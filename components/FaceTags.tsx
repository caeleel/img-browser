'use client';

import Link from 'next/link';
import { RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Face, FaceBox, Person, Vector2 } from '@/lib/types';
import { addFace, cachedPersons, fetchFaces, tagFace } from '@/lib/persons';
import FaceAvatar from './FaceAvatar';

// Faces per image id, so flipping back and forth doesn't refetch
const facesCache = new Map<number, Face[]>();

type Rect = { left: number, top: number, width: number, height: number };
type Tag = { personId: number | null } | { newPersonName: string };

// Hand-drawn boxes smaller than this (fraction of the photo) are treated as a stray click
const MIN_BOX = 0.01;

// Boxes around each detected face in the viewer, labelled with who it is; clicking a label opens a
// picker to tag or correct the face. Face boxes are fractions of the displayed photo, and the photo
// is drawn object-contain inside imageRef with the viewer's pan/zoom transform, so the overlay
// covers the same box and copies the transform. "Tag someone" lets the user drag a box around a face
// the detector missed and tag it.
export default function FaceTags({ imageId, imageRef, imageUrl, scale, position }: {
  imageId: number,
  imageRef: RefObject<HTMLImageElement | null>,
  imageUrl: string,
  scale: number,
  position: Vector2,
}) {
  const [faces, setFaces] = useState<Face[] | null>(facesCache.get(imageId) ?? null);
  const [frame, setFrame] = useState<{ element: Rect, photo: Rect } | null>(null);
  // face is null while tagging a newly drawn box
  const [picking, setPicking] = useState<{ face: Face | null, anchor: DOMRect } | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [draft, setDraft] = useState<FaceBox | null>(null);
  const dragStart = useRef<{ x: number, y: number } | null>(null);
  const photoRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<HTMLDivElement>(null);

  const stopDrawing = () => {
    setDrawing(false);
    setDraft(null);
    dragStart.current = null;
  };

  // Escape leaves drawing mode instead of closing the viewer (which listens on document)
  useEffect(() => {
    if (!drawing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      stopDrawing();
      setPicking(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [drawing]);

  useEffect(() => {
    let cancelled = false;
    setPicking(null);
    stopDrawing();
    setFaces(facesCache.get(imageId) ?? null);
    fetchFaces(imageId).then((result) => {
      facesCache.set(imageId, result);
      if (!cancelled) setFaces(result);
    }).catch((error) => console.error('Failed to load faces:', error));
    return () => { cancelled = true };
  }, [imageId]);

  // Where the photo actually sits inside the <img> element (object-contain letterboxing)
  useLayoutEffect(() => {
    const image = imageRef.current;
    if (!image) return;
    const measure = () => {
      if (!image.naturalWidth) return setFrame(null);
      const fit = Math.min(image.clientWidth / image.naturalWidth, image.clientHeight / image.naturalHeight);
      const width = image.naturalWidth * fit;
      const height = image.naturalHeight * fit;
      setFrame({
        element: { left: image.offsetLeft, top: image.offsetTop, width: image.clientWidth, height: image.clientHeight },
        photo: { left: (image.clientWidth - width) / 2, top: (image.clientHeight - height) / 2, width, height },
      });
    };
    measure();
    image.addEventListener('load', measure);
    const observer = new ResizeObserver(measure);
    observer.observe(image);
    return () => {
      image.removeEventListener('load', measure);
      observer.disconnect();
    };
  }, [imageRef, imageUrl]);

  const save = async (face: Face | null, tag: Tag) => {
    setPicking(null);
    const box = draft;
    stopDrawing();
    try {
      let result: Face[];
      if (face) result = await tagFace(face.id, tag);
      else if (!box) return;
      else if ('newPersonName' in tag) result = await addFace(imageId, box, tag);
      else if (tag.personId !== null) result = await addFace(imageId, box, { personId: tag.personId });
      else return;
      facesCache.set(imageId, result);
      setFaces(result);
    } catch (error) {
      console.error('Failed to tag face:', error);
    }
  };

  // Pointer position as a fraction of the photo; the bounding rect already includes pan/zoom
  const toPhoto = (e: React.PointerEvent) => {
    const rect = photoRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    setPicking(null);
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = toPhoto(e);
    setDraft({ ...dragStart.current, width: 0, height: 0 });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    if (!start) return;
    const point = toPhoto(e);
    setDraft({
      x: Math.min(start.x, point.x), y: Math.min(start.y, point.y),
      width: Math.abs(point.x - start.x), height: Math.abs(point.y - start.y),
    });
  };

  const onPointerUp = () => {
    dragStart.current = null;
    if (!draft || draft.width < MIN_BOX || draft.height < MIN_BOX) {
      setDraft(null);
      return;
    }
    const anchor = draftRef.current?.getBoundingClientRect();
    if (anchor) setPicking({ face: null, anchor });
  };

  if (!faces || !frame) return null;

  return (
    <>
      <div
        className="absolute pointer-events-none"
        style={{
          ...frame.element,
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
          transformOrigin: 'center',
        }}
      >
        <div ref={photoRef} className="absolute" style={frame.photo}>
          {faces.map((face) => {
            // Unnamed (or hidden) faces stay quiet until hovered, so crowds don't bury the photo
            const known = face.person?.name != null && !face.person.hidden;
            const open = (e: React.MouseEvent<HTMLElement>) => {
              e.stopPropagation();
              setPicking({ face, anchor: e.currentTarget.getBoundingClientRect() });
            };
            return (
              <div
                key={face.id}
                onClick={open}
                className={`group absolute rounded-md cursor-pointer shadow-[0_0_0_1px_rgba(0,0,0,0.25)] ${drawing ? '' : 'pointer-events-auto'}`}
                style={{
                  left: `${face.x * 100}%`,
                  top: `${face.y * 100}%`,
                  width: `${face.width * 100}%`,
                  height: `${face.height * 100}%`,
                  // Hand-drawn boxes are dashed
                  border: `${1.5 / scale}px ${face.manual ? 'dashed' : 'solid'} rgba(255,255,255,${known ? 0.9 : 0.45})`,
                }}
              >
                {/* Label stays the same size while zoomed */}
                <div
                  className={`absolute left-1/2 top-full ${known ? '' : 'opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100'}`}
                  style={{ transform: `translateX(-50%) scale(${1 / scale})`, transformOrigin: 'top center' }}
                >
                  <button
                    onClick={open}
                    className={`mt-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs shadow backdrop-blur-md ${known ? 'bg-black/70 text-white hover:bg-black/80' : 'bg-white/80 text-black/60 hover:bg-white/95'}`}
                  >
                    {known ? face.person!.name : "Who's this?"}
                  </button>
                </div>
              </div>
            );
          })}
          {drawing && (
            <div
              className="absolute inset-0 pointer-events-auto cursor-crosshair touch-none"
              onTouchStart={(e) => e.stopPropagation()}  // drawing, not swiping to the next photo
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            />
          )}
          {draft && (
            <div
              ref={draftRef}
              className="absolute rounded-md pointer-events-none bg-white/10 shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
              style={{
                left: `${draft.x * 100}%`,
                top: `${draft.y * 100}%`,
                width: `${draft.width * 100}%`,
                height: `${draft.height * 100}%`,
                border: `${1.5 / scale}px dashed rgba(255,255,255,0.9)`,
              }}
            />
          )}
        </div>
      </div>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-full bg-black/70 backdrop-blur-md text-white text-xs shadow px-1 py-1">
        {drawing ? <>
          <span className="pl-2">Drag a box around a face</span>
          <button onClick={() => { stopDrawing(); setPicking(null); }} className="rounded-full px-2 py-0.5 hover:bg-white/15">Cancel</button>
        </> : (
          <button onClick={() => { setPicking(null); setDrawing(true); }} className="rounded-full px-2 py-0.5 hover:bg-white/15">
            + Tag someone
          </button>
        )}
      </div>

      {picking && createPortal(
        <TagPicker
          face={picking.face}
          anchor={picking.anchor}
          onClose={() => {
            setPicking(null);
            if (!picking.face) setDraft(null);  // drawn box abandoned; draw another
          }}
          onPick={(tag) => save(picking.face, tag)}
        />,
        document.body
      )}
    </>
  );
}

// "Who is this?": filter named people, pick one, or type a new name. Enter picks the top option.
function TagPicker({ face, anchor, onClose, onPick }: {
  face: Face | null,
  anchor: DOMRect,
  onClose: () => void,
  onPick: (tag: Tag) => void,
}) {
  const [persons, setPersons] = useState<Person[] | null>(null);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    cachedPersons().then(setPersons).catch((error) => console.error('Failed to load people:', error));
  }, []);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [onClose]);

  const text = query.trim();
  const matches = useMemo(() => (persons ?? [])
    .filter((p) => p.name && p.id !== face?.person?.id && (!text || p.name.toLowerCase().includes(text.toLowerCase())))
    .slice(0, 6), [persons, text, face?.person?.id]);
  const exact = persons?.some((p) => p.name?.toLowerCase() === text.toLowerCase());

  const width = 256;
  const left = Math.max(8, Math.min(window.innerWidth - width - 8, anchor.left + anchor.width / 2 - width / 2));
  const top = Math.min(anchor.bottom + 6, window.innerHeight - 300);

  return (
    <div
      ref={ref}
      className="fixed z-[60] rounded-lg bg-white/90 backdrop-blur-lg shadow-lg border border-black/5 p-1 text-sm"
      style={{ left, top, width }}
    >
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') onClose();
          if (e.key === 'Enter') {
            if (matches[0]) onPick({ personId: matches[0].id });
            else if (text) onPick({ newPersonName: text });
          }
        }}
        placeholder={face?.person?.name ? `Not ${face.person.name}? Who is this?` : 'Who is this?'}
        className="w-full bg-transparent px-2 py-1.5 outline-none placeholder:text-black/35"
      />
      <div className="border-t border-black/5 pt-1">
        {persons === null && <div className="px-2 py-1.5 text-black/35">Loading…</div>}
        {matches.map((person) => (
          <button key={person.id} onClick={() => onPick({ personId: person.id })}
            className="w-full flex items-center gap-2 rounded-md px-2 py-1 hover:bg-black/5 text-left text-black/80">
            <FaceAvatar person={person} size={24} />
            <span className="flex-1 truncate">{person.name}</span>
            <span className="text-xs text-black/35">{person.photoCount}</span>
          </button>
        ))}
        {text && !exact && (
          <button onClick={() => onPick({ newPersonName: text })}
            className="w-full rounded-md px-2 py-1.5 hover:bg-black/5 text-left text-black/80">
            Add “{text}” as a new person
          </button>
        )}
        {face?.person && (
          <div className="border-t border-black/5 mt-1 pt-1">
            {face.person.name && (
              <Link href={`/people/${face.person.id}`} className="block rounded-md px-2 py-1.5 hover:bg-black/5 text-black/60">
                All photos of {face.person.name}
              </Link>
            )}
            <button onClick={() => onPick({ personId: null })}
              className="w-full rounded-md px-2 py-1.5 hover:bg-black/5 text-left text-black/60">
              Remove tag
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
