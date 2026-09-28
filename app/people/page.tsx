'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import FullscreenContainer from '@/components/FullscreenContainer';
import LoadingSpinner from '@/components/LoadingSpinner';
import FaceAvatar from '@/components/FaceAvatar';
import PersonNameInput from '@/components/PersonNameInput';
import { Person } from '@/lib/types';
import { fetchPersons, mergePersons, updatePerson } from '@/lib/persons';

// People photographed on fewer days than this (and not named) are tucked away below the grid:
// they're mostly strangers, statues, or one-off fragments of someone (e.g. in a mask).
const MIN_DAYS = 2;

export default function PeoplePage() {
  const [persons, setPersons] = useState<Person[] | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [showRare, setShowRare] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Naming someone with a name another person already has asks to merge the two
  const [pendingMerge, setPendingMerge] = useState<{ source: Person, target: Person } | null>(null);

  useEffect(() => {
    fetchPersons(true).then(setPersons).catch((e) => setError(e.message));
  }, []);

  const replace = (updated: Person) =>
    setPersons((current) => current?.map((p) => (p.id === updated.id ? updated : p)) ?? null);

  const rename = async (person: Person, name: string | null) => {
    const existing = name && persons?.find((p) => p.id !== person.id && p.name?.toLowerCase() === name.toLowerCase());
    if (existing) {
      setPendingMerge({ source: person, target: existing });
      return;
    }
    replace({ ...person, name });
    try {
      replace(await updatePerson(person.id, { name }));
    } catch (e) {
      replace(person);
      setError((e as Error).message);
    }
  };

  const confirmMerge = async () => {
    if (!pendingMerge) return;
    const { source, target } = pendingMerge;
    setPendingMerge(null);
    try {
      const merged = await mergePersons([source.id], target.id);
      setPersons((current) => current?.filter((p) => p.id !== source.id).map((p) => (p.id === merged.id ? merged : p)) ?? null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (persons === null) {
    return (
      <FullscreenContainer>
        {error ? <div className="text-black/30">{error}</div> : <LoadingSpinner />}
      </FullscreenContainer>
    );
  }

  const isRare = (p: Person) => p.name === null && p.dayCount < MIN_DAYS;
  const visible = persons.filter((p) => !p.hidden && !isRare(p));
  const rare = persons.filter((p) => !p.hidden && isRare(p));
  const hidden = persons.filter((p) => p.hidden);

  return (
    <div>
      <Header />
      {persons.length === 0 ? (
        <FullscreenContainer>
          <div className="text-black/30">
            No people found yet. Run scripts/index_faces.py and scripts/cluster_faces.py
          </div>
        </FullscreenContainer>
      ) : (
        <div className="max-w-7xl mx-auto p-8 pb-20">
          <PersonGrid persons={visible} onRename={rename} />
          {rare.length > 0 && (
            <div className="mt-12">
              <button onClick={() => setShowRare(!showRare)} className="text-sm text-black/40 hover:text-black/70">
                {showRare ? 'Hide' : 'Show'} people seen on only one day ({rare.length})
              </button>
              {showRare && <div className="mt-6"><PersonGrid persons={rare} onRename={rename} /></div>}
            </div>
          )}
          {hidden.length > 0 && (
            <div className="mt-12">
              <button onClick={() => setShowHidden(!showHidden)} className="text-sm text-black/40 hover:text-black/70">
                {showHidden ? 'Hide' : 'Show'} hidden people ({hidden.length})
              </button>
              {showHidden && <div className="mt-6 opacity-60"><PersonGrid persons={hidden} onRename={rename} /></div>}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-black/80 text-white text-sm rounded-full px-4 py-1.5" onClick={() => setError(null)}>
          {error}
        </div>
      )}

      {pendingMerge && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white/70 backdrop-blur-lg rounded-lg p-6 max-w-sm">
            <div className="flex justify-center gap-4 mb-4">
              <FaceAvatar person={pendingMerge.source} size={64} />
              <FaceAvatar person={pendingMerge.target} size={64} />
            </div>
            <p className="text-black/50 mb-6 text-sm">
              Someone is already named {pendingMerge.target.name}. Are these the same person? Their photos will be combined.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setPendingMerge(null)} className="px-4 py-1 text-sm hover:bg-black/5 rounded-full">
                Cancel
              </button>
              <button onClick={confirmMerge} className="px-4 py-1 text-sm bg-black text-white rounded-full hover:bg-black/80">
                Same person
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PersonGrid({ persons, onRename }: { persons: Person[], onRename: (person: Person, name: string | null) => void }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-x-4 gap-y-6">
      {persons.map((person) => (
        <div key={person.id} className="flex flex-col items-center min-w-0">
          <Link href={`/people/${person.id}`} className="rounded-full hover:ring-4 hover:ring-black/10 transition-shadow">
            <FaceAvatar person={person} size={104} />
          </Link>
          <div className="mt-2 w-full flex flex-col items-center min-w-0 text-sm">
            <PersonNameInput person={person} onSave={(name) => onRename(person, name)} className="max-w-full text-center" />
            <span className="text-xs text-black/35">{person.photoCount} photo{person.photoCount === 1 ? '' : 's'}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
