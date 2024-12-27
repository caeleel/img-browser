'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { BucketItemWithBlob, ImageMetadata } from '@/lib/types';
import { useRouter, useSearchParams } from 'next/navigation';
import debounce from 'lodash.debounce';
import { getThumbnailUrl, getCssOrientation } from '@/lib/utils';
import ImageViewer from '@/components/ImageViewer';
import LoadingSpinner from '@/components/LoadingSpinner';
import { getCredentials } from '@/lib/s3';
import Header from '@/components/Header';
import FullscreenContainer from '@/components/FullscreenContainer';

interface SearchResult extends ImageMetadata {
  similarity: number;
}

export default function SearchPage() {
  return <Suspense>
    <SearchPageInner />
  </Suspense>
}

function SearchPageInner() {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<BucketItemWithBlob[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
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

  useEffect(() => {
    const urlIndex = searchParams.get('i');
    if (urlIndex) {
      setSelectedIndex(parseInt(urlIndex));
    } else {
      setSelectedIndex(null);
    }
  }, [searchParams])

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
        data.results.map(async (result: SearchResult) => ({
          type: 'file',
          name: result.name,
          path: result.path,
          thumbnailBlobUrl: await getThumbnailUrl(result.path),
          metadata: result,
        }))
      );
      setItems(newItems);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectImage = useCallback((index: number | null) => {
    setSelectedIndex(index);
    updateUrl(undefined, index);
  }, [updateUrl]);

  // Debounce search to avoid too many requests
  const debouncedSearch = useCallback(debounce(performSearch, 300), []);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsLoading(true);
    console.log('search', e.target.value);
    updateUrl(e.target.value);
    const newQuery = e.target.value;
    setQuery(newQuery);
    debouncedSearch(newQuery);
  };

  const credentials = getCredentials();

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Search Bar */}
      <Header search={query} onSearch={handleSearchChange} />

      {/* Results Grid */}
      <div className="max-w-7xl mx-auto p-4">
        {query === '' ? (
          <FullscreenContainer>
            <div className="text-black/30">
              Enter a search query to find images
            </div>
          </FullscreenContainer>
        ) : isLoading ? (
          <FullscreenContainer>
            <LoadingSpinner size="large" />
          </FullscreenContainer>
        ) : items.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {items.map((item, index) => {
              const orientation = item.metadata?.orientation || 1;
              const rotationClass = getCssOrientation(orientation);

              return (
                <button
                  key={item.metadata?.id}
                  onClick={() => handleSelectImage(index)}
                  className="group relative aspect-square bg-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <img
                      src={item.thumbnailBlobUrl}
                      alt={item.name}
                      className={`w-full h-full object-contain ${rotationClass}`}
                    />
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-white/50 backdrop-blur-md text-black p-2 text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="truncate">{item.name}</div>
                    <div className="text-xs">{Math.round((item.metadata as SearchResult).similarity * 100)}% match</div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : query && !isLoading ? (
          <div className="text-center text-gray-500 mt-8">
            No results found
          </div>
        ) : null}
      </div>

      {/* Image Viewer */}
      {selectedIndex !== null && items[selectedIndex] && (
        <ImageViewer
          idx={selectedIndex}
          allImages={items}
          onClose={() => handleSelectImage(null)}
          onNext={selectedIndex < items.length - 1 ? () => handleSelectImage(selectedIndex + 1) : undefined}
          onPrevious={selectedIndex > 0 ? () => handleSelectImage(selectedIndex - 1) : undefined}
          onSelectImage={(image) => handleSelectImage(items.findIndex(i => i.path === image.path))}
          credentials={credentials}
        />
      )}
    </div>
  );
} 