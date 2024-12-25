export interface ImageMetadata {
  id: string;
  path: string;
  name: string;
  taken_at: string | null;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  state: string | null;
  country: string | null;
  camera_make: string | null;
  camera_model: string | null;
  lens_model: string | null;
  aperture: number | null;
  iso: number | null;
  shutter_speed: number | null;
  focal_length: number | null;
  orientation: number;
  notes: string | null;
}

export interface BucketItem {
  type: 'directory' | 'image' | 'video' | 'other';
  name: string;
  path: string;
  signedUrl?: string;
}

export interface BucketItemWithBlob extends BucketItem {
  blobUrl?: string;
  index?: number;
  thumbnailBlobUrl?: string;
  metadata?: ImageMetadata;
}

export interface S3Response {
  CommonPrefixes: { Prefix?: string }[];
  Contents: { Key?: string }[];
  NextContinuationToken?: string;
  IsTruncated: boolean;
}

export interface S3Credentials {
  accessKeyId: string;
  secretAccessKey: string;
}

export interface Vector2 {
  x: number;
  y: number;
}