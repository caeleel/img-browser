import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { BucketItem, S3Response, S3Credentials } from '../types';

const BUCKET_NAME = 'terencefischer';
const REGION = 'sfo3';
const ENDPOINT = 'https://sfo3.digitaloceanspaces.com';

function getS3Client(credentials: S3Credentials) {
  return new S3Client({
    region: REGION,
    endpoint: ENDPOINT,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
    }
  });
}

export async function fetchFile(item: BucketItem, credentials: S3Credentials): Promise<string> {
  const s3Client = getS3Client(credentials);

  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: item.key,
  });

  const response = await s3Client.send(command);

  if (!response.Body) {
    throw new Error('No file content received');
  }

  // Convert the readable stream to a blob
  const responseArrayBuffer = await response.Body.transformToByteArray();
  const blob = new Blob([responseArrayBuffer], {
    type: response.ContentType || 'application/octet-stream'
  });

  return URL.createObjectURL(blob);
}

export async function listContents(path: string, credentials: S3Credentials, continuationToken?: string): Promise<S3Response> {
  const s3Client = getS3Client(credentials);

  const firstDir = path.split('/')[0];
  if (firstDir !== 'photos' && firstDir !== 'videos' && firstDir !== 'thumbnails') {
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