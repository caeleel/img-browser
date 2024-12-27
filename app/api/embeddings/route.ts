import { credentialsValid } from "@/lib/db";
import { S3Credentials } from "@/lib/types";
import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const data: {
    embeddings: Record<number, number[]>,
    credentials: S3Credentials
  } = await request.json();

  const { embeddings, credentials } = data;

  if (!credentialsValid(credentials)) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  try {
    // Convert embeddings object to array of (image_id, embedding) tuples
    const values = Object.entries(embeddings).map(([image_id, embedding]) => ({
      image_id: parseInt(image_id),
      embedding
    }));

    // Insert all embeddings in a single query
    await sql.query(`
      INSERT INTO image_embeddings (image_id, embedding)
      SELECT v.image_id, v.embedding::vector(512)
      FROM jsonb_to_recordset($1) AS v(image_id int, embedding float[])
      ON CONFLICT (image_id, version) 
      DO UPDATE SET 
        embedding = EXCLUDED.embedding,
        updated_at = NOW()
    `, [JSON.stringify(values)]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error storing embeddings:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 