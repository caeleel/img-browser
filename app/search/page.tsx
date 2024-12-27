'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { BucketItemWithBlob, ImageMetadata } from '@/lib/types';
import { useSearchParams } from 'next/navigation';
import debounce from 'lodash.debounce';
import { getThumbnailUrl, getCssOrientation } from '@/lib/utils';
import ImageViewer from '@/components/ImageViewer';
import LoadingSpinner from '@/components/LoadingSpinner';
import { getCredentials } from '@/lib/s3';

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

  // Initialize query from URL
  useEffect(() => {
    const urlQuery = searchParams.get('q');
    if (urlQuery) {
      setQuery(urlQuery);
      performSearch(urlQuery);
    }
  }, []);

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
      console.log(newItems);

      // Update URL without triggering a new search
      const newUrl = `/search?q=${encodeURIComponent(searchQuery)}`;
      window.history.pushState({}, '', newUrl);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Debounce search to avoid too many requests
  const debouncedSearch = useCallback(debounce(performSearch, 300), []);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setQuery(newQuery);
    debouncedSearch(newQuery);
  };

  const credentials = getCredentials();

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Search Bar */}
      <div className="sticky top-0 z-10 bg-white shadow-md">
        <div className="max-w-7xl mx-auto p-4">
          <div className="absolute left-2 top-2">

          </div>
          <input
            type="text"
            value={query}
            onChange={handleSearchChange}
            placeholder="Search images..."
            className="w-full max-w-xl px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Results Grid */}
      <div className="max-w-7xl mx-auto p-4">
        {isLoading ? (
          <div className="h-64">
            <LoadingSpinner size="large" />
          </div>
        ) : items.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {items.map((item, index) => {
              const orientation = item.metadata?.orientation || 1;
              const rotationClass = getCssOrientation(orientation);

              return (
                <button
                  key={item.metadata?.id}
                  onClick={() => setSelectedIndex(index)}
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
      {selectedIndex !== null && (
        <ImageViewer
          idx={selectedIndex}
          allImages={items}
          onClose={() => setSelectedIndex(null)}
          onNext={selectedIndex < items.length - 1 ? () => setSelectedIndex(selectedIndex + 1) : undefined}
          onPrevious={selectedIndex > 0 ? () => setSelectedIndex(selectedIndex - 1) : undefined}
          onSelectImage={(image) => setSelectedIndex(items.findIndex(i => i.path === image.path))}
          credentials={credentials}
        />
      )}
    </div>
  );
} 