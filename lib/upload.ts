import { getCredentials, uploadFile } from "./s3";
import exifr from "exifr";
import { getImageEmbedding } from "./embeddings";

let heic2any: (options: {
  blob: Blob;
  multiple?: true;
  toType?: string;
  quality?: number;
  gifInterval?: number;
}) => Promise<Blob | Blob[]>;

if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  heic2any = require('heic2any');
}

export type UploadStatus = {
  total: number;
  processed: number;
  currentBatch: string[];
  error: string | null;
  isProcessing: boolean;
};

const BATCH_SIZE = 20;
const BASE_PATH = 'photos';

async function createThumbnail(file: File): Promise<Blob> {
  const MAX_SIZE = 800;

  // Create image element
  const img = new Image();
  const objectUrl = URL.createObjectURL(file);

  try {
    // Load image
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = (e) => {
        console.log('error loading image', e);
        reject(e);
      }
      img.src = objectUrl;
    });

    // Calculate new dimensions
    let width = img.width;
    let height = img.height;

    if (width > height) {
      if (width > MAX_SIZE) {
        height = Math.round(height * MAX_SIZE / width);
        width = MAX_SIZE;
      }
    } else {
      if (height > MAX_SIZE) {
        width = Math.round(width * MAX_SIZE / height);
        height = MAX_SIZE;
      }
    }

    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    // Draw resized image
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');

    ctx.drawImage(img, 0, 0, width, height);

    // Convert to blob
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create blob'));
        },
        'image/jpeg',
        0.8
      );
    });

    return blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function convertHeicToJpeg(file: File): Promise<File> {
  if (!file.name.toLowerCase().endsWith('.heic') && !file.name.toLowerCase().endsWith('.heif')) {
    return file;
  }

  try {
    const blob = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.9
    });

    // Convert blob to file to maintain filename
    return new File(
      [blob as Blob],
      file.name.replace(/\.(heic|HEIC|heif|HEIF)$/, '.jpg'),
      { type: 'image/jpeg' }
    );
  } catch (error) {
    console.error('HEIC conversion failed:', error);
    throw new Error(`Failed to convert HEIC file ${file.name}`);
  }
}

