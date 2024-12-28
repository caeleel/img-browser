import { atom, createStore } from 'jotai';
import { UploadStatus } from './upload';

export const globalStore = createStore();
export const uploadStatusAtom = atom<UploadStatus | null>(null);
export const abortControllerAtom = atom<AbortController | null>(null);
export const showFooterAtom = atom<boolean>(false);