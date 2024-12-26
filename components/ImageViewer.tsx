'use client';

import { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import { BucketItemWithBlob, S3Credentials, Vector2 } from '@/lib/types';
import { fetchFile } from '@/lib/s3';
import { fetchMetadata } from '@/lib/db';
import { blur } from '@/lib/utils';
import { MetadataEditor } from './MetadataEditor';
import exifr from 'exifr';
import Carousel from './Carousel';
import { Minimap } from './Minimap';
import TopBar from './TopBar';

let lastScale = 1;
let lastPosition = { x: 0, y: 0 };

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
  onClose: () => void
  onNext?: () => void
  onPrevious?: () => void
  onSelectImage: (image: BucketItemWithBlob) => void
  credentials: S3Credentials
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const image = allImages[idx];
  const [showInfo, setShowInfo] = useState(false);
  const [showFilmstrip, setShowFilmstrip] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
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
          const blobUrl = await fetchFile(image.path);
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
                id: image.path,
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
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (container) {
        container.removeEventListener('wheel', handleWheel);
      }
    };
  }, [imageRef, idx, editing]);

  return (
    <div ref={containerRef} className="fixed h-screen inset-0 bg-black z-50 flex flex-col">
      <TopBar
        onPrevious={onPrevious}
        onNext={onNext}
        onClose={onClose}
        toggleFullscreen={toggleFullscreen}
        setShowInfo={setShowInfo}
        image={image}
        showFilmstrip={showFilmstrip}
        idx={idx}
        total={total}
        isFullscreen={isFullscreen}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col w-full items-center justify-center relative transition-all duration-300 overflow-hidden">
        {/* Image container */}
        {image.blobUrl ? (
          <>
            <img
              ref={imageRef}
              src={image.blobUrl}
              alt={image.name}
              className={`w-full h-full object-contain transition-none cursor-${scale > 1 ? 'grab' : 'default'} ${isDragging ? 'cursor-grabbing' : ''}`}
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                transformOrigin: 'center',
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              draggable={false}
            />
            <Minimap
              thumbnailUrl={image.thumbnailBlobUrl || image.blobUrl}
              orientation={image.metadata?.orientation}
              scale={scale}
              position={position}
              imageRef={imageRef}
              onPositionChange={setPos}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Toggle filmstrip button */}
      <button
        onClick={() => setShowFilmstrip(prev => !prev)}
        className="absolute bottom-4 right-4 p-2 rounded-full bg-black bg-opacity-50 text-white hover:bg-opacity-70 transition-opacity z-50"
        aria-label="Toggle filmstrip"
      >
        <svg className="w-6 h-6" fill="none" stroke="white" viewBox="0 0 32 16">
          <rect x="4" y="2" width="6" height="12" fill="white" opacity="0.7" />
          <rect x="12" y="0" width="8" height="16" fill="white" />
          <rect x="22" y="2" width="6" height="12" fill="white" opacity="0.7" />
        </svg>
      </button>

      {/* Info panel */}
      {<MetadataEditor
        metadata={metadata}
        credentials={credentials}
        editing={editing}
        setEditing={setEditing}
        showFilmstrip={showFilmstrip && showInfo}
      />}

      {/* Filmstrip drawer */}
      <Carousel images={windowImages} shown={showFilmstrip} onSelectImage={onSelectImage} />
    </div>
  );
} 