import os
import sys
import asyncio
import aiohttp
import psycopg
from dotenv import load_dotenv
import boto3
from botocore.config import Config
from concurrent.futures import ThreadPoolExecutor
from typing import List, Dict, Tuple, Optional
import time
import argparse
import face_recognition
import numpy as np
from PIL import Image
import io
from sklearn.cluster import DBSCAN
import shutil

# Load environment variables from both files
load_dotenv()
load_dotenv('.env.local')

# S3 Configuration
BUCKET_NAME = 'terencefischer'
ENDPOINT_URL = 'https://sfo3.digitaloceanspaces.com'
s3_client = boto3.client('s3',
    endpoint_url=ENDPOINT_URL,
    aws_access_key_id=os.getenv('ACCESS_KEY_ID'),
    aws_secret_access_key=os.getenv('SECRET_ACCESS_KEY'),
    config=Config(s3={'addressing_style': 'virtual'})
)

# Database Configuration from .env.local
DB_URL = os.getenv('POSTGRES_URL_NON_POOLING')  # Using non-pooling URL for long-running script
if not DB_URL:
    raise ValueError("Database URL not found in environment variables")

# Batch size for processing
BATCH_SIZE = 25

async def get_embedding(session: aiohttp.ClientSession, image_data: bytes) -> List[float]:
    """Get embedding from local CLIP server."""
    try:
        async with session.post(
            'http://localhost:8000/embed/image',
            data={'file': image_data}
        ) as response:
            if response.status != 200:
                raise Exception(f"Error from embedding server: {await response.text()}")
            result = await response.json()
            return result['embedding']
    except Exception as e:
        print(f"Error getting embedding: {str(e)}", file=sys.stderr)
        raise

async def get_batch_embeddings(session: aiohttp.ClientSession, image_data_list: List[bytes]) -> List[List[float]]:
    """Get embeddings for multiple images using batch endpoint."""
    try:
        # Create form-data with multiple files
        form_data = aiohttp.FormData()
        for image_data in image_data_list:
            form_data.add_field('files', image_data)

        async with session.post(
            'http://localhost:8000/batch_embed/images',
            data=form_data
        ) as response:
            if response.status != 200:
                raise Exception(f"Error from embedding server: {await response.text()}")
            result = await response.json()
            
            # Extract embeddings from results, handling potential errors
            embeddings = []
            for item in result['results']:
                if item['error']:
                    raise Exception(f"Error in batch response: {item['error']}")
                embeddings.append(item['embedding'])
            return embeddings
    except Exception as e:
        print(f"Error getting batch embeddings: {str(e)}", file=sys.stderr)
        raise

def detect_faces(image_data: bytes) -> List[Tuple[np.ndarray, Tuple[int, int, int, int]]]:
    """
    Detect faces in an image and return face encodings with bounding boxes.
    Returns list of (face_encoding, (top, right, bottom, left)) tuples.
    """
    try:
        # Load image using PIL and convert to RGB
        pil_image = Image.open(io.BytesIO(image_data))
        if pil_image.mode != 'RGB':
            pil_image = pil_image.convert('RGB')
        
        # Convert PIL image to numpy array
        image_array = np.array(pil_image)
        
        # Find face locations and encodings
        face_locations = face_recognition.face_locations(image_array, model="hog")
        face_encodings = face_recognition.face_encodings(image_array, face_locations)
        
        # Combine encodings with normalized bounding boxes
        results = []
        height, width = image_array.shape[:2]
        
        for encoding, (top, right, bottom, left) in zip(face_encodings, face_locations):
            # Normalize coordinates to 0-1 range
            norm_left = left / width
            norm_top = top / height
            norm_right = right / width
            norm_bottom = bottom / height
            
            results.append((encoding, (norm_left, norm_top, norm_right, norm_bottom)))
        
        return results
    except Exception as e:
        print(f"Error detecting faces: {str(e)}", file=sys.stderr)
        return []

async def find_matching_person(cur, face_encoding: np.ndarray, threshold: float = 0.6) -> Optional[int]:
    """
    Find a matching person in the database based on face encoding similarity.
    Returns person_id if match found, None otherwise.
    """
    try:
        # Get all existing people and their face encodings
        await cur.execute("SELECT id, face_encoding FROM people")
        people = await cur.fetchall()
        
        if not people:
            return None
        
        # Compare with existing face encodings
        for person_id, stored_encoding_str in people:
            # Convert stored encoding string back to numpy array
            stored_encoding = np.fromstring(stored_encoding_str.strip('[]'), sep=',')
            
            # Calculate face distance (lower is more similar)
            distance = face_recognition.face_distance([stored_encoding], face_encoding)[0]
            
            if distance < threshold:
                return person_id
        
        return None
    except Exception as e:
        print(f"Error finding matching person: {str(e)}", file=sys.stderr)
        return None

async def create_new_person(cur, face_encoding: np.ndarray, image_id: int) -> int:
    """
    Create a new person entry in the database.
    Returns the new person's ID.
    """
    try:
        # Convert face encoding to string for storage
        encoding_str = str(face_encoding.tolist())
        
        await cur.execute("""
            INSERT INTO people (name, face_encoding, representative_image_id)
            VALUES (%s, %s, %s)
            RETURNING id
        """, (f"Person_{int(time.time())}", encoding_str, image_id))
        
        result = await cur.fetchone()
        return result[0]
    except Exception as e:
        print(f"Error creating new person: {str(e)}", file=sys.stderr)
        raise

async def store_face_detection(cur, person_id: int, image_id: int, bbox: Tuple[float, float, float, float], confidence: float = 0.8):
    """
    Store a face detection result in the people_images table.
    """
    try:
        left, top, right, bottom = bbox
        await cur.execute("""
            INSERT INTO people_images (person_id, image_id, face_left, face_top, face_right, face_bottom, confidence)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (person_id, image_id, face_left, face_top, face_right, face_bottom) DO NOTHING
        """, (person_id, image_id, left, top, right, bottom, confidence))
    except Exception as e:
        print(f"Error storing face detection: {str(e)}", file=sys.stderr)
        raise

async def process_batch(
    session: aiohttp.ClientSession,
    batch: List[Dict],
    executor: ThreadPoolExecutor,
    cur,
    conn,
    test_face_dir: Optional[str] = None,
    dry_run: bool = False
) -> List[tuple]:
    """Process a batch of images for both embeddings and facial recognition."""
    results = []
    image_data_list = []
    successful_items = []
    
    # Download all images in batch
    for item in batch:
        try:
            thumbnail_key = f"thumbnails/{item['path'].split('/', 1)[1]}"
            loop = asyncio.get_running_loop()
            
            response = await loop.run_in_executor(
                executor,
                lambda: s3_client.get_object(Bucket=BUCKET_NAME, Key=thumbnail_key)
            )
            image_data = await loop.run_in_executor(
                executor,
                lambda: response['Body'].read()
            )
            
            image_data_list.append(image_data)
            successful_items.append(item)
            print(f"Downloaded {item['path']}")
            
        except Exception as e:
            print(f"Error downloading {item['path']}: {str(e)}", file=sys.stderr)
            continue
    
    if image_data_list:
        try:
            # Get embeddings for all images at once
            embeddings = await get_batch_embeddings(session, image_data_list)
            
            # Process each image for facial recognition
            for item, embedding, image_data in zip(successful_items, embeddings, image_data_list):
                # Store embedding result
                results.append((item['id'], embedding))
                print(f"Processed embedding for {item['path']}")
                
                # Detect faces in the image
                faces = await asyncio.get_event_loop().run_in_executor(
                    executor, detect_faces, image_data
                )
                
                if faces:
                    print(f"Found {len(faces)} face(s) in {item['path']}")
                    
                    for face_encoding, bbox in faces:
                        if dry_run:
                            # In dry run mode, simulate person matching/creation
                            person_id = await find_matching_person(cur, face_encoding)
                            if person_id is None:
                                person_id = 999999  # Placeholder ID for dry run
                                print(f"[DRY RUN] Would create new person from {item['path']}")
                            else:
                                print(f"[DRY RUN] Would match face to existing person {person_id} in {item['path']}")
                            print(f"[DRY RUN] Would store face detection for person {person_id}")
                        else:
                            # Find matching person or create new one
                            person_id = await find_matching_person(cur, face_encoding)
                            
                            if person_id is None:
                                # Create new person
                                person_id = await create_new_person(cur, face_encoding, item['id'])
                                print(f"Created new person {person_id} from {item['path']}")
                            else:
                                print(f"Matched face to existing person {person_id} in {item['path']}")
                            
                            # Store the face detection
                            await store_face_detection(cur, person_id, item['id'], bbox)
                        
                        # If test_face_dir is provided, save images organized by person
                        if test_face_dir:
                            await save_test_face_image(test_face_dir, person_id, image_data, item['path'])
                
                # Commit after each image to ensure data is saved (unless dry run)
                if not dry_run:
                    await conn.commit()
                
        except Exception as e:
            print(f"Error processing batch: {str(e)}", file=sys.stderr)
    
    return results

async def save_test_face_image(test_face_dir: str, person_id: int, image_data: bytes, image_path: str):
    """Save image to test directory organized by person."""
    try:
        person_dir = os.path.join(test_face_dir, f"person_{person_id}")
        os.makedirs(person_dir, exist_ok=True)
        
        # Extract filename from path
        filename = os.path.basename(image_path)
        output_path = os.path.join(person_dir, filename)
        
        # Save the image
        with open(output_path, 'wb') as f:
            f.write(image_data)
        
        print(f"Saved test image: {output_path}")
    except Exception as e:
        print(f"Error saving test face image: {str(e)}", file=sys.stderr)

async def main():
    parser = argparse.ArgumentParser(description='Reprocess images for embeddings and facial recognition')
    parser.add_argument('--test-face-dir', type=str, help='Directory to save test face images organized by person')
    parser.add_argument('--dry', action='store_true', help='Dry run mode: do not make any changes to the database')
    args = parser.parse_args()
    
    if args.dry:
        print("DRY RUN MODE: No changes will be made to the database")
    
    if args.test_face_dir:
        os.makedirs(args.test_face_dir, exist_ok=True)
        print(f"Test face images will be saved to: {args.test_face_dir}")
    
    # Connect to database
    async with await psycopg.AsyncConnection.connect(DB_URL) as conn:
        async with conn.cursor() as cur:
            # Get all images that don't have embeddings yet
            await cur.execute("""
                SELECT m.id, m.path 
                FROM image_metadata m 
                LEFT JOIN image_embeddings e ON m.id = e.image_id 
                WHERE e.id IS NULL
            """)
            all_images = await cur.fetchall()
            
            if not all_images:
                print("No images to process")
                return
                
            print(f"Found {len(all_images)} images to process")
            
            # Process in batches
            async with aiohttp.ClientSession() as session:
                with ThreadPoolExecutor(max_workers=4) as executor:
                    for i in range(0, len(all_images), BATCH_SIZE):
                        batch = [{'id': row[0], 'path': row[1]} 
                                for row in all_images[i:i + BATCH_SIZE]]
                        
                        print(f"\nProcessing batch {i//BATCH_SIZE + 1}/{(len(all_images) + BATCH_SIZE - 1)//BATCH_SIZE}")
                        
                        results = await process_batch(session, batch, executor, cur, conn, args.test_face_dir, args.dry)
                        
                        # Store embeddings
                        if results:
                            if args.dry:
                                print(f"[DRY RUN] Would store {len(results)} embeddings")
                            else:
                                await cur.executemany("""
                                    INSERT INTO image_embeddings (image_id, embedding)
                                    VALUES (%s, %s)
                                """, results)
                                await conn.commit()
                                print(f"Stored {len(results)} embeddings")

if __name__ == "__main__":
    asyncio.run(main())