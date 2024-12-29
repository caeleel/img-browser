import { atom, createStore } from 'jotai';
import { UploadStatus } from './upload';
import { BucketItemWithBlob } from './types';

export const globalStore = createStore();
export const uploadStatusAtom = atom<UploadStatus | null>(null);
export const abortControllerAtom = atom<AbortController | null>(null);
export const showFooterAtom = atom<boolean>(false);
export const selectedItemsAtom = atom<{ [path: string]: BucketItemWithBlob }>({});
export const allContentsAtom = atom<BucketItemWithBlob[]>([]);
export const favoritesAtom = atom<Set<number>>(new Set<number>());