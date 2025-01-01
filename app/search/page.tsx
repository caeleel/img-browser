'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { BucketItemWithBlob, ImageMetadata } from '@/lib/types';
import { useRouter, useSearchParams } from 'next/navigation';
import debounce from 'lodash.debounce';
import { getFileType, getThumbnailUrl } from '@/lib/utils';
import Header from '@/components/Header';
import FullscreenContainer from '@/components/FullscreenContainer';
import Browser from '@/components/Browser';
import SelectedItemsUI from '@/components/SelectedItemsUI';

export default function SearchPage() {
  return <Suspense>
    <SearchPageInner />
  </Suspense>
}

function SearchPageInner() {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<BucketItemWithBlob[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();

  // Initialize query and selected index from URL
  useEffect(() => {
    const urlQuery = searchParams.get('q');

    if (urlQuery) {
      setQuery(urlQuery);
      performSearch(urlQuery);
    }
  }, []);

  const updateUrl = useCallback((newQuery?: string, newIndex?: number | null) => {
    const params = new URLSearchParams();

    if (newQuery) {
      params.set('q', newQuery);
    } else if (newQuery === '') {
      params.delete('q');
    } else if (searchParams.has('q')) {
      params.set('q', searchParams.get('q')!);
    }

    if (newIndex !== undefined && newIndex !== null) {
      params.set('i', newIndex.toString());
    } else if (searchParams.has('i')) {
      params.delete('i');
    }

    // Add scroll: false option to prevent automatic scrolling
    router.push(`/search?${params.toString()}`, {
      scroll: false
    });
  }, [searchParams, router]);

  const performSearch = async (searchQuery: string) => {
    updateUrl(searchQuery);

    if (!searchQuery.trim()) {
      setItems([]);
      return;
    }

    setIsLoading(true);
    try {
      const credentials = JSON.parse(localStorage.getItem('doCredentials') || '{}');
      const response = await fetch(`/api/embeddings/search?q=${encodeURIComponent(searchQuery)}`, {
        headers: {
          'X-DO-ACCESS-KEY-ID': credentials.accessKeyId,
          'X-DO-SECRET-ACCESS-KEY': credentials.secretAccessKey,
        }
      });

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data = await response.json();

      const newItems: BucketItemWithBlob[] = await Promise.all(
        data.results.map(async (result: ImageMetadata) => {
          return {
            type: getFileType(result.path),
            name: result.name,
            path: result.path,
            thumbnailBlobUrl: await getThumbnailUrl(result.path),
            metadata: result,
          }
        })
      );
      setItems(newItems);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Debounce search to avoid too many requests
  const debouncedSearch = useCallback(debounce(performSearch, 300), []);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsLoading(true);
    const newQuery = e.target.value;
    setQuery(newQuery);
    debouncedSearch(newQuery);
  };

  return (
    <div>
      <SelectedItemsUI deleteCallback={(deletedItems) => {
        const pathSet = new Set(deletedItems.map(item => item.path));
        setItems(items.filter(item => !pathSet.has(item.path)))
      }} />
      <Header search={query} onSearch={handleSearchChange} />

      {/* Results Grid */}
      <div className="max-w-7xl mx-auto px-4">
        {query === '' ? (
          <FullscreenContainer>
            <div className="text-black/30">
              Enter a search query to find images
            </div>
          </FullscreenContainer>
        ) : query && !isLoading && items.length === 0 ? (
          <div className="text-center text-gray-500 mt-8">
            No results found
          </div>
        ) : <Browser allContents={items} pageSize={50} loading={isLoading} onDelete={(path) => {
          setItems(items.filter(item => item.path !== path))
        }} />}
      </div>
    </div>
  );
} 