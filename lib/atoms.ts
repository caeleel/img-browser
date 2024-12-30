import { atom, createStore, useAtomValue } from 'jotai';
import { UploadStatus } from './upload';
import { BucketItemWithBlob, Favorite } from './types';
import { useMemo } from 'react';

export const globalStore = createStore();
export const uploadStatusAtom = atom<UploadStatus | null>(null);
export const abortControllerAtom = atom<AbortController | null>(null);
export const showFooterAtom = atom<boolean>(false);
export const selectedItemsAtom = atom<{ [path: string]: BucketItemWithBlob }>({});
export const allContentsAtom = atom<BucketItemWithBlob[]>([]);
export const favoritesAtom = atom<Favorite[]>([]);
export const credentialsAtom = atom<{ accessKeyId: string; secretAccessKey: string } | null>(null);

export function useFavoriteIds() {
  const favorites = useAtomValue(favoritesAtom);
  return useMemo(() => new Set(favorites.map(f => f.image_id)), [favorites]);
}