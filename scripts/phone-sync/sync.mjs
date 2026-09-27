#!/usr/bin/env node
// Syncs an attached iPhone's photo library into the image cloud, mirroring what the web
// uploader (lib/upload.ts) does: HEIC -> JPEG, 800px thumbnails under thumbnails/, EXIF
// metadata and SigLIP 2 embeddings via the web app's API.
//
// Dedupe: a ledger of synced Photos asset ids lives in the bucket at sync-state/<dest>.json,
// so re-runs (from any Mac) only process new assets. Photos that were already uploaded
// elsewhere in the bucket (same filename + capture time) are skipped too.
//
// Only camera formats are synced: PNGs (screenshots, images saved from Safari/apps) are skipped.
// For photos edited on the phone, only the edited version is synced.
//
// Usage: npm run sync-phone -- [--dest photos/iphone_sync] [--dry-run] [--limit N] [--login]

import { spawn, execFile } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { parseArgs, promisify } from 'node:util';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import exifr from 'exifr';

const run = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

// Keep in sync with lib/s3.ts
const BUCKET_NAME = 'terencefischer';
const REGION = 'sfo3';
const ENDPOINT = 'https://sfo3.digitaloceanspaces.com';
const ROOT_PATH = 'photos';

// Formats the iPhone camera produces; PNG/GIF/WebP are screenshots or saved images.
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.heic', '.heif'];
const VIDEO_EXTENSIONS = ['.mp4', '.mov'];
const CONTENT_TYPES = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.mp4': 'video/mp4', '.mov': 'video/quicktime',
};

const BATCH_SIZE = 20;
const EMBEDDING_DIM = 768; // SigLIP 2, see ai-server/model.py
const CREDENTIALS_FILE = path.join(os.homedir(), '.config', 'img-browser', 'credentials.json');

const { values: args } = parseArgs({
  options: {
    dest: { type: 'string', default: `${ROOT_PATH}/iphone_sync` },
    'dry-run': { type: 'boolean', default: false },
    limit: { type: 'string' },
    login: { type: 'boolean', default: false },
    concurrency: { type: 'string', default: '4' },
    api: { type: 'string', default: process.env.SYNC_API_BASE || 'https://dezephoto.vercel.app' },
    'embed-url': { type: 'string', default: process.env.EMBED_URL || 'http://127.0.0.1:8000' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (args.help) {
  console.log(`Sync iPhone photos into the image cloud.

  --dest <prefix>     Bucket folder to sync into (default: ${ROOT_PATH}/iphone_sync)
  --dry-run           Show what would be synced without uploading anything
  --limit <n>         Only sync the n newest unsynced items
  --login             Re-authorize through the browser even if credentials are cached
  --concurrency <n>   Items processed in parallel (default: 4)
  --api <url>         Web app base URL (default: https://dezephoto.vercel.app)
  --embed-url <url>   SigLIP 2 embedding server (default: http://127.0.0.1:8000, started automatically)`);
  process.exit(0);
}

const DEST = args.dest.replace(/\/+$/, '');
if (DEST.split('/')[0] !== ROOT_PATH) fail(`--dest must be inside ${ROOT_PATH}/`);
const LEDGER_KEY = `sync-state/${DEST}.json`;

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

function log(message) {
  clearProgress();
  console.log(message);
}

// ---------------------------------------------------------------------------
// Credentials: .env (ACCESS_KEY_ID / SECRET_ACCESS_KEY), cached file, or browser handoff

async function getCredentials() {
  for (const file of ['.env', '.env.local']) {
    const envPath = path.join(REPO, file);
    if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
  }
  if (!args.login && process.env.ACCESS_KEY_ID && process.env.SECRET_ACCESS_KEY) {
    return { accessKeyId: process.env.ACCESS_KEY_ID, secretAccessKey: process.env.SECRET_ACCESS_KEY };
  }
  if (!args.login && fs.existsSync(CREDENTIALS_FILE)) {
    return JSON.parse(await fsp.readFile(CREDENTIALS_FILE, 'utf8'));
  }
  return { ...(await browserLogin()), fromBrowser: true };
}

// Opens <api>/cli-auth, which POSTs the credentials the web app has in localStorage to a
// one-shot server on 127.0.0.1. The random state guards against stray requests.
function browserLogin() {
  const state = randomBytes(24).toString('hex');
  const allowedOrigin = new URL(args.api).origin;

  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      res.setHeader('Access-Control-Allow-Methods', 'POST');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
      if (req.method === 'OPTIONS') return res.writeHead(204).end();
      if (req.method !== 'POST' || req.url !== '/callback' || req.headers.origin !== allowedOrigin) {
        return res.writeHead(404).end();
      }

      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const { accessKeyId, secretAccessKey } = data.credentials || {};
          if (data.state !== state || !accessKeyId || !secretAccessKey) throw new Error('bad request');
          res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
          server.close();
          resolve({ accessKeyId, secretAccessKey });
        } catch {
          res.writeHead(400).end();
        }
      });
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const url = `${args.api}/cli-auth?port=${server.address().port}&state=${state}`;
      log(`Opening the browser to authorize… If nothing opens, visit:\n  ${url}`);
      spawn('open', [url], { stdio: 'ignore' });
    });
  });
}

