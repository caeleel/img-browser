import { deleteFile, getCredentials } from "./s3";
import { ImageMetadata, S3Credentials } from "./types";

// Client-side only
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

export async function updateMetadata(ids: number[], metadata: Partial<ImageMetadata>, credentials: S3Credentials) {
  const response = await fetch('/api/metadata', {
    method: 'PUT',
    body: JSON.stringify({ ids, metadata, credentials })
  });
  return await response.json();
}

// Server-side only
// Not NEXT_PUBLIC_: these must never be inlined into the client bundle.
const ACCESS_KEY_ID = process.env.ACCESS_KEY_ID || '';
const SECRET_ACCESS_KEY = process.env.SECRET_ACCESS_KEY || '';

// Synchronous on purpose: routes call it as `if (!credentialsValid(...))`, and an async
// version returns a Promise, which is always truthy, so every request would pass.
export function credentialsValid(credentials: Partial<S3Credentials> | null | undefined) {
  if (!ACCESS_KEY_ID || !SECRET_ACCESS_KEY) return false;
  return credentials?.accessKeyId === ACCESS_KEY_ID && credentials?.secretAccessKey === SECRET_ACCESS_KEY;
}

export async function deleteFileWithMetadata(paths: string[]) {
  const credentials = getCredentials();
  const response = await fetch('/api/metadata', {
    method: 'DELETE',
    body: JSON.stringify({ paths, credentials })
  });
  if (response.ok) {
    for (const path of paths) {
      await deleteFile(path)
    }
  } else {
    throw new Error('Error erasing file from DB')
  }
}