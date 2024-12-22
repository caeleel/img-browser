'use client';

import { useEffect, useCallback, useState } from 'react';
import exifr from 'exifr';

interface ImageViewerProps {
  image: {
    name: string;
    url?: string;
  };
  idx?: number;
  total?: number;
  onClose: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  hasNext?: boolean;
  hasPrevious?: boolean;
}

interface ImageMetadata {
  Make?: string;
  Model?: string;
  DateTimeOriginal?: string;
  ISO?: number;
  FNumber?: number;
  ExposureTime?: number;
  FocalLength?: number;
  latitude?: number;
  longitude?: number;
}

export default function ImageViewer({
  image,
  idx,
  total,
  onClose,
  onNext,
  onPrevious,
  hasNext,
  hasPrevious,
}: ImageViewerProps) {
  const [showInfo, setShowInfo] = useState(false);
  const [metadata, setMetadata] = useState<ImageMetadata | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (image.url) {
      setLoading(true);
      exifr.parse(image.url, {
        pick: [
          'Make', 'Model', 'DateTimeOriginal', 'ISO',
          'FNumber', 'ExposureTime', 'FocalLength',
          'latitude', 'longitude'
        ]
      })
        .then(setMetadata)
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [image.url]);

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
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
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
      <div className="flex-1 flex relative">
        {/* Image container */}
        <div className="flex-1 flex items-center justify-center bg-neutral-950">
          {image.url ? (
            <img
              src={image.url}
              alt={image.name}
              className="max-h-[calc(100vh-36px)] max-w-full w-auto h-auto object-contain"
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Info panel */}
        {showInfo && (
          <div className="w-52 bg-black backdrop-blur-lg bg-opacity-70 text-white overflow-y-auto animate-slide-left rounded-lg absolute right-8 top-8 shadow-lg">
            <div className="p-4 text-xs">
              {loading ? (
                <div className="flex justify-center py-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-800 border-t-transparent" />
                </div>
              ) : metadata ? (
                <div className="space-y-4">
                  {(metadata.Make || metadata.Model) && (
                    <div>
                      <h4 className="font-semibold mb-1">Camera</h4>
                      <p className="text-gray-300">{[metadata.Make, metadata.Model].filter(Boolean).join(' ')}</p>
                    </div>
                  )}

                  {metadata.DateTimeOriginal && (
                    <div>
                      <h4 className="font-semibold mb-1">Date Taken</h4>
                      <p className="text-gray-300">
                        {new Date(metadata.DateTimeOriginal).toLocaleString()}
                      </p>
                    </div>
                  )}

                  {(metadata.ISO || metadata.FNumber || metadata.ExposureTime || metadata.FocalLength) && (
                    <div>
                      <h4 className="font-semibold mb-1">Camera Settings</h4>
                      <div className="text-gray-300 space-y-1">
                        {metadata.ISO && <p>ISO: {metadata.ISO}</p>}
                        {metadata.FNumber && <p>ƒ/{metadata.FNumber}</p>}
                        {metadata.ExposureTime && (
                          <p>Shutter: {formatExposure(metadata.ExposureTime)}s</p>
                        )}
                        {metadata.FocalLength && <p>Focal Length: {metadata.FocalLength}mm</p>}
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
    </div>
  );
} 