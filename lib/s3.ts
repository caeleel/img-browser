import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { BucketItem, BucketItemWithBlob, S3Response } from './types';

const BUCKET_NAME = 'terencefischer';
const REGION = 'sfo3';
const ENDPOINT = 'https://sfo3.digitaloceanspaces.com';

let cachedS3Client: S3Client | null = null;

export const ROOT_CONTENTS: BucketItemWithBlob[] = [
  { type: 'directory', name: 'photos', path: 'photos/' },
  { type: 'directory', name: 'videos', path: 'videos/' },
];
const ROOT_PATHS = ROOT_CONTENTS.map(item => item.path.slice(0, -1));

function getCredentials() {
  const savedCredentials = localStorage.getItem('doCredentials');
  if (!savedCredentials) {
    throw new Error('No credentials found');
  }
  return JSON.parse(savedCredentials);
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

export async function signedUrl(item: BucketItem): Promise<string> {
  const s3Client = getS3Client();

  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: item.path,
  });

  // URL expires in 1 hour
  return getSignedUrl(s3Client, command, { expiresIn: 3600 });
} 