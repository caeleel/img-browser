'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import VideoPlayer from './VideoPlayer';
import ImageViewer from './ImageViewer';
import { fetchFile, listContents, signedUrl } from '@/lib/s3';
import type { BucketItem, BucketItemWithBlob, S3Credentials } from '@/lib/types';
import { ItemTile } from './ItemTile';
import { fetchMetadata } from '@/lib/db';

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const VIDEO_EXTENSIONS = ['.mp4', '.ts', '.mov'];

const PAGE_SIZE = 24;
const ROOT_CONTENTS: BucketItemWithBlob[] = [
  { type: 'directory', name: 'photos', path: 'photos/' },
  { type: 'directory', name: 'videos', path: 'videos/' },
  { type: 'directory', name: 'thumbnails', path: 'thumbnails/' },
];

export default function BucketBrowser({ onLogout, credentials }: { onLogout: () => void; credentials: S3Credentials }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentPath, setCurrentPath] = useState(searchParams.get('path') || '');
  const [allContents, setAllContents] = useState<BucketItemWithBlob[]>([]);
  const [contents, setContents] = useState<BucketItemWithBlob[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<BucketItem | null>(null);
  const [selectedImage, setSelectedImage] = useState<BucketItemWithBlob | null>(null);
  const [loadingVideo, setLoadingVideo] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(parseInt(searchParams.get('page') || '1'));

  const allImages = useMemo(() => allContents.filter(item => item.type === 'image'), [allContents]);

  const viewerImageIndex = useMemo(() => allImages.findIndex(img => img.path === selectedImage?.path), [allImages, selectedImage]);
  const totalPages = Math.ceil(allContents.length / PAGE_SIZE);
  const [generation, setGeneration] = useState(0);

  const fetchAllImages = async (items: BucketItemWithBlob[]) => {
    const imageItems = items.filter(item => item.type === 'image' && !item.blobUrl);

    try {
      const paths = imageItems.filter(item => !item.metadata).map(item => item.path)
      const imageMeta = await fetchMetadata(paths, credentials);

      await Promise.allSettled(
        imageItems.map(async (item, i) => {
          try {
            let isThumbnail = false;
            let key = item.path
            if (key.startsWith('photos/sony_camera/')) {
              key = key.replace('photos/', 'thumbnails/')
              isThumbnail = true;
            }

            const blobUrl = await fetchFile(key)
            if (isThumbnail) {
              item.thumbnailBlobUrl = blobUrl
            } else {
              item.blobUrl = blobUrl
            }
            if (!item.metadata) {
              item.metadata = imageMeta[item.path]
            }
            setGeneration(generation + 1 + i)

            return { item, blobUrl };
          } catch (error) {
            console.error(`Failed to fetch image ${item.name}:`, error);
            return { item, error };
          }
        })
      );
    } catch (error) {
      console.error('Error fetching images:', error);
    }
  };

  const cleanupBlobUrls = (items: BucketItemWithBlob[]) => {
    items.forEach(item => {
      if (item.blobUrl) {
        URL.revokeObjectURL(item.blobUrl);
        item.blobUrl = undefined;
      }
    });
  };

  const fetchContents = async () => {
    try {
      setLoading(true);
      let allItems: BucketItemWithBlob[] = [];
      let continuationToken: string | undefined;

      do {
        const data = await listContents(currentPath, continuationToken);

        const newItems: BucketItemWithBlob[] = [
          ...(data.CommonPrefixes || []).map((prefix) => ({
            type: 'directory' as const,
            name: prefix.Prefix!.split('/').slice(-2)[0],
            path: prefix.Prefix!
          })),
          ...(data.Contents || [])
            .filter((item) => !item.Key!.endsWith('/'))
            .map((item) => {
              const ext = item.Key!.toLowerCase().slice(item.Key!.lastIndexOf('.'));
              const type: BucketItem['type'] = IMAGE_EXTENSIONS.includes(ext) ? 'image' :
                VIDEO_EXTENSIONS.includes(ext) ? 'video' : 'other';
              return {
                type,
                name: item.Key!.split('/').pop()!,
                path: item.Key!,
                url: `/api/s3/file`,
                key: item.Key
              };
            })
            .filter((item) => item.type !== 'other')
        ];

        allItems = [...allItems, ...newItems];
        continuationToken = data.NextContinuationToken;
      } while (continuationToken);

      setAllContents(allItems);
      updateCurrentPageContents(currentPage, allItems);
    } catch (error) {
      console.error('Error fetching contents:', error);
      alert('Error fetching bucket contents');
    } finally {
      setLoading(false);
    }
  };

  const updateCurrentPageContents = async (page: number, items = allContents) => {
    const startIndex = (page - 1) * PAGE_SIZE;
    const endIndex = startIndex + PAGE_SIZE;
    const pageItems = items.slice(startIndex, endIndex);
    setContents(pageItems);
    await fetchAllImages(pageItems);
  };

  const handlePageChange = async (page: number) => {
    if (page === currentPage) return;
    setCurrentPage(page);
    updateUrl(undefined, page);
    await updateCurrentPageContents(page);
  };

  const setNextImage = (item: BucketItemWithBlob | null) => {
    setSelectedImage(item);
    updateUrl(undefined, undefined, item?.path || '');
  }

  useEffect(() => {
    if (currentPath === '') {
      setAllContents(ROOT_CONTENTS);
      updateCurrentPageContents(1, ROOT_CONTENTS);
      setLoading(false);
    } else {
      fetchContents();
    }
    return () => cleanupBlobUrls(allContents);
  }, [currentPath]);

  useEffect(() => {
    // Initialize with URL params
    const urlPath = searchParams.get('path');
    const urlPage = parseInt(searchParams.get('page') || '1');

    if (urlPath !== currentPath) {
      setCurrentPath(urlPath || '');
    }
    if (urlPage !== currentPage) {
      setCurrentPage(urlPage);
    }
  }, [searchParams]);

  const breadcrumbs = [
    { name: 'root', path: '' },
    ...currentPath.split('/').filter(Boolean).map((part, index, array) => ({
      name: part,
      path: array.slice(0, index + 1).join('/') + '/'
    }))
  ];

  // Update URL when path or page changes
  const updateUrl = (newPath?: string, newPage?: number, imagePath?: string) => {
    const params = new URLSearchParams(window.location.search);

    if (newPath !== undefined) {
      if (newPath) {
        params.set('path', newPath);
      } else {
        params.delete('path');
      }
    }

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

    router.push(`/?${params.toString()}`);
  };

  const updatePath = (newPath: string) => {
    setCurrentPage(1); // Reset page when changing directory
    setCurrentPath(newPath);
    updateUrl(newPath, 1);
  };

  // Effect to handle initial image viewing
  useEffect(() => {
    const urlImage = searchParams.get('image');
    if (urlImage && allImages.length > 0) {
      const imageToView = allImages.find(img => img.path === urlImage);
      if (imageToView) {
        const index = allImages.findIndex(img => img.path === urlImage);
        const page = Math.floor(index / PAGE_SIZE) + 1;

        if (page !== currentPage) {
          handlePageChange(page);
        }

        setSelectedImage(imageToView);
      }
    } else if (!urlImage) {
      setSelectedImage(null);
    }
  }, [searchParams, allContents]);

  return (
    <div className="w-screen h-screen flex flex-col">
      <div className="flex justify-between items-center px-4">
        <div className="flex items-center space-x-2 flex-wrap text-gray-300 text-sm">
          {breadcrumbs.map((crumb, index) => (
            <div key={crumb.path} className="flex items-center">
              {index > 0 && <span className="text-gray-300 mx-2 text-sm">/</span>}
              <button
                onClick={() => updatePath(crumb.path)}
                className="hover:text-gray-500 hover:underline max-w-[250px] text-left text-ellipsis overflow-hidden text-nowrap"
              >
                {crumb.name || '/'}
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={onLogout}
          className="py-2 rounded hover:underline hover:text-gray-500 ml-4 shrink-0 text-gray-300 text-sm"
        >
          Logout
        </button>
      </div>

      {loading ? (
        <div className="text-center flex justify-center items-center flex-grow">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-500 mx-auto"></div>
        </div>
      ) : contents.length === 0 ? (
        <div className="text-center py-8 text-gray-600 flex-grow">
          This directory is empty
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 flex-grow px-4 pb-4 overflow-y-scroll">
          {contents.map((item) => (
            <ItemTile
              key={item.path}
              item={item}
              handleDirectoryClick={updatePath}
              handleVideoClick={async () => {
                try {
                  setLoadingVideo(item.path);
                  const url = await signedUrl(item);
                  setSelectedVideo({ ...item, signedUrl: url });
                } catch (error) {
                  console.error('Failed to load video', error);
                } finally {
                  setLoadingVideo('');
                }
              }}
              handleImageClick={setNextImage}
              loadingVideo={loadingVideo}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="bg-neutral-900 flex justify-center items-center flex-wrap py-2 px-4 shadow">
          <div className="flex flex-wrap gap-2 justify-center max-w-full">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => handlePageChange(page)}
                className={`text-xs ${currentPage === page
                  ? 'font-bold text-white'
                  : 'text-gray-400 hover:underline hover:text-white'
                  }`}
              >
                {page}
              </button>
            ))}
          </div>

          <div className="rotate-90 hidden">a</div>
          <div className="rotate-180 hidden">b</div>
          <div className="-rotate-90 hidden">c</div>
        </div>
      )}

      {selectedImage && (
        <ImageViewer
          idx={viewerImageIndex}
          allImages={allImages}
          credentials={credentials}
          total={allImages.length}
          onClose={() => setNextImage(null)}
          onSelectImage={(image) => {
            const index = allImages.findIndex(img => img.path === image.path);
            const nextPage = Math.floor(index / PAGE_SIZE) + 1;

            if (nextPage !== currentPage) {
              handlePageChange(nextPage);
            }

            setNextImage(image);
          }}
          onNext={async () => {
            const nextIndex = viewerImageIndex + 1;
            if (nextIndex < allImages.length) {
              const nextImage = allImages[nextIndex];
              const nextPage = Math.floor(nextIndex / PAGE_SIZE) + 1;

              if (nextPage !== currentPage) {
                await handlePageChange(nextPage);
              }

              setNextImage(nextImage);
            }
          }}
          onPrevious={() => {
            const prevIndex = viewerImageIndex - 1;
            if (prevIndex >= 0) {
              const prevImage = allImages[prevIndex];
              const prevPage = Math.floor(prevIndex / PAGE_SIZE) + 1;

              if (prevPage !== currentPage) {
                handlePageChange(prevPage);
              }

              setNextImage(prevImage);
            }
          }}
          hasNext={viewerImageIndex < allImages.length - 1}
          hasPrevious={viewerImageIndex > 0}
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