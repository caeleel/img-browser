import { BucketItemWithBlob } from "@/lib/types";

function DirectoryTile({ item, handleDirectoryClick }: {
  item: BucketItemWithBlob,
  handleDirectoryClick: (path: string) => void
}) {
  return <button
    onClick={() => handleDirectoryClick(item.path)}
    className="w-full h-48 flex items-center justify-center hover:bg-gray-500 transition-colors"
  >
    <div className="text-center w-full px-4">
      <div className="text-4xl mb-2">📁</div>
      <div className="text-sm text-gray-300 break-words">
        {item.name}
      </div>
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
    return <div className="w-full h-48 bg-gray-600 flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-500"></div>
    </div>
  }

  let rotation = ''
  if (item.thumbnailBlobUrl && metadata?.orientation) {
    rotation = metadata.orientation === 6 ? 'rotate-90' : metadata.orientation === 8 ? '-rotate-90' : ''
  }

  return <div className="relative group">
    <div className="w-full h-48 overflow-hidden">
      <img
        src={blobUrl}
        alt={item.name}
        className={`w-full h-48 object-cover cursor-pointer ${rotation}`}
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
    return <div className="w-full h-48 bg-gray-600 flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-500"></div>
    </div>
  }

  return <button
    onClick={() => handleVideoClick(item)}
    className="w-full h-48 bg-gray-600 flex items-center justify-center hover:bg-gray-500 transition-colors"
  >
    <div className="flex flex-col items-center">
      <div className="text-4xl mb-2">🎥</div>
      <div className="text-sm text-gray-300 px-2 truncate">
        {item.name}
      </div>
    </div>
  </button>
}

export function ItemTile({ item, handleDirectoryClick, handleVideoClick, handleImageClick, loadingVideo }: {
  item: BucketItemWithBlob,
  handleDirectoryClick: (path: string) => void,
  handleVideoClick: (item: BucketItemWithBlob) => void,
  handleImageClick: (item: BucketItemWithBlob) => void,
  loadingVideo: string
}) {
  const innerTile = () => {
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

  return <div className="border border-neutral-800 h-48">
    {innerTile()}
  </div>
}