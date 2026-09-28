'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Person } from '@/lib/types';
import { getThumbnailUrl } from '@/lib/utils';
import { personLabel } from '@/lib/persons';

// How much room to leave around the face box, as a multiple of its larger side
const PADDING = 1.6;

// Round crop of a person's cover face out of the photo's thumbnail. Face boxes are stored in the
// photo's displayed orientation; thumbnails the app rotates with CSS (orientation 6/8) are rotated
// here the same way.
export default function FaceAvatar({ person, size = 96, className = '' }: {
  person: Person, size?: number, className?: string,
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ width: number, height: number } | null>(null);
  const cover = person.cover;

  useEffect(() => {
    let cancelled = false;
    setNatural(null);
    if (cover) getThumbnailUrl(cover.path).then((signed) => !cancelled && setUrl(signed));
    return () => { cancelled = true };
  }, [cover?.path]);

  const style: React.CSSProperties = { width: size, height: size };
  if (!cover || !url) {
    return <div className={`rounded-full bg-black/5 shrink-0 ${className}`} style={style} />;
  }

  const rotation = cover.orientation === 6 ? 90 : cover.orientation === 8 ? -90 : 0;
  let imageStyle: React.CSSProperties = { visibility: 'hidden' };
  let frameStyle: React.CSSProperties = {};
  if (natural) {
    // Displayed size of the thumbnail, then scale so the padded face box fills the avatar
    const width = rotation ? natural.height : natural.width;
    const height = rotation ? natural.width : natural.height;
    const side = Math.max(cover.width * width, cover.height * height) * PADDING;
    const scale = size / side;
    const centerX = (cover.x + cover.width / 2) * width;
    const centerY = (cover.y + cover.height / 2) * height;
    frameStyle = {
      width: width * scale,
      height: height * scale,
      left: size / 2 - centerX * scale,
      top: size / 2 - centerY * scale,
    };
    imageStyle = {
      width: natural.width * scale,
      height: natural.height * scale,
      left: (width - natural.width) * scale / 2,
      top: (height - natural.height) * scale / 2,
      transform: rotation ? `rotate(${rotation}deg)` : undefined,
      maxWidth: 'none',
    };
  }

  return (
    <div className={`relative rounded-full overflow-hidden bg-black/5 shrink-0 ${className}`} style={style}>
      <div className="absolute" style={frameStyle}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={personLabel(person)}
          draggable={false}
          className="absolute"
          style={imageStyle}
          onLoad={(e) => setNatural({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
        />
      </div>
    </div>
  );
}

export function PersonChip({ person }: { person: Person }) {
  return (
    <Link
      href={`/people/${person.id}`}
      className="flex items-center gap-1.5 rounded-full bg-black/5 hover:bg-black/10 pl-0.5 pr-3 py-0.5 text-black/70"
    >
      <FaceAvatar person={person} size={22} />
      {personLabel(person)}
    </Link>
  );
}
