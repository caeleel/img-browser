import { credentialsValid } from "@/lib/db";
import { S3Credentials } from "@/lib/types";
import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";

const MAX_FOLDERS = 500;

// Covers for a list of folders: { [folderPath]: { id, path, orientation } }
export async function POST(request: Request) {
  const { folderPaths, credentials }: { folderPaths: string[], credentials: S3Credentials } = await request.json();

  if (!credentialsValid(credentials)) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }
  if (!Array.isArray(folderPaths) || folderPaths.length > MAX_FOLDERS) {
    return NextResponse.json({ error: `folderPaths must be up to ${MAX_FOLDERS} paths` }, { status: 400 });
  }
  if (folderPaths.length === 0) {
    return NextResponse.json({});
  }

  const { rows } = await sql.query(`
    SELECT c.folder_path, m.id, m.path, m.orientation
    FROM folder_covers c
    JOIN image_metadata m ON m.id = c.image_id
    WHERE c.folder_path = ANY($1)
  `, [folderPaths]);

  return NextResponse.json(Object.fromEntries(
    rows.map((row) => [row.folder_path, { id: row.id, path: row.path, orientation: row.orientation }])
  ));
}

// Sets a folder's cover. The image has to be inside the folder (at any depth).
export async function PUT(request: Request) {
  const { folderPath, imageId, credentials }: { folderPath: string, imageId: number, credentials: S3Credentials } = await request.json();

  if (!credentialsValid(credentials)) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }
  if (typeof folderPath !== 'string' || !folderPath.endsWith('/') || !Number.isInteger(imageId)) {
    return NextResponse.json({ error: 'folderPath (ending in /) and imageId are required' }, { status: 400 });
  }

  const { rows } = await sql.query('SELECT path FROM image_metadata WHERE id = $1', [imageId]);
  if (!rows[0]?.path.startsWith(folderPath)) {
    return NextResponse.json({ error: 'Image is not in that folder' }, { status: 400 });
  }

  await sql.query(`
    INSERT INTO folder_covers (folder_path, image_id) VALUES ($1, $2)
    ON CONFLICT (folder_path) DO UPDATE SET image_id = EXCLUDED.image_id, updated_at = NOW()
  `, [folderPath, imageId]);

  return NextResponse.json({ folderPath, path: rows[0].path });
}

export async function DELETE(request: Request) {
  const { folderPath, credentials }: { folderPath: string, credentials: S3Credentials } = await request.json();

  if (!credentialsValid(credentials)) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  await sql.query('DELETE FROM folder_covers WHERE folder_path = $1', [folderPath]);
  return NextResponse.json({ folderPath });
}
