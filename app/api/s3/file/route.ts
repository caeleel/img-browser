import { NextRequest, NextResponse } from 'next/server';
import {
  S3Client,
  GetObjectCommand
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const spaceName = params.get('spaceName')!;
    const accessKeyId = params.get('accessKeyId')!;
    const secretAccessKey = params.get('secretAccessKey')!;
    const key = params.get('key')!;

    // If not in cache, fetch from S3
    const s3Client = new S3Client({
      endpoint: 'https://sfo3.digitaloceanspaces.com',
      region: 'sfo3',
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey
      }
    });

    const command = new GetObjectCommand({
      Bucket: spaceName,
      Key: key,
    });

    const response = await s3Client.send(command);

    if (!response.Body) {
      throw new Error('No file content received');
    }

    // Convert the readable stream to a buffer
    const chunks = [];
    for await (const chunk of response.Body as Readable) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // Return the file with appropriate headers
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': response.ContentType || 'application/octet-stream',
        'Content-Length': response.ContentLength?.toString() || buffer.length.toString(),
        'Cache-Control': 'public, max-age=31536000',
      },
    });
  } catch (error) {
    console.error('S3 file proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch file from S3' },
      { status: 500 }
    );
  }
} 