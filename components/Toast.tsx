import { UploadStatus } from "@/lib/upload";
import { useState } from "react";
import LoadingSpinner from "./LoadingSpinner";
import CloseIcon from "./icons/CloseIcon";

export default function Toast({
  status,
  onCancel,
  onDismiss,
  raised,
}: {
  status: UploadStatus,
  onCancel: () => void,
  onDismiss: () => void,
  raised: boolean,
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const progress = status.total ? Math.round((status.processed / status.total) * 100) : 0;
  const isComplete = status.processed === status.total && !status.isProcessing;

  const handleClose = () => {
    if (status.isProcessing) {
      setShowConfirm(true);
    } else {
      onDismiss();
    }
  };

  return (
    <>
      <div className={`fixed left-4 bg-white/70 backdrop-blur-lg rounded-lg shadow-[0_4px_10px_rgba(0,0,0,0.1)] p-4 w-80 ${raised ? 'bottom-16' : 'bottom-4'}`} style={{
        transition: 'bottom 0.3s ease-in-out'
      }}>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex justify-between text-sm mb-1">
              <div className="flex items-center gap-2">
                {status.isProcessing && <div><LoadingSpinner size={"small"} /></div>}
                <div>{status.processed} / {status.total}</div>
              </div>
              <div className="text-black/50 text-xs">{progress}%</div>
            </div>
            <div className="w-full bg-black/5 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full transition-all duration-300 ${status.error ? 'bg-red-500' : isComplete ? 'bg-green-500' : 'bg-black/30'}`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <button onClick={handleClose} className="hover:bg-black/5 rounded p-1">
            <CloseIcon color="black" />
          </button>
        </div>

        {status.error && (
          <div className="mt-2 text-sm text-red-600">
            {status.error}
          </div>
        )}
      </div >

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
                onClick={() => {
                  setShowConfirm(false);
                  onCancel();
                }}
                className="px-4 py-2 text-sm bg-red-500 text-white rounded-full hover:bg-red-600/50"
              >
                Cancel Upload
              </button>
            </div>
          </div>
        </div>
      )
      }
    </>
  );
} 