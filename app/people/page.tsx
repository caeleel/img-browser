'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import FullscreenContainer from '@/components/FullscreenContainer';
import LoadingSpinner from '@/components/LoadingSpinner';
import FaceAvatar from '@/components/FaceAvatar';
import PersonNameInput from '@/components/PersonNameInput';
import { Person } from '@/lib/types';
import { fetchPersons, mergePersons, updatePerson } from '@/lib/persons';

// People photographed on fewer days than this (and not named) only show with the "low-occurrence"
// filter: they're mostly strangers, statues, or one-off fragments of someone (e.g. in a mask).
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

  const setHidden = async (person: Person, hidden: boolean) => {
    replace({ ...person, hidden });
    try {
      replace(await updatePerson(person.id, { hidden }));
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
  const shown = persons.filter((p) => (showHidden || !p.hidden) && (showRare || !isRare(p)));

  return (
    <div>
      <Header actions={
        <FilterMenu options={[
          { label: 'Show hidden people', count: persons.filter((p) => p.hidden).length, checked: showHidden, onChange: setShowHidden },
          { label: 'Show low-occurrence people', count: persons.filter((p) => !p.hidden && isRare(p)).length, checked: showRare, onChange: setShowRare },
        ]} />
      } />
      {persons.length === 0 ? (
        <FullscreenContainer>
          <div className="text-black/30">
            No people found yet. Run scripts/index_faces.py and scripts/cluster_faces.py
          </div>
        </FullscreenContainer>
      ) : (
        <div className="max-w-7xl mx-auto p-8 pb-20">
          <PersonGrid persons={shown} onRename={rename} onSetHidden={setHidden} />
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

// Unnamed people get an × in the corner to hide them ("not someone I want to label"); hidden
// people get a restore button instead. Always visible on touch screens, on hover otherwise.
function PersonGrid({ persons, onRename, onSetHidden }: {
  persons: Person[],
  onRename: (person: Person, name: string | null) => void,
  onSetHidden: (person: Person, hidden: boolean) => void,
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-x-4 gap-y-6">
      {persons.map((person) => (
        <div key={person.id} className="group flex flex-col items-center min-w-0">
          <div className="relative">
            <Link href={`/people/${person.id}`} className={`block rounded-full hover:ring-4 hover:ring-black/10 transition-shadow ${person.hidden ? 'opacity-50' : ''}`}>
              <FaceAvatar person={person} size={104} />
            </Link>
            {(person.hidden || person.name === null) && (
              <button
                onClick={() => onSetHidden(person, !person.hidden)}
                title={person.hidden ? 'Show on the People page again' : 'Hide — not someone to label'}
                aria-label={person.hidden ? 'Unhide' : 'Hide'}
                className="absolute top-0.5 right-0.5 w-6 h-6 rounded-full bg-white shadow flex items-center justify-center text-black/40 hover:text-black/80 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {person.hidden
                    ? <path d="M3.5 5.5H9C10.3807 5.5 11.5 6.61929 11.5 8C11.5 9.38071 10.3807 10.5 9 10.5H6M3.5 5.5L5.5 3.5M3.5 5.5L5.5 7.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
                    : <path d="M4 4L10 10M4 10L10 4" stroke="currentColor" strokeLinecap="round" />}
                </svg>
              </button>
            )}
          </div>
          <div className="mt-2 w-full flex flex-col items-center min-w-0 text-sm">
            <PersonNameInput person={person} onSave={(name) => onRename(person, name)} className="max-w-full text-center" />
            <span className="text-xs text-black/35">{person.photoCount} photo{person.photoCount === 1 ? '' : 's'}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

type FilterOption = { label: string, count: number, checked: boolean, onChange: (checked: boolean) => void };

// Filter button for the header; a dot marks it while any option is on.
function FilterMenu({ options }: { options: FilterOption[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = options.some((option) => option.checked);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative pointer-events-auto">
      <button
        onClick={() => setOpen(!open)}
        title="Filter"
        aria-label="Filter"
        aria-expanded={open}
        className={`relative p-1 rounded-full hover:text-black/70 hover:bg-black/5 transition-colors ${open ? 'text-black/70 bg-black/5' : 'text-black/35'}`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M5 7.5H19M7.5 12H16.5M10 16.5H14" stroke="currentColor" strokeLinecap="round" />
        </svg>
        {active && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-sky-600" />}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-64 rounded-lg bg-white/80 backdrop-blur-lg shadow-md border border-black/5 p-1 z-20">
          {options.map((option) => (
            <label key={option.label} className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-black/70 hover:bg-black/5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={option.checked}
                onChange={(e) => option.onChange(e.target.checked)}
                className="accent-black"
              />
              <span className="flex-1">{option.label}</span>
              <span className="text-xs text-black/35">{option.count}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
