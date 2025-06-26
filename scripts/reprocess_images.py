import os
import sys
import asyncio
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

async def cluster_unknown_faces(
    unknown_faces: List[Tuple[np.ndarray, Dict]], 
    cur, 
    conn,
    dry_run: bool = False,
    eps: float = 0.5,
    min_samples: int = 2
) -> Dict[np.ndarray, int]:
    """
    Cluster unknown face encodings and create new people for each cluster.
    Returns mapping from face_encoding to person_id.
    """
    if not unknown_faces:
        return {}
    
    print(f"Clustering {len(unknown_faces)} unknown faces...")
    
    # Extract face encodings for clustering
    face_encodings = np.array([face_data[0] for face_data in unknown_faces])
    
    # Use DBSCAN clustering
    # eps: max distance between samples in same cluster
    # min_samples: min samples in neighborhood for core point
    clustering = DBSCAN(eps=eps, min_samples=min_samples, metric='euclidean')
    cluster_labels = clustering.fit_predict(face_encodings)
    
    # Create mapping from face encoding to person_id
    encoding_to_person = {}
    
    # Get unique clusters (excluding noise points labeled as -1)
    unique_labels = set(cluster_labels)
    n_clusters = len(unique_labels) - (1 if -1 in unique_labels else 0)
    n_noise = list(cluster_labels).count(-1)
    
    print(f"Found {n_clusters} face clusters and {n_noise} noise points")
    
    # Create people for each cluster
    for cluster_id in unique_labels:
        if cluster_id == -1:
            # Handle noise points individually (create separate person for each)
            noise_indices = [i for i, label in enumerate(cluster_labels) if label == -1]
            for noise_idx in noise_indices:
                face_encoding, face_data = unknown_faces[noise_idx]
                
                if dry_run:
                    person_id = 999900 + noise_idx  # Placeholder for dry run
                    print(f"[DRY RUN] Would create person for noise face from {face_data['image_path']}")
                else:
                    person_id = await create_new_person(cur, face_encoding, face_data['image_id'])
                    print(f"Created person {person_id} for noise face from {face_data['image_path']}")
                
                encoding_to_person[face_encoding.tobytes()] = person_id
        else:
            # Create one person for the entire cluster
            cluster_indices = [i for i, label in enumerate(cluster_labels) if label == cluster_id]
            cluster_size = len(cluster_indices)
            
            # Use the first face in the cluster as representative
            representative_idx = cluster_indices[0]
            face_encoding, face_data = unknown_faces[representative_idx]
            
            if dry_run:
                person_id = 999000 + cluster_id  # Placeholder for dry run
                print(f"[DRY RUN] Would create person for cluster {cluster_id} (size: {cluster_size}) from {face_data['image_path']}")
            else:
                person_id = await create_new_person(cur, face_encoding, face_data['image_id'])
                print(f"Created person {person_id} for cluster {cluster_id} (size: {cluster_size}) from {face_data['image_path']}")
            
            # Map all faces in this cluster to the same person
            for cluster_idx in cluster_indices:
                cluster_face_encoding, _ = unknown_faces[cluster_idx]
                encoding_to_person[cluster_face_encoding.tobytes()] = person_id
    
    return encoding_to_person

async def process_batch(
    batch: List[Dict],
    executor: ThreadPoolExecutor,
    cur,
    conn,
    test_face_dir: Optional[str] = None,
    dry_run: bool = False
):
    """Process a batch of images for facial recognition only."""
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
            # First pass: collect all face data from images
            all_faces_data = []  # List of (face_encoding, bbox, item, image_data)
            
            for item, image_data in zip(successful_items, image_data_list):
                print(f"Processing faces for {item['path']}")
                
                # Detect faces in the image
                faces = await asyncio.get_event_loop().run_in_executor(
                    executor, detect_faces, image_data
                )
                
                if faces:
                    print(f"Found {len(faces)} face(s) in {item['path']}")
                    for face_encoding, bbox in faces:
                        all_faces_data.append((face_encoding, bbox, item, image_data))
                else:
                    print(f"No faces found in {item['path']}")
            
            # Second pass: separate known vs unknown faces
            known_faces = []  # (face_encoding, bbox, item, image_data, person_id)
            unknown_faces = []  # (face_encoding, face_data_dict)
            
            for face_encoding, bbox, item, image_data in all_faces_data:
                person_id = await find_matching_person(cur, face_encoding)
                
                if person_id is not None:
                    # Known face
                    known_faces.append((face_encoding, bbox, item, image_data, person_id))
                    print(f"Matched face to existing person {person_id} in {item['path']}")
                else:
                    # Unknown face - add to clustering list
                    face_data = {
                        'image_id': item['id'],
                        'image_path': item['path'],
                        'bbox': bbox,
                        'image_data': image_data
                    }
                    unknown_faces.append((face_encoding, face_data))
            
            # Third pass: cluster unknown faces and create new people
            encoding_to_person = {}
            if unknown_faces:
                encoding_to_person = await cluster_unknown_faces(unknown_faces, cur, conn, dry_run)
            
            # Fourth pass: store all face detections
            # Handle known faces
            for face_encoding, bbox, item, image_data, person_id in known_faces:
                if not dry_run:
                    await store_face_detection(cur, person_id, item['id'], bbox)
                else:
                    print(f"[DRY RUN] Would store known face detection for person {person_id}")
                
                if test_face_dir:
                    await save_test_face_image(test_face_dir, person_id, image_data, item['path'])
            
            # Handle unknown faces (now clustered)
            for face_encoding, face_data in unknown_faces:
                encoding_key = face_encoding.tobytes()
                person_id = encoding_to_person.get(encoding_key)
                
                if person_id:
                    if not dry_run:
                        await store_face_detection(cur, person_id, face_data['image_id'], face_data['bbox'])
                    else:
                        print(f"[DRY RUN] Would store clustered face detection for person {person_id}")
                    
                    if test_face_dir:
                        await save_test_face_image(test_face_dir, person_id, face_data['image_data'], face_data['image_path'])
            
            # Commit all face detection data for this batch (unless dry run)
            if not dry_run:
                await conn.commit()
                
        except Exception as e:
            print(f"Error processing batch: {str(e)}", file=sys.stderr)

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
    parser = argparse.ArgumentParser(description='Process all images for facial recognition')
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
            # Get all images from the metadata table
            await cur.execute("""
                SELECT id, path FROM image_metadata
                ORDER BY created_at DESC
            """)
            all_images = await cur.fetchall()
            
            if not all_images:
                print("No images found in database")
                return
                
            print(f"Found {len(all_images)} images to process for facial recognition")
            
            # Process in batches
            with ThreadPoolExecutor(max_workers=4) as executor:
                for i in range(0, len(all_images), BATCH_SIZE):
                    batch = [{'id': row[0], 'path': row[1]} 
                            for row in all_images[i:i + BATCH_SIZE]]
                    
                    print(f"\nProcessing batch {i//BATCH_SIZE + 1}/{(len(all_images) + BATCH_SIZE - 1)//BATCH_SIZE}")
                    
                    await process_batch(batch, executor, cur, conn, args.test_face_dir, args.dry)

if __name__ == "__main__":
    asyncio.run(main())