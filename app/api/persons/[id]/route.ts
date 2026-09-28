import { credentialsValid } from "@/lib/db";
import { getPerson } from "@/lib/server/persons";
import { S3Credentials } from "@/lib/types";
import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

async function personId(params: Params['params']) {
  const id = Number((await params).id);
  return Number.isInteger(id) ? id : null;
}

export async function GET(request: Request, { params }: Params) {
  const accessKeyId = request.headers.get('X-DO-ACCESS-KEY-ID');
  const secretAccessKey = request.headers.get('X-DO-SECRET-ACCESS-KEY');
  if (!credentialsValid({ accessKeyId: accessKeyId ?? undefined, secretAccessKey: secretAccessKey ?? undefined })) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const id = await personId(params);
  const person = id === null ? null : await getPerson(id);
  if (!person) {
    return NextResponse.json({ error: 'Person not found' }, { status: 404 });
  }
  return NextResponse.json(person);
}

// Rename, hide/unhide, or pick a cover face (one of the person's own faces, by image).
export async function PATCH(request: Request, { params }: Params) {
  const { name, hidden, coverImageId, credentials }: {
    name?: string | null, hidden?: boolean, coverImageId?: number, credentials: S3Credentials
  } = await request.json();
  if (!credentialsValid(credentials)) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }
  const id = await personId(params);
  if (id === null) {
    return NextResponse.json({ error: 'Invalid person id' }, { status: 400 });
  }

  if (name !== undefined) {
    const trimmed = typeof name === 'string' ? name.trim().slice(0, 100) : '';
    await sql.query('UPDATE persons SET name = $2 WHERE id = $1', [id, trimmed || null]);
  }
  if (typeof hidden === 'boolean') {
    await sql.query('UPDATE persons SET hidden = $2 WHERE id = $1', [id, hidden]);
  }
  if (Number.isInteger(coverImageId)) {
    const { rowCount } = await sql.query(`
      UPDATE persons SET cover_face_id = (
        SELECT f.id FROM faces f WHERE f.person_id = $1 AND f.image_id = $2 ORDER BY f.det_score DESC NULLS LAST LIMIT 1
      )
      WHERE id = $1 AND EXISTS (SELECT 1 FROM faces f WHERE f.person_id = $1 AND f.image_id = $2)
    `, [id, coverImageId]);
    if (!rowCount) {
      return NextResponse.json({ error: 'That photo is not of this person' }, { status: 400 });
    }
  }

  return NextResponse.json(await getPerson(id));
}

// "Not this person": takes the person's faces in these photos away from them for good.
export async function DELETE(request: Request, { params }: Params) {
  const { imageIds, credentials }: { imageIds: number[], credentials: S3Credentials } = await request.json();
  if (!credentialsValid(credentials)) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }
  const id = await personId(params);
  if (id === null || !Array.isArray(imageIds) || !imageIds.every(Number.isInteger)) {
    return NextResponse.json({ error: 'imageIds must be integers' }, { status: 400 });
  }

  await sql.query(`
    UPDATE faces SET person_id = NULL, user_assigned = TRUE
    WHERE person_id = $1 AND image_id = ANY($2)
  `, [id, imageIds]);
  // Keep the cover pointing at one of the person's remaining faces
  await sql.query(`
    UPDATE persons p SET cover_face_id = (
      SELECT f.id FROM faces f WHERE f.person_id = p.id ORDER BY f.det_score DESC NULLS LAST LIMIT 1
    )
    WHERE p.id = $1 AND (p.cover_face_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM faces f WHERE f.id = p.cover_face_id AND f.person_id = p.id
    ))
  `, [id]);

  return NextResponse.json(await getPerson(id));
}
