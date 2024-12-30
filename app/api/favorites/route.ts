import { credentialsValid } from "@/lib/db";
import { S3Credentials } from "@/lib/types";
import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";

// Get all favorited images
export async function GET(request: Request) {
  const accessKeyId = request.headers.get('X-DO-ACCESS-KEY-ID')!;
  const secretAccessKey = request.headers.get('X-DO-SECRET-ACCESS-KEY')!;

  if (!credentialsValid({ accessKeyId, secretAccessKey })) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const results = await sql`
    SELECT f.id AS id, f.image_id AS image_id, f.created_at AS created_at, i.path AS path, i.name AS name from favorites f
    JOIN image_metadata i ON f.image_id = i.id
    ORDER BY created_at DESC
  `;

  return NextResponse.json(results.rows);
}

// Get favorite status for a set of images
export async function POST(request: Request) {
  const data: {
    ids: number[],
    credentials: S3Credentials
  } = await request.json();

  const { ids, credentials } = data;

  if (!credentialsValid(credentials)) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const results = await sql.query(`
    INSERT INTO favorites (image_id)
    VALUES ${ids.map((_, i) => `($${i + 1})`).join(', ')}
    ON CONFLICT (image_id) DO NOTHING
  `, ids);

  const favorited = new Set(results.rows.map(row => row.image_id));
  return NextResponse.json(favorited);
}

export async function DELETE(request: Request) {
  const { ids, credentials }: { ids: number[], credentials: S3Credentials } = await request.json();
  if (!credentialsValid(credentials)) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  await sql.query(`
    DELETE FROM favorites
    WHERE image_id IN (${ids.map((_, i) => `$${i + 1}`).join(', ')})
  `, ids);

  return NextResponse.json({ count: ids.length });
}