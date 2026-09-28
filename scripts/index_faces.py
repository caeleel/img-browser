"""Detects faces in every image not scanned yet (face_scans) and stores them in `faces`.

Runs InsightFace buffalo_l (SCRFD detection + ArcFace 512-d embeddings) locally on each image's
800px thumbnail. Only reasonably prominent faces are kept (see MIN_* below); videos are skipped.
Safe to stop and re-run: it only picks up images that haven't been scanned.

Usage:
    python scripts/index_faces.py [--dry-run] [--limit N]
    python scripts/cluster_faces.py            # then group the new faces into people

Needs ACCESS_KEY_ID, SECRET_ACCESS_KEY and POSTGRES_URL_NON_POOLING in .env / .env.local.
The model (~280 MB) downloads to ~/.insightface on first run.
"""

import argparse
import io
import os
import sys
import time
import warnings
from concurrent.futures import ThreadPoolExecutor
from typing import List, Optional, Tuple

import boto3
import cv2
import numpy as np
import psycopg
from botocore.config import Config
from dotenv import load_dotenv
from PIL import Image, ImageOps

load_dotenv()
load_dotenv('.env.local')

BUCKET_NAME = 'terencefischer'
ENDPOINT_URL = 'https://sfo3.digitaloceanspaces.com'
VIDEO_EXTENSIONS = ('.mov', '.mp4', '.m4v', '.avi', '.webm')
BATCH_SIZE = 64

# Faces smaller or less certain than this are background people / false positives (dogs, patterns)
MIN_DET_SCORE = 0.6
MIN_FACE_FRACTION = 0.04  # face height as a fraction of the image's short side

s3_client = boto3.client(
    's3',
    endpoint_url=ENDPOINT_URL,
    aws_access_key_id=os.getenv('ACCESS_KEY_ID'),
    aws_secret_access_key=os.getenv('SECRET_ACCESS_KEY'),
    config=Config(s3={'addressing_style': 'virtual'}, max_pool_connections=16),
)

DB_URL = os.getenv('POSTGRES_URL_NON_POOLING')
if not DB_URL:
    raise ValueError("Database URL not found in environment variables")


def load_model():
    warnings.filterwarnings('ignore')
    from insightface.app import FaceAnalysis
    app = FaceAnalysis(
        name='buffalo_l',
        allowed_modules=['detection', 'recognition'],
        providers=['CoreMLExecutionProvider', 'CPUExecutionProvider'],
    )
    app.prepare(ctx_id=0, det_size=(640, 640), det_thresh=MIN_DET_SCORE)
    return app


def thumbnail_key(path: str) -> str:
    return f"thumbnails/{path.split('/', 1)[1]}"


# Some thumbnails (older camera imports) are stored unrotated without EXIF orientation; the app
# rotates them with CSS from image_metadata.orientation (getCssOrientation), so do the same here.
CSS_ROTATIONS = {6: Image.Transpose.ROTATE_270, 8: Image.Transpose.ROTATE_90}


def download(item: Tuple[int, str, Optional[int]]) -> Optional[Image.Image]:
    """Thumbnail, rotated the way the browser displays it."""
    _, path, orientation = item
    try:
        data = s3_client.get_object(Bucket=BUCKET_NAME, Key=thumbnail_key(path))['Body'].read()
        image = Image.open(io.BytesIO(data))
        if image.getexif().get(0x0112, 1) == 1 and orientation in CSS_ROTATIONS:
            image = image.transpose(CSS_ROTATIONS[orientation])
        return ImageOps.exif_transpose(image).convert('RGB')
    except s3_client.exceptions.NoSuchKey:
        return None
    except Exception as e:
        print(f"  could not read {path}: {e}", file=sys.stderr)
        return None


