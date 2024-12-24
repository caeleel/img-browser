'use client';

import { useEffect, useCallback, useState, useMemo } from 'react';
import { BucketItemWithBlob, S3Credentials } from '@/lib/types';
import { fetchFile } from '@/lib/s3';
import { fetchMetadata } from '@/lib/db';
import { MetadataEditor } from './MetadataEditor';
import exifr from 'exifr';

interface ImageViewerProps {
  idx?: number
  total?: number
  allImages: BucketItemWithBlob[]
  onClose: () => void
  onNext?: () => void
  onPrevious?: () => void
  hasNext?: boolean
  hasPrevious?: boolean
  onSelectImage: (image: BucketItemWithBlob) => void
  credentials: S3Credentials
}

export default function ImageViewer({
  idx = 0,
  allImages,
  onClose,
  onNext,
  onPrevious,
  hasNext,
  hasPrevious,
  onSelectImage,
  credentials
}: ImageViewerProps) {
  const image = allImages[idx];
  const [showInfo, setShowInfo] = useState(false);
  const [showFilmstrip, setShowFilmstrip] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const setGeneration = useState(0)[1];

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
      const hasDbEntry = image.path.startsWith('photos/sony_camera/')
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

  // Add 'f' key to toggle filmstrip
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (editing) {
      return
    }
    switch (e.key) {
      case 'Escape':
        onClose();
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        if (onNext && hasNext) onNext();
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        if (onPrevious && hasPrevious) onPrevious();
        break;
      case 'i':
        setShowInfo(prev => !prev);
        break;
      case 'f':
        setShowFilmstrip(prev => !prev);
        break;
    }
  }, [onClose, onNext, onPrevious, hasNext, hasPrevious, editing]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="fixed h-screen inset-0 bg-black z-50 flex flex-col">
      {/* Top bar */}
      <div className="bg-black h-9 px-2 flex items-center justify-between text-white">
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
          <h2 className="text-sm font-medium">{image.name} <span className="text-gray-400">({idx ? idx + 1 : 0} / {total})</span></h2>
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
            onClick={() => setShowInfo(prev => !prev)}
            className="p-1 rounded-full hover:bg-white/10"
            aria-label="Show info"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" strokeWidth={2} />
              <rect x="11" y="10" width="2" height="8" fill="currentColor" />
              <circle cx="12" cy="7" r="1" fill="currentColor" />
            </svg>
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-white/10"
            aria-label="Close viewer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col w-full items-center relative transition-all duration-300">
        {/* Image container */}
        <>
          {image.blobUrl ? (
            <div
              className="w-full h-full"
              style={{
                backgroundImage: `url(${image.blobUrl})`,
                backgroundSize: 'contain',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
              }}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </>

        {/* Info panel */}
        {showInfo && <MetadataEditor metadata={metadata} credentials={credentials} editing={editing} setEditing={setEditing} />}
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
      <div
        className={`bg-black bg-opacity-80 transform transition-all duration-300 ${showFilmstrip ? 'h-32' : 'h-0'
          }`}
      >
        <div className="h-full w-full flex justify-center px-4 py-4 space-x-4 overflow-x-hidden relative">
          <div className="absolute inset-0 z-10 pointer-events-none" style={{
            background: "linear-gradient(90deg, rgba(0,0,0,1) 8%, rgba(0,0,0,0) 35%, rgba(0,0,0,0) 65%, rgba(0,0,0,1) 92%)"
          }} />
          {windowImages.map((img, i) => {
            const blobUrl = img?.thumbnailBlobUrl || img?.blobUrl;
            let rotation = '';
            if (img?.thumbnailBlobUrl && img?.metadata?.orientation) {
              rotation = img.metadata.orientation === 6 ? 'rotate-90' : img.metadata.orientation === 8 ? '-rotate-90' : '';
            }

            return (
              <button
                key={img?.path || i}
                onClick={() => img ? onSelectImage(img) : null}
                className={`h-24 w-24 flex-shrink-0 box-border bg-white/5 transition-none flex justify-center duration-200  ${windowStart + i === idx ? 'ring-2 ring-white' : ''
                  } ${rotation}`}
              >
                {blobUrl ? (
                  <img
                    src={blobUrl}
                    alt={img.name}
                    className="h-full w-auto object-cover"
                  />
                ) : (
                  <div className="h-full w-24 bg-black flex items-center justify-center">
                    {img && <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-500 border-t-transparent" />}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
} 