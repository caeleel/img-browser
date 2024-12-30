'use client';

import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { selectedItemsAtom, allContentsAtom, favoritesAtom, useFavoriteIds, credentialsAtom } from '@/lib/atoms';
import { useState, useEffect, useMemo } from "react";
import TrashIcon from "./icons/TrashIcon";
import HeartIcon from "./icons/HeartIcon";
import { deleteFileWithMetadata } from '@/lib/db';
import LoadingSpinner from './LoadingSpinner';
import { getFavorites, toggleFavorites } from '@/lib/utils';
import { BucketItemWithBlob } from '@/lib/types';
import { createPortal } from 'react-dom';

export default function SelectedItemsUI() {
  const [selectedItems, setSelectedItems] = useAtom(selectedItemsAtom);

  return <ItemsUI selectedItems={selectedItems} deleteCallback={() => setSelectedItems({})} />
}

export function ItemsUI({ selectedItems, deleteCallback, altStyle }: {
  selectedItems: { [path: string]: BucketItemWithBlob },
  deleteCallback: () => void,
  altStyle?: boolean
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isTogglingFavorite, setIsTogglingFavorite] = useState(false);
  const [allContents, setAllContents] = useAtom(allContentsAtom);
  const setFavoriteStatus = useSetAtom(favoritesAtom);
  const favoriteIds = useFavoriteIds();
  const credentials = useAtomValue(credentialsAtom);

  // Filter to only images
  const selectedImages = Object.values(selectedItems).filter(item => item.type === 'image');
  const isShown = selectedImages.length > 0;

  // Check favorite status of selected images
  useEffect(() => {
    const checkFavorites = async () => {
      const favorites = await getFavorites();
      setFavoriteStatus(favorites);
    };

    checkFavorites();
  }, []);

  const handleDelete = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setIsDeleting(true);
    if (!isShown) return;

    try {
      const paths = selectedImages.map(item => item.path);
      await deleteFileWithMetadata(paths);
      deleteCallback();
      setAllContents(allContents.filter(item => !paths.includes(item.path)));
      setShowConfirm(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const allFavorited = useMemo(() => {
    return selectedImages.every(img =>
      img.metadata?.id && favoriteIds.has(img.metadata.id)
    ) && selectedImages.length > 0;
  }, [selectedImages, favoriteIds]);

  const handleToggleFavorite = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setIsTogglingFavorite(true);

    try {
      const images = selectedImages
        .filter((image) => image.metadata?.id !== undefined)

      if (images.length === 0) return
      const ids = images.map(img => img.metadata!.id)

      // If any selected image is not favorited, favorite all. Otherwise, unfavorite all
      const shouldFavorite = ids.some(id => !favoriteIds.has(id))
      const success = await toggleFavorites(images, shouldFavorite)
      if (!success) return;

    } catch (error) {
      console.error('Error toggling favorites:', error);
    } finally {
      setIsTogglingFavorite(false);
    }
  };

  if (!credentials) return null;

  return (
    <>
      <div className={altStyle ? '' : `fixed flex justify-center items-center pointer-events-none left-0 right-0 p-1.5 z-20 ${isShown ? 'top-0' : '-top-12'}`} style={{
        transition: 'top 0.3s ease-in-out'
      }}>
        <div className={altStyle ? 'flex items-center gap-2 ml-2' : "bg-neutral-100/50 shadow-inner backdrop-blur-lg rounded-full py-0.5 px-1 pointer-events-auto h-9 flex items-center justify-center gap-1"}>
          {!altStyle && <div className="px-6 mr-4">
            <p className="text-sm text-black/50">{selectedImages.length} selected</p>
          </div>}
          <button
            onClick={handleToggleFavorite}
            className={altStyle ? 'rounded hover:bg-white/10 group' : "py-0.5 px-6 hover:bg-white hover:shadow-sm rounded-full relative group"}
            title={allFavorited ? "Remove from favorites" : "Add to favorites"}
            disabled={isTogglingFavorite}
          >
            {isTogglingFavorite ? (
              <div className="h-6 w-6">
                <LoadingSpinner size="small" light={altStyle} />
              </div>
            ) : (
              <HeartIcon filled={allFavorited} flipOnHover color={altStyle ? '#fff' : '#888'} />
            )}
          </button>
          <button
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
              e.stopPropagation();
              setShowConfirm(true);
            }}
            className={altStyle ? 'rounded hover:bg-white/10 group' : "py-0.5 px-6 hover:bg-white hover:shadow-sm rounded-full group"}
            title="Delete selected items"
            disabled={isDeleting}
          >
            <TrashIcon color={altStyle ? '#fff' : '#888'} />
          </button>
        </div>
      </div>

      {showConfirm && createPortal(
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
        </div>,
        document.body
      )}
    </>
  );
} 