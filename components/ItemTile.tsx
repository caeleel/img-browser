import { BucketItemWithBlob } from "@/lib/types";
import { getCssOrientation } from "@/lib/utils";
import LoadingSpinner from "./LoadingSpinner";
import { useAtom } from "jotai";
import { selectedItemsAtom } from "@/lib/atoms";
import { useEffect } from "react";

function DirectoryTile({ item }: {
  item: BucketItemWithBlob,
}) {
  return (
    <div className="p-4 text-left text-black/50 text-sm">
      📁 {item.name}
    </div>
  )
}

function ImageTile({ item }: {
  item: BucketItemWithBlob,
}) {
  const blobUrl = item.thumbnailBlobUrl || item.blobUrl
  const { metadata } = item

  if (!blobUrl) {
    return <LoadingSpinner />
  }

  let rotation = ''
  if (item.thumbnailBlobUrl && metadata?.orientation) {
    rotation = getCssOrientation(metadata.orientation)
  }

  return (
    <img
      src={blobUrl}
      alt={item.name}
      className={`w-full h-48 object-cover ${rotation}`}
    />
  );
}

function VideoTile({ item, loadingVideo }: {
  item: BucketItemWithBlob,
  loadingVideo: string,
}) {
  if (loadingVideo === item.path) {
    return <LoadingSpinner />
  }

  return (
    <div className="p-4 text-left text-sm text-black/50">
      🎥 {item.name}
    </div>
  )
}

export function ItemTile({ item, handleDirectoryClick, handleVideoClick, handleImageClick, loadingVideo }: {
  item: BucketItemWithBlob,
  handleDirectoryClick: (path: string) => void,
  handleVideoClick: (item: BucketItemWithBlob) => void,
  handleImageClick: (item: BucketItemWithBlob) => void,
  loadingVideo: string
}) {
  const [selectedItems, setSelectedItems] = useAtom(selectedItemsAtom)
  const isSelected = selectedItems[item.path] !== undefined

  useEffect(() => {
    return () => {
      setSelectedItems(prev => {
        const { [item.path]: _, ...rest } = prev
        return rest
      })
    }
  }, [item])

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    if (e.detail === 2) {
      switch (item.type) {
        case 'directory':
          handleDirectoryClick(item.path)
          break
        case 'image':
          handleImageClick(item)
          break
        case 'video':
          handleVideoClick(item)
          break
      }

      return
    }

    if (e.shiftKey) {
      if (isSelected) {
        setSelectedItems(prev => {
          const { [item.path]: _, ...rest } = prev
          return rest
        })
      } else {
        setSelectedItems(prev => ({ ...prev, [item.path]: item }))
      }
    } else {
      setSelectedItems({ [item.path]: item })
    }
  }

  const innerTile = () => {
    switch (item.type) {
      case 'directory':
        return <DirectoryTile
          item={item}
        />
      case 'image':
        return <ImageTile
          item={item}
        />
      case 'video':
        return <VideoTile
          item={item}
          loadingVideo={loadingVideo}
        />
      default:
        return null
    }
  }

  return <button
    onClick={handleClick}
    className={`w-full h-48 cursor-default flex items-center bg-black/5 hover:border-black border-4 justify-center ${isSelected ? 'border-black' : 'border-white'} overflow-hidden`}
  >
    {innerTile()}
  </button>
}