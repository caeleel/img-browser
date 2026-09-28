'use client';

import { useCallback, useRef, useState } from 'react';
import { BucketItemWithBlob, ImageMetadata, Person } from '@/lib/types';
import { getFileType, getThumbnailUrl } from '@/lib/utils';
import { getCredentials } from '@/lib/s3';

const PAGE_SIZE = 50;

type RankedResult = { id: number, similarity?: number };

async function toItems(results: ImageMetadata[]): Promise<BucketItemWithBlob[]> {
  return Promise.all(results.map(async (result) => ({
    type: getFileType(result.path),
    name: result.name,
    path: result.path,
    thumbnailBlobUrl: await getThumbnailUrl(result.path),
    metadata: result,
  })));
}

// Runs a search (/api/embeddings/search) that ranks everything once, then pages through the
// ranked ids with loadMore() for infinite scroll.
export function useRankedSearch() {
  const [items, setItems] = useState<BucketItemWithBlob[]>([]);
  const [persons, setPersons] = useState<Person[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // Every result for the current search, best first; items holds the ones loaded so far.
  const [ranked, setRanked] = useState<RankedResult[]>([]);
  const [loadedCount, setLoadedCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  // Bumped per search so responses for an outdated query are dropped.
  const searchGeneration = useRef(0);

  const search = useCallback(async (query: string, personIds: number[] = []) => {
    const generation = ++searchGeneration.current;
    setRanked([]);
    setLoadedCount(0);

    if (!query.trim() && personIds.length === 0) {
      setItems([]);
      setPersons([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const credentials = getCredentials();
      const params = new URLSearchParams({ q: query });
      if (personIds.length > 0) params.set('persons', personIds.join(','));
      const response = await fetch(`/api/embeddings/search?${params}`, {
        headers: {
          'X-DO-ACCESS-KEY-ID': credentials.accessKeyId,
          'X-DO-SECRET-ACCESS-KEY': credentials.secretAccessKey,
        }
      });

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data: { persons: Person[], ranked: RankedResult[], results: ImageMetadata[] } = await response.json();
      const newItems = await toItems(data.results);
      if (generation !== searchGeneration.current) return;

      setPersons(data.persons);
      setRanked(data.ranked);
      setLoadedCount(Math.min(PAGE_SIZE, data.ranked.length));
      setItems(newItems);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      if (generation === searchGeneration.current) setIsLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || loadedCount >= ranked.length) return;

    const generation = searchGeneration.current;
    const page = ranked.slice(loadedCount, loadedCount + PAGE_SIZE);
    setLoadingMore(true);
    try {
      const response = await fetch('/api/metadata/by_ids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: page.map(r => r.id), credentials: getCredentials() }),
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

  return {
    items, setItems, persons, isLoading, setIsLoading, search, loadMore, loadingMore,
    hasMore: loadedCount < ranked.length,
    total: ranked.length,
  };
}
