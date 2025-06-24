import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { credentialsValid } from '../../../lib/db';

export async function POST(request: NextRequest) {
  try {
    const { faces, credentials } = await request.json();
    
    if (!await credentialsValid(credentials)) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Store face detections for each image
    for (const faceData of faces) {
      const { image_id, person_id, bbox, confidence } = faceData;
      
      await sql`
        INSERT INTO people_images (person_id, image_id, face_left, face_top, face_right, face_bottom, confidence)
        VALUES (${person_id}, ${image_id}, ${bbox.left}, ${bbox.top}, ${bbox.right}, ${bbox.bottom}, ${confidence})
        ON CONFLICT (person_id, image_id, face_left, face_top, face_right, face_bottom) DO NOTHING
      `;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error storing face data:', error);
    return NextResponse.json(
      { error: 'Failed to store face data' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const personId = searchParams.get('person_id');
    const imageId = searchParams.get('image_id');
    
    let query;
    let params: any[] = [];
    
    if (personId) {
      query = `
        SELECT pi.*, p.name as person_name, m.path as image_path
        FROM people_images pi
        JOIN people p ON pi.person_id = p.id
        JOIN image_metadata m ON pi.image_id = m.id
        WHERE pi.person_id = $1
        ORDER BY pi.created_at DESC
      `;
      params = [personId];
    } else if (imageId) {
      query = `
        SELECT pi.*, p.name as person_name
        FROM people_images pi
        JOIN people p ON pi.person_id = p.id
        WHERE pi.image_id = $1
        ORDER BY pi.confidence DESC
      `;
      params = [imageId];
    } else {
      query = `
        SELECT p.id, p.name, COUNT(pi.id) as image_count
        FROM people p
        LEFT JOIN people_images pi ON p.id = pi.person_id
        GROUP BY p.id, p.name
        ORDER BY image_count DESC
      `;
    }

    const result = await sql.query(query, params);
    return NextResponse.json({ data: result.rows });
  } catch (error) {
    console.error('Error fetching face data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch face data' },
      { status: 500 }
    );
  }
}