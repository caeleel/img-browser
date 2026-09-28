import { credentialsValid } from "@/lib/db";
import { listPersons } from "@/lib/server/persons";
import { NextResponse } from "next/server";

// Everyone found in photos (see scripts/cluster_faces.py). ?hidden=1 includes hidden persons.
export async function GET(request: Request) {
  const accessKeyId = request.headers.get('X-DO-ACCESS-KEY-ID');
  const secretAccessKey = request.headers.get('X-DO-SECRET-ACCESS-KEY');
  if (!credentialsValid({ accessKeyId: accessKeyId ?? undefined, secretAccessKey: secretAccessKey ?? undefined })) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const includeHidden = new URL(request.url).searchParams.get('hidden') === '1';
  return NextResponse.json(await listPersons(includeHidden));
}
