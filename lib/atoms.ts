import { atom, createStore, useAtomValue, useSetAtom } from 'jotai';
import { UploadStatus } from './upload';
import { BucketItemWithBlob, Favorite } from './types';
import { useEffect, useMemo, useState } from 'react';
import { getFavorites } from './utils';

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

export function useLoadCredentials() {
  const setCredentials = useSetAtom(credentialsAtom);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedCredentials = localStorage.getItem('doCredentials')
    if (savedCredentials) {
      setCredentials(JSON.parse(savedCredentials))
    }
    setLoading(false)
  }, []);

  return loading
}

export function useLoadFavorites(onComplete: () => void = () => { }) {
  const setFavorites = useSetAtom(favoritesAtom)
  useEffect(() => {
    const fetchFavorites = async () => {
      const newFavorites = await getFavorites()
      const favorites = globalStore.get(favoritesAtom)

      let favoritesChanged = false
      if (favorites.length !== newFavorites.length) {
        favoritesChanged = true
      } else {
        const prevFavoriteIds = new Set(favorites.map(f => f.image_id))

        for (const favorite of newFavorites) {
          if (!prevFavoriteIds.has(favorite.image_id)) {
            favoritesChanged = true
            break
          }
        }
      }
      if (favoritesChanged) {
        setFavorites(newFavorites)
      }
      onComplete()
    }
    fetchFavorites()
  }, [])
}