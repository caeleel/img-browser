'use client';

import { Suspense, useEffect, useState } from 'react';
import { BucketItemWithBlob } from '@/lib/types';
import { getThumbnailUrl } from '@/lib/utils';
import Browser from '@/components/Browser';
import Header from '@/components/Header';
import FullscreenContainer from '@/components/FullscreenContainer'
import { favoritesAtom, useLoadFavorites } from '@/lib/atoms';
import { useAtomValue } from 'jotai';
import SelectedItemsUI from '@/components/SelectedItemsUI';

export default function FavoritesPage() {
  return (
    <Suspense>
      <FavoritesInner />
    </Suspense>
  )
}

function FavoritesInner() {
  const [items, setItems] = useState<BucketItemWithBlob[]>([]);
  const favorites = useAtomValue(favoritesAtom);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const newItems: BucketItemWithBlob[] = await Promise.all(
          favorites.map(async (favorite) => ({
            type: 'image' as const,
            name: favorite.name,
            path: favorite.path,
            thumbnailBlobUrl: await getThumbnailUrl(favorite.path),
          }))
        );
        setItems(newItems);
      } catch (error) {
        console.error('Error fetching favorites:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchItems();
  }, [favorites]);

  useLoadFavorites()

  return (
    <div>
      <SelectedItemsUI deleteCallback={(deletedItems) => {
        const pathSet = new Set(deletedItems.map(item => item.path));
        setItems(items.filter(item => !pathSet.has(item.path)))
      }} />
      <Header />

      {!isLoading && items.length === 0 ? (
        <FullscreenContainer>
          <div className="text-black/30">
            No favorited images yet
          </div>
        </FullscreenContainer>
      ) : (
        <Browser allContents={items} loading={isLoading} onDelete={(path) => {
          setItems(items.filter(item => item.path !== path))
        }} />
      )}
    </div>
  );
} 