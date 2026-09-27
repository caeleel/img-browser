import { BucketItemWithBlob } from "@/lib/types";
import { getCssOrientation } from "@/lib/utils";
import LoadingSpinner from "./LoadingSpinner";
import { useAtom, useAtomValue } from "jotai";
import { currentFolderCoverAtom, selectedItemsAtom } from "@/lib/atoms";
import { usePathname } from "next/navigation";
import CoverIcon from "./icons/CoverIcon";
import { useEffect } from "react";
import CameraIcon from "./icons/CameraIcon";

function DirectoryTile({ item }: {
  item: BucketItemWithBlob,
}) {
  if (item.cover) {
    return (
      <>
        <img
          src={item.cover.thumbnailUrl}
          alt=""
          draggable={false}
          className={`absolute inset-0 w-full h-full object-cover ${getCssOrientation(item.cover.orientation || 1)}`}
        />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute left-0 bottom-0 p-4 text-left text-white text-sm font-medium select-none drop-shadow">
          📁 {item.name}
        </div>
      </>
    )
  }

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
  const currentFolderCover = useAtomValue(currentFolderCoverAtom)
  const pathname = usePathname()
  // Only badge in folder view; the atom still holds the last folder's cover on other pages.
  const isFolderCover = pathname === '/' && currentFolderCover?.path === item.path

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
      {isFolderCover && (
        <div className="absolute top-2 left-2 z-10 rounded bg-black/50 backdrop-blur-sm" title="Folder thumbnail">
          <CoverIcon set color="#fff" size={20} />
        </div>
      )}
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