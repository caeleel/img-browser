import os
import sys
import asyncio
import aiohttp
import psycopg
from dotenv import load_dotenv
import boto3
from botocore.config import Config
from concurrent.futures import ThreadPoolExecutor
from typing import List, Dict
import time

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

async def process_batch(
    session: aiohttp.ClientSession,
    batch: List[Dict],
    executor: ThreadPoolExecutor
) -> List[tuple]:
    """Process a batch of images."""
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
            
            # Pair embeddings with their corresponding items
            for item, embedding in zip(successful_items, embeddings):
                results.append((item['id'], embedding))
                print(f"Processed {item['path']}")
                
        except Exception as e:
            print(f"Error processing batch: {str(e)}", file=sys.stderr)
    
    return results

async def main():
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
                        
                        results = await process_batch(session, batch, executor)
                        
                        # Store embeddings
                        if results:
                            await cur.executemany("""
                                INSERT INTO image_embeddings (image_id, embedding)
                                VALUES (%s, %s)
                            """, results)
                            await conn.commit()
                            print(f"Stored {len(results)} embeddings")

if __name__ == "__main__":
    asyncio.run(main()) 