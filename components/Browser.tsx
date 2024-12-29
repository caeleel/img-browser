'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import VideoPlayer from './VideoPlayer';
import ImageViewer from './ImageViewer';
import PageSwitcher from './PageSwitcher';
import { getCredentials, signedUrl } from '@/lib/s3';
import type { BucketItem, BucketItemWithBlob } from '@/lib/types';
import { ItemTile } from './ItemTile';
import { fetchMetadata } from '@/lib/db';
import LoadingSpinner from './LoadingSpinner';
import { useSetAtom } from 'jotai';
import { showFooterAtom, selectedItemsAtom } from '@/lib/atoms';
import FullscreenContainer from './FullscreenContainer';

const PAGE_SIZE = 24;

export default function Browser({ allContents, pageSize = PAGE_SIZE, updatePath = () => { }, loading = false }: {
  allContents: BucketItemWithBlob[],
  pageSize?: number, updatePath?:
  (path: string) => void,
  loading?: boolean
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [contents, setContents] = useState<BucketItemWithBlob[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<BucketItem | null>(null);
  const [loadingVideo, setLoadingVideo] = useState('');
  const [currentPage, setCurrentPage] = useState(parseInt(searchParams.get('page') || '1'));
  const credentials = getCredentials();

  const allImages = useMemo(() => allContents.filter(item => item.type === 'image'), [allContents]);

  const [viewerImageIndex, setViewerImageIndex] = useState<number | null>(null);
  const selectedImage = viewerImageIndex !== null ? allImages[viewerImageIndex] : null;
  const totalPages = Math.ceil(allContents.length / pageSize);
  const [generation, setGeneration] = useState(0);

  const setShowFooter = useSetAtom(showFooterAtom);
  const setSelectedItems = useSetAtom(selectedItemsAtom);

  useEffect(() => {
    updateCurrentPageContents(currentPage, allContents);
  }, [allContents, currentPage]);

  const fetchAllImages = async (items: BucketItemWithBlob[]) => {
    const imageItems = items.filter(item => item.type === 'image' && !item.blobUrl);

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
    const urlPage = parseInt(searchParams.get('page') || '1');

    if (urlPage !== currentPage) {
      handlePageChange(urlPage);
    }
  }, [searchParams]);

  useEffect(() => {
    setShowFooter(totalPages > 1);
    return () => setShowFooter(false);
  }, [totalPages]);

  // Update URL when path or page changes
  const updateUrl = (newPage?: number, imagePath?: string) => {
    const params = new URLSearchParams(window.location.search);

    if (newPage !== undefined) {
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

  return (
    <div>
      <div className="hidden">{generation}</div>
      <div
        onClick={(e) => {
          if (e.shiftKey) {
            e.preventDefault()
            return
          }
          setSelectedItems({})
        }}
      >
        {loading ? (
          <FullscreenContainer>
            <LoadingSpinner size="large" />
          </FullscreenContainer>
        ) : contents.length === 0 ? (
          <div className="flex flex-col flex-grow justify-center items-center">
            <div className="text-center text-gray-600">
              This page is empty
            </div>
          </div>
        ) : (
          <div className="pb-20 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 max-w-7xl p-8 mx-auto">
            {contents.map((item) => (
              <ItemTile
                key={item.path}
                item={item}
                handleDirectoryClick={updatePath}
                handleVideoClick={async () => {
                  try {
                    setLoadingVideo(item.path);
                    const url = await signedUrl(item.path);
                    setSelectedVideo({ ...item, signedUrl: url });
                  } catch (error) {
                    console.error('Failed to load video', error);
                  } finally {
                    setLoadingVideo('');
                  }
                }}
                handleImageClick={(item) => setNextImage(allImages.findIndex(img => img.path === item.path))}
                loadingVideo={loadingVideo}
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
          onClose={() => setNextImage(null)}
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

      {selectedVideo && (
        <VideoPlayer
          video={selectedVideo as { name: string; signedUrl: string }}
          onClose={() => {
            URL.revokeObjectURL(selectedVideo.signedUrl!);
            setSelectedVideo(null);
          }}
        />
      )}
    </div>
  );
} 