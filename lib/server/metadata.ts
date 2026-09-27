import { sql } from '@vercel/postgres';
import { ImageMetadata } from '@/lib/types';

// Server-only. Returns metadata rows for `ids` in the same order, skipping ids that no longer exist.
export async function getMetadataByIds(ids: number[]): Promise<ImageMetadata[]> {
  if (ids.length === 0) return [];
  const { rows } = await sql.query<ImageMetadata>('SELECT * FROM image_metadata WHERE id = ANY($1)', [ids]);
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter((row): row is ImageMetadata => Boolean(row));
}
