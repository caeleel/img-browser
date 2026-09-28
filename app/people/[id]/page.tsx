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
import { HideIcon, MergeIcon, NotPersonIcon, PortraitIcon } from '@/components/icons/PersonIcons';
import { useRankedSearch } from '@/lib/hooks/useRankedSearch';
import { fetchPerson, fetchPersons, mergePersons, personLabel, removeFromPerson, updatePerson } from '@/lib/persons';
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
  const [merging, setMerging] = useState(false);
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
        <div className="flex items-center gap-1">
          <button onClick={() => setMerging(true)} className="p-1 rounded-full hover:bg-black/5" title="Merge with someone else">
            <MergeIcon />
          </button>
          <button onClick={() => save({ hidden: !person.hidden })} className="p-1 rounded-full hover:bg-black/5"
            title={person.hidden ? 'Show on the People page' : 'Hide from the People page'}>
            <HideIcon hidden={person.hidden} />
          </button>
        </div>
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

      {merging && (
        <MergeDialog
          person={person}
          onCancel={() => setMerging(false)}
          onMerge={async (target) => {
            setMerging(false);
            try {
              await mergePersons([person.id], target.id);
              router.replace(`/people/${target.id}`);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
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

// Pick who this person really is; their photos move to that person.
function MergeDialog({ person, onCancel, onMerge }: {
  person: Person, onCancel: () => void, onMerge: (target: Person) => void,
}) {
  const [persons, setPersons] = useState<Person[] | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    fetchPersons(true).then((all) => setPersons(all.filter((p) => p.id !== person.id)));
  }, [person.id]);

  const shown = persons?.filter((p) => !filter || p.name?.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-white/80 backdrop-blur-lg rounded-lg p-6 w-[min(640px,calc(100vw-32px))] max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <p className="text-black/50 text-sm mb-3">
          Who is {person.name ?? 'this'}? Their photos will be moved to that person.
        </p>
        <input
          autoFocus
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') onCancel();
          }}
          placeholder="Filter by name"
          className="bg-white px-3 py-1 text-sm rounded-full border border-black/10 focus:outline-none focus:ring-1 focus:ring-black/50 mb-4"
        />
        <div className="overflow-y-auto grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-3">
          {shown === undefined ? <LoadingSpinner size="small" /> : shown.map((p) => (
            <button key={p.id} onClick={() => onMerge(p)} className="flex flex-col items-center gap-1 rounded-lg p-1 hover:bg-black/5 min-w-0">
              <FaceAvatar person={p} size={64} />
              <span className={`text-xs truncate max-w-full ${p.name ? 'text-black/70' : 'text-black/30'}`}>{personLabel(p)}</span>
            </button>
          ))}
        </div>
        <div className="flex justify-end mt-4">
          <button onClick={onCancel} className="px-4 py-1 text-sm hover:bg-black/5 rounded-full">Cancel</button>
        </div>
      </div>
    </div>
  );
}
