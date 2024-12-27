'use client';

import React, { useEffect } from 'react';

interface VideoPlayerProps {
  video: {
    name: string;
    signedUrl: string;
  };
  onClose: () => void;
}

export default function VideoPlayer({ video, onClose }: VideoPlayerProps) {
  useEffect(() => {
    const keyDownHandler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', keyDownHandler);
    return () => window.removeEventListener('keydown', keyDownHandler);
  }, [])

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="relative max-w-4xl w-full" onClick={e => e.stopPropagation()}>
        <div className="absolute top-0 right-0 p-4 z-10" onClick={onClose}>
          <button
            className="text-white hover:text-gray-300"
          >
            ✕
          </button>
        </div>
        <video
          src={video.signedUrl}
          controls
          autoPlay
          className="w-full"
        >
          Your browser does not support the video tag.
        </video>
      </div>
    </div>
  );
} 