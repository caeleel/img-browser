import { getCredentials, uploadFile } from "./s3";
import exifr from "exifr";
import { getImageEmbedding } from "./embeddings";
import { uploadStatusAtom, abortControllerAtom, globalStore } from './atoms';

export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
export const VIDEO_EXTENSIONS = ['.mp4', '.ts', '.mov'];

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

function isVideo(file: File): boolean {
  return file.type.startsWith('video/') || file.name.toLowerCase().endsWith('.mov');
}

async function createThumbnail(file: File): Promise<Blob> {
  if (isVideo(file)) {
    return await extractVideoThumbnail(file);
  }

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

interface ProcessedImage {
  path: string;
  name: string;
  taken_at: string | number | null;
  latitude: string | number | null;
  longitude: string | number | null;
  city: string | null;
  state: string | null;
  country: string | null;
  embedding: number[];
  camera_make?: string | number | null;
  camera_model?: string | number | null;
  lens_model?: string | number | null;
  aperture?: string | number | null;
  iso?: string | number | null;
  shutter_speed?: string | number | null;
  focal_length?: string | number | null;
  orientation?: number;
}

async function processFiles(
  fileMap: { [path: string]: File },
  setStatus: (status: UploadStatus) => void,
  abortController: AbortController
) {
  const files: { [path: string]: File } = {};
  for (const path in fileMap) {
    const file = fileMap[path];
    if (file.type.startsWith('image/') || isVideo(file) ||
      file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')
    ) {
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

  try {
    for (let i = 0; i < imagePaths.length; i += BATCH_SIZE) {
      if (abortController.signal.aborted) {
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

      const imagePromises: Promise<ProcessedImage | null>[] = []

      for (const path of newBatchPaths) {
        const file = files[path];
        const fileIsVideo = isVideo(file);

        const imagePromiseFunc = async () => {
          try {
            // Convert HEIC to JPEG if necessary
            const processedFile = await convertHeicToJpeg(file);

            // Read EXIF data
            let exif: { [key: string]: string | number | null } | undefined;

            if (!fileIsVideo) {
              try {
                const originalBuffer = await file.arrayBuffer();
                exif = await exifr.parse(originalBuffer);
              } catch (error) {
                console.warn(`Error parsing EXIF data for ${path}:`, error);
              }
            }

            // Create thumbnail
            const basePath = path.split('/').slice(0, -1).join('/');
            const filePath = `${basePath}/${processedFile.name}`;

            const thumbnailPath = filePath.replace(`${BASE_PATH}/`, 'thumbnails/');
            const thumbnail = await createThumbnail(processedFile);

            // Upload thumbnail
            await uploadFile(
              thumbnailPath,
              thumbnail
            );
            // Get the image embedding using the newly created thumbnail
            const embedding = await getImageEmbedding(thumbnail);

            // Upload original
            await uploadFile(
              filePath,
              processedFile
            );

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
        }

        if (fileIsVideo) {
          imagePromises.push(Promise.resolve(await imagePromiseFunc()));
        } else {
          imagePromises.push(imagePromiseFunc());
        }
      }

      const batchMetadata = await Promise.all(imagePromises);

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
  }
};

export async function processDataTransfer(
  dataTransfer: DataTransfer,
  basePath = BASE_PATH
) {
  const store = globalStore;

  const abortController = new AbortController();
  store.set(abortControllerAtom, abortController);

  const setStatus = (status: UploadStatus) => {
    if (!abortController.signal.aborted) {
      store.set(uploadStatusAtom, status);
    }
  };

  const items = Array.from(dataTransfer.items);
  if (basePath.endsWith('/')) {
    basePath = basePath.slice(0, -1);
  }

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

async function extractVideoThumbnail(file: File, seekTo = 0.0): Promise<Blob> {
  return new Promise((resolve, reject) => {
    // load the file to a video player
    const videoPlayer = document.createElement('video');
    const srcTag = document.createElement('source');
    srcTag.setAttribute('src', URL.createObjectURL(file));
    srcTag.setAttribute('type', 'video/mp4');
    videoPlayer.appendChild(srcTag);
    videoPlayer.load();
    videoPlayer.addEventListener('error', (ex) => {
      reject(`error when loading video file: ${ex}`);
    });
    // load metadata of the video to get video duration and dimensions
    videoPlayer.addEventListener('loadedmetadata', () => {
      // seek to user defined timestamp (in seconds) if possible
      if (videoPlayer.duration < seekTo) {
        reject("video is too short.");
        return;
      }
      // delay seeking or else 'seeked' event won't fire on Safari
      setTimeout(() => {
        videoPlayer.currentTime = seekTo;
      }, 100);
      // extract video thumbnail once seeking is complete
      videoPlayer.addEventListener('seeked', () => {
        // define a canvas to have the same dimension as the video
        const canvas = document.createElement("canvas");
        canvas.width = videoPlayer.videoWidth;
        canvas.height = videoPlayer.videoHeight;
        // draw the video frame to canvas
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject("error when getting canvas context");
          return;
        }
        ctx.drawImage(videoPlayer, 0, 0, canvas.width, canvas.height);
        // return the canvas image as a blob
        ctx.canvas.toBlob(
          blob => {
            resolve(blob!);
          },
          "image/jpeg",
          0.75 /* quality */
        );

        videoPlayer.remove()
        canvas.remove()
      });
    });
  });
}