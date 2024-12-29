'use client';

import { useAtom } from 'jotai';
import { selectedItemsAtom, allContentsAtom } from '@/lib/atoms';
import { useState } from "react";
import TrashIcon from "./icons/TrashIcon";
import { deleteFileWithMetadata } from '@/lib/db';
import LoadingSpinner from './LoadingSpinner';

export default function SelectedItemsUI() {
  const [selectedItems, setSelectedItems] = useAtom(selectedItemsAtom);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [allContents, setAllContents] = useAtom(allContentsAtom);

  // Filter to only images
  const selectedImages = Object.values(selectedItems).filter(item => item.type === 'image');
  const isShown = selectedImages.length > 0;

  const handleDelete = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setIsDeleting(true);
    if (!isShown) return;

    try {
      const paths = selectedImages.map(item => item.path);
      await deleteFileWithMetadata(paths);
      setSelectedItems({});
      setAllContents(allContents.filter(item => !paths.includes(item.path)));
      setShowConfirm(false);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className={`fixed flex justify-center items-center gap-4 pointer-events-none left-0 right-0 p-1.5 z-20 ${isShown ? 'top-0' : '-top-12'}`} style={{
        transition: 'top 0.3s ease-in-out'
      }}>
        <div className="bg-neutral-100/50 shadow-inner backdrop-blur-lg rounded-full p-0.5 pointer-events-auto w-[168px] h-9 flex items-center justify-around">
          <button
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
              e.stopPropagation();
              setShowConfirm(true);
            }}
            className="p-0.5 hover:bg-black/5 rounded-full"
            title="Delete selected items"
            disabled={isDeleting}
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white/70 backdrop-blur-lg rounded-lg p-6 max-w-sm">
            <p className="text-black/50 mb-6 text-sm">
              Are you sure you want to delete {selectedImages.length} item{selectedImages.length !== 1 ? 's' : ''}?
              This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-1 text-sm hover:bg-black/5 rounded-full disabled:opacity-50"
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="relative px-4 py-1 text-sm bg-red-500 text-white rounded-full hover:bg-red-600 disabled:opacity-50 min-w-[80px]"
              >
                {isDeleting ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <LoadingSpinner size="small" light />
                  </div>
                ) : (
                  'Delete'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
} 