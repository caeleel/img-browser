import { S3Credentials } from './types';

// SigLIP 2 server (ai-server/modal_app.py), deployed on Modal.
const EMBED_HOST = 'https://caeleel--img-browser-embed-embed-web.modal.run'
export const EMBEDDING_DIM = 768;

// SigLIP scores a text/image pair as sigmoid(similarity * scale + bias). These are the model's
// learned values (model.logit_scale.exp(), model.logit_bias for siglip2-base-patch16-256).
const LOGIT_SCALE = 112.90117645263672;
const LOGIT_BIAS = -16.77180290222168;

// Cosine similarity at which the model's match probability equals `probability`.
export function similarityForProbability(probability: number): number {
  return (Math.log(probability / (1 - probability)) - LOGIT_BIAS) / LOGIT_SCALE;
}

type Embedding = number[];

function authHeaders(credentials: S3Credentials): Record<string, string> {
  return {
    'X-DO-ACCESS-KEY-ID': credentials.accessKeyId,
    'X-DO-SECRET-ACCESS-KEY': credentials.secretAccessKey,
  };
}

async function readEmbedding(response: Response): Promise<Embedding> {
  if (!response.ok) {
    throw new Error(`Embedding server error: ${response.status}`);
  }
  const data = await response.json();
  if (!Array.isArray(data.embedding) || data.embedding.length !== EMBEDDING_DIM) {
    throw new Error('Embedding server returned no embedding');
  }
  return data.embedding;
}

export async function getTextEmbedding(text: string, credentials: S3Credentials): Promise<Embedding> {
  const response = await fetch(`${EMBED_HOST}/embed/text`, {
    method: 'POST',
    body: JSON.stringify({ content: text }),
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(credentials),
    }
  });
  return readEmbedding(response);
}

export async function getImageEmbedding(blob: Blob, credentials: S3Credentials): Promise<Embedding> {
  const formData = new FormData();
  formData.append('file', blob);

  const response = await fetch(`${EMBED_HOST}/embed/image`, {
    method: 'POST',
    body: formData,
    headers: authHeaders(credentials),
  });
  return readEmbedding(response);
}
