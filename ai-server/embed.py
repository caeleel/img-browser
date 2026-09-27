"""Embedding server: SigLIP 2 image/text embeddings over HTTP.

Runs locally (`python embed.py`, used by the phone sync and the backfill script) and on Modal
(modal_app.py, used by search and the web uploader). Set EMBED_REQUIRE_AUTH=1 to require the
bucket credentials in X-DO-ACCESS-KEY-ID / X-DO-SECRET-ACCESS-KEY, like the web app's API.
"""

import asyncio
import os
import secrets
import sys
from concurrent.futures import ThreadPoolExecutor
from typing import List

import uvicorn
from fastapi import Depends, FastAPI, File, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from model import Embedder

# One worker: the model isn't shared safely across threads, and batching does the parallelism.
executor = ThreadPoolExecutor(max_workers=1)


class TextRequest(BaseModel):
    content: str


def check_credentials(
    x_do_access_key_id: str = Header(default=""),
    x_do_secret_access_key: str = Header(default=""),
):
    if not os.getenv("EMBED_REQUIRE_AUTH"):
        return
    expected_id = os.getenv("ACCESS_KEY_ID", "")
    expected_secret = os.getenv("SECRET_ACCESS_KEY", "")
    if not (
        expected_id
        and expected_secret
        and secrets.compare_digest(x_do_access_key_id, expected_id)
        and secrets.compare_digest(x_do_secret_access_key, expected_secret)
    ):
        raise HTTPException(status_code=401, detail="Invalid credentials")


def create_app(embedder: Embedder) -> FastAPI:
    app = FastAPI()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    auth = [Depends(check_credentials)]

    async def run(fn, *args):
        return await asyncio.get_running_loop().run_in_executor(executor, fn, *args)

    async def embed_images_each(files: List[bytes]) -> list:
        """Embeds a batch in one pass, falling back to one-by-one to isolate bad images."""
        try:
            return [{"error": None, "embedding": e} for e in await run(embedder.images, files)]
        except Exception:
            results = []
            for f in files:
                try:
                    results.append({"error": None, "embedding": (await run(embedder.images, [f]))[0]})
                except Exception as e:
                    results.append({"error": str(e), "embedding": None})
            return results

    @app.post("/embed/image", dependencies=auth)
    async def embed_image(file: bytes = File(...)):
        result = (await embed_images_each([file]))[0]
        if result["error"]:
            raise HTTPException(status_code=400, detail=f"Error processing image: {result['error']}")
        return {"embedding": result["embedding"]}

    @app.post("/embed/text", dependencies=auth)
    async def embed_text(request: TextRequest):
        return {"embedding": (await run(embedder.texts, [request.content]))[0]}

    @app.post("/batch_embed/images", dependencies=auth)
    async def batch_embed_images(files: List[bytes] = File(...)):
        return {"results": await embed_images_each(files)}

    @app.post("/batch_embed/text", dependencies=auth)
    async def batch_embed_text(requests: List[TextRequest]):
        embeddings = await run(embedder.texts, [r.content for r in requests])
        return {"results": [{"error": None, "embedding": e} for e in embeddings]}

    return app


if __name__ == "__main__":
    print("Loading SigLIP 2 model...", file=sys.stderr)
    embedder = Embedder()
    print(f"Model loaded on {embedder.device}", file=sys.stderr)
    uvicorn.run(create_app(embedder), host=os.getenv("HOST", "127.0.0.1"), port=int(os.getenv("PORT", "8000")), workers=1)
