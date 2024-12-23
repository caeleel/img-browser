import { credentialsValid } from "@/lib/db";
import { ImageMetadata, S3Credentials } from "@/lib/types";
import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const data: { paths: string[], credentials: S3Credentials } = await request.json();
  const { paths, credentials } = data;

  if (!credentialsValid(credentials)) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const results = await sql.query(`SELECT * FROM image_metadata WHERE path IN (${paths.map((_, i) => `$${i + 1}`).join(',')})`, paths)
  // transform the rows to a map of path to row
  const rows = results.rows.reduce((acc, row) => {
    acc[row.path] = row;
    return acc;
  }, {} as Record<string, ImageMetadata>);

  return NextResponse.json(rows)
}