import router from "next/router";
import { clearS3Cache, getCredentials, signedUrl } from "./s3";
import { BucketItemWithBlob, Favorite } from "./types";
import { favoritesAtom, globalStore } from "./atoms";

export function blur(e: KeyboardEvent) {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  (e.target as HTMLElement)?.blur ? (e.target as HTMLElement).blur() : null;
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
