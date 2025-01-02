'use client';

import { BucketItemWithBlob } from '@/lib/types';
import { useEffect, useRef, useState } from 'react';
import PlayIcon from './icons/PlayIcon';
import PauseIcon from './icons/PauseIcon'
import VolumeIcon from './icons/VolumeIcon';

let controlsTimeout: NodeJS.Timeout | null = null;

const VOLUME_STORAGE_KEY = 'video-player-volume';

export default function VideoPlayer({ video }: { video: BucketItemWithBlob }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedVolume = localStorage.getItem(VOLUME_STORAGE_KEY);
      return savedVolume ? parseFloat(savedVolume) : 1;
    }
    return 1;
  });
  const [showControls, setShowControls] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      const progress = (video.currentTime / video.duration) * 100;
      setProgress(progress);
    };

    const handleEnded = () => setIsPlaying(false);

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ended', handleEnded);
    };
  }, []);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
    }
  }, []);

  const handleMouseMove = () => {
    setShowControls(true);

    // Clear existing timeout
    if (controlsTimeout) {
      clearTimeout(controlsTimeout);
    }

    // Set new timeout
    controlsTimeout = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  };

  const handleMouseLeave = () => {
    if (controlsTimeout) {
      clearTimeout(controlsTimeout);
    }
    setShowControls(false);
  };

  const togglePlay = () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !progressRef.current) return;

    const rect = progressRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = (x / rect.width) * 100;
    const time = (percentage / 100) * videoRef.current.duration;

    videoRef.current.currentTime = time;
  };

  const updateVolume = (newVolume: number) => {
    setVolume(newVolume);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
    }
    localStorage.setItem(VOLUME_STORAGE_KEY, newVolume.toString());
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const newVolume = volume === 0 ? 1 : 0;
    updateVolume(newVolume);
  };

  const handleVolumeChange = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const percentage = 1 - (y / rect.height);
    const newVolume = Math.max(0, Math.min(1, percentage));

    updateVolume(newVolume);
  };

  return (
    <div
      className="relative h-full w-full"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        src={video.blobUrl}
        onClick={togglePlay}
      />

      {/* Custom Controls */}
      <div className={`absolute shadow-md hover:opacity-100 left-1/2 -translate-x-1/2 bottom-8 px-2 py-1 bg-black/90 rounded-full flex items-center gap-4 min-w-[300px] transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
        {/* Play/Pause Button */}
        <button
          onClick={togglePlay}
          className="text-white hover:text-white/80"
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>

        {/* Progress Bar */}
        <div
          ref={progressRef}
          onClick={handleSeek}
          className="flex-1 h-1.5 bg-white/20 rounded cursor-pointer relative overflow-hidden"
        >
          {/* 3D Effect Layers */}
          <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent" />

          {/* Progress Fill */}
          <div
            className="absolute h-full bg-white rounded"
            style={{ width: `${progress}%` }}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-transparent" />
          </div>
        </div>

        {/* Volume Control */}
        <div className="relative h-6 w-6 group">
          <button
            onClick={toggleMute}
            className="text-white hover:text-white/80"
          >
            <VolumeIcon volume={volume} />
          </button>

          <div className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 h-16 p-2 bg-black/70 backdrop-blur-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            {/* Volume Bar */}
            <div
              onClick={handleVolumeChange}
              className="w-1.5 h-12 bg-white/20 rounded-full cursor-pointer relative overflow-hidden"
            >
              {/* 3D Effect Layers */}
              <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent" />

              {/* Volume Fill */}
              <div
                className="absolute bottom-0 w-full bg-white rounded-full transition-all duration-150"
                style={{ height: `${volume * 100}%` }}
              >
                <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-transparent" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 