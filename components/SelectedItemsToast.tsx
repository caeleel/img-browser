'use client';

import { useAtom } from 'jotai';
import { selectedItemsAtom, allContentsAtom } from '@/lib/atoms';
import { useState } from "react";
import TrashIcon from "./icons/TrashIcon";
import { deleteFileWithMetadata } from '@/lib/db';
import LoadingSpinner from './LoadingSpinner';

export default function SelectedItemsToast() {
  const [selectedItems, setSelectedItems] = useAtom(selectedItemsAtom);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [allContents, setAllContents] = useAtom(allContentsAtom);

  // Filter to only images
  const selectedImages = Object.values(selectedItems).filter(item => item.type === 'image');
  if (selectedImages.length === 0) return null;

  const handleDelete = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setError(null);
    setIsDeleting(true);

    try {
      const paths = selectedImages.map(item => item.path);
      await deleteFileWithMetadata(paths);
      setSelectedItems({});
      setAllContents(allContents.filter(item => !paths.includes(item.path)));
      setShowConfirm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete items');
      setShowConfirm(false);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-4 bg-white/70 backdrop-blur-lg rounded-lg shadow-[0_4px_10px_rgba(0,0,0,0.1)] p-4">
        <div className="text-sm">
          {error ? (
            <span className="text-red-500">{error}</span>
          ) : (
            <span className="text-black/70">
              {selectedImages.length} item{selectedImages.length !== 1 ? 's' : ''} selected
            </span>
          )}
        </div>
        <div className="h-4 w-px bg-black/10" />
        <button
          onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
            e.stopPropagation();
            setShowConfirm(true);
          }}
          className="p-1 hover:bg-black/5 rounded"
          title="Delete selected items"
          disabled={isDeleting}
        >
          <TrashIcon />
        </button>
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