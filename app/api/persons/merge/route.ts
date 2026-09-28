import { credentialsValid } from "@/lib/db";
import { getPerson } from "@/lib/server/persons";
import { S3Credentials } from "@/lib/types";
import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";

// Moves every face of `sourceIds` into `targetId` and deletes the source persons. Merged faces
// count as placed by hand, so clustering never splits them off again.
export async function POST(request: Request) {
  const { sourceIds, targetId, credentials }: { sourceIds: number[], targetId: number, credentials: S3Credentials } = await request.json();
  if (!credentialsValid(credentials)) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }
  if (!Array.isArray(sourceIds) || !sourceIds.every(Number.isInteger) || !Number.isInteger(targetId)) {
    return NextResponse.json({ error: 'sourceIds and targetId are required' }, { status: 400 });
  }
  const sources = sourceIds.filter((id) => id !== targetId);
  if (!(await getPerson(targetId))) {
    return NextResponse.json({ error: 'Target person not found' }, { status: 404 });
  }

  // An unnamed target takes the name of a named source
  await sql.query(`
    UPDATE persons SET name = (SELECT name FROM persons WHERE id = ANY($2) AND name IS NOT NULL ORDER BY id LIMIT 1)
    WHERE id = $1 AND name IS NULL
  `, [targetId, sources]);
  await sql.query('UPDATE faces SET person_id = $1, user_assigned = TRUE WHERE person_id = ANY($2)', [targetId, sources]);
  await sql.query('DELETE FROM persons WHERE id = ANY($1)', [sources]);

  return NextResponse.json(await getPerson(targetId));
}
