import { credentialsValid } from "@/lib/db";
import { getFacesInImage } from "@/lib/server/persons";
import { S3Credentials } from "@/lib/types";
import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";

// Tags one face by hand: { personId } moves it to that person, { newPersonName } creates a person
// for it (or uses the one already called that), { personId: null } removes the tag. Hand-tagged
// faces are never moved by clustering. Returns the photo's faces.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { personId, newPersonName, credentials }: {
    personId?: number | null, newPersonName?: string, credentials: S3Credentials
  } = await request.json();
  if (!credentialsValid(credentials)) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const faceId = Number((await params).id);
  const { rows: [face] } = await sql.query<{ image_id: number, person_id: number | null }>(
    'SELECT image_id, person_id FROM faces WHERE id = $1', [faceId]
  );
  if (!face) {
    return NextResponse.json({ error: 'Face not found' }, { status: 404 });
  }

  let target: number | null;
  const name = newPersonName?.trim().slice(0, 100);
  if (name) {
    const { rows: [existing] } = await sql.query<{ id: number }>(
      'SELECT id FROM persons WHERE lower(name) = lower($1) ORDER BY id LIMIT 1', [name]
    );
    target = existing?.id ?? (await sql.query<{ id: number }>(
      'INSERT INTO persons (name, cover_face_id) VALUES ($1, $2) RETURNING id', [name, faceId]
    )).rows[0].id;
  } else if (personId === null) {
    target = null;
  } else if (Number.isInteger(personId)) {
    const { rowCount } = await sql.query('SELECT 1 FROM persons WHERE id = $1', [personId]);
    if (!rowCount) return NextResponse.json({ error: 'Person not found' }, { status: 404 });
    target = personId!;
  } else {
    return NextResponse.json({ error: 'personId or newPersonName is required' }, { status: 400 });
  }

  await sql.query('UPDATE faces SET person_id = $2, user_assigned = TRUE WHERE id = $1', [faceId, target]);

  const previous = face.person_id;
  if (previous !== null && previous !== target) {
    // The old person loses this face: repoint their cover, or drop them if nothing's left
    await sql.query(`
      UPDATE persons p SET cover_face_id = (
        SELECT f.id FROM faces f WHERE f.person_id = p.id ORDER BY f.det_score DESC LIMIT 1
      )
      WHERE p.id = $1 AND (p.cover_face_id IS NULL OR p.cover_face_id = $2)
    `, [previous, faceId]);
    await sql.query('DELETE FROM persons p WHERE p.id = $1 AND NOT EXISTS (SELECT 1 FROM faces f WHERE f.person_id = p.id)', [previous]);
  }
  if (target !== null) {
    await sql.query('UPDATE persons SET cover_face_id = $2 WHERE id = $1 AND cover_face_id IS NULL', [target, faceId]);
  }

  return NextResponse.json(await getFacesInImage(face.image_id));
}
