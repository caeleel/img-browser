'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import debounce from 'lodash.debounce';
import Header from '@/components/Header';
import FullscreenContainer from '@/components/FullscreenContainer';
import Browser from '@/components/Browser';
import SelectedItemsUI from '@/components/SelectedItemsUI';
import { useRankedSearch } from '@/lib/hooks/useRankedSearch';
import { PersonChip } from '@/components/FaceAvatar';

export default function SearchPage() {
  return <Suspense>
    <SearchPageInner />
  </Suspense>
}

function SearchPageInner() {
  const [query, setQuery] = useState('');
  const { items, setItems, persons, isLoading, setIsLoading, search, loadMore, loadingMore, hasMore } = useRankedSearch();
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

  const performSearch = (searchQuery: string) => {
    updateUrl(searchQuery);
    return search(searchQuery);
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
        {query !== '' && persons.length > 0 && (
          <div className="flex items-center gap-2 pt-4 text-sm text-black/50">
            Photos with
            {persons.map((person) => <PersonChip key={person.id} person={person} />)}
          </div>
        )}
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
          hasMore={hasMore}
          loadingMore={loadingMore}
          onDelete={(path) => {
            setItems(items.filter(item => item.path !== path))
          }}
        />}
      </div>
    </div>
  );
}