// ---------------------------------------------------------------------------
// Phone bridge (Swift / ImageCaptureCore)

async function ensureBridgeBinary() {
  const source = path.join(HERE, 'PhoneBridge.swift');
  const binary = path.join(HERE, '.build', 'phone-bridge');
  const stale = !fs.existsSync(binary) || fs.statSync(binary).mtimeMs < fs.statSync(source).mtimeMs;
  if (stale) {
    log('Compiling phone bridge…');
    await fsp.mkdir(path.dirname(binary), { recursive: true });
    await run('swiftc', ['-O', source, '-o', binary]);
  }
  return binary;
}

async function startBridge() {
  const child = spawn(await ensureBridgeBinary(), [], { stdio: ['pipe', 'pipe', 'inherit'] });
  const items = [];
  const pending = new Map(); // id -> { resolve, reject }
  let onCatalog;
  const catalog = new Promise((resolve, reject) => { onCatalog = { resolve, reject }; });

  createInterface({ input: child.stdout }).on('line', (line) => {
    let event;
    try { event = JSON.parse(line); } catch { return; }
    switch (event.type) {
      case 'status': log(`  ${event.message}`); break;
      case 'item': items.push(event); break;
      case 'catalog_done': onCatalog.resolve(items); break;
      case 'downloaded':
        pending.get(event.id)?.resolve(event.path);
        pending.delete(event.id);
        break;
      case 'download_error':
        pending.get(event.id)?.reject(new Error(event.message));
        pending.delete(event.id);
        break;
      case 'fatal': {
        const error = new Error(event.message);
        onCatalog.reject(error);
        for (const p of pending.values()) p.reject(error);
        pending.clear();
        break;
      }
    }
  });
  child.on('exit', (code) => {
    const error = new Error(`Phone bridge exited (${code})`);
    onCatalog.reject(error);
    for (const p of pending.values()) p.reject(error);
  });

  return {
    catalog,
    download(id, dir) {
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        child.stdin.write(JSON.stringify({ id, dir }) + '\n');
      });
    },
    close() { child.stdin.end(); },
  };
}

// ---------------------------------------------------------------------------
// Embedding server (ai-server/embed.py), started locally if it isn't already running

// Returns the server's embedding size, or null if nothing is answering.
async function embedServerDim() {
  try {
    const response = await fetch(`${args['embed-url']}/embed/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'ping' }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    return (await response.json()).embedding?.length ?? null;
  } catch {
    return null;
  }
}

async function ensureEmbedServer() {
  const dim = await embedServerDim();
  if (dim === EMBEDDING_DIM) return null;
  if (dim !== null) {
    fail(`${args['embed-url']} serves ${dim}-d embeddings, expected ${EMBEDDING_DIM} (an old CLIP embed.py still running?). Stop it and re-run.`);
  }
  const { hostname } = new URL(args['embed-url']);
  if (!['127.0.0.1', 'localhost'].includes(hostname)) fail(`Embedding server ${args['embed-url']} is not reachable`);

  const logFile = path.join(os.tmpdir(), 'img-browser-embed.log');
  log(`Starting local SigLIP 2 embedding server (log: ${logFile})…`);
  const out = fs.openSync(logFile, 'w');
  const child = spawn(process.env.EMBED_PYTHON || 'python3', ['embed.py'], {
    cwd: path.join(REPO, 'ai-server'),
    stdio: ['ignore', out, out],
  });
  let exited = false;
  child.on('exit', () => { exited = true; });

  for (let i = 0; i < 150; i++) {
    if (exited) fail(`Embedding server failed to start, see ${logFile}`);
    if ((await embedServerDim()) === EMBEDDING_DIM) return child;
    await new Promise((r) => setTimeout(r, 2000));
  }
  child.kill();
  fail(`Embedding server did not come up in time, see ${logFile}`);
}

async function getImageEmbedding(buffer) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'image/jpeg' }), 'thumb.jpg');
  const response = await fetch(`${args['embed-url']}/embed/image`, { method: 'POST', body: form });
  if (!response.ok) throw new Error(`Embedding failed (${response.status})`);
  const { embedding } = await response.json();
  if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIM) throw new Error('Embedding server returned no embedding');
  return embedding;
}

// ---------------------------------------------------------------------------
// Bucket + web app API

let s3;
let credentials;

async function putObject(key, body, contentType, contentLength) {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET_NAME, Key: key, Body: body, ContentType: contentType, ContentLength: contentLength,
  }));
}

async function loadLedger() {
  try {
    const response = await s3.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: LEDGER_KEY }));
    return JSON.parse(await response.Body.transformToString());
  } catch (error) {
    if (error.name === 'NoSuchKey') return { version: 1, items: {} };
    throw error;
  }
}

async function saveLedger(ledger) {
  await putObject(LEDGER_KEY, JSON.stringify(ledger), 'application/json');
}

async function api(route, init = {}) {
  const response = await fetch(`${args.api}${route}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-DO-ACCESS-KEY-ID': credentials.accessKeyId,
      'X-DO-SECRET-ACCESS-KEY': credentials.secretAccessKey,
      ...init.headers,
    },
  });
  if (!response.ok) throw new Error(`${init.method || 'GET'} ${route} failed (${response.status})`);
  return response.json();
}

// ---------------------------------------------------------------------------
// Per-item processing

const stem = (name) => name.replace(/\.[^.]+$/, '').toLowerCase();
const extOf = (name) => path.extname(name).toLowerCase();

function uploadName(item) {
  const ext = extOf(item.displayName);
  return ext === '.heic' || ext === '.heif' ? item.displayName.replace(/\.[^.]+$/, '.jpg') : item.displayName;
}

const isSupported = (item) => [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS].includes(extOf(item.name));

// An edited photo is two files sharing one Photos asset id: the original (IMG_1234) and the
// rendered edit (IMG_E1234, originally named FullSizeRender).
const isEditRender = (item) => /^IMG_E\d/i.test(item.name) || /^FullSizeRender\./i.test(item.originalName || '');

// Picks what to sync: supported formats only, and for edited photos just the edit (named like
// the original). An edit of a screenshot/saved image is skipped along with its original.
function selectItems(catalog) {
  const byAsset = new Map();
  for (const item of catalog) {
    // The bridge appends "|<name>" when two files share an asset id.
    item.assetId = /^[0-9A-F-]{36}\/[^|]*/i.exec(item.id)?.[0] ?? item.id;
    item.displayName = isEditRender(item) ? item.name.replace(/^IMG_E/i, 'IMG_') : item.name;
    byAsset.set(item.assetId, [...(byAsset.get(item.assetId) || []), item]);
  }

  const selected = [];
  const skipped = { unsupported: 0, editedOriginals: 0 };
  for (const group of byAsset.values()) {
    const edit = group.length > 1 && group.find(isEditRender);
    if (!edit) {
      for (const item of group) {
        if (isSupported(item)) selected.push(item);
        else skipped.unsupported++;
      }
    } else if (group.every(isSupported)) {
      selected.push(edit);
      skipped.editedOriginals += group.length - 1;
    } else {
      skipped.unsupported += group.length;
    }
  }
  return { selected, skipped };
}

function monthFolder(item) {
  const date = item.created ? new Date(item.created) : null;
  if (!date || isNaN(date)) return 'undated';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// ISO 6709, e.g. "+37.7749-122.4194+010.000/"
function parseIso6709(value) {
  const match = /^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/.exec(value || '');
  return match ? { latitude: parseFloat(match[1]), longitude: parseFloat(match[2]) } : {};
}

async function videoInfo(file) {
  try {
    const { stdout } = await run('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_format', file]);
    const tags = JSON.parse(stdout).format?.tags || {};
    return {
      ...parseIso6709(tags['com.apple.quicktime.location.ISO6709']),
      make: tags['com.apple.quicktime.make'] || null,
      model: tags['com.apple.quicktime.model'] || null,
    };
  } catch {
    return {};
  }
}

async function processItem(item, bridge, workDir, existingByKey) {
  const itemDir = await fsp.mkdtemp(path.join(workDir, 'item-'));
  try {
    const original = await bridge.download(item.id, itemDir);
    const isVideo = VIDEO_EXTENSIONS.includes(extOf(item.name));
    const metadata = {
      path: item.path, name: path.basename(item.path), taken_at: item.created || null,
      latitude: null, longitude: null, city: null, state: null, country: null,
      camera_make: null, camera_model: null, lens_model: null, aperture: null, iso: null,
      shutter_speed: null, focal_length: null, orientation: 1,
    };

    let uploadFile = original;
    const thumbFile = path.join(itemDir, 'thumb.jpg');

    if (isVideo) {
      const info = await videoInfo(original);
      Object.assign(metadata, {
        latitude: info.latitude ?? null, longitude: info.longitude ?? null,
        camera_make: info.make ?? null, camera_model: info.model ?? null,
      });
      await run('ffmpeg', ['-v', 'error', '-y', '-i', original, '-frames:v', '1',
        '-vf', "scale='min(800,iw)':'min(800,ih)':force_original_aspect_ratio=decrease", '-q:v', '4', thumbFile]);
    } else {
      let exif;
      try { exif = await exifr.parse(original); } catch { /* no EXIF */ }
      if (exif) {
        Object.assign(metadata, {
          taken_at: exif.DateTimeOriginal || metadata.taken_at,
          latitude: exif.latitude || null, longitude: exif.longitude || null,
          camera_make: exif.Make || null, camera_model: exif.Model || null, lens_model: exif.LensModel || null,
          aperture: exif.FNumber || null, iso: exif.ISO || null, shutter_speed: exif.ExposureTime || null,
          focal_length: exif.FocalLength || null,
        });
      }

      // Already uploaded elsewhere (e.g. dragged into the web app before)?
      if (exif?.DateTimeOriginal instanceof Date) {
        const duplicate = existingByKey.get(`${stem(item.displayName)}|${exif.DateTimeOriginal.toISOString()}`);
        if (duplicate) return { duplicateOf: duplicate };
      }

      if (extOf(item.name) === '.heic' || extOf(item.name) === '.heif') {
        uploadFile = path.join(itemDir, path.basename(item.path));
        await run('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '90', original, '--out', uploadFile]);
      }
      await run('sips', ['-Z', '800', '-s', 'format', 'jpeg', '-s', 'formatOptions', '80', uploadFile, '--out', thumbFile]);
    }

    const thumbnail = await fsp.readFile(thumbFile);
    const embedding = await getImageEmbedding(thumbnail);

    await putObject(item.path.replace(`${ROOT_PATH}/`, 'thumbnails/'), thumbnail, 'image/jpeg');
    const { size } = await fsp.stat(uploadFile);
    await putObject(item.path, fs.createReadStream(uploadFile), CONTENT_TYPES[extOf(item.path)], size);
    return { metadata, embedding };
  } finally {
    await fsp.rm(itemDir, { recursive: true, force: true });
  }
}

async function mapConcurrent(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }));
  return results;
}

// ---------------------------------------------------------------------------
// Progress line

let progressShown = false;
function progress(text) {
  if (!process.stdout.isTTY) return;
  process.stdout.write(`\r\x1b[K${text}`);
  progressShown = true;
}
function clearProgress() {
  if (progressShown) process.stdout.write('\r\x1b[K');
  progressShown = false;
}

// ---------------------------------------------------------------------------

async function main() {
  const { fromBrowser, ...creds } = await getCredentials();
  credentials = creds;
  s3 = new S3Client({ region: REGION, endpoint: ENDPOINT, credentials });
  try {
    await s3.send(new ListObjectsV2Command({ Bucket: BUCKET_NAME, Prefix: `${ROOT_PATH}/`, MaxKeys: 1 }));
  } catch (error) {
    fail(`Bucket credentials were rejected (${error.name}). Re-run with --login.`);
  }
  if (fromBrowser) {
    await fsp.mkdir(path.dirname(CREDENTIALS_FILE), { recursive: true });
    await fsp.writeFile(CREDENTIALS_FILE, JSON.stringify(credentials), { mode: 0o600 });
    log(`✓ Authorized; credentials saved to ${CREDENTIALS_FILE}`);
  }

  log('Connecting to iPhone…');
  const bridge = await startBridge();
  const catalog = await bridge.catalog.catch((error) => fail(error.message));

  const ledger = await loadLedger();
  const { selected, skipped } = selectItems(catalog);
  // Ledger entries are keyed "<asset id>" or (older runs) "<asset id>|<name>". Match on asset id + name
  // only: which file of an edited pair gets the bare id can change between sessions.
  const isSynced = (item) =>
    ledger.items[item.assetId]?.name === item.name || Boolean(ledger.items[`${item.assetId}|${item.name}`]);
  let todo = selected.filter((item) => !isSynced(item));
  todo.sort((a, b) => (b.created || '').localeCompare(a.created || '')); // newest first
  if (args.limit) todo = todo.slice(0, parseInt(args.limit, 10));

  // Assign bucket paths, suffixing the asset id when two assets would collide.
  const usedPaths = new Set(Object.values(ledger.items).map((entry) => entry.path).filter(Boolean));
  for (const item of todo) {
    let key = `${DEST}/${monthFolder(item)}/${uploadName(item)}`;
    if (usedPaths.has(key)) {
      const suffix = item.id.replace(/[^A-Za-z0-9]/g, '').slice(0, 8);
      key = key.replace(/(\.[^.]+)$/, `_${suffix}$1`);
    }
    usedPaths.add(key);
    item.path = key;
  }

  log(`Library: ${catalog.length} items · ${selected.length - todo.length} already synced · ${todo.length} to sync · ` +
    `skipped ${skipped.unsupported} screenshots/saved images and ${skipped.editedOriginals} originals of edited photos`);

  if (args['dry-run'] || todo.length === 0) {
    for (const item of todo.slice(0, 20)) log(`  ${item.name} -> ${item.path}`);
    if (todo.length > 20) log(`  … and ${todo.length - 20} more`);
    bridge.close();
    return;
  }

  // Index of everything already in the bucket (outside DEST) by filename + capture time.
  const existingByKey = new Map();
  const { rows } = await api('/api/metadata');
  for (const row of rows) {
    if (!row.taken_at || row.path.startsWith(`${DEST}/`)) continue;
    existingByKey.set(`${stem(path.basename(row.path))}|${new Date(row.taken_at).toISOString()}`, row.path);
  }

  const embedServer = await ensureEmbedServer();
  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'img-browser-sync-'));
  const counts = { synced: 0, duplicate: 0, failed: 0 };
  const failures = [];
  let stopping = false;
  process.on('SIGINT', () => {
    if (stopping) process.exit(130);
    stopping = true;
    log('Stopping after the current batch… (Ctrl-C again to quit immediately)');
  });

  const concurrency = Math.max(1, parseInt(args.concurrency, 10) || 4);
  try {
    for (let i = 0; i < todo.length && !stopping; i += BATCH_SIZE) {
      const batch = todo.slice(i, i + BATCH_SIZE);

      // Paths that already have metadata were uploaded by an interrupted run.
      const existing = await api('/api/batch_meta', {
        method: 'POST',
        body: JSON.stringify({ paths: batch.map((item) => item.path), credentials }),
      });

      const results = await mapConcurrent(batch, concurrency, async (item, j) => {
        progress(`[${i + j + 1}/${todo.length}] ${counts.synced} synced · ${counts.duplicate} duplicates · ` +
          `${counts.failed} failed · ${item.name}`);
        if (existing[item.path]) return { item, alreadyUploaded: true };
        try {
          return { item, ...(await processItem(item, bridge, workDir, existingByKey)) };
        } catch (error) {
          return { item, error };
        }
      });

      const uploaded = results.filter((r) => r.metadata);
      if (uploaded.length) {
        const { pathToIds } = await api('/api/metadata', {
          method: 'POST',
          body: JSON.stringify({ metadata: uploaded.map((r) => r.metadata), credentials }),
        });
        const embeddings = {};
        for (const r of uploaded) embeddings[pathToIds[r.metadata.path]] = r.embedding;
        await api('/api/embeddings', { method: 'POST', body: JSON.stringify({ embeddings, credentials }) });
      }

      const now = new Date().toISOString();
      for (const r of results) {
        if (r.error) {
          counts.failed++;
          failures.push(`${r.item.name}: ${r.error.message}`);
          log(`  ✗ ${r.item.name}: ${r.error.message}`);
          continue;
        }
        if (r.duplicateOf) counts.duplicate++;
        else counts.synced++;
        ledger.items[r.item.assetId] = {
          path: r.duplicateOf || r.item.path,
          name: r.item.name,
          ...(r.duplicateOf && { duplicate: true }),
          syncedAt: now,
        };
      }
      await saveLedger(ledger);
    }
  } finally {
    clearProgress();
    bridge.close();
    embedServer?.kill();
    await fsp.rm(workDir, { recursive: true, force: true });
  }

  log(`\n✓ Done: ${counts.synced} synced to ${DEST}/ · ${counts.duplicate} already in the bucket elsewhere · ` +
    `${counts.failed} failed${stopping ? ' (stopped early — re-run to continue)' : ''}`);
  if (failures.length) log('Failed items will be retried on the next run.');
}

main().catch((error) => fail(error.stack || error.message));
