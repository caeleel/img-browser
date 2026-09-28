'use client';

import { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import { BucketItemWithBlob, S3Credentials, Vector2 } from '@/lib/types';
import { fetchFile, signedUrl } from '@/lib/s3';
import { fetchMetadata } from '@/lib/db';
import { blur } from '@/lib/utils';
import { MetadataEditor } from './MetadataEditor';
import exifr from 'exifr';
import Carousel from './Carousel';
import { Minimap } from './Minimap';
import TopBar from './TopBar';
import LoadingSpinner from './LoadingSpinner';
import VideoPlayer from './VideoPlayer';
import FaceTags from './FaceTags';
import { useIsTouch } from '@/lib/hooks/useIsTouch';

let lastScale = 1;
let lastPosition = { x: 0, y: 0 };
// Face tags stay on or off as you move between photos (and reopen the viewer)
let lastShowFaces = false;

export default function ImageViewer({
  idx = 0,
  allImages,
  onClose,
  onNext,
  onPrevious,
  onSelectImage,
  credentials
}: {
  idx: number
  allImages: BucketItemWithBlob[]
  onClose: (deleteImage?: boolean) => void
  onNext?: () => void
  onPrevious?: () => void
  onSelectImage: (image: BucketItemWithBlob) => void
  credentials: S3Credentials
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement & HTMLVideoElement>(null);
  const image = allImages[idx];
  const [showInfo, setShowInfo] = useState(false);
  const [showFaces, setShowFacesState] = useState(lastShowFaces);
  const setShowFaces = (show: boolean) => {
    lastShowFaces = show;
    setShowFacesState(show);
  };
  const [showFilmstrip, setShowFilmstrip] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Touch devices: "fullscreen" hides the viewer chrome on a black background instead (iPhone
  // browsers have no Fullscreen API); tapping the black area brings it back
  const isTouch = useIsTouch();
  const [immersive, setImmersive] = useState(false);
  const chromeShown = showFilmstrip && !immersive;
  // Horizontal finger drag, in px, while swiping between photos
  const [swipeX, setSwipeX] = useState(0);
  const [swipeSettling, setSwipeSettling] = useState(false);
  const swipe = useRef<{ x: number, y: number, axis: 'x' | 'y' | null } | null>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const setGeneration = useState(0)[1];

  const getMaxDrift = () => {
    if (!imageRef.current) {
      return { x: 0, y: 0 };
    }
    const { width, height } = imageRef.current;
    return { x: (lastScale - 1) * width / 2, y: (lastScale - 1) * height / 2 }
  }

  const setPos = (pos: Vector2) => {
    const maxDrift = getMaxDrift();
    lastPosition = {
      x: Math.max(-maxDrift.x, Math.min(maxDrift.x, pos.x)),
      y: Math.max(-maxDrift.y, Math.min(maxDrift.y, pos.y)),
    };
    setPosition(lastPosition);
  }

  // Calculate window of images
  const WINDOW_SIZE = 9;
  const windowStart = idx - Math.floor(WINDOW_SIZE / 2)
  const windowImages = useMemo(() => {
    const images: (BucketItemWithBlob | null)[] = []
    for (let i = windowStart; i < windowStart + WINDOW_SIZE; i++) {
      images.push(allImages[i] || null)
    }
    return images
  }, [allImages, windowStart]);
  const validImages = useMemo(() => windowImages.filter(img => img !== null), [windowImages]);
  const total = allImages.length;
  const metadata = image.metadata;
  // Fetch any unfetched images in the window
  useEffect(() => {
    const fetchCarousel = async () => {
      const hasDbEntry = image.path.startsWith('photos/')
      if (hasDbEntry) {
        const pathsWithNoMetadata = validImages.filter(img => !img.metadata).map(img => img.path);
        fetchMetadata(pathsWithNoMetadata, credentials).then(metadata => {
          for (const img of validImages) {
            if (img.path in metadata) {
              img.metadata = metadata[img.path];
              setGeneration(prev => prev + 1);
            }
          }
        })
      }

      if (!image.blobUrl) {
        try {
          const blobUrl = image.type === 'video' ? await signedUrl(image.path) : await fetchFile(image.path);
          image.blobUrl = blobUrl;
          setGeneration(prev => prev + 1);
        } catch (error) {
          console.error('Failed to fetch image:', error);
        }
      }

      validImages.forEach(async (img) => {
        if (!img.thumbnailBlobUrl && hasDbEntry) {
          try {
            const blobUrl = await fetchFile(img.path.replace('photos', 'thumbnails'));
            img.thumbnailBlobUrl = blobUrl;
            setGeneration(prev => prev + 1);
          } catch (error) {
            console.error('Failed to fetch image:', error);
          }
        }
        if (!img.blobUrl) {
          try {
            const blobUrl = await fetchFile(img.path);
            img.blobUrl = blobUrl;
            if (!hasDbEntry && !img.metadata) {
              // use exif data to populate metadata
              const exifData = await exifr.parse(blobUrl);
              img.metadata = {
                id: 0,
                path: image.path,
                name: image.name,
                latitude: exifData.gpsLatitude,
                longitude: exifData.gpsLongitude,
                city: exifData.city,
                state: exifData.state,
                country: exifData.country,
                orientation: exifData.orientation,
                lens_model: exifData.lensModel,
                camera_make: exifData.make,
                camera_model: exifData.model,
                shutter_speed: exifData.exposureTime,
                aperture: exifData.apertureValue,
                focal_length: exifData.focalLength,
                iso: exifData.iso,
                taken_at: exifData.dateTimeOriginal,
                notes: '',
              }
            }

            setGeneration(prev => prev + 1);
          } catch (error) {
            console.error('Failed to fetch image:', error);
          }
        }
      });
    }
    fetchCarousel();
  }, [windowImages, image.path]);

  const toggleFullscreen = async () => {
    if (isTouch) {
      const entering = !immersive;
      setImmersive(entering);
      // Android can also hide the browser's own bars
      try {
        if (entering && document.fullscreenEnabled && !document.fullscreenElement) await containerRef.current?.requestFullscreen();
        if (!entering && document.fullscreenElement) await document.exitFullscreen();
      } catch (error) {
        console.error('Fullscreen failed:', error);
      }
      return;
    }
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      // Leaving native fullscreen (e.g. Android back gesture) leaves immersive mode too
      if (!document.fullscreenElement) setImmersive(false);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const hasNext = idx < allImages.length - 1;
  const hasPrevious = idx > 0;

  // Add 'f' key to toggle filmstrip
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (editing) {
      return
    }
    switch (e.key) {
      case 'Escape':
        if (document.fullscreenElement) {
          document.exitFullscreen();
          e.preventDefault();
          return;
        }
        onClose();
        blur(e);
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        if (onNext && hasNext) onNext();
        blur(e);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        if (onPrevious && hasPrevious) onPrevious();
        blur(e);
        break;
      case 'i':
        setShowInfo(prev => !prev);
        blur(e);
        break;
      case 'f':
        toggleFullscreen();
        blur(e);
        break;
      case 'c':
        setShowFilmstrip(prev => !prev);
        blur(e);
        break;
      case 'p':
        setShowFaces(!lastShowFaces);
        blur(e);
        break;
    }
  }, [onClose, onNext, onPrevious, hasNext, hasPrevious, editing]);

  const handleWheel = useCallback((e: WheelEvent) => {
    if (!imageRef.current) {
      return
    }

    e.preventDefault();
    const deltaY = -e.deltaY;
    const deltaX = -e.deltaX;

    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      // Calculate zoom
      const { x: ex, y: dy } = e;
      const ey = dy - 36;
      const newScale = Math.max(1, Math.min(5, lastScale * (1 + deltaY * 0.01)));
      const { width, height } = imageRef.current;
      const prevCenter = { x: width / 2 + lastPosition.x, y: height / 2 + lastPosition.y }
      const targetDelta = { x: ex - prevCenter.x, y: ey - prevCenter.y }
      const scaledTargetDelta = { x: targetDelta.x * newScale / lastScale, y: targetDelta.y * newScale / lastScale }
      lastPosition = { x: ex - scaledTargetDelta.x - width / 2, y: ey - scaledTargetDelta.y - height / 2 }
      lastScale = newScale;
      setScale(newScale);
    } else {
      lastPosition.x += deltaX;
      lastPosition.y += deltaY;
    }

    setPos(lastPosition);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && scale > 1) {
      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;

      // Constrain position within bounds
      setPos({ x: newX, y: newY });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    lastScale = scale;
    const container = containerRef.current;
    if (container && image.type !== 'video') {
      container.addEventListener('wheel', handleWheel, { passive: false });
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (container && image.type !== 'video') {
        container.removeEventListener('wheel', handleWheel);
      }
    };
  }, [imageRef, idx, editing, image]);

  // Until the full photo arrives, show its thumbnail (already loaded for the grid/filmstrip) so
  // swiping to a new photo shows something immediately. Thumbnails the app rotates with CSS
  // (orientation 6/8) would show sideways here, so those wait for the full photo.
  const viewUrl = (img?: BucketItemWithBlob) => {
    if (!img) return undefined;
    if (img.blobUrl && img.type === 'image') return img.blobUrl;
    const rotated = img.metadata?.orientation === 6 || img.metadata?.orientation === 8;
    return img.thumbnailBlobUrl && !rotated ? img.thumbnailBlobUrl : undefined;
  };
  const displayUrl = image.type === 'image' ? viewUrl(image) : undefined;

  // Swiping sideways on the photo moves between photos (touch only, not while zoomed or on videos).
  // The neighbouring photos ride along just off-screen, so the next one slides in with the finger;
  // a completed swipe animates the strip the rest of the way, then switches photos in place.
  const SWIPE_GAP = 16;
  const SWIPE_MS = 200;
  const contentRef = useRef<HTMLDivElement>(null);
  const swipeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(swipeTimer.current), []);

  // iOS Safari starts its back/forward swipe for touches that begin at the screen edge, which
  // fights photo swiping. Cancelling those touchstarts (needs a non-passive listener; React's are
  // passive) stops it. Doesn't help in Chrome for iOS or with Android's system back gesture; the
  // home-screen app has no such gesture at all.
  useEffect(() => {
    const content = contentRef.current;
    if (!content || !isTouch) return;
    const EDGE = 24;
    const onTouchStart = (e: TouchEvent) => {
      const x = e.touches[0]?.clientX ?? EDGE;
      if (x < EDGE || x > window.innerWidth - EDGE) e.preventDefault();
    };
    content.addEventListener('touchstart', onTouchStart, { passive: false });
    return () => content.removeEventListener('touchstart', onTouchStart);
  }, [isTouch]);
  const canSwipe = isTouch && image.type !== 'video' && scale === 1 && !swipeSettling;
  const previousUrl = isTouch ? viewUrl(allImages[idx - 1]) : undefined;
  const nextUrl = isTouch ? viewUrl(allImages[idx + 1]) : undefined;
  const swipeTransition = swipeSettling ? `transform ${SWIPE_MS}ms ease-out` : undefined;

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!canSwipe || e.touches.length !== 1) return;
    swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, axis: null };
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    const start = swipe.current;
    if (!start || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - start.x;
    const dy = e.touches[0].clientY - start.y;
    if (!start.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 10) start.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (start.axis !== 'x') return;
    // Resist past the first/last photo
    const blocked = (dx > 0 && !hasPrevious) || (dx < 0 && !hasNext);
    setSwipeX(blocked ? dx * 0.25 : dx);
  };
  const handleTouchEnd = () => {
    const start = swipe.current;
    swipe.current = null;
    if (!start || start.axis !== 'x') return;
    const width = (contentRef.current?.clientWidth ?? window.innerWidth) + SWIPE_GAP;
    const threshold = Math.min(80, window.innerWidth * 0.2);
    const direction = swipeX <= -threshold && hasNext ? 1 : swipeX >= threshold && hasPrevious ? -1 : 0;
    setSwipeSettling(true);
    setSwipeX(-direction * width);  // 0 springs back
    swipeTimer.current = setTimeout(() => {
      // The neighbour is now exactly where the current photo was: switch without animating
      if (direction === 1) onNext?.();
      if (direction === -1) onPrevious?.();
      setSwipeSettling(false);
      setSwipeX(0);
    }, SWIPE_MS);
  };

  // In immersive mode, a tap on the black around the photo brings the viewer chrome back
  const handleContentClick = (e: React.MouseEvent) => {
    if (!immersive) return;
    const img = imageRef.current;
    if (img?.naturalWidth && image.type !== 'video') {
      const box = img.getBoundingClientRect();
      const fit = Math.min(box.width / img.naturalWidth, box.height / img.naturalHeight);
      const width = img.naturalWidth * fit;
      const height = img.naturalHeight * fit;
      const left = box.left + (box.width - width) / 2;
      const top = box.top + (box.height - height) / 2;
      if (e.clientX >= left && e.clientX <= left + width && e.clientY >= top && e.clientY <= top + height) return;
    }
    toggleFullscreen();
  };

  return (
    <div ref={containerRef} className={`fixed h-[100dvh] inset-0 z-50 flex flex-col transition-colors duration-300 ${immersive ? 'bg-black' : 'bg-white'}`}>
      <TopBar
        onPrevious={onPrevious}
        onNext={onNext}
        onClose={onClose}
        toggleFullscreen={toggleFullscreen}
        setShowInfo={setShowInfo}
        image={image}
        showFilmstrip={chromeShown}
        idx={idx}
        total={total}
        isFullscreen={isFullscreen || immersive}
        editing={editing}
        setEditing={setEditing}
        showFaces={showFaces}
        setShowFaces={image.type === 'image' && image.metadata?.id ? setShowFaces : undefined}
      />

      {/* Main content */}
      <div
        ref={contentRef}
        className={`${chromeShown ? 'mt-4' : ''} flex-1 flex flex-col w-full items-center justify-center relative transition-all duration-300 overflow-hidden`}
        style={isTouch ? { touchAction: 'pinch-zoom' } : undefined}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onClick={handleContentClick}
      >
        {/* Neighbouring photos, off-screen until swiped in */}
        {[{ url: previousUrl, side: -1 }, { url: nextUrl, side: 1 }].map(({ url, side }) => url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={side}
            src={url}
            alt=""
            aria-hidden
            draggable={false}
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            style={{
              transform: `translateX(calc(${side} * (100% + ${SWIPE_GAP}px) + ${swipeX}px))`,
              transition: swipeTransition,
            }}
          />
        ))}
        {/* Image container */}
        {image.type === 'video' && image.blobUrl ? (
          <VideoPlayer key={image.path} video={image} />
        ) : displayUrl ? (
          <>
            <img
              ref={imageRef}
              src={displayUrl}
              alt={image.name}
              className={`w-full h-full object-contain transition-none cursor-${scale > 1 ? 'grab' : 'default'} ${isDragging ? 'cursor-grabbing' : ''}`}
              style={{
                transform: `translate(${position.x + swipeX}px, ${position.y}px) scale(${scale})`,
                transformOrigin: 'center',
                transition: swipeTransition,
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              draggable={false}
            />
            {showFaces && !immersive && image.metadata?.id ? (
              <FaceTags
                imageId={image.metadata.id}
                imageRef={imageRef}
                imageUrl={displayUrl}
                scale={scale}
                position={{ x: position.x + swipeX, y: position.y }}
              />
            ) : null}
            {image.blobUrl ? (
              <Minimap
                thumbnailUrl={image.thumbnailBlobUrl || image.blobUrl}
                orientation={image.metadata?.orientation}
                scale={scale}
                position={position}
                imageRef={imageRef}
                onPositionChange={setPos}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <LoadingSpinner size="large" light={immersive} />
              </div>
            )}
          </>
        ) : (
          <div className="flex-1">
            <LoadingSpinner size="large" light={immersive} />
          </div>
        )}
      </div>

      {/* Toggle filmstrip button */}
      <button
        onClick={() => setShowFilmstrip(prev => !prev)}
        className={`absolute bottom-4 right-4 p-2 rounded-md bg-white/10 text-white hover:bg-black/5 z-50 ${immersive ? 'hidden' : ''}`}
        aria-label="Toggle filmstrip"
      >
        <svg className="w-6 h-6" fill="none" stroke="black" viewBox="0 0 32 16">
          <rect x="4" y="2" width="6" height="12" fill="black" opacity="0.3" />
          <rect x="12" y="0" width="8" height="16" fill="black" opacity="0.5" />
          <rect x="22" y="2" width="6" height="12" fill="black" opacity="0.3" />
        </svg>
      </button>

      {/* Info panel */}
      {<MetadataEditor
        metadata={metadata}
        credentials={credentials}
        editing={editing}
        setEditing={setEditing}
        showFilmstrip={chromeShown && showInfo}
      />}

      {/* Filmstrip drawer */}
      <Carousel images={windowImages} shown={chromeShown} onSelectImage={onSelectImage} />
    </div>
  );
} 