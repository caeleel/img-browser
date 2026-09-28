import { credentialsValid } from "@/lib/db";
import { getFacesInImage, resolveTag } from "@/lib/server/persons";
import { S3Credentials } from "@/lib/types";
import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";

// Detected faces in one photo (?imageId=), with who each one is.
export async function GET(request: Request) {
  const accessKeyId = request.headers.get('X-DO-ACCESS-KEY-ID');
  const secretAccessKey = request.headers.get('X-DO-SECRET-ACCESS-KEY');
  if (!credentialsValid({ accessKeyId: accessKeyId ?? undefined, secretAccessKey: secretAccessKey ?? undefined })) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const imageId = Number(new URL(request.url).searchParams.get('imageId'));
  if (!Number.isInteger(imageId)) {
    return NextResponse.json({ error: 'imageId is required' }, { status: 400 });
  }
  return NextResponse.json(await getFacesInImage(imageId));
}

// A face drawn by hand in the viewer, tagged as { personId } or { newPersonName }. It has no
// embedding, so it only records who is in the photo. Returns the photo's faces.
export async function POST(request: Request) {
  const { imageId, x, y, width, height, personId, newPersonName, credentials }: {
    imageId: number, x: number, y: number, width: number, height: number,
    personId?: number, newPersonName?: string, credentials: S3Credentials,
  } = await request.json();
  if (!credentialsValid(credentials)) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }
  const box = [x, y, width, height];
  if (!Number.isInteger(imageId) || !box.every((v) => typeof v === 'number' && v >= 0 && v <= 1)
    || width < 0.005 || height < 0.005 || x + width > 1.0001 || y + height > 1.0001) {
    return NextResponse.json({ error: 'imageId and a box inside the photo are required' }, { status: 400 });
  }
  if (!personId && !newPersonName?.trim()) {
    return NextResponse.json({ error: 'personId or newPersonName is required' }, { status: 400 });
  }
  const { rowCount } = await sql.query('SELECT 1 FROM image_metadata WHERE id = $1', [imageId]);
  if (!rowCount) {
    return NextResponse.json({ error: 'Image not found' }, { status: 404 });
  }

  const { rows: [face] } = await sql.query<{ id: number }>(`
    INSERT INTO faces (image_id, x, y, width, height, user_assigned) VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING id
  `, [imageId, x, y, width, height]);
  const target = await resolveTag({ personId, newPersonName }, face.id);
  if (typeof target !== 'number') {
    await sql.query('DELETE FROM faces WHERE id = $1', [face.id]);
    return NextResponse.json({ error: 'Person not found' }, { status: 404 });
  }
  await sql.query('UPDATE faces SET person_id = $2 WHERE id = $1', [face.id, target]);
  await sql.query('UPDATE persons SET cover_face_id = $2 WHERE id = $1 AND cover_face_id IS NULL', [target, face.id]);

  return NextResponse.json(await getFacesInImage(imageId));
}
