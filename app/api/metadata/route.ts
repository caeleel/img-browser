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

    const { rowCount, rows } = await sql.query(`
      INSERT INTO image_metadata (
        path, name, taken_at, latitude, longitude, city, state, country,
        camera_make, camera_model, lens_model, aperture, iso, 
        shutter_speed, focal_length, orientation
      ) 
      SELECT path, name, taken_at, latitude, longitude, city, state, country,
        camera_make, camera_model, lens_model, aperture, iso, 
        shutter_speed, focal_length, orientation FROM json_populate_recordset(null::image_metadata, $1)
      ON CONFLICT (path) DO UPDATE SET
        taken_at = EXCLUDED.taken_at,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        city = EXCLUDED.city,
        state = EXCLUDED.state,
        country = EXCLUDED.country,
        camera_make = EXCLUDED.camera_make,
        camera_model = EXCLUDED.camera_model,
        lens_model = EXCLUDED.lens_model,
        aperture = EXCLUDED.aperture,
        iso = EXCLUDED.iso,
        shutter_speed = EXCLUDED.shutter_speed,
        focal_length = EXCLUDED.focal_length,
        orientation = EXCLUDED.orientation
      RETURNING id, path
    `,
      [JSON.stringify(metadata)]
    );

    const pathToIds = new Map<string, number>();
    for (const row of rows) {
      pathToIds.set(row.path, row.id);
    }
    return NextResponse.json({ count: rowCount, pathToIds: Object.fromEntries(pathToIds) });
  } catch (error) {
    console.error('Failed to insert metadata:', error);
    return NextResponse.json({ error: 'Failed to insert metadata' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const { ids, metadata, credentials }: { ids: string[], metadata: Partial<ImageMetadata>, credentials: S3Credentials } = await request.json();

  if (!credentialsValid(credentials)) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const entries = Object.entries(metadata);
  const { rowCount } = await sql.query(`
    UPDATE image_metadata SET ${entries.map((key, i) => `${key[0]} = $${i + 1 + ids.length}`).join(', ')} WHERE id IN (${ids.map((_, i) => `$${i + 1}`).join(', ')})
  `, [...ids, ...entries.map((value) => value[1])]);
  return NextResponse.json({ count: rowCount });
}

export async function DELETE(request: Request) {
  const { paths, credentials }: { paths: string[], credentials: S3Credentials } = await request.json();
  if (!credentialsValid(credentials)) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  await sql.query(`DELETE FROM image_metadata WHERE path IN (${paths.map((_, i) => `$${i + 1}`).join(', ')})`, paths);
  return NextResponse.json({ count: paths.length });
}