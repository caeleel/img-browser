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

  const setPos = (pos: Vector2) => {
    lastPosition = pos;
    setPosition(pos);
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

  const getMaxDrift = () => {
    if (!imageRef.current) {
      return { x: 0, y: 0 };
    }
    const { width, height } = imageRef.current;
    return { x: (lastScale - 1) * width / 2, y: (lastScale - 1) * height / 2 }
  }

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
      const newScale = Math.max(1, Math.min(5, lastScale * (1 + deltaY * 0.01)));
      const { width, height } = imageRef.current;
      const prevCenter = { x: width / 2 + lastPosition.x, y: height / 2 + lastPosition.y }
      const targetDelta = { x: e.x - prevCenter.x, y: e.y - prevCenter.y }
      const scaledTargetDelta = { x: targetDelta.x * newScale / lastScale, y: targetDelta.y * newScale / lastScale }
      lastPosition = { x: e.x - scaledTargetDelta.x - width / 2, y: e.y - scaledTargetDelta.y - height / 2 }
      lastScale = newScale;
      setScale(newScale);
    } else {
      lastPosition.x += deltaX;
      lastPosition.y += deltaY;
    }

    const maxDrift = getMaxDrift();
    setPos({
      x: Math.max(-maxDrift.x, Math.min(maxDrift.x, lastPosition.x)),
      y: Math.max(-maxDrift.y, Math.min(maxDrift.y, lastPosition.y)),
    });
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

      // Calculate bounds
      const maxDrift = getMaxDrift();

      // Constrain position within bounds
      setPos({
        x: Math.max(-maxDrift.x, Math.min(maxDrift.x, newX)),
        y: Math.max(-maxDrift.y, Math.min(maxDrift.y, newY)),
      });
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
      {/* Top bar */}
      <div className={`bg-black px-1 overflow-hidden duration-300 flex items-center justify-between transition-all text-white ${showFilmstrip ? 'h-9' : 'h-0'}`}>
        <div className="flex items-center h-20">
          <button
            onClick={() => setShowInfo(prev => !prev)}
            className="p-1 rounded-full hover:bg-white/10"
            aria-label="Show info"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 6.5C8.96243 6.5 6.5 8.96243 6.5 12C6.5 15.0376 8.96243 17.5 12 17.5C15.0376 17.5 17.5 15.0376 17.5 12C17.5 8.96243 15.0376 6.5 12 6.5ZM5.5 12C5.5 8.41015 8.41015 5.5 12 5.5C15.5899 5.5 18.5 8.41015 18.5 12C18.5 15.5899 15.5899 18.5 12 18.5C8.41015 18.5 5.5 15.5899 5.5 12ZM11.5 15.5V10.5H12.5V15.5H11.5Z" fill="white" />
              <path d="M12.5 9C12.5 9.27614 12.2761 9.5 12 9.5C11.7239 9.5 11.5 9.27614 11.5 9C11.5 8.72386 11.7239 8.5 12 8.5C12.2761 8.5 12.5 8.72386 12.5 9Z" fill="white" />
            </svg>

          </button>
        </div>
        <div className="flex items-center space-x-1 h-9">
          <button
            onClick={onPrevious}
            disabled={!hasPrevious}
            className="p-1 rounded-full hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Previous image"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="text-sm font-medium">{image.name} <span className="text-white/70 ml-1">{idx ? idx + 1 : 0} / {total}</span></h2>
          <button
            onClick={onNext}
            disabled={!hasNext}
            className="p-1 rounded-full hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Next image"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={toggleFullscreen}
            className="p-1 rounded-full hover:bg-white/10"
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 6L10.5 10.5M18 18L13.5 13.5M6 18L10.5 13.5M18 6L13.5 10.5M10.5 10.5V8M10.5 10.5H8M13.5 10.5H16M13.5 10.5V8M13.5 13.5V16M13.5 13.5H16M10.5 13.5H8M10.5 13.5V16" stroke="white" />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 6L18 18M6 6V10M6 6H10M18 18L17.9704 14M18 18L14 17.9704M6 18L18 6M6 18H10M6 18V14M18 6V10M18 6L14 6.0296" stroke="white" />
              </svg>
            )}
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-white/10"
            aria-label="Close viewer"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 6L18 18M6 18L18 6" stroke="white" />
            </svg>
          </button>
        </div>
      </div>

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

        {/* Info panel */}
        {<MetadataEditor
          metadata={metadata}
          credentials={credentials}
          editing={editing}
          setEditing={setEditing}
          showFilmstrip={showFilmstrip && showInfo}
          imageUrl={image.blobUrl}
        />}
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

      {/* Filmstrip drawer */}
      <Carousel images={windowImages} shown={showFilmstrip} onSelectImage={onSelectImage} />
    </div>
  );
} 