"""Backfills SigLIP 2 embeddings (image_embeddings_v2) for every image that doesn't have one yet.

Embeds each image's 800px thumbnail using a local embedding server (ai-server/embed.py).
Safe to stop and re-run: it only picks up images still missing an embedding.

Usage:
    (cd ai-server && python embed.py)          # in another terminal
    python scripts/generate_embeddings.py [--dry-run]

Needs ACCESS_KEY_ID, SECRET_ACCESS_KEY and POSTGRES_URL_NON_POOLING in .env / .env.local
(`vercel env pull .env.local`).
"""

import asyncio
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, List, Optional

import aiohttp
import boto3
import psycopg
from botocore.config import Config
from dotenv import load_dotenv

load_dotenv()
load_dotenv('.env.local')

BUCKET_NAME = 'terencefischer'
ENDPOINT_URL = 'https://sfo3.digitaloceanspaces.com'
EMBED_URL = os.getenv('EMBED_URL', 'http://localhost:8000')
EMBEDDING_DIM = 768  # SigLIP 2, see ai-server/model.py
BATCH_SIZE = 32

s3_client = boto3.client(
    's3',
    endpoint_url=ENDPOINT_URL,
    aws_access_key_id=os.getenv('ACCESS_KEY_ID'),
    aws_secret_access_key=os.getenv('SECRET_ACCESS_KEY'),
    config=Config(s3={'addressing_style': 'virtual'}, max_pool_connections=16),
)

DB_URL = os.getenv('POSTGRES_URL_NON_POOLING')  # non-pooling URL for a long-running script
if not DB_URL:
    raise ValueError("Database URL not found in environment variables")


async def store(conn, rows) -> psycopg.AsyncConnection:
    """Writes a batch, reconnecting on dropped connections (long runs over flaky Wi-Fi)."""
    for attempt in range(5):
        try:
            async with conn.cursor() as cur:
                await cur.executemany("""
                    INSERT INTO image_embeddings_v2 (image_id, embedding)
                    VALUES (%s, %s::vector)
                    ON CONFLICT (image_id) DO UPDATE SET embedding = EXCLUDED.embedding, updated_at = NOW()
                """, rows)
            await conn.commit()
            return conn
        except psycopg.OperationalError as e:
            print(f"  database connection lost ({e}), reconnecting…", file=sys.stderr)
            await asyncio.sleep(2 ** attempt)
            try:
                await conn.close()
            except Exception:
                pass
            conn = await psycopg.AsyncConnection.connect(DB_URL)
    raise RuntimeError("Could not write to the database after 5 attempts")


def thumbnail_key(path: str) -> str:
    return f"thumbnails/{path.split('/', 1)[1]}"


def download(key: str) -> Optional[bytes]:
    try:
        return s3_client.get_object(Bucket=BUCKET_NAME, Key=key)['Body'].read()
    except s3_client.exceptions.NoSuchKey:
        return None


async def embed_batch(session: aiohttp.ClientSession, images: List[bytes]) -> List[Optional[List[float]]]:
    form = aiohttp.FormData()
    for image in images:
        form.add_field('files', image, filename='thumb.jpg', content_type='image/jpeg')
    async with session.post(f'{EMBED_URL}/batch_embed/images', data=form) as response:
        if response.status != 200:
            raise Exception(f"Embedding server error {response.status}: {await response.text()}")
        return [r['embedding'] for r in (await response.json())['results']]


async def check_embed_server(session: aiohttp.ClientSession):
    try:
        async with session.post(f'{EMBED_URL}/embed/text', json={'content': 'ping'}) as response:
            dim = len((await response.json())['embedding'])
    except Exception as e:
        sys.exit(f"Embedding server not reachable at {EMBED_URL} ({e}). Start it: cd ai-server && python embed.py")
    if dim != EMBEDDING_DIM:
        sys.exit(f"{EMBED_URL} serves {dim}-d embeddings, expected {EMBEDDING_DIM} (old CLIP server?)")


async def main():
    dry_run = '--dry-run' in sys.argv

    conn = await psycopg.AsyncConnection.connect(DB_URL)
    try:
        async with conn.cursor() as cur:
            await cur.execute("""
                SELECT m.id, m.path
                FROM image_metadata m
                LEFT JOIN image_embeddings_v2 e ON m.id = e.image_id
                WHERE e.image_id IS NULL
                ORDER BY m.id
            """)
            todo: List[Dict] = [{'id': row[0], 'path': row[1]} for row in await cur.fetchall()]

        print(f"{len(todo)} images need embeddings")
        if dry_run or not todo:
            return

        loop = asyncio.get_running_loop()
        done = missing = failed = 0
        started = time.time()

        async with aiohttp.ClientSession() as session:
            await check_embed_server(session)
            with ThreadPoolExecutor(max_workers=16) as executor:
                for i in range(0, len(todo), BATCH_SIZE):
                    batch = todo[i:i + BATCH_SIZE]
                    images = await asyncio.gather(*[
                        loop.run_in_executor(executor, download, thumbnail_key(item['path'])) for item in batch
                    ])

                    present = [(item, image) for item, image in zip(batch, images) if image is not None]
                    for item, image in zip(batch, images):
                        if image is None:
                            missing += 1
                            print(f"  no thumbnail: {item['path']}", file=sys.stderr)

                    rows = []
                    if present:
                        embeddings = await embed_batch(session, [image for _, image in present])
                        for (item, _), embedding in zip(present, embeddings):
                            if embedding is None:
                                failed += 1
                                print(f"  could not embed: {item['path']}", file=sys.stderr)
                            else:
                                rows.append((item['id'], json.dumps(embedding)))

                    if rows:
                        conn = await store(conn, rows)
                        done += len(rows)

                    processed = i + len(batch)
                    rate = processed / (time.time() - started)
                    eta = (len(todo) - processed) / rate if rate else 0
                    print(f"[{processed}/{len(todo)}] {done} embedded · {missing} without thumbnail · "
                          f"{failed} failed · {rate:.1f}/s · ~{eta / 60:.0f} min left", flush=True)

        print(f"Done: {done} embedded, {missing} without thumbnail, {failed} failed")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
