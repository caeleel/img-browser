'use client';

import { useAtom, useAtomValue } from 'jotai';
import { uploadStatusAtom, abortControllerAtom, showFooterAtom } from '@/lib/atoms';
import { useState } from "react";
import LoadingSpinner from "./LoadingSpinner";
import CloseIcon from "./icons/CloseIcon";

export default function UploadToast() {
  const [uploadStatus, setUploadStatus] = useAtom(uploadStatusAtom);
  const [abortController, setAbortController] = useAtom(abortControllerAtom);
  const [showConfirm, setShowConfirm] = useState(false);
  const showFooter = useAtomValue(showFooterAtom);

  if (!uploadStatus) return null;

  const progress = uploadStatus.total ? Math.round((uploadStatus.processed / uploadStatus.total) * 100) : 0;
  const isComplete = uploadStatus.processed === uploadStatus.total && !uploadStatus.isProcessing;

  const handleClose = () => {
    if (uploadStatus.isProcessing) {
      setShowConfirm(true);
    } else {
      setUploadStatus(null);
      setAbortController(null);
    }
  };

  const handleCancel = () => {
    abortController?.abort();
    setUploadStatus(null);
    setAbortController(null);
    setShowConfirm(false);
  };

  return (
    <>
      <div className={`fixed left-4 bg-white/70 backdrop-blur-lg rounded-lg shadow-[0_4px_10px_rgba(0,0,0,0.1)] p-4 w-80 ${showFooter ? 'bottom-16' : 'bottom-4'}`} style={{
        transition: 'bottom 0.3s ease-in-out'
      }}>
        <div className="flex items-center gap-4">
          <div className="flex-1 ml-1">
            <div className="flex justify-between text-sm mb-2">
              <div className="flex items-center gap-2">
                {uploadStatus.isProcessing && <div><LoadingSpinner size={"small"} /></div>}
                <div>{uploadStatus.processed} / {uploadStatus.total}</div>
              </div>
              <div className="text-black/50">{progress}%</div>
            </div>
            <div className="w-full bg-black/5 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full transition-all duration-300 ${uploadStatus.error ? 'bg-red-500' : isComplete ? 'bg-green-500' : 'bg-black/30'}`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <button onClick={handleClose} className="hover:bg-black/5 rounded p-1">
            <CloseIcon color="black" />
          </button>
        </div>

        {uploadStatus.error && (
          <div className="mt-2 text-sm text-red-600">
            {uploadStatus.error}
          </div>
        )}
      </div>

      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white/70 backdrop-blur-lg rounded-lg p-6 max-w-sm">
            <p className="text-black/50 mb-6">
              Are you sure you want to cancel the upload?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 text-sm hover:bg-black/5 rounded-full"
              >
                Continue Upload
              </button>
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-sm bg-red-500/50 backdrop-blur-lg text-white rounded-full hover:bg-red-600/50"
              >
                Cancel Upload
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
} 