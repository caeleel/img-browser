import { getCredentials } from "@/lib/s3";
import { BucketItemWithBlob } from "@/lib/types"
import { Dispatch, SetStateAction, useState } from "react";

export default function TopBar({ onPrevious, onNext, onClose, toggleFullscreen, setShowInfo, image, showFilmstrip, idx, total, isFullscreen, editing, setEditing }: {
  onPrevious?: () => void,
  onNext?: () => void,
  onClose: () => void,
  image: BucketItemWithBlob,
  idx: number,
  total: number,
  showFilmstrip: boolean,
  isFullscreen: boolean,
  editing: string | null,
  setEditing: Dispatch<SetStateAction<string | null>>,
  toggleFullscreen: () => void,
  setShowInfo: Dispatch<SetStateAction<boolean>>,
}) {
  const hasPrevious = idx > 0;
  const hasNext = idx < total - 1;
  const [editValue, setEditValue] = useState(image.name);

  const handleSave = async () => {
    if (!image.metadata?.id || editValue === image.name) {
      setEditing(null);
      return;
    }

    try {
      const credentials = getCredentials();
      const response = await fetch('/api/metadata', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: [image.metadata.id],
          metadata: { name: editValue },
          credentials
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update name');
      }

      // Update local state
      image.name = editValue;
      image.metadata.name = editValue;
    } catch (error) {
      console.error('Error updating name:', error);
      setEditValue(image.name); // Reset on error
    } finally {
      setEditing(null);
    }
  };

  return <div className={`fixed rounded-lg shadow-md z-10 h-9 right-2 backdrop-blur-md bg-black/80 px-2 overflow-hidden duration-300 flex items-center justify-between gap-2 text-white ${showFilmstrip ? 'top-2' : '-top-16'}`}>
    <div className="flex items-center h-20">
      <button
        onClick={() => setShowInfo(prev => !prev)}
        className="rounded-md hover:bg-white/10"
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
        className="p-1 rounded-md hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Previous image"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <h2 className="text-sm font-medium">
        {image.metadata?.id ? (
          editing === 'name' ? (
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSave();
                } else if (e.key === 'Escape') {
                  setEditValue(image.name);
                  setEditing(null);
                }
              }}
              className="bg-white/10 px-2 rounded text-white w-48"
              autoFocus
            />
          ) : (
            <button
              onClick={() => setEditing('name')}
              className="hover:bg-white/10 px-2 py-0.5 rounded"
            >
              {image.name}
            </button>
          )
        ) : (
          <span>{image.name}</span>
        )}
        <span className="text-white/70 ml-1">{idx + 1} / {total}</span>
      </h2>
      <button
        onClick={onNext}
        disabled={!hasNext}
        className="p-1 rounded-md hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Next image"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
    <div className="flex items-center space-x-2">
      <button
        onClick={toggleFullscreen}
        className="rounded-md hover:bg-white/10"
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
        className="rounded-md hover:bg-white/10"
        aria-label="Close viewer"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 6L18 18M6 18L18 6" stroke="white" />
        </svg>
      </button>
    </div>
  </div>
}