async function processFiles(
  fileMap: { [path: string]: File },
  setStatus: (status: UploadStatus) => void,
  abortController: { current: AbortController | null }
) {
  const files: { [path: string]: File } = {};
  for (const path in fileMap) {
    const file = fileMap[path];
    if (file.type.startsWith('image/') || file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')) {
      files[path] = file;
    }
  }

  const imagePaths = Object.keys(files);
  const status: UploadStatus = {
    total: imagePaths.length,
    processed: 0,
    currentBatch: [],
    error: null,
    isProcessing: true
  }

  setStatus({ ...status });
  const credentials = getCredentials();
  abortController.current = new AbortController();

  try {
    for (let i = 0; i < imagePaths.length; i += BATCH_SIZE) {
      if (abortController.current?.signal.aborted) {
        break;
      }

      const batch = imagePaths.slice(i, i + BATCH_SIZE);

      // Check which files in this batch already exist
      const batchPaths = batch.map(path => path.replace(/\.(heic|heif|HEIC|HEIF)$/, '.jpg'));

      const response = await fetch('/api/batch_meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paths: batchPaths,
          credentials
        })
      });
      const existingMetadata = await response.json();
      const existingPathsSet = new Set(Object.keys(existingMetadata));

      // Filter out already processed images from this batch
      const newBatchPaths = batch.filter((_, index) => !existingPathsSet.has(batchPaths[index]));

      status.processed = i + batch.length;
      status.currentBatch = newBatchPaths;
      setStatus({ ...status });

      const batchMetadata = await Promise.all(
        newBatchPaths.map(async (path) => {
          try {
            const file = files[path];
            // Convert HEIC to JPEG if necessary
            const processedFile = await convertHeicToJpeg(file);

            // Read EXIF data
            const arrayBuffer = await processedFile.arrayBuffer();
            const originalBuffer = await file.arrayBuffer();
            const exif = await exifr.parse(originalBuffer);

            // Create thumbnail
            const thumbnail = await createThumbnail(processedFile);
            const basePath = path.split('/').slice(0, -1).join('/');
            const filePath = `${basePath}/${processedFile.name}`;
            const thumbnailPath = filePath.replace(`${BASE_PATH}/`, 'thumbnails/');

            // Upload original
            await uploadFile(
              filePath,
              new Blob([arrayBuffer], { type: processedFile.type })
            );

            // Upload thumbnail
            await uploadFile(
              thumbnailPath,
              thumbnail
            );

            // Get the image embedding using the newly created thumbnail
            const embedding = await getImageEmbedding(thumbnail);

            return {
              path: filePath,
              name: processedFile.name,
              taken_at: exif?.DateTimeOriginal || null,
              latitude: exif?.latitude || null,
              longitude: exif?.longitude || null,
              city: null,
              state: null,
              country: null,
              embedding,
              camera_make: exif?.Make || null,
              camera_model: exif?.Model || null,
              lens_model: exif?.LensModel || null,
              aperture: exif?.FNumber || null,
              iso: exif?.ISO || null,
              shutter_speed: exif?.ExposureTime || null,
              focal_length: exif?.FocalLength || null,
              orientation: 1,
            };
          } catch (error) {
            console.error(`Error processing ${path}:`, error);
            return null;
          }
        })
      );

      // Update metadata in database
      const validMetadata = batchMetadata.filter(Boolean);
      if (validMetadata.length > 0) {
        const credentials = getCredentials();

        // First store metadata
        const metadataResponse = await fetch('/api/metadata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ metadata: validMetadata, credentials })
        });

        if (!metadataResponse.ok) {
          throw new Error('Failed to store metadata');
        }

        const { pathToIds } = await metadataResponse.json();

        // Then store embeddings
        const embeddings: Record<number, number[]> = {};
        for (const item of validMetadata) {
          if (item?.embedding) {
            embeddings[pathToIds[item.path]] = item.embedding;
          }
        }

        if (Object.keys(embeddings).length > 0) {
          const embeddingResponse = await fetch('/api/embeddings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeddings, credentials })
          });

          if (!embeddingResponse.ok) {
            throw new Error('Failed to store embeddings');
          }
        }
      }

      status.processed = i + batch.length;
      status.currentBatch = [];
      setStatus({ ...status });
    }
  } catch (error) {
    status.error = error instanceof Error ? error.message : 'An error occurred';
  } finally {
    status.isProcessing = false;
    setStatus({ ...status });
    abortController.current = null;
  }
};

export async function processDataTransfer(
  dataTransfer: DataTransfer,
  setStatus: (status: UploadStatus) => void,
  abortController: { current: AbortController | null },
  basePath = BASE_PATH
) {
  const items = Array.from(dataTransfer.items);

  const files: { [path: string]: File } = {};

  async function readEntries(entry: FileSystemDirectoryEntry, dirName: string): Promise<void> {
    const reader = entry.createReader();
    let entries: FileSystemEntry[] = [];

    // Keep reading until no more entries are returned
    do {
      const newEntries = await new Promise<FileSystemEntry[]>((resolve) => {
        reader.readEntries(resolve);
      });

      if (newEntries.length === 0) break;
      entries = entries.concat(newEntries);
    } while (true);

    await Promise.all(entries.map(async (entry) => {
      if (entry.isFile) {
        const file = await new Promise<File>((resolve) => {
          (entry as FileSystemFileEntry).file(resolve);
        });
        files[`${dirName}/${file.name}`] = file;
      } else if (entry.isDirectory) {
        await readEntries(entry as FileSystemDirectoryEntry, `${dirName}/${entry.name}`);
      }
    }));
  }

  for (const item of items) {
    const webkitEntry = item.webkitGetAsEntry();
    if (webkitEntry) {
      if (webkitEntry.isFile) {
        const file = item.getAsFile();
        if (file) {
          files[`${basePath}/${file.name}`] = file;
        }
      } else if (webkitEntry.isDirectory) {
        const dirEntry = item.webkitGetAsEntry();
        if (dirEntry) {
          await readEntries(dirEntry as FileSystemDirectoryEntry, `${basePath}/${dirEntry.name}`);
        }
      }
    }
  }

  await processFiles(files, setStatus, abortController);
}