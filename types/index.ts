export interface BucketItem {
  type: 'directory' | 'image' | 'video' | 'other';
  name: string;
  path: string;
  url?: string;
  key?: string;
}

export interface BucketItemWithBlob extends BucketItem {
  blobUrl?: string;
  index?: number;
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