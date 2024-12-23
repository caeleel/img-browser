import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import { ImageMetadata, S3Credentials } from '@/lib/types';
import { credentialsValid } from '@/lib/db';

export async function GET(request: Request) {
  // get credentials from request headers X-DO-ACCESS-KEY-ID and X-DO-SECRET-ACCESS-KEY
  const accessKeyId = request.headers.get('X-DO-ACCESS-KEY-ID');
  const secretAccessKey = request.headers.get('X-DO-SECRET-ACCESS-KEY');

  if (!accessKeyId || !secretAccessKey) {
    return NextResponse.json({ error: 'Missing credentials' }, { status: 401 });
  }

  if (!credentialsValid({ accessKeyId, secretAccessKey })) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  try {
    const { rows } = await sql`
      SELECT path, taken_at FROM image_metadata
    `;
    return NextResponse.json({ rows });
  } catch (error) {
    return NextResponse.json({ error: `Failed to fetch metadata: ${error}` }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { metadata, credentials }: { metadata: ImageMetadata[], credentials: S3Credentials } = await request.json();

    if (!metadata.length) {
      return NextResponse.json({ count: 0 });
    }

    if (!credentialsValid(credentials)) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    console.log(JSON.stringify(metadata));

    const { rowCount } = await sql.query(`
      INSERT INTO image_metadata (
        path, name, taken_at, latitude, longitude, city, state, country,
        camera_make, camera_model, lens_model, aperture, iso, 
        shutter_speed, focal_length, orientation
      ) 
      SELECT path, name, taken_at, latitude, longitude, city, state, country,
        camera_make, camera_model, lens_model, aperture, iso, 
        shutter_speed, focal_length, orientation FROM json_populate_recordset(null::image_metadata, $1)
      ON CONFLICT (path) DO NOTHING
    `,
      [JSON.stringify(metadata)]
    );

    return NextResponse.json({ count: rowCount });
  } catch (error) {
    console.error('Failed to insert metadata:', error);
    return NextResponse.json({ error: 'Failed to insert metadata' }, { status: 500 });
  }
} 