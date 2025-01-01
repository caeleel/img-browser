import { BucketItemWithBlob } from "@/lib/types";
import { getCssOrientation } from "@/lib/utils";
import LoadingSpinner from "./LoadingSpinner";
import { useAtom } from "jotai";
import { selectedItemsAtom } from "@/lib/atoms";
import { useEffect } from "react";
import CameraIcon from "./icons/CameraIcon";

function DirectoryTile({ item }: {
  item: BucketItemWithBlob,
}) {
  return (
    <div className="p-4 text-left text-black/50 text-sm group-hover:text-black select-none">
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
    <>
      {item.type === 'video' && <div className="absolute top-2 right-2"><CameraIcon /></div>}
      <img
        src={blobUrl}
        alt={item.name}
        draggable={false}
        className={`w-full h-64 object-cover ${rotation}`}
      />
      {item.metadata?.similarity && (
        <div className="absolute top-1 right-1 hidden group-hover:flex">
          <div className="text-xs text-white bg-black/70 backdrop-blur-lg px-2 py-1 rounded">
            {(item.metadata.similarity * 100).toFixed(0)}% match
          </div>
        </div>
      )}
    </>
  );
}

export function ItemTile({ item, handleDirectoryClick, handleImageClick }: {
  item: BucketItemWithBlob,
  handleDirectoryClick: (path: string) => void,
  handleImageClick: (item: BucketItemWithBlob) => void,
}) {
  const [selectedItems, setSelectedItems] = useAtom(selectedItemsAtom)
  const isSelected = selectedItems[item.path] !== undefined

  useEffect(() => {
    return () => {
      setSelectedItems(prev => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
          handleImageClick(item)
          break
      }

      return
    }

    if (e.shiftKey) {
      if (isSelected) {
        setSelectedItems(prev => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
        return <ImageTile
          item={item}
        />
      default:
        return null
    }
  }

  return <button
    data-item-tile
    data-path={item.path}
    onClick={handleClick}
    className={`w-full h-64 relative cursor-default flex items-center bg-black/5 hover:border-black border-4 justify-center ${isSelected ? 'border-black' : 'border-white'} overflow-hidden group select-none`}
  >
    {innerTile()}
  </button>
}