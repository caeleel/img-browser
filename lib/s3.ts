import { S3Client, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Response } from './types';

const BUCKET_NAME = 'terencefischer';
const REGION = 'sfo3';
const ENDPOINT = 'https://sfo3.digitaloceanspaces.com';

let cachedS3Client: S3Client | null = null;

export const ROOT_PATH = 'photos';

export function getCredentials() {
  if (typeof window === 'undefined') {
    return null
  }

  const savedCredentials = localStorage.getItem('doCredentials');
  if (!savedCredentials) {
    return null
  }
  return JSON.parse(savedCredentials)
}

function getS3Client() {
  if (cachedS3Client) {
    return cachedS3Client;
  }

  const { accessKeyId, secretAccessKey } = getCredentials();

  cachedS3Client = new S3Client({
    region: REGION,
    endpoint: ENDPOINT,
    credentials: {
      accessKeyId,
      secretAccessKey,
    }
  });

  return cachedS3Client;
}

// Function to clear the cached client (useful when credentials change)
export function clearS3Cache() {
  cachedS3Client = null;
}

// Downloads through the (stable) signed URL rather than the SDK so the browser's HTTP cache is used.
export async function fetchFile(key: string): Promise<string> {
  const response = await fetch(await signedUrl(key));
  if (!response.ok) {
    throw new Error(`Failed to fetch ${key}: ${response.status}`);
  }
  return URL.createObjectURL(await response.blob());
}

export async function listContents(path: string, continuationToken?: string): Promise<S3Response> {
  const s3Client = getS3Client();

  const firstDir = path.split('/')[0];
  if (firstDir !== ROOT_PATH) {
    throw new Error('Invalid path');
  }

  const command = new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: path,
    Delimiter: '/',
    ContinuationToken: continuationToken
  });

  const response = await s3Client.send(command);

  return {
    CommonPrefixes: response.CommonPrefixes || [],
    Contents: response.Contents || [],
    NextContinuationToken: response.NextContinuationToken,
    IsTruncated: response.IsTruncated || false
  };
}

// Signed GET URLs are signed as of the start of a fixed window instead of "now", so the same key
// gives the same URL for SIGNING_WINDOW_MS and the browser cache (keyed by URL) can hit. Every URL
// stays valid for at least URL_LIFETIME_S - SIGNING_WINDOW_MS (4 days). 7 days is SigV4's maximum.
const SIGNING_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const URL_LIFETIME_S = 7 * 24 * 60 * 60;
// Photos never change under the same key, so let the browser keep them without revalidating
const CACHE_CONTROL = `private, max-age=${URL_LIFETIME_S}, immutable`;

export async function signedUrl(key: string): Promise<string> {
  const s3Client = getS3Client();

  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ResponseCacheControl: CACHE_CONTROL,
  });

  const now = Date.now();
  return getSignedUrl(s3Client, command, {
    expiresIn: URL_LIFETIME_S,
    signingDate: new Date(now - (now % SIGNING_WINDOW_MS)),
  });
}

export async function getSignedPutUrl(key: string, contentType: string): Promise<string> {
  const s3Client = getS3Client();

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(s3Client, command, { expiresIn: 3600 });
}

export async function deleteFile(key: string): Promise<void> {
  const s3Client = getS3Client();

  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  await s3Client.send(command);
}

export async function uploadFile(key: string, file: Blob): Promise<void> {
  try {
    // Get signed URL for upload
    const signedUrl = await getSignedPutUrl(key, file.type);

    const body = await file.arrayBuffer();
    // Upload using signed URL
    const response = await fetch(signedUrl, {
      method: 'PUT',
      body: body,
      headers: {
        'Content-Type': file.type,
        'Content-Length': body.byteLength.toString(),
      },
    });

    if (!response.ok) {
      throw new Error(`Upload failed with status: ${response.status}`);
    }
  } catch (error) {
    console.error('Error uploading file:', error);
    throw new Error(`Failed to upload ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}