import { ImageMetadata, S3Credentials } from "./types";

export async function fetchMetadata(paths: string[], credentials: S3Credentials): Promise<Record<string, ImageMetadata>> {
  if (paths.length === 0) {
    return {};
  }

  const response = await fetch('/api/batch_meta', {
    method: 'POST',
    body: JSON.stringify({ paths, credentials })
  });
  return await response.json();
}

const ACCESS_KEY_ID = process.env.NEXT_PUBLIC_DO_ACCESS_KEY_ID || '';
const SECRET_ACCESS_KEY = process.env.NEXT_PUBLIC_DO_SECRET_ACCESS_KEY || '';

export async function credentialsValid(credentials: S3Credentials) {
  return credentials.accessKeyId === ACCESS_KEY_ID && credentials.secretAccessKey === SECRET_ACCESS_KEY;
}