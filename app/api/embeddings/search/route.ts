import { credentialsValid } from "@/lib/db";
import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { getTextEmbedding, similarityForProbability } from "@/lib/embeddings";
import { getMetadataByIds } from "@/lib/server/metadata";

// Results continue while the model's match probability is at least MIN_PROBABILITY (1e-3 kept
// results relevant across sample queries; 3e-4 started drifting). MIN_RESULTS keeps queries with
// no strong match from coming back nearly empty.
const MIN_PROBABILITY = 1e-3;
const MIN_RESULTS = 24;
const MAX_RESULTS = 2000;
const FIRST_PAGE_SIZE = 50;

// Ranks every image once and returns the ordered ids plus the first page of metadata. The client
// fetches later pages by id (/api/metadata/by_ids), so scrolling never re-embeds the query or
// re-ranks, and the order stays stable while new photos are being added.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
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
    const embedding = await getTextEmbedding(query, { accessKeyId, secretAccessKey });

    // Exact search: at this library size a full scan is ~100ms and never misses results.
    const { rows } = await sql.query<{ image_id: number, similarity: number }>(`
      SELECT image_id, similarity FROM (
        SELECT
          image_id,
          1 - (embedding <=> $1) AS similarity,
          row_number() OVER (ORDER BY embedding <=> $1) AS rank
        FROM image_embeddings_v2
      ) ranked
      WHERE rank <= $2 OR similarity >= $3
      ORDER BY rank
      LIMIT $4
    `, [`[${embedding.join(',')}]`, MIN_RESULTS, similarityForProbability(MIN_PROBABILITY), MAX_RESULTS]);

    const ranked = rows.map((row) => ({ id: row.image_id, similarity: row.similarity }));
    const firstPage = await getMetadataByIds(ranked.slice(0, FIRST_PAGE_SIZE).map((r) => r.id));
    const similarityById = new Map(ranked.map((r) => [r.id, r.similarity]));

    return NextResponse.json({
      ranked,
      results: firstPage.map((row) => ({ ...row, similarity: similarityById.get(row.id) })),
    });
  } catch (error) {
    console.error('Error searching embeddings:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
