import { credentialsValid } from "@/lib/db";
import { getFacesInImage } from "@/lib/server/persons";
import { NextResponse } from "next/server";

// Detected faces in one photo (?imageId=), with who each one is.
export async function GET(request: Request) {
  const accessKeyId = request.headers.get('X-DO-ACCESS-KEY-ID');
  const secretAccessKey = request.headers.get('X-DO-SECRET-ACCESS-KEY');
  if (!credentialsValid({ accessKeyId: accessKeyId ?? undefined, secretAccessKey: secretAccessKey ?? undefined })) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const imageId = Number(new URL(request.url).searchParams.get('imageId'));
  if (!Number.isInteger(imageId)) {
    return NextResponse.json({ error: 'imageId is required' }, { status: 400 });
  }
  return NextResponse.json(await getFacesInImage(imageId));
}
