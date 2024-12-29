'use client';

import { useAtom } from 'jotai';
import { selectedItemsAtom, allContentsAtom, favoritesAtom } from '@/lib/atoms';
import { useState, useEffect } from "react";
import TrashIcon from "./icons/TrashIcon";
import HeartIcon from "./icons/HeartIcon";
import { deleteFileWithMetadata } from '@/lib/db';
import LoadingSpinner from './LoadingSpinner';
import { getFavorites, toggleFavorites } from '@/lib/utils';

export default function SelectedItemsUI() {
  const [selectedItems, setSelectedItems] = useAtom(selectedItemsAtom);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isTogglingFavorite, setIsTogglingFavorite] = useState(false);
  const [allContents, setAllContents] = useAtom(allContentsAtom);
  const [favoriteStatus, setFavoriteStatus] = useAtom(favoritesAtom);

  // Filter to only images
  const selectedImages = Object.values(selectedItems).filter(item => item.type === 'image');
  const isShown = selectedImages.length > 0;

  // Check favorite status of selected images
  useEffect(() => {
    const checkFavorites = async () => {
      const favorites = await getFavorites();
      setFavoriteStatus(new Set(favorites.map(f => f.image_id)));
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
      setSelectedItems({});
      setAllContents(allContents.filter(item => !paths.includes(item.path)));
      setShowConfirm(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const allFavorited = selectedImages.every(img =>
    img.metadata?.id && favoriteStatus.has(img.metadata.id)
  ) && selectedImages.length > 0;

  const handleToggleFavorite = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setIsTogglingFavorite(true);

    try {
      const ids = selectedImages
        .map(img => img.metadata?.id)
        .filter((id): id is number => id !== undefined);

      if (ids.length === 0) return;

      // If any selected image is not favorited, favorite all. Otherwise, unfavorite all
      const shouldFavorite = ids.some(id => !favoriteStatus.has(id));
      const success = await toggleFavorites(ids, shouldFavorite);
      if (!success) return;

      setFavoriteStatus(prev => {
        const next = new Set(prev);
        ids.forEach(id => {
          if (shouldFavorite) {
            next.add(id);
          } else {
            next.delete(id);
          }
        });
        return next;
      });
    } catch (error) {
      console.error('Error toggling favorites:', error);
    } finally {
      setIsTogglingFavorite(false);
    }
  };

  return (
    <>
      <div className={`fixed flex justify-center items-center pointer-events-none left-0 right-0 p-1.5 z-20 ${isShown ? 'top-0' : '-top-12'}`} style={{
        transition: 'top 0.3s ease-in-out'
      }}>
        <div className="bg-neutral-100/50 shadow-inner backdrop-blur-lg rounded-full py-0.5 px-1 pointer-events-auto h-9 flex items-center justify-center gap-1">
          <div className="px-6 mr-4">
            <p className="text-sm text-black/50">{selectedImages.length} selected</p>
          </div>
          <button
            onClick={handleToggleFavorite}
            className="py-0.5 px-6 hover:bg-white hover:shadow-sm rounded-full relative group"
            title={allFavorited ? "Remove from favorites" : "Add to favorites"}
            disabled={isTogglingFavorite}
          >
            {isTogglingFavorite ? (
              <div className="h-6 w-6">
                <LoadingSpinner size="small" />
              </div>
            ) : (
              <HeartIcon filled={allFavorited} flipOnHover />
            )}
          </button>
          <button
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
              e.stopPropagation();
              setShowConfirm(true);
            }}
            className="py-0.5 px-6 hover:bg-white hover:shadow-sm rounded-full group"
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