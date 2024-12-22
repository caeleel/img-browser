import { NextRequest, NextResponse } from 'next/server';
import {
  S3Client,
  ListObjectsV2Command,
  ListObjectsV2CommandOutput
} from '@aws-sdk/client-s3';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { spaceName, accessKeyId, secretAccessKey, path, continuationToken } = body;

    const firstDir = path.split('/')[0];
    if (firstDir !== 'thumbnails' && firstDir !== 'videos' && firstDir !== 'photos') {
      return NextResponse.json({
        CommonPrefixes: [],
        Contents: [],
        NextContinuationToken: null,
        IsTruncated: false
      });
    }

    const s3Client = new S3Client({
      endpoint: 'https://sfo3.digitaloceanspaces.com',
      region: 'sfo3',
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey
      }
    });

    const command = new ListObjectsV2Command({
      Bucket: spaceName,
      Prefix: path,
      Delimiter: '/',
      ContinuationToken: continuationToken
    });

    const response: ListObjectsV2CommandOutput = await s3Client.send(command);

    return NextResponse.json({
      CommonPrefixes: response.CommonPrefixes || [],
      Contents: response.Contents || [],
      NextContinuationToken: response.NextContinuationToken,
      IsTruncated: response.IsTruncated
    });
  } catch (error) {
    console.error('S3 proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch from S3' },
      { status: 500 }
    );
  }
} 