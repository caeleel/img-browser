'use client';

import { useState, useCallback } from 'react';
import Header from '@/components/Header';
import { processDataTransfer, UploadStatus } from '@/lib/upload';

const abortController: { current: AbortController | null } = { current: null };

export default function UploadPage() {
  const [status, setStatus] = useState<UploadStatus>({
    total: 0,
    processed: 0,
    currentBatch: [],
    error: null,
    isProcessing: false
  });
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    processDataTransfer(e.dataTransfer, setStatus, abortController);
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
    setStatus(prev => ({ ...prev, isProcessing: false }));
  };

  const progress = status.total ? Math.round((status.processed / status.total) * 100) : 0;

  return (
    <div>
      <Header />
      <div className="p-8 max-w-4xl mx-auto">

        {/* Drop Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`
          border-4 border-dashed rounded-lg p-12 text-center
          ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}
          ${status.isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
        >
          <p className="text-lg text-gray-600">
            {status.isProcessing ? 'Processing...' : 'Drop a directory here'}
          </p>
        </div>

        {/* Progress Section */}
        {(status.isProcessing || status.processed > 0) && (
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
        {status.isProcessing && (
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
    </div>
  )
}
