import { credentialsValid } from "@/lib/db";
import { ImageMetadata } from "@/lib/types";
import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { getTextEmbedding } from "@/lib/embeddings";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const limit = parseInt(searchParams.get('limit') || '50');  // Default result limit
  const accessKeyId = request.headers.get('X-DO-ACCESS-KEY-ID');
  const secretAccessKey = request.headers.get('X-DO-SECRET-ACCESS-KEY');

  if (!accessKeyId || !secretAccessKey) {
    return NextResponse.json({ error: 'Missing credentials' }, { status: 401 });
  }

  if (!query) {
    return NextResponse.json({ error: 'Missing query parameter' }, { status: 400 });
  }

  if (!credentialsValid({ accessKeyId, secretAccessKey })) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  try {
    // Get embedding for search query
    const embedding = await getTextEmbedding(query);

    // Search for similar images using cosine similarity
    const results = await sql.query<ImageMetadata & { similarity: number }>(`
      WITH similarities AS (
        SELECT 
          m.*,
          1 - (e.embedding <=> $1) as similarity
        FROM image_embeddings e
        JOIN image_metadata m ON m.id = e.image_id
        ORDER BY similarity DESC
        LIMIT $2
      )
      SELECT * FROM similarities
      ORDER BY similarity DESC
    `, [`[${embedding.join(',')}]`, limit]);

    return NextResponse.json({
      results: results.rows.map(row => ({
        ...row,
      }))
    });
  } catch (error) {
    console.error('Error searching embeddings:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
