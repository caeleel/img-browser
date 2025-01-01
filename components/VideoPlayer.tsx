'use client';

import { BucketItemWithBlob } from '@/lib/types';
import React from 'react';

export default function VideoPlayer({ video }: { video: BucketItemWithBlob }) {

  return (
    <video
      controls
      autoPlay
      className="h-full w-full object-contain"
    >
      <source src={video.blobUrl} type="video/mp4" />
      Your browser does not support the video tag.
    </video>
  );
} 