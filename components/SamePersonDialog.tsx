'use client';

import { createPortal } from 'react-dom';
import { Person } from '@/lib/types';
import FaceAvatar from './FaceAvatar';

// Shown when someone is given a name another person already has: confirming merges them.
export default function SamePersonDialog({ source, target, onCancel, onConfirm }: {
  source: Person, target: Person, onCancel: () => void, onConfirm: () => void,
}) {
  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-white/70 backdrop-blur-lg rounded-lg p-6 max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-center gap-4 mb-4">
          <FaceAvatar person={source} size={64} />
          <FaceAvatar person={target} size={64} />
        </div>
        <p className="text-black/50 mb-6 text-sm">
          Someone is already named {target.name}. Are these the same person? Their photos will be combined.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-1 text-sm hover:bg-black/5 rounded-full">
            Cancel
          </button>
          <button onClick={onConfirm} className="px-4 py-1 text-sm bg-black text-white rounded-full hover:bg-black/80">
            Same person
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
