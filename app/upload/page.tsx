'use client';

import { useState, useCallback, useRef } from 'react';
import { uploadFile } from '@/lib/s3';
import exifr from 'exifr';

const BATCH_SIZE = 25;
let heic2any: (options: {
  blob: Blob;
  multiple?: true;
  toType?: string;
  quality?: number;
  gifInterval?: number;
}) => Promise<Blob | Blob[]>;

if (typeof window !== 'undefined') {
  heic2any = require('heic2any');
}

interface UploadStatus {
  total: number;
  processed: number;
  currentBatch: string[];
  error: string | null;
}

async function createThumbnail(file: File): Promise<Blob> {
  const MAX_SIZE = 800;

  // Create image element
  const img = new Image();
  const objectUrl = URL.createObjectURL(file);
  console.log(file.name, file.type, file.size);

  try {
    // Load image
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = (e) => {
        console.log('error loading image', e);
        reject(e);
      }
      img.src = objectUrl;
    });

    // Calculate new dimensions
    let width = img.width;
    let height = img.height;

    if (width > height) {
      if (width > MAX_SIZE) {
        height = Math.round(height * MAX_SIZE / width);
        width = MAX_SIZE;
      }
    } else {
      if (height > MAX_SIZE) {
        width = Math.round(width * MAX_SIZE / height);
        height = MAX_SIZE;
      }
    }

    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    // Draw resized image
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');

    ctx.drawImage(img, 0, 0, width, height);

    // Convert to blob
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create blob'));
        },
        'image/jpeg',
        0.8
      );
    });

    return blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function convertHeicToJpeg(file: File): Promise<File> {
  if (!file.name.toLowerCase().endsWith('.heic') && !file.name.toLowerCase().endsWith('.heif')) {
    return file;
  }

  try {
    const blob = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.9
    });

    // Convert blob to file to maintain filename
    return new File(
      [blob as Blob],
      file.name.replace(/\.(heic|HEIC|heif|HEIF)$/, '.jpg'),
      { type: 'image/jpeg' }
    );
  } catch (error) {
    console.error('HEIC conversion failed:', error);
    throw new Error(`Failed to convert HEIC file ${file.name}`);
  }
}

export default function UploadPage() {
  const [status, setStatus] = useState<UploadStatus>({
    total: 0,
    processed: 0,
    currentBatch: [],
    error: null
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const abortController = useRef<AbortController | null>(null);

  const processFiles = async (files: File[], dirName: string) => {
    const imageFiles = Array.from(files).filter(file =>
      file.type.startsWith('image/') || file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')
    );

    setStatus({
      total: imageFiles.length,
      processed: 0,
      currentBatch: [],
      error: null
    });

    const credentials = JSON.parse(localStorage.getItem('doCredentials') || '{}');
    setIsProcessing(true);
    abortController.current = new AbortController();

    try {
      for (let i = 0; i < imageFiles.length; i += BATCH_SIZE) {
        if (abortController.current?.signal.aborted) {
          break;
        }

        const batch = imageFiles.slice(i, i + BATCH_SIZE);

        // Check which files in this batch already exist
        const batchPaths = batch.map(file => {
          const fileName = file.name.toLowerCase()
            .replace(/\.(heic|heif|HEIC|HEIF)$/, '.jpg');
          return `photos/${dirName}/${fileName}`;
        });

        const response = await fetch('/api/batch_meta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paths: batchPaths,
            credentials
          })
        });
        const existingMetadata = await response.json();
        const existingPathsSet = new Set(Object.keys(existingMetadata));

        // Filter out already processed images from this batch
        const newBatchFiles = batch.filter((file, index) => !existingPathsSet.has(batchPaths[index]));

        if (newBatchFiles.length === 0) {
          setStatus(prev => ({
            ...prev,
            processed: prev.processed + batch.length
          }));
          continue;
        }

        setStatus(prev => ({ ...prev, currentBatch: newBatchFiles.map(f => f.name) }));

        const batchMetadata = await Promise.all(
          newBatchFiles.map(async (file) => {
            try {
              // Convert HEIC to JPEG if necessary
              const processedFile = await convertHeicToJpeg(file);

              // Read EXIF data
              const arrayBuffer = await processedFile.arrayBuffer();
              const originalBuffer = await file.arrayBuffer();
              const exif = await exifr.parse(originalBuffer);

              // Create thumbnail
              const thumbnail = await createThumbnail(processedFile);

              // Upload original
              await uploadFile(
                `photos/${dirName}/${processedFile.name}`,
                new Blob([arrayBuffer], { type: processedFile.type })
              );

              // Upload thumbnail
              await uploadFile(
                `thumbnails/${dirName}/${processedFile.name}`,
                thumbnail
              );

              return {
                path: `photos/${dirName}/${processedFile.name}`,
                name: processedFile.name,
                taken_at: exif?.DateTimeOriginal || null,
                latitude: exif?.latitude || null,
                longitude: exif?.longitude || null,
                city: null,
                state: null,
                country: null,
                camera_make: exif?.Make || null,
                camera_model: exif?.Model || null,
                lens_model: exif?.LensModel || null,
                aperture: exif?.FNumber || null,
                iso: exif?.ISO || null,
                shutter_speed: exif?.ExposureTime || null,
                focal_length: exif?.FocalLength || null,
                orientation: 1,
              };
            } catch (error) {
              console.error(`Error processing ${file.name}:`, error);
              return null;
            }
          })
        );

        // Update metadata in database
        const validMetadata = batchMetadata.filter(Boolean);
        if (validMetadata.length > 0) {
          const credentials = JSON.parse(localStorage.getItem('doCredentials') || '{}');
          await fetch('/api/metadata', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ metadata: validMetadata, credentials })
          });
        }

        setStatus(prev => ({ ...prev, processed: prev.processed + batch.length }));
      }
    } catch (error) {
      setStatus(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'An error occurred'
      }));
    } finally {
      setIsProcessing(false);
      abortController.current = null;
    }
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const items = Array.from(e.dataTransfer.items);
    const dirEntry = items[0]?.webkitGetAsEntry();

    if (!dirEntry?.isDirectory) {
      setStatus(prev => ({ ...prev, error: 'Please drop a directory' }));
      return;
    }

    const files: File[] = [];
    const dirName = dirEntry.name;

    async function readEntries(entry: FileSystemDirectoryEntry): Promise<void> {
      const reader = entry.createReader();
      let entries: FileSystemEntry[] = [];

      // Keep reading until no more entries are returned
      do {
        const newEntries = await new Promise<FileSystemEntry[]>((resolve) => {
          reader.readEntries(resolve);
        });

        if (newEntries.length === 0) break;
        entries = entries.concat(newEntries);
      } while (true);

      await Promise.all(entries.map(async (entry) => {
        if (entry.isFile) {
          const file = await new Promise<File>((resolve) => {
            (entry as FileSystemFileEntry).file(resolve);
          });
          files.push(file);
        } else if (entry.isDirectory) {
          await readEntries(entry as FileSystemDirectoryEntry);
        }
      }));
    }

    await readEntries(dirEntry as FileSystemDirectoryEntry);
    await processFiles(files, dirName);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleCancel = () => {
    abortController.current?.abort();
    setIsProcessing(false);
  };

  const progress = status.total ? Math.round((status.processed / status.total) * 100) : 0;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-8">Upload Directory</h1>

      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          border-4 border-dashed rounded-lg p-12 text-center
          ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}
          ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        <p className="text-lg text-gray-600">
          {isProcessing ? 'Processing...' : 'Drop a directory here'}
        </p>
      </div>

      {/* Progress Section */}
      {(isProcessing || status.processed > 0) && (
        <div className="mt-8">
          <div className="mb-2 flex justify-between text-sm">
            <span>Progress: {status.processed} / {status.total}</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Current Batch */}
      {status.currentBatch.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-4">Currently Processing:</h2>
          <div className="bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto">
            <ul className="space-y-1">
              {status.currentBatch.map((name, i) => (
                <li key={i} className="text-sm text-gray-600">{name}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Cancel Button */}
      {isProcessing && (
        <button
          onClick={handleCancel}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Cancel Upload
        </button>
      )}

      {/* Error Display */}
      {status.error && (
        <div className="mt-8 p-4 bg-red-50 text-red-700 rounded-lg">
          <p className="font-medium">Error:</p>
          <p className="text-sm">{status.error}</p>
        </div>
      )}
    </div>
  );
}
