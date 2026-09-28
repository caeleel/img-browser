import { sql } from '@vercel/postgres';
import { Face, Person } from '@/lib/types';

// Server-only helpers for face-based person search (tables from db/migrate_faces.sql).

type PersonRow = {
  id: number, name: string | null, hidden: boolean, photo_count: string, day_count: string,
  x: number | null, y: number | null, width: number | null, height: number | null,
  path: string | null, orientation: number | null,
};

function toPerson(row: PersonRow): Person {
  return {
    id: row.id,
    name: row.name,
    hidden: row.hidden,
    photoCount: Number(row.photo_count),
    dayCount: Number(row.day_count),
    cover: row.path === null ? null : {
      path: row.path,
      orientation: row.orientation,
      x: row.x!, y: row.y!, width: row.width!, height: row.height!,
    },
  };
}

const PERSON_SELECT = `
  SELECT p.id, p.name, p.hidden, count(DISTINCT f.image_id) AS photo_count,
         -- Undated photos count as a day each
         count(DISTINCT COALESCE(date(pm.taken_at)::text, pm.id::text)) AS day_count,
         c.x, c.y, c.width, c.height, m.path, m.orientation
  FROM persons p
  JOIN faces f ON f.person_id = p.id
  JOIN image_metadata pm ON pm.id = f.image_id
  LEFT JOIN faces c ON c.id = p.cover_face_id
  LEFT JOIN image_metadata m ON m.id = c.image_id
`;

// Named people first, then everyone else by how often they appear.
export async function listPersons(includeHidden: boolean): Promise<Person[]> {
  const { rows } = await sql.query<PersonRow>(`
    ${PERSON_SELECT}
    ${includeHidden ? '' : 'WHERE NOT p.hidden'}
    GROUP BY p.id, c.id, m.id
    ORDER BY (p.name IS NULL), count(DISTINCT f.image_id) DESC, p.id
  `);
  return rows.map(toPerson);
}

export async function getPerson(id: number): Promise<Person | null> {
  const { rows } = await sql.query<PersonRow>(`
    ${PERSON_SELECT}
    WHERE p.id = $1
    GROUP BY p.id, c.id, m.id
  `, [id]);
  return rows[0] ? toPerson(rows[0]) : null;
}

// Named people whose name appears in a search query, e.g. "alice at the beach". Returns them
// with the query text left over once their names are taken out.
export async function extractPersons(query: string): Promise<{ persons: Person[], rest: string }> {
  const { rows } = await sql.query<{ id: number, name: string }>(
    `SELECT id, name FROM persons p
     WHERE name IS NOT NULL AND $1 ILIKE '%' || name || '%'
       AND EXISTS (SELECT 1 FROM faces f WHERE f.person_id = p.id)`, [query]
  );
  // Longest names first so "Ann Lee" wins over "Ann"
  rows.sort((a, b) => b.name.length - a.name.length);
  let rest = query;
  const matched: number[] = [];
  for (const row of rows) {
    const escaped = row.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}('s)?(?=$|[^\\p{L}\\p{N}])`, 'iu');
    if (pattern.test(rest)) {
      rest = rest.replace(pattern, '$1 ');
      matched.push(row.id);
    }
  }
  const persons = await Promise.all(matched.map(getPerson));
  rest = rest.replace(/\s+/g, ' ').replace(/^(and|with|&|,)\s+|\s+(and|with|&|,)$/gi, '').trim();
  // Nothing left worth embedding ("photos of alice") means just show the person's photos
  if (/^((photos?|pictures?|pics?|images?|of|with|and|the|a|&|,)\s*)*$/i.test(rest)) rest = '';
  return { persons: persons.filter((p): p is Person => p !== null), rest };
}

// Images that contain every one of these persons, newest first.
export async function imageIdsWithPersons(personIds: number[]): Promise<number[]> {
  const { rows } = await sql.query<{ id: number }>(`
    SELECT m.id
    FROM image_metadata m
    JOIN faces f ON f.image_id = m.id
    WHERE f.person_id = ANY($1)
    GROUP BY m.id
    HAVING count(DISTINCT f.person_id) = cardinality($1::int[])
    ORDER BY max(m.taken_at) DESC NULLS LAST, m.id DESC
  `, [personIds]);
  return rows.map((row) => row.id);
}

export async function getFacesInImage(imageId: number): Promise<Face[]> {
  const { rows } = await sql.query<{
    id: number, x: number, y: number, width: number, height: number,
    person_id: number | null, name: string | null, hidden: boolean | null, manual: boolean,
  }>(`
    SELECT f.id, f.x, f.y, f.width, f.height, f.person_id, p.name, p.hidden, f.embedding IS NULL AS manual
    FROM faces f
    LEFT JOIN persons p ON p.id = f.person_id
    WHERE f.image_id = $1
    ORDER BY f.x
  `, [imageId]);
  return rows.map((row) => ({
    id: row.id, x: row.x, y: row.y, width: row.width, height: row.height, manual: row.manual,
    person: row.person_id === null ? null : { id: row.person_id, name: row.name, hidden: row.hidden ?? false },
  }));
}

// Resolves a tag to a person id: an existing person, or one found/created by name (a new person's
// cover is the tagged face). Returns null for "nobody" (untag).
export async function resolveTag(
  tag: { personId?: number | null, newPersonName?: string }, faceId: number,
): Promise<number | null | 'invalid' | 'not found'> {
  const name = tag.newPersonName?.trim().slice(0, 100);
  if (name) {
    const { rows: [existing] } = await sql.query<{ id: number }>(
      'SELECT id FROM persons WHERE lower(name) = lower($1) ORDER BY id LIMIT 1', [name]
    );
    if (existing) return existing.id;
    const { rows: [created] } = await sql.query<{ id: number }>(
      'INSERT INTO persons (name, cover_face_id) VALUES ($1, $2) RETURNING id', [name, faceId]
    );
    return created.id;
  }
  if (tag.personId === null) return null;
  if (!Number.isInteger(tag.personId)) return 'invalid';
  const { rowCount } = await sql.query('SELECT 1 FROM persons WHERE id = $1', [tag.personId]);
  return rowCount ? tag.personId! : 'not found';
}
