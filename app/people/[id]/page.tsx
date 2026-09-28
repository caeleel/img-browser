'use client';

import { Suspense, use, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSetAtom } from 'jotai';
import debounce from 'lodash.debounce';
import Header from '@/components/Header';
import Browser from '@/components/Browser';
import FullscreenContainer from '@/components/FullscreenContainer';
import LoadingSpinner from '@/components/LoadingSpinner';
import SelectedItemsUI from '@/components/SelectedItemsUI';
import FaceAvatar from '@/components/FaceAvatar';
import PersonNameInput from '@/components/PersonNameInput';
import { NotPersonIcon, PortraitIcon } from '@/components/icons/PersonIcons';
import { useRankedSearch } from '@/lib/hooks/useRankedSearch';
import { fetchPerson, personLabel, removeFromPerson, updatePerson } from '@/lib/persons';
import { selectedItemsAtom } from '@/lib/atoms';
import { Person } from '@/lib/types';

export default function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense>
      <PersonPageInner id={Number(id)} />
    </Suspense>
  );
}

function PersonPageInner({ id }: { id: number }) {
  const router = useRouter();
  const [person, setPerson] = useState<Person | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const setSelectedItems = useSetAtom(selectedItemsAtom);
  const { items, setItems, isLoading, setIsLoading, search, loadMore, loadingMore, hasMore } = useRankedSearch();

  useEffect(() => {
    fetchPerson(id).then(setPerson).catch((e) => setError(e.message));
    search('', [id]);
  }, [id, search]);

  const debouncedSearch = useMemo(() => debounce((text: string) => search(text, [id]), 300), [id, search]);

  const save = async (changes: Parameters<typeof updatePerson>[1]) => {
    if (!person) return;
    try {
      setPerson(await updatePerson(person.id, changes));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const notThisPerson = async (images: typeof items) => {
    if (!person) return;
    const ids = images.map((image) => image.metadata?.id).filter((imageId): imageId is number => imageId !== undefined);
    const paths = new Set(images.map((image) => image.path));
    setItems((current) => current.filter((item) => !paths.has(item.path)));
    setSelectedItems({});
    try {
      const updated = await removeFromPerson(person.id, ids);
      if (updated) setPerson(updated);
      else router.push('/people');  // no photos left
    } catch (e) {
      setError((e as Error).message);
      search(query, [id]);
    }
  };

  if (error && !person) {
    return <FullscreenContainer><div className="text-black/30">{error}</div></FullscreenContainer>;
  }
  if (!person) {
    return <FullscreenContainer><LoadingSpinner /></FullscreenContainer>;
  }

  const label = personLabel(person);

  return (
    <div>
      <SelectedItemsUI
        deleteCallback={(deletedItems) => {
          const pathSet = new Set(deletedItems.map(item => item.path));
          setItems(items.filter(item => !pathSet.has(item.path)));
        }}
        extraActions={(images, buttonClassName) => <>
          {images.length === 1 && (
            <button className={buttonClassName} title={`Use as ${label}'s photo`} onClick={(e) => {
              e.stopPropagation();
              const imageId = images[0].metadata?.id;
              if (imageId !== undefined) save({ coverImageId: imageId });
            }}>
              <PortraitIcon />
            </button>
          )}
          <button className={buttonClassName} title={`Not ${person.name ?? 'this person'}`} onClick={(e) => {
            e.stopPropagation();
            notThisPerson(images);
          }}>
            <NotPersonIcon />
          </button>
        </>}
      />
      <Header />

      <div className="max-w-7xl mx-auto px-8 pt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
        <FaceAvatar person={person} size={72} />
        <div className="flex flex-col min-w-0 mr-auto">
          <PersonNameInput person={person} onSave={(name) => save({ name })} className="text-xl" />
          <span className="text-sm text-black/40">{person.photoCount} photo{person.photoCount === 1 ? '' : 's'}</span>
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setIsLoading(true);
            setQuery(e.target.value);
            debouncedSearch(e.target.value);
          }}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder={`Search photos of ${label}…`}
          className="bg-white/5 w-64 px-3 py-1 text-sm rounded-full border border-black/10 focus:outline-none focus:ring-1 focus:ring-black/50"
        />
      </div>

      {!isLoading && items.length === 0 ? (
        <div className="text-center text-black/30 mt-16">No photos found</div>
      ) : (
        <Browser
          allContents={items}
          loading={isLoading}
          onLoadMore={loadMore}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onDelete={(path) => setItems(items.filter(item => item.path !== path))}
        />
      )}

      {error && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-black/80 text-white text-sm rounded-full px-4 py-1.5 z-30" onClick={() => setError(null)}>
          {error}
        </div>
      )}
    </div>
  );
}
