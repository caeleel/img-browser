import { S3Client, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { BucketItemWithBlob, S3Response } from './types';

const BUCKET_NAME = 'terencefischer';
const REGION = 'sfo3';
const ENDPOINT = 'https://sfo3.digitaloceanspaces.com';

let cachedS3Client: S3Client | null = null;

export const ROOT_CONTENTS: BucketItemWithBlob[] = [
  { type: 'directory', name: 'photos', path: 'photos/' },
  { type: 'directory', name: 'videos', path: 'videos/' },
];
const ROOT_PATHS = ROOT_CONTENTS.map(item => item.path.slice(0, -1));

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

export async function fetchFile(key: string): Promise<string> {
  const s3Client = getS3Client();

  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  const response = await s3Client.send(command);

  if (!response.Body) {
    throw new Error('No file content received');
  }

  const responseArrayBuffer = await response.Body.transformToByteArray();
  const blob = new Blob([responseArrayBuffer], {
    type: response.ContentType || 'application/octet-stream'
  });

  return URL.createObjectURL(blob);
}

export async function listContents(path: string, continuationToken?: string): Promise<S3Response> {
  const s3Client = getS3Client();

  const firstDir = path.split('/')[0];
  if (!ROOT_PATHS.includes(firstDir)) {
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

export async function signedUrl(key: string): Promise<string> {
  const s3Client = getS3Client();

  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  // URL expires in 1 hour
  return getSignedUrl(s3Client, command, { expiresIn: 3600 });
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