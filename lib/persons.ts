import { getCredentials } from './s3';
import { Person } from './types';

// Client-side calls for the People pages (API in app/api/persons).

function authHeaders() {
  const credentials = getCredentials();
  return {
    'X-DO-ACCESS-KEY-ID': credentials?.accessKeyId ?? '',
    'X-DO-SECRET-ACCESS-KEY': credentials?.secretAccessKey ?? '',
  };
}

async function send(url: string, method: string, body: object): Promise<Person> {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, credentials: getCredentials() }),
  });
  if (!response.ok) throw new Error((await response.json()).error ?? `${method} ${url} failed`);
  return response.json();
}

export async function fetchPersons(includeHidden = false): Promise<Person[]> {
  const response = await fetch(`/api/persons${includeHidden ? '?hidden=1' : ''}`, { headers: authHeaders() });
  if (!response.ok) throw new Error('Failed to load people');
  return response.json();
}

export async function fetchPerson(id: number): Promise<Person> {
  const response = await fetch(`/api/persons/${id}`, { headers: authHeaders() });
  if (!response.ok) throw new Error('Failed to load person');
  return response.json();
}

export function updatePerson(id: number, changes: { name?: string | null, hidden?: boolean, coverImageId?: number }) {
  return send(`/api/persons/${id}`, 'PATCH', changes);
}

// "Not this person" for the person's faces in these photos
export function removeFromPerson(id: number, imageIds: number[]) {
  return send(`/api/persons/${id}`, 'DELETE', { imageIds });
}

export function mergePersons(sourceIds: number[], targetId: number) {
  return send('/api/persons/merge', 'POST', { sourceIds, targetId });
}

export function personLabel(person: Person) {
  return person.name ?? 'Unnamed';
}