def detect(app, image: Image.Image) -> List[Tuple]:
    """Returns (x, y, width, height, score, embedding) for each prominent face, box as 0-1 fractions."""
    width, height = image.size
    faces = app.get(cv2.cvtColor(np.asarray(image), cv2.COLOR_RGB2BGR))
    rows = []
    for face in faces:
        x1, y1, x2, y2 = (float(v) for v in face.bbox)
        x1, y1, x2, y2 = max(x1, 0), max(y1, 0), min(x2, width), min(y2, height)
        if face.det_score < MIN_DET_SCORE or (y2 - y1) < MIN_FACE_FRACTION * min(width, height):
            continue
        rows.append((
            x1 / width, y1 / height, (x2 - x1) / width, (y2 - y1) / height,
            float(face.det_score), face.normed_embedding.astype(np.float32).tolist(),
        ))
    return rows


def store(conn, scanned: List[Tuple[int, List[Tuple]]]):
    """Writes one batch atomically, reconnecting on dropped connections (long runs over Wi-Fi)."""
    for attempt in range(5):
        try:
            with conn.cursor() as cur:
                face_rows = [
                    (image_id, x, y, w, h, score, str(embedding))
                    for image_id, faces in scanned
                    for x, y, w, h, score, embedding in faces
                ]
                if face_rows:
                    cur.executemany("""
                        INSERT INTO faces (image_id, x, y, width, height, det_score, embedding)
                        VALUES (%s, %s, %s, %s, %s, %s, %s::vector)
                    """, face_rows)
                cur.executemany("""
                    INSERT INTO face_scans (image_id, face_count) VALUES (%s, %s)
                    ON CONFLICT (image_id) DO NOTHING
                """, [(image_id, len(faces)) for image_id, faces in scanned])
            conn.commit()
            return conn
        except psycopg.OperationalError as e:
            print(f"  database connection lost ({e}), reconnecting…", file=sys.stderr)
            time.sleep(2 ** attempt)
            try:
                conn.close()
            except Exception:
                pass
            conn = psycopg.connect(DB_URL)
    raise RuntimeError("Could not write to the database after 5 attempts")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--dry-run', action='store_true', help='only count images that need scanning')
    parser.add_argument('--limit', type=int, help='scan at most this many images')
    args = parser.parse_args()

    conn = psycopg.connect(DB_URL)
    try:
        rows = conn.execute("""
            SELECT m.id, m.path, m.orientation
            FROM image_metadata m
            LEFT JOIN face_scans s ON s.image_id = m.id
            WHERE s.image_id IS NULL
            ORDER BY m.id
        """).fetchall()
        todo = [row for row in rows if not row[1].lower().endswith(VIDEO_EXTENSIONS)]
        if args.limit:
            todo = todo[:args.limit]
        print(f"{len(todo)} images need a face scan")
        if args.dry_run or not todo:
            return

        app = load_model()
        started = time.time()
        found = missing = 0
        with ThreadPoolExecutor(max_workers=16) as executor:
            batches = [todo[i:i + BATCH_SIZE] for i in range(0, len(todo), BATCH_SIZE)]
            # Download the next batch while detecting on the current one
            pending = executor.map(download, batches[0])
            for index, batch in enumerate(batches):
                images = list(pending)
                if index + 1 < len(batches):
                    pending = executor.map(download, batches[index + 1])

                scanned = []
                for (image_id, path, _), image in zip(batch, images):
                    if image is None:
                        missing += 1
                        print(f"  no thumbnail: {path}", file=sys.stderr)
                        continue
                    faces = detect(app, image)
                    found += len(faces)
                    scanned.append((image_id, faces))
                conn = store(conn, scanned)

                processed = index * BATCH_SIZE + len(batch)
                rate = processed / (time.time() - started)
                eta = (len(todo) - processed) / rate if rate else 0
                print(f"[{processed}/{len(todo)}] {found} faces · {missing} without thumbnail · "
                      f"{rate:.1f}/s · ~{eta / 60:.0f} min left", flush=True)

        print(f"Done: {found} faces in {len(todo) - missing} images, {missing} without thumbnail")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
