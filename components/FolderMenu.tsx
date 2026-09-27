'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { BucketItemWithBlob } from '@/lib/types';
import { setFolderCover } from '@/lib/db';
import { getCredentials, ROOT_PATH } from '@/lib/s3';
import FolderIcon from './icons/FolderIcon';

// Folders containing `path`, nearest first, excluding the root: photos/a/b/x.jpg -> [photos/a/b/, photos/a/]
function containingFolders(path: string): string[] {
  const parts = path.split('/').slice(0, -1);
  const folders: string[] = [];
  for (let i = parts.length; i > 1; i--) {
    folders.push(parts.slice(0, i).join('/') + '/');
  }
  return folders.filter(folder => folder !== `${ROOT_PATH}/`);
}

const folderName = (folder: string) => folder.split('/').slice(-2)[0];

export default function FolderMenu({ image }: { image: BucketItemWithBlob }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, right: 0 });
  const [status, setStatus] = useState<{ folder: string, state: 'saving' | 'done' | 'error' } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const folders = containingFolders(image.path);
  const imageFolder = image.path.slice(0, image.path.lastIndexOf('/') + 1);
  const inImageFolder = pathname === '/' && searchParams.get('path') === imageFolder;

  useEffect(() => setStatus(null), [image.path]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !buttonRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  const toggle = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setPosition({ top: rect.bottom + 12, right: window.innerWidth - rect.right });
    setOpen(prev => !prev);
  };

  const setCover = async (folder: string) => {
    if (!image.metadata?.id) return;
    setStatus({ folder, state: 'saving' });
    try {
      await setFolderCover(folder, image.metadata.id, getCredentials());
      setStatus({ folder, state: 'done' });
    } catch (error) {
      console.error('Error setting folder cover:', error);
      setStatus({ folder, state: 'error' });
    }
  };

  const showInFolder = () => {
    const params = new URLSearchParams({ path: imageFolder, image: image.path });
    router.push(`/?${params.toString()}`);
  };

  const itemClass = 'w-full text-left px-3 py-1.5 rounded hover:bg-white/10 flex justify-between gap-4 disabled:opacity-40 disabled:hover:bg-transparent';

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggle}
        className="rounded hover:bg-white/10 group p-0.5"
        title="Folder options"
      >
        <FolderIcon color="#fff" size={20} />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          className="fixed z-30 min-w-56 rounded-lg shadow-md backdrop-blur-md bg-black/80 p-1 text-sm text-white"
          style={{ top: position.top, right: position.right }}
        >
          {!inImageFolder && (
            <button className={itemClass} onClick={showInFolder}>
              Show in folder <span className="text-white/50">{folderName(imageFolder)}</span>
            </button>
          )}
          {folders.length > 0 && (
            <>
              <div className="px-3 pt-2 pb-1 text-xs text-white/50">Set as cover for</div>
              {folders.map(folder => (
                <button
                  key={folder}
                  className={itemClass}
                  disabled={!image.metadata?.id || status?.state === 'saving'}
                  onClick={() => setCover(folder)}
                >
                  <span>📁 {folderName(folder)}</span>
                  <span className="text-white/50">
                    {status?.folder === folder && {
                      saving: 'Saving…',
                      done: '✓ Set',
                      error: 'Failed',
                    }[status.state]}
                  </span>
                </button>
              ))}
            </>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
