'use client';

import { useEffect, useRef, useState } from 'react';
import { Person } from '@/lib/types';

// Inline name editor: shows the name (or a prompt to add one) and turns into a text field on click.
// Enter or blur saves, Escape cancels.
export default function PersonNameInput({ person, onSave, className = '', placeholder = 'Add a name' }: {
  person: Person,
  onSave: (name: string | null) => Promise<void> | void,
  className?: string,
  placeholder?: string,
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(person.name ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setValue(person.name ?? ''), [person.name]);
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = async () => {
    setEditing(false);
    const name = value.trim() || null;
    if (name !== person.name) await onSave(name);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setValue(person.name ?? '');
            setEditing(false);
          }
        }}
        className={`bg-white rounded-md px-1.5 -mx-1.5 outline-none ring-1 ring-black/20 min-w-0 ${className}`}
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className={`text-left truncate rounded-md hover:bg-black/5 px-1.5 -mx-1.5 ${person.name ? 'text-black/80' : 'text-black/35'} ${className}`}
      title="Rename"
    >
      {person.name ?? placeholder}
    </button>
  );
}
