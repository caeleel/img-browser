import { BucketItemWithBlob } from "@/lib/types";
import { getCssOrientation } from "@/lib/utils";
import LoadingSpinner from "./LoadingSpinner";

function DirectoryTile({ item, handleDirectoryClick }: {
  item: BucketItemWithBlob,
  handleDirectoryClick: (path: string) => void
}) {
  return <button
    onClick={() => handleDirectoryClick(item.path)}
    className="w-full h-48 flex hover:border-black border-4 border-white bg-black/5 overflow-hidden items-center justify-center"
  >
    <div className="p-4 text-left text-black/50 text-sm">
      📁 {item.name}
    </div>
  </button>
}

function ImageTile({ item, handleImageClick }: {
  item: BucketItemWithBlob,
  handleImageClick: (item: BucketItemWithBlob) => void
}) {
  const blobUrl = item.thumbnailBlobUrl || item.blobUrl
  const { metadata } = item

  if (!blobUrl) {
    return <div className="w-full h-48 flex items-center justify-center">
      <LoadingSpinner size="small" light />
    </div>
  }

  let rotation = ''
  if (item.thumbnailBlobUrl && metadata?.orientation) {
    rotation = getCssOrientation(metadata.orientation)
  }

  return (
    <div className="relative group bg-black/5 overflow-hidden border-4 border-white hover:border-black">
      <img
        src={blobUrl}
        alt={item.name}
        className={`w-full h-48 object-cover cursor-pointer ${rotation}`}
        onClick={() => handleImageClick(item)}
      />
    </div>
  );
}

function VideoTile({ item, loadingVideo, handleVideoClick }: {
  item: BucketItemWithBlob,
  loadingVideo: string,
  handleVideoClick: (item: BucketItemWithBlob) => void
}) {
  if (loadingVideo === item.path) {
    return <div className="w-full h-48 flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-500"></div>
    </div>
  }

  return <button
    onClick={() => handleVideoClick(item)}
    className="w-full h-48 flex bg-black/5 hover:border-black border-4 border-white overflow-hidden items-center justify-center"
  >
    <div className="p-4 text-left text-sm text-black/50">
      🎥 {item.name}
    </div>
  </button >
}

export function ItemTile({ item, handleDirectoryClick, handleVideoClick, handleImageClick, loadingVideo }: {
  item: BucketItemWithBlob,
  handleDirectoryClick: (path: string) => void,
  handleVideoClick: (item: BucketItemWithBlob) => void,
  handleImageClick: (item: BucketItemWithBlob) => void,
  loadingVideo: string
}) {
  switch (item.type) {
    case 'directory':
      return <DirectoryTile
        item={item}
        handleDirectoryClick={handleDirectoryClick}
      />
    case 'image':
      return <ImageTile
        item={item}
        handleImageClick={handleImageClick}
      />
    case 'video':
      return <VideoTile
        item={item}
        loadingVideo={loadingVideo}
        handleVideoClick={handleVideoClick}
      />
    default:
      return null
  }
}