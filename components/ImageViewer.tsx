'use client';

import { useEffect, useCallback, useState, useMemo } from 'react';
import { BucketItemWithBlob, S3Credentials } from '@/lib/types';
import { fetchFile } from '@/lib/s3';
import { fetchMetadata } from '@/lib/db';

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
  const setGeneration = useState(0)[1];

  // Calculate window of images
  const WINDOW_SIZE = 9;
  const windowStart = Math.max(0, Math.min(
    idx - Math.floor(WINDOW_SIZE / 2),
    allImages.length - WINDOW_SIZE
  ));
  const windowImages = useMemo(() => allImages.slice(windowStart, windowStart + WINDOW_SIZE), [allImages, windowStart]);
  const total = allImages.length;
  const metadata = image.metadata;
  // Fetch any unfetched images in the window
  useEffect(() => {
    const pathsWithNoMetadata = windowImages.filter(img => !img.metadata).map(img => img.path);
    fetchMetadata(pathsWithNoMetadata, credentials).then(metadata => {
      for (const img of windowImages) {
        if (img.path in metadata) {
          img.metadata = metadata[img.path];
          setGeneration(prev => prev + 1);
        }
      }
    })

    windowImages.forEach(async (img) => {
      if (!img.thumbnailBlobUrl) {
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
          setGeneration(prev => prev + 1);
        } catch (error) {
          console.error('Failed to fetch image:', error);
        }
      }
    });
  }, [windowImages, image.path]);

  // Add 'f' key to toggle filmstrip
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
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
  }, [onClose, onNext, onPrevious, hasNext, hasPrevious]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const formatExposure = (exposure?: number) => {
    if (!exposure) return null;
    return exposure < 1 ? `1/${Math.round(1 / exposure)}` : exposure.toString();
  };

  return (
    <div className="fixed h-screen inset-0 bg-black z-50 flex flex-col">
      {/* Top bar */}
      <div className="bg-black h-9 px-2 flex items-center justify-between text-white">
        <div className="flex items-center space-x-4 h-9">
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
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setShowInfo(prev => !prev)}
            className="p-1 rounded-full hover:bg-white/10"
            aria-label="Show info"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
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
        {showInfo && (
          <div className="w-52 bg-black backdrop-blur-lg bg-opacity-70 text-white overflow-y-auto animate-slide-left rounded-lg absolute right-8 top-8 shadow-lg">
            <div className="p-4 text-xs">
              {metadata ? (
                <div className="space-y-4">
                  {(metadata.camera_make || metadata.camera_model) && (
                    <div>
                      <h4 className="font-semibold mb-1">Camera</h4>
                      <p className="text-gray-300">{[metadata.camera_make, metadata.camera_model].filter(Boolean).join(' ')}</p>
                    </div>
                  )}

                  {metadata.taken_at && (
                    <div>
                      <h4 className="font-semibold mb-1">Date Taken</h4>
                      <p className="text-gray-300">
                        {new Date(metadata.taken_at).toLocaleString()}
                      </p>
                    </div>
                  )}

                  {(metadata.iso || metadata.aperture || metadata.shutter_speed || metadata.focal_length) && (
                    <div>
                      <h4 className="font-semibold mb-1">Camera Settings</h4>
                      <div className="text-gray-300 space-y-1">
                        {metadata.iso && <p>ISO: {metadata.iso}</p>}
                        {metadata.aperture && <p>ƒ/{metadata.aperture}</p>}
                        {metadata.shutter_speed && (
                          <p>Shutter: {formatExposure(metadata.shutter_speed)}s</p>
                        )}
                        {metadata.focal_length && <p>Focal Length: {metadata.focal_length}mm</p>}
                      </div>
                    </div>
                  )}

                  {(metadata.latitude && metadata.longitude) && (
                    <div>
                      <h4 className="font-semiboldmb-1">Location</h4>
                      <a
                        href={`https://maps.google.com/?q=${metadata.latitude},${metadata.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline"
                      >
                        View on Google Maps
                      </a>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-gray-300">No metadata available</p>
              )}
            </div>
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

      {/* Filmstrip drawer */}
      <div
        className={`bg-black bg-opacity-80 transform transition-all duration-300 ${showFilmstrip ? 'h-32' : 'h-0'
          }`}
      >
        <div className="h-full w-full flex justify-center px-4 py-4 space-x-4 overflow-x-hidden relative">
          <div className="absolute inset-0 z-10 pointer-events-none" style={{
            background: "linear-gradient(90deg, rgba(0,0,0,1) 5%, rgba(0,0,0,0) 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,1) 95%)"
          }} />
          {windowImages.map((img, i) => {
            const blobUrl = img.thumbnailBlobUrl || img.blobUrl;
            let rotation = '';
            if (img.thumbnailBlobUrl && img.metadata?.orientation) {
              rotation = img.metadata.orientation === 6 ? 'rotate-90' : img.metadata.orientation === 8 ? '-rotate-90' : '';
            }

            return (
              <button
                key={img.path}
                onClick={() => onSelectImage(img)}
                className={`h-24 w-24 flex-shrink-0 box-border transition-none flex justify-center duration-200 bg-neutral-800 ${windowStart + i === idx ? 'ring-2 ring-white' : ''
                  } ${rotation}`}
              >
                {blobUrl ? (
                  <img
                    src={blobUrl}
                    alt={img.name}
                    className="h-full w-auto object-cover"
                  />
                ) : (
                  <div className="h-full w-24 bg-neutral-800 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-500 border-t-transparent" />
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