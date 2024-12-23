'use client';

import { useEffect, useState, useCallback } from 'react';
import { listContents, fetchFile } from '@/lib/s3';
import exifr from 'exifr';
import { BucketItem, S3Credentials, S3Response } from '@/lib/types';

const BATCH_SIZE = 25;

export default function BackfillPage() {
  const [total, setTotal] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [currentBatch, setCurrentBatch] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [filesToProcess, setFilesToProcess] = useState<BucketItem[]>([]);
  const [isPaused, setIsPaused] = useState(true);
  const [credentials, setCredentials] = useState<S3Credentials | null>(null);
  // Initialize the files to process
  useEffect(() => {
    const savedCredentials = localStorage.getItem('doCredentials');
    let parsedCredentials: S3Credentials | null = null;
    if (savedCredentials) {
      parsedCredentials = JSON.parse(savedCredentials);
      setCredentials(parsedCredentials);
    }

    async function initialize() {
      try {
        // Get all files from S3
        const allFiles: S3Response = { Contents: [], IsTruncated: true, CommonPrefixes: [] };
        let continuationToken;
        while (allFiles.IsTruncated) {
          const response = await listContents('photos/sony_camera/', continuationToken);
          allFiles.Contents.push(...(response.Contents || []));
          allFiles.IsTruncated = response.IsTruncated;
          continuationToken = response.NextContinuationToken;
        }
        const allImageFiles = allFiles.Contents.filter(f => f.Key?.toLowerCase().endsWith('.jpg') || f.Key?.toLowerCase().endsWith('.png')).map(f => ({ path: f.Key!, name: f.Key!.split('/').pop()!, type: 'image' as const, key: f.Key! }));

        // Get existing paths from database
        const response = await fetch('/api/metadata', {
          headers: {
            'X-DO-ACCESS-KEY-ID': parsedCredentials?.accessKeyId || '',
            'X-DO-SECRET-ACCESS-KEY': parsedCredentials?.secretAccessKey || ''
          }
        });
        const { rows } = await response.json();
        const paths = rows.map((r: { path: string }) => r.path);
        const existingPaths = new Set(paths);

        // Filter out already processed files
        const unprocessedFiles = allImageFiles.filter(f => !existingPaths.has(f.path));
        setFilesToProcess(unprocessedFiles);
        setTotal(unprocessedFiles.length);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      }
    }

    initialize();
  }, []);

  const processBatch = useCallback(async (startIndex: number) => {
    try {
      const batch = filesToProcess.slice(startIndex, startIndex + BATCH_SIZE);
      setCurrentBatch(batch.map(f => f.name));

      const batchMetadata = await Promise.all(
        batch.map(async (file) => {
          const blobUrl = await fetchFile(file.path);
          const exif = await exifr.parse(blobUrl, {
            pick: [
              'Make', 'Model', 'DateTimeOriginal', 'ISO', 'FNumber',
              'ExposureTime', 'FocalLength', 'latitude', 'longitude'
            ]
          });

          return {
            path: file.path,
            name: file.name,
            taken_at: exif?.DateTimeOriginal || null,
            latitude: exif?.latitude || null,
            longitude: exif?.longitude || null,
            city: null,
            state: null,
            country: null,
            camera_make: exif?.Make || null,
            camera_model: exif?.Model || null,
            lens_model: null,
            aperture: exif?.FNumber || null,
            iso: exif?.ISO || null,
            shutter_speed: exif?.ExposureTime || null,
            focal_length: exif?.FocalLength || null,
            orientation: await exifr.orientation(blobUrl) || 1
          };
        })
      );

      await fetch('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata: batchMetadata, credentials })
      });

      setProcessed(prev => prev + batch.length);
      return batch.length;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      return 0;
    }
  }, [filesToProcess, credentials]);

  const backfill = useCallback(async () => {
    if (!filesToProcess.length) return;

    setIsProcessing(true);
    setError(null);

    try {
      for (let i = processed; i < filesToProcess.length && !isPaused; i += BATCH_SIZE) {
        await processBatch(i);
      }
    } finally {
      setIsProcessing(false);
      setCurrentBatch([]);
    }
  }, [filesToProcess, processed, isPaused, processBatch]);

  // Start/resume processing when isPaused is set to false
  useEffect(() => {
    if (!isPaused && !isProcessing) {
      backfill();
    }
  }, [isPaused, isProcessing, backfill]);

  const handleStartPause = () => {
    setIsPaused(prev => !prev);
  };

  const handleRunOneBatch = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    await processBatch(processed);
    setIsProcessing(false);
    setCurrentBatch([]);
  };

  const progress = total ? Math.round((processed / total) * 100) : 0;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-8">Backfilling Image Metadata</h1>

      {/* Control Buttons */}
      <div className="mb-8 flex space-x-4">
        <button
          onClick={handleStartPause}
          disabled={processed >= total}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isProcessing ? (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" />
              </svg>
              <span>Pause</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              </svg>
              <span>Start</span>
            </>
          )}
        </button>

        <button
          onClick={handleRunOneBatch}
          disabled={isProcessing || processed >= total}
          className="flex items-center space-x-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
          <span>Run 1 Batch</span>
        </button>
      </div>

      {/* Progress Section */}
      <div className="mb-8">
        <div className="mb-2 flex justify-between text-sm">
          <span>Progress: {processed} / {total}</span>
          <span>{progress}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div
            className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Current Batch */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Currently Processing:</h2>
        <div className="bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto">
          {currentBatch.length > 0 ? (
            <ul className="space-y-1">
              {currentBatch.map((name, i) => (
                <li key={i} className="text-sm text-gray-600">{name}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">
              {isProcessing ? "Preparing next batch..." : "Processing complete"}
            </p>
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg">
          <p className="font-medium">Error:</p>
          <p className="text-sm">{error}</p>
        </div>
      )}
    </div>
  );
}
