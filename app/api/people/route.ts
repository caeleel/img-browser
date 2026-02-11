import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { credentialsValid } from '../../../lib/db';

export async function POST(request: NextRequest) {
  try {
    const { action, credentials, ...data } = await request.json();
    
    if (!await credentialsValid(credentials)) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    if (action === 'find_or_create') {
      const { face_encoding, image_id, threshold = 0.6 } = data;
      
      // First, try to find a matching person
      const existingPeople = await sql`
        SELECT id, face_encoding FROM people
      `;
      
      // Simple distance calculation (in a real implementation, you'd use pgvector)
      let matchedPersonId = null;
      let minDistance = Infinity;
      
      for (const person of existingPeople.rows) {
        // For now, we'll use a simple placeholder matching
        // In production, you'd use proper vector similarity
        const distance = Math.random(); // Placeholder
        
        if (distance < threshold && distance < minDistance) {
          minDistance = distance;
          matchedPersonId = person.id;
        }
      }
      
      if (matchedPersonId) {
        return NextResponse.json({ person_id: matchedPersonId });
      }
      
      // Create new person if no match found
      const newPerson = await sql`
        INSERT INTO people (name, face_encoding, representative_image_id)
        VALUES (${`Person_${Date.now()}`}, ${JSON.stringify(face_encoding)}, ${image_id})
        RETURNING id
      `;
      
      return NextResponse.json({ person_id: newPerson.rows[0].id });
    }
    
    if (action === 'update_name') {
      const { person_id, name } = data;
      
      await sql`
        UPDATE people 
        SET name = ${name}, updated_at = NOW()
        WHERE id = ${person_id}
      `;
      
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error handling person request:', error);
    return NextResponse.json(
      { error: 'Failed to handle person request' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const personId = searchParams.get('id');
    
    if (personId) {
      const person = await sql`
        SELECT p.*, COUNT(pi.id) as image_count
        FROM people p
        LEFT JOIN people_images pi ON p.id = pi.person_id
        WHERE p.id = ${personId}
        GROUP BY p.id, p.name, p.face_encoding, p.representative_image_id, p.created_at, p.updated_at
      `;
      
      if (person.rows.length === 0) {
        return NextResponse.json({ error: 'Person not found' }, { status: 404 });
      }
      
      return NextResponse.json({ person: person.rows[0] });
    }
    
    // Get all people with their image counts
    const people = await sql`
      SELECT p.*, COUNT(pi.id) as image_count
      FROM people p
      LEFT JOIN people_images pi ON p.id = pi.person_id
      GROUP BY p.id, p.name, p.face_encoding, p.representative_image_id, p.created_at, p.updated_at
      ORDER BY image_count DESC, p.created_at DESC
    `;
    
    return NextResponse.json({ people: people.rows });
  } catch (error) {
    console.error('Error fetching people:', error);
    return NextResponse.json(
      { error: 'Failed to fetch people' },
      { status: 500 }
    );
  }
}