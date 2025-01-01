import os
import sys
import boto3
from pathlib import Path
from dotenv import load_dotenv
from concurrent.futures import ThreadPoolExecutor
from tqdm import tqdm

# Load environment variables from .env file
load_dotenv()

# Configure S3 client for Digital Ocean Spaces
session = boto3.session.Session()
client = session.client('s3',
    region_name='sfo3',
    endpoint_url='https://sfo3.digitaloceanspaces.com',
    aws_access_key_id=os.getenv('ACCESS_KEY_ID'),
    aws_secret_access_key=os.getenv('SECRET_ACCESS_KEY')
)

def download_file(bucket: str, key: str, output_dir: Path, prefix: str):
    """Download a single file from DO Spaces"""
    try:
        # Remove the prefix from the output path
        relative_path = key[len(prefix):].lstrip('/')
        output_path = output_dir / relative_path
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Get file size for progress bar
        response = client.head_object(Bucket=bucket, Key=key)
        file_size = response['ContentLength']
        
        # Download with progress bar
        with tqdm(total=file_size, unit='B', unit_scale=True, desc=relative_path) as pbar:
            client.download_file(
                Bucket=bucket,
                Key=key,
                Filename=str(output_path),
                Callback=lambda bytes_transferred: pbar.update(bytes_transferred)
            )
        return True
    except Exception as e:
        print(f"Error downloading {key}: {str(e)}", file=sys.stderr)
        return False

def download_directory(bucket: str, prefix: str, output_dir: str, max_workers: int = 4):
    """Download all files from a directory in DO Spaces"""
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    # Ensure prefix ends with / to match only contents
    prefix = prefix.rstrip('/') + '/'
    
    # List all objects in the directory
    paginator = client.get_paginator('list_objects_v2')
    objects = []
    
    print(f"Listing files in {prefix}...")
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        if 'Contents' in page:
            # Filter out the directory itself
            objects.extend([obj for obj in page['Contents'] 
                          if obj['Key'] != prefix])
    
    if not objects:
        print(f"No files found in {prefix}")
        return
    
    print(f"Found {len(objects)} files. Starting download...")
    
    # Download files in parallel
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [
            executor.submit(download_file, bucket, obj['Key'], output_path, prefix)
            for obj in objects
        ]
        
        # Wait for all downloads to complete
        success = 0
        for future in futures:
            if future.result():
                success += 1
    
    print(f"\nDownload complete. Successfully downloaded {success}/{len(objects)} files")

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python download.py <space_directory> <output_directory>")
        print("Example: python download.py photos/vacation local/vacation")
        sys.exit(1)
    
    space_dir = sys.argv[1]
    output_dir = sys.argv[2]
    
    BUCKET_NAME = "terencefischer"
    MAX_CONCURRENT_DOWNLOADS = 4
    
    download_directory(BUCKET_NAME, space_dir, output_dir, MAX_CONCURRENT_DOWNLOADS) 