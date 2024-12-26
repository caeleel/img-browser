import { useEffect, useRef, useState } from 'react';
import { Vector2 } from '@/lib/types';
import { getCssOrientation } from '@/lib/utils';

interface MinimapProps {
  thumbnailUrl?: string;
  scale: number;
  position: Vector2;
  imageRef: React.RefObject<HTMLImageElement | null>;
  onPositionChange: (position: Vector2) => void;
  orientation?: number;
}

export function Minimap({ thumbnailUrl, scale, position, imageRef, onPositionChange, orientation }: MinimapProps) {
  const minimapRef = useRef<HTMLDivElement>(null);
  const thumbnailRef = useRef<HTMLImageElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [minimapRect, setMinimapRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (minimapRef.current) {
      setMinimapRect(minimapRef.current.getBoundingClientRect());
    }
  }, [scale]);

  useEffect(() => {
    if (!minimapRef.current || !imageRef.current) return;

    const { width: imageWidth, height: imageHeight } = imageRef.current;
    const minimapHeight = minimapRef.current.clientWidth * imageHeight / imageWidth;
    minimapRef.current.style.height = `${minimapHeight}px`;

    if (!thumbnailRef.current || !orientation || orientation === 1) return;
    if (orientation === 6 || orientation === 8) {
      thumbnailRef.current.style.width = `${minimapHeight}px`;
      thumbnailRef.current.style.height = `${minimapRef.current.clientWidth}px`;
    }
  }, [scale, position, orientation])

  const handleMinimapClick = (e: React.MouseEvent) => {
    if (!minimapRect || !imageRef.current) return;

    const rect = minimapRef.current?.getBoundingClientRect();
    if (!rect) return;

    const { width: imageWidth, height: imageHeight } = imageRef.current;
    const minimapX = (e.clientX - rect.left) / rect.width;
    const minimapY = (e.clientY - rect.top) / rect.height;

    // Calculate the new center position
    const newX = (minimapX - 0.5) * imageWidth * scale;
    const newY = (minimapY - 0.5) * imageHeight * scale;

    onPositionChange({
      x: -newX,
      y: -newY
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    handleMinimapClick(e);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      handleMinimapClick(e);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Calculate viewport rectangle position
  const getViewportRect = () => {
    if (!imageRef.current) return { left: 0, top: 0, width: 100, height: 100 };

    const { width: imageWidth, height: imageHeight } = imageRef.current;
    const viewportWidth = 100 / scale;
    const viewportHeight = 100 / scale;

    // Convert position to percentage
    const left = 50 - 100 * position.x / imageWidth / scale;
    const top = 50 - 100 * position.y / imageHeight / scale;

    return {
      left: `${left - viewportWidth / 2}%`,
      top: `${top - viewportHeight / 2}%`,
      width: `${viewportWidth}%`,
      height: `${viewportHeight}%`
    };
  };

  const viewportRect = getViewportRect();
  const rotation = getCssOrientation(orientation || 1)

  return (
    <div
      ref={minimapRef}
      className={`absolute flex items-center justify-center bottom-4 right-4 w-48 transition-opacity duration-300 bg-black/30 backdrop-blur-md ${scale > 1 ? 'opacity-100' : 'opacity-0'}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      draggable={false}
    >
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          ref={thumbnailRef}
          alt="Minimap"
          draggable={false}
          className={`w-full h-full object-contain ${rotation} opacity-70`}
        />
      ) : (
        <div className="w-full h-full bg-black/30" />
      )}
      <div
        className="absolute border-2 border-white/70 pointer-events-none"
        style={{
          left: viewportRect.left,
          top: viewportRect.top,
          width: viewportRect.width,
          height: viewportRect.height,
        }}
        draggable={false}
      />
    </div>
  );
} 