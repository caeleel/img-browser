import { credentialsValid } from "@/lib/db";
import { getMetadataByIds } from "@/lib/server/metadata";
import { S3Credentials } from "@/lib/types";
import { NextResponse } from "next/server";

const MAX_IDS = 200;

// Metadata for a list of image ids, in the given order. Used to page through search results.
export async function POST(request: Request) {
  const { ids, credentials }: { ids: number[], credentials: S3Credentials } = await request.json();

  if (!credentialsValid(credentials)) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }
  if (!Array.isArray(ids) || ids.length > MAX_IDS || !ids.every(Number.isInteger)) {
    return NextResponse.json({ error: `ids must be up to ${MAX_IDS} integers` }, { status: 400 });
  }

  return NextResponse.json({ rows: await getMetadataByIds(ids) });
}
