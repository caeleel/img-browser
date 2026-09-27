'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { BucketItemWithBlob, ImageMetadata } from '@/lib/types';
import { useRouter, useSearchParams } from 'next/navigation';
import debounce from 'lodash.debounce';
import { getFileType, getThumbnailUrl } from '@/lib/utils';
import Header from '@/components/Header';
import FullscreenContainer from '@/components/FullscreenContainer';
import Browser from '@/components/Browser';
import SelectedItemsUI from '@/components/SelectedItemsUI';

const PAGE_SIZE = 50;

type RankedResult = { id: number, similarity: number };

function getCredentialsFromStorage() {
  return JSON.parse(localStorage.getItem('doCredentials') || '{}');
}

async function toItems(results: ImageMetadata[]): Promise<BucketItemWithBlob[]> {
  return Promise.all(results.map(async (result) => ({
    type: getFileType(result.path),
    name: result.name,
    path: result.path,
    thumbnailBlobUrl: await getThumbnailUrl(result.path),
    metadata: result,
  })));
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
  // Every result for the current query, best first; items holds the ones loaded so far.
  const [ranked, setRanked] = useState<RankedResult[]>([]);
  const [loadedCount, setLoadedCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  // Bumped per search so responses for an outdated query are dropped.
  const searchGeneration = useRef(0);
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

    const generation = ++searchGeneration.current;
    setRanked([]);
    setLoadedCount(0);

    if (!searchQuery.trim()) {
      setItems([]);
      return;
    }

    setIsLoading(true);
    try {
      const credentials = getCredentialsFromStorage();
      const response = await fetch(`/api/embeddings/search?q=${encodeURIComponent(searchQuery)}`, {
        headers: {
          'X-DO-ACCESS-KEY-ID': credentials.accessKeyId,
          'X-DO-SECRET-ACCESS-KEY': credentials.secretAccessKey,
        }
      });

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data: { ranked: RankedResult[], results: ImageMetadata[] } = await response.json();
      const newItems = await toItems(data.results);
      if (generation !== searchGeneration.current) return;

      setRanked(data.ranked);
      setLoadedCount(Math.min(PAGE_SIZE, data.ranked.length));
      setItems(newItems);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      if (generation === searchGeneration.current) setIsLoading(false);
    }
  };

  const loadMore = useCallback(async () => {
    if (loadingMore || loadedCount >= ranked.length) return;

    const generation = searchGeneration.current;
    const page = ranked.slice(loadedCount, loadedCount + PAGE_SIZE);
    setLoadingMore(true);
    try {
      const response = await fetch('/api/metadata/by_ids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: page.map(r => r.id), credentials: getCredentialsFromStorage() }),
      });
      if (!response.ok) throw new Error('Failed to load more results');

      const { rows }: { rows: ImageMetadata[] } = await response.json();
      const similarityById = new Map(page.map(r => [r.id, r.similarity]));
      const newItems = await toItems(rows.map(row => ({ ...row, similarity: similarityById.get(row.id) })));
      if (generation !== searchGeneration.current) return;

      setItems(items => [...items, ...newItems]);
      setLoadedCount(count => count + page.length);
    } catch (error) {
      console.error('Load more error:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, loadedCount, ranked]);

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
        ) : <Browser
          allContents={items}
          loading={isLoading}
          onLoadMore={loadMore}
          hasMore={loadedCount < ranked.length}
          loadingMore={loadingMore}
          onDelete={(path) => {
            setItems(items.filter(item => item.path !== path))
          }}
        />}
      </div>
    </div>
  );
} 