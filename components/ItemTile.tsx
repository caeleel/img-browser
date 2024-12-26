import { BucketItemWithBlob } from "@/lib/types";
import { getCssOrientation } from "@/lib/utils";

function DirectoryTile({ item, handleDirectoryClick }: {
  item: BucketItemWithBlob,
  handleDirectoryClick: (path: string) => void
}) {
  return <button
    onClick={() => handleDirectoryClick(item.path)}
    className="w-full h-16 flex hover:bg-[rgba(25,103,64,0.9)] bg-white/10 transition-colors"
  >
    <div className="w-full p-4 text-white text-left text-xs font-semibold">
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
    return <div className="w-full h-48 xl:h-[calc((100vh-184px)/4)] flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-500"></div>
    </div>
  }

  let rotation = ''
  if (item.thumbnailBlobUrl && metadata?.orientation) {
    rotation = getCssOrientation(metadata.orientation)
  }

  return <div className="relative group bg-white/5">
    <div className="w-full overflow-hidden">
      <img
        src={blobUrl}
        alt={item.name}
        className={`w-full h-48 xl:h-[calc((100vh-184px)/4)] object-cover cursor-pointer ${rotation}`}
        onClick={() => handleImageClick(item)}
      />
      <div className="absolute bottom-2 left-2 rounded-full px-2 py-1 bg-black bg-opacity-50 group-hover:opacity-100 transition-opacity duration-300">
        <div className="flex flex-col items-center justify-center h-full">
          <div className="text-white text-xs">
            {item.name}
          </div>
        </div>
      </div>
    </div>
  </div>
}

function VideoTile({ item, loadingVideo, handleVideoClick }: {
  item: BucketItemWithBlob,
  loadingVideo: string,
  handleVideoClick: (item: BucketItemWithBlob) => void
}) {
  if (loadingVideo === item.path) {
    return <div className="w-full h-48 xl:h-36 flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-500"></div>
    </div>
  }

  return <button
    onClick={() => handleVideoClick(item)}
    className="w-full h-48 flex bg-neutral-800 hover:bg-[rgba(25,103,64,0.9)] transition-colors"
  >
    <div className="w-full p-4 text-white text-left text-xs font-semibold">
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