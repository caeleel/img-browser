import router from "next/router";
import { clearS3Cache, getCredentials, signedUrl } from "./s3";
import { BucketItemWithBlob, Favorite } from "./types";
import { favoritesAtom, globalStore } from "./atoms";
import JSZip from 'jszip';
import { IMAGE_EXTENSIONS } from "./upload";

export function blur(e: KeyboardEvent) {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  (e.target as HTMLElement)?.blur ? (e.target as HTMLElement).blur() : null;
}

export function getFileType(path: string): 'image' | 'video' {
  const ext = path.split('.').pop()?.toLowerCase();
  return IMAGE_EXTENSIONS.includes(`.${ext}`) ? 'image' : 'video';
}

export function getCssOrientation(orientation: number) {
  if (orientation === 6) {
    return 'rotate-90';
  } else if (orientation === 8) {
    return '-rotate-90';
  }
  return '';
}

export function getThumbnailUrl(path: string) {
  const thumbnailPath = path.replace('photos', 'thumbnails');
  return signedUrl(thumbnailPath);
}

export function logout() {
  localStorage.removeItem('doCredentials');
  clearS3Cache();
  router.push('/');
}

export async function getFavorites(): Promise<Favorite[]> {
  const credentials = getCredentials();
  if (!credentials) return [];
  const response = await fetch('/api/favorites', {
    headers: {
      'X-DO-ACCESS-KEY-ID': credentials.accessKeyId,
      'X-DO-SECRET-ACCESS-KEY': credentials.secretAccessKey,
    },
  });
  return response.json();
}

export async function toggleFavorites(images: BucketItemWithBlob[], favorite: boolean) {
  const credentials = getCredentials();
  const ids = images.map(img => img.metadata!.id)
  let success = false;
  if (favorite) {
    success = (await fetch('/api/favorites', {
      method: 'POST',
      body: JSON.stringify({ ids, credentials }),
    })).ok;
  } else {
    success = (await fetch('/api/favorites', {
      method: 'DELETE',
      body: JSON.stringify({ ids, credentials }),
    })).ok;
  }
  if (!success) return false;

  const newFavorites = await getFavorites();
  globalStore.set(favoritesAtom, newFavorites);
  return true;
}

function downloadBlob(blob: Blob, filename: string) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

export async function downloadFiles(paths: string[]) {
  // Get all signed URLs
  const urls = await Promise.all(paths.map(path => signedUrl(path)));

  if (urls.length === 1) {
    const response = await fetch(urls[0]);
    const filename = paths[0].split('/').pop() || 'unknown';

    downloadBlob(await response.blob(), filename);
    return;
  }

  const zip = new JSZip();
  const folder = zip.folder("photos");
  if (!folder) throw new Error("Failed to create zip folder");

  // Fetch all files and add them to zip
  await Promise.all(urls.map(async (url, index) => {
    const response = await fetch(url);
    const filename = paths[index].split('/').pop() || 'unknown';
    folder.file(filename, await response.blob());
  }));

  // Generate zip file
  const zipBlob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: {
      level: 5
    }
  });

  // Download zip file
  downloadBlob(zipBlob, `photos-${new Date().toISOString().split('T')[0]}.zip`);
}