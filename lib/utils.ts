import { signedUrl } from "./s3";

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
  return signedUrl({ path: thumbnailPath });
}