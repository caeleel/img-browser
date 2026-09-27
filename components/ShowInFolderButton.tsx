'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { BucketItemWithBlob } from '@/lib/types';
import FolderIcon from './icons/FolderIcon';

// Opens the image in its folder (the folder browser jumps to its page and opens the viewer).
// Hidden when already browsing that folder.
export default function ShowInFolderButton({ image }: { image: BucketItemWithBlob }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const folder = image.path.slice(0, image.path.lastIndexOf('/') + 1);
  if (pathname === '/' && searchParams.get('path') === folder) return null;

  return (
    <button
      onClick={() => router.push(`/?${new URLSearchParams({ path: folder, image: image.path })}`)}
      className="rounded hover:bg-white/10 group p-0.5"
      title={`Show in folder ${folder.split('/').slice(-2)[0]}`}
    >
      <FolderIcon color="#fff" size={20} />
    </button>
  );
}
