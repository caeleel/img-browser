'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { listContents, ROOT_PATH } from '@/lib/s3';
import type { BucketItem, BucketItemWithBlob } from '@/lib/types';
import Header from './Header';
import DragTarget from './DragTarget';
import { IMAGE_EXTENSIONS, processDataTransfer, VIDEO_EXTENSIONS } from '@/lib/upload';
import { useAtom } from 'jotai';
import { allContentsAtom } from '@/lib/atoms';
import Browser from './Browser';
import SelectedItemsUI from './SelectedItemsUI';

let directoryPath = `${ROOT_PATH}/`;
let currentPage = 1;

export default function BucketBrowser({ onLogout }: { onLogout: () => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentPath, setCurrentPath] = useState(searchParams.get('path') || directoryPath);
  const [allContents, setAllContents] = useAtom<BucketItemWithBlob[]>(allContentsAtom);
  const [loading, setLoading] = useState(true);
  const [isDragging, setIsDragging] = useState(false);

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
    } catch (error) {
      console.error('Error fetching contents:', error);
      alert('Error fetching bucket contents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    directoryPath = currentPath
    fetchContents()

    return () => cleanupBlobUrls(allContents)
  }, [currentPath]);

  useEffect(() => {
    if (!searchParams.get('page') && directoryPath !== '') {
      updatePath(directoryPath, currentPage);
    }
  }, [])

  useEffect(() => {
    // Initialize with URL params
    const urlPath = searchParams.get('path');

    if (urlPath && urlPath !== currentPath) {
      setCurrentPath(urlPath);
    }
  }, [searchParams]);

  const breadcrumbs = [
    ...currentPath.split('/').filter(Boolean).map((part, index, array) => ({
      name: part,
      path: array.slice(0, index + 1).join('/') + '/'
    }))
  ];

  const updatePath = (newPath: string, newPage?: number) => {
    setCurrentPath(newPath);

    const params = new URLSearchParams(window.location.search);

    if (newPath !== undefined) {
      if (newPath) {
        params.set('path', newPath);
      } else {
        params.delete('path');
      }
    }

    if (newPage !== undefined && newPage > 1) {
      params.set('page', newPage.toString());
    } else if (newPage === undefined) {
      params.delete('page');
      currentPage = 1
    }

    router.push(`/?${params.toString()}`, {
      scroll: false
    });
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    if (!isDragging) return;

    e.preventDefault();
    setIsDragging(false);

    processDataTransfer(
      e.dataTransfer,
      currentPath
    );
  }, [currentPath, isDragging]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    // Only allow drops in photos directory
    if (!currentPath.startsWith('photos/') && currentPath !== 'photos') {
      return;
    }

    e.preventDefault();
    setIsDragging(true);
  }, [currentPath]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only set dragging false if we're leaving the container
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;

    if (
      x <= rect.left ||
      x >= rect.right ||
      y <= rect.top ||
      y >= rect.bottom
    ) {
      setIsDragging(false);
    }
  }, []);

  return (
    <div>
      <SelectedItemsUI deleteCallback={(deletedItems) => {
        const pathSet = new Set(deletedItems.map(item => item.path));
        setAllContents(allContents.filter(item => !pathSet.has(item.path)))
      }} />
      <Header breadcrumbs={breadcrumbs} onLogout={onLogout} updatePath={updatePath} />

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {isDragging && <DragTarget />}

        <Browser
          allContents={allContents}
          loading={loading}
          updatePath={updatePath}
          onDelete={(path) => {
            setAllContents(allContents.filter(item => item.path !== path))
          }}
          onPageChange={(page) => {
            currentPage = page
          }}
        />
      </div>
    </div>
  );
} 