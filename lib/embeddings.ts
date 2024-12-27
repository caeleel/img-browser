const EMBED_HOST = 'https://dd94-157-131-170-91.ngrok-free.app'

type Embedding = number[];

export async function getTextEmbedding(text: string): Promise<Embedding> {
  const response = await fetch(`${EMBED_HOST}/embed/text`, {
    method: 'POST',
    body: JSON.stringify({ content: text }),
    headers: {
      'Content-Type': 'application/json',
    }
  });
  const data = await response.json();
  console.log(data);
  return data.embedding;
}

export async function getImageEmbedding(blob: Blob): Promise<number[]> {
  const formData = new FormData();
  formData.append('file', blob);

  const response = await fetch(`${EMBED_HOST}/embed/image`, {
    method: 'POST',
    body: formData,
  });

  const data = await response.json();
  return data.embedding;
}