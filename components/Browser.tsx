'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ImageViewer from './ImageViewer';
import PageSwitcher from './PageSwitcher';
import { getCredentials, signedUrl } from '@/lib/s3';
import type { BucketItemWithBlob } from '@/lib/types';
import { ItemTile } from './ItemTile';
import { fetchMetadata } from '@/lib/db';
import LoadingSpinner from './LoadingSpinner';
import { useSetAtom, useAtom } from 'jotai';
import { showFooterAtom, selectedItemsAtom } from '@/lib/atoms';
import FullscreenContainer from './FullscreenContainer';

interface SelectionBox {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

function getSelectionRect(selection: SelectionBox) {
  return {
    left: Math.min(selection.startX, selection.endX),
    top: Math.min(selection.startY, selection.endY),
    width: Math.abs(selection.endX - selection.startX),
    height: Math.abs(selection.endY - selection.startY),
  };
}

function isElementInSelection(element: Element, selection: SelectionBox) {
  const rect = element.getBoundingClientRect();
  const selectionRect = getSelectionRect(selection);

  return !(
    rect.right < selectionRect.left ||
    rect.left > selectionRect.left + selectionRect.width ||
    rect.bottom < selectionRect.top ||
    rect.top > selectionRect.top + selectionRect.height
  );
}

const PAGE_SIZE = 24;

export default function Browser({
  allContents,
  pageSize = PAGE_SIZE,
  updatePath = () => { },
  onDelete = () => { },
  loading = false,
  onPageChange = () => { }
}: {
  allContents: BucketItemWithBlob[],
  pageSize?: number,
  updatePath?: (path: string) => void,
  onDelete?: (path: string) => void,
  loading?: boolean,
  onPageChange?: (page: number) => void
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [contents, setContents] = useState<BucketItemWithBlob[]>([]);
  const [currentPage, setCurrentPage] = useState(parseInt(searchParams.get('page') || '1'));
  const credentials = getCredentials();

  const allImages = useMemo(() => allContents.filter(item => item.type === 'image' || item.type === 'video'), [allContents]);

  const [viewerImageIndex, setViewerImageIndex] = useState<number | null>(null);
  const selectedImage = viewerImageIndex !== null ? allImages[viewerImageIndex] : null;
  const totalPages = Math.ceil(allContents.length / pageSize);
  const [generation, setGeneration] = useState(0);
  const [delayedIsLoading, setDelayedIsLoading] = useState(true);

  const setShowFooter = useSetAtom(showFooterAtom);
  const [selectedItems, setSelectedItems] = useAtom(selectedItemsAtom);

  const [isDragging, setIsDragging] = useState(false);
  const [selection, setSelection] = useState<SelectionBox | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTimeout(() => setDelayedIsLoading(loading), 10)
  }, [loading])

  useEffect(() => {
    updateCurrentPageContents(currentPage, allContents);
  }, [allContents, currentPage]);

  const fetchAllImages = async (items: BucketItemWithBlob[]) => {
    const imageItems = items.filter(item => (item.type === 'image' || item.type === 'video') && !item.blobUrl);

    try {
      const paths = imageItems.filter(item => !item.metadata).map(item => item.path)
      const imageMeta = await fetchMetadata(paths, credentials);

      imageItems.map(async (item) => {
        try {
          let isThumbnail = false;
          let key = item.path
          if (key.startsWith('photos/')) {
            key = key.replace('photos/', 'thumbnails/')
            isThumbnail = true;
          }

          const blobUrl = await signedUrl(key)
          if (isThumbnail) {
            item.thumbnailBlobUrl = blobUrl
          } else {
            item.blobUrl = blobUrl
          }
          if (!item.metadata) {
            item.metadata = imageMeta[item.path]
          }
          setGeneration((generation) => generation + 1)

          return { item, blobUrl };
        } catch (error) {
          console.error(`Failed to fetch image ${item.name}:`, error);
          return { item, error };
        }
      })
    } catch (error) {
      console.error('Error fetching images:', error);
    }
  };

  const updateCurrentPageContents = async (page: number, items = allContents) => {
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const pageItems = items.slice(startIndex, endIndex);
    setContents(pageItems);
    fetchAllImages(pageItems);
  };

  const handlePageChange = async (page: number) => {
    if (page === currentPage) return;
    setCurrentPage(page);
    updateUrl(page);
  };

  const setNextImage = (index: number | null) => {
    setViewerImageIndex(index);
    setSelectedItems({});
    let pageNumber: number | undefined
    if (index !== null) {
      pageNumber = Math.floor(index / pageSize) + 1;
    }
    updateUrl(pageNumber, index !== null ? allImages[index].path : '');
  }

  useEffect(() => {
    const stringPage = searchParams.get('page')
    const urlPage = parseInt(searchParams.get('page') || '1');

    if (stringPage !== undefined && urlPage !== currentPage) {
      handlePageChange(urlPage);
    }
  }, [searchParams]);

  useEffect(() => {
    setShowFooter(totalPages > 1);
    return () => setShowFooter(false);
  }, [totalPages]);

  useEffect(() => {
    const keyboardHandler = (e: KeyboardEvent) => {
      if (e.key === 'a' && e.metaKey) {
        const newSelectedItems: { [key: string]: BucketItemWithBlob } = {};
        contents.forEach(item => {
          newSelectedItems[item.path] = item;
        })
        setSelectedItems(newSelectedItems)
        e.preventDefault()
      }
    }

    window.addEventListener('keydown', keyboardHandler);
    return () => window.removeEventListener('keydown', keyboardHandler);
  }, [contents])

  // Update URL when path or page changes
  const updateUrl = (newPage?: number, imagePath?: string) => {
    const params = new URLSearchParams(window.location.search);

    if (newPage !== undefined) {
      onPageChange(newPage);
      if (newPage > 1) {
        params.set('page', newPage.toString());
      } else {
        params.delete('page');
      }
    }

    if (imagePath !== undefined) {
      if (imagePath) {
        params.set('image', imagePath);
      } else {
        params.delete('image');
      }
    }

    router.push(`${window.location.pathname}?${params.toString()}`, {
      scroll: false
    });
  };

  // Effect to handle initial image viewing
  useEffect(() => {
    const urlImage = searchParams.get('image');
    if (urlImage && allImages.length > 0) {
      const index = allImages.findIndex(img => img.path === urlImage);
      if (index !== -1) {
        const page = Math.floor(index / pageSize) + 1;

        if (page !== currentPage) {
          handlePageChange(page);
        }

        setViewerImageIndex(index);
      }
    } else if (!urlImage) {
      setViewerImageIndex(null);
    }
  }, [searchParams, allContents]);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only start selection on left click and when not clicking an interactive element
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, a')) return;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const startX = e.clientX;
    const startY = e.clientY;

    setIsDragging(true);
    setSelection({
      startX,
      startY,
      endX: startX,
      endY: startY,
    });

    // If not holding shift, clear existing selection
    if (!e.shiftKey) {
      setSelectedItems({});
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !selection) return;

    setSelection({
      ...selection,
      endX: e.clientX,
      endY: e.clientY,
    });

    // Find all ItemTiles that intersect with selection
    const tiles = containerRef.current?.querySelectorAll('[data-item-tile]');
    if (!tiles) return;

    const newSelectedItems = e.shiftKey ? { ...selectedItems } : {};

    tiles.forEach((tile) => {
      const path = tile.getAttribute('data-path');
      const item = contents.find(item => item.path === path);
      if (!item) return;

      if (isElementInSelection(tile, selection)) {
        newSelectedItems[item.path] = item;
      } else if (!e.shiftKey) {
        // Only remove items if not holding shift
        delete newSelectedItems[item.path];
      }
    });

    setSelectedItems(newSelectedItems);
  }

  const handleMouseUp = () => {
    setIsDragging(false);
    setSelection(null);
  }

  return (
    <div
      ref={containerRef}
      className="w-full relative lg:min-h-[calc(100svh-48px)] min-h-[calc(100svh-84px)]"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <div className="hidden">{generation}</div>
      <div>
        {loading || delayedIsLoading ? (
          <FullscreenContainer>
            <LoadingSpinner size="large" />
          </FullscreenContainer>
        ) : contents.length === 0 ? (
          <FullscreenContainer>
            <div className="text-center text-black/50">
              This page is empty
            </div>
          </FullscreenContainer>
        ) : (
          <div className="pb-20 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-w-7xl p-8 mx-auto">
            {contents.map((item) => (
              <ItemTile
                key={item.path}
                item={item}
                handleDirectoryClick={updatePath}
                handleImageClick={(item) => setNextImage(allImages.findIndex(img => img.path === item.path))}
              />
            ))}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="fixed bottom-0 left-0 right-0 py-2 px-4 backdrop-blur-lg bg-white/50">
          <PageSwitcher
            currentPage={currentPage}
            totalPages={totalPages}
            handlePageChange={handlePageChange}
            visible
          />
        </div>
      )}

      {selectedImage && (
        <ImageViewer
          idx={viewerImageIndex!}
          allImages={allImages}
          credentials={credentials}
          onClose={(deleteImage) => {
            setNextImage(null)

            if (deleteImage) {
              onDelete(selectedImage.path)
            }
          }}
          onSelectImage={(image) => {
            const index = allImages.findIndex(img => img.path === image.path);
            setNextImage(index);
          }}
          onNext={async () => {
            if (viewerImageIndex === null) return;

            const nextIndex = viewerImageIndex + 1;
            if (nextIndex < allImages.length) {
              setNextImage(nextIndex);
            }
          }}
          onPrevious={() => {
            if (viewerImageIndex === null) return;

            const prevIndex = viewerImageIndex - 1;
            if (prevIndex >= 0) {
              setNextImage(prevIndex);
            }
          }}
        />
      )}

      {selection && (
        <div
          className="fixed pointer-events-none border border-sky-600 bg-sky-600 bg-opacity-10"
          style={{
            ...getSelectionRect(selection),
            position: 'fixed',
          }}
        />
      )}
    </div>
  );
} 