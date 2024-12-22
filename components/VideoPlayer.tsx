'use client';

import React, { useState } from 'react';

interface VideoPlayerProps {
  video: {
    name: string;
    url: string;
  };
  onClose: () => void;
}

export default function VideoPlayer({ video, onClose }: VideoPlayerProps) {
  const [loading, setLoading] = useState(true);

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
          src={video.url}
          controls
          autoPlay
          className="w-full"
          onLoadedData={() => setLoading(false)}
        >
          Your browser does not support the video tag.
        </video>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-2 border-white border-t-transparent"></div>
          </div>
        )}
      </div>
    </div>
  );
} 