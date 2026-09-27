"""Hosts the embedding server (embed.py) on Modal for search and the web uploader.

Deploy:  modal deploy ai-server/modal_app.py
Needs a Modal secret named "img-browser-bucket" with ACCESS_KEY_ID and SECRET_ACCESS_KEY, which
callers must send as X-DO-ACCESS-KEY-ID / X-DO-SECRET-ACCESS-KEY.

Scales to zero after 20 idle minutes; a memory snapshot of the loaded model keeps cold starts short.
"""

import modal


def download_model():
    from transformers import AutoModel, AutoProcessor

    from model import MODEL_ID

    AutoModel.from_pretrained(MODEL_ID)
    AutoProcessor.from_pretrained(MODEL_ID)


image = (
    modal.Image.debian_slim(python_version="3.12")
    # CPU-only torch wheel: much smaller, and a GPU isn't needed at this volume.
    .pip_install("torch", extra_index_url="https://download.pytorch.org/whl/cpu")
    .pip_install("transformers>=4.49", "sentencepiece", "pillow", "fastapi[standard]", "python-multipart")
    .env({"HF_HOME": "/models", "EMBED_REQUIRE_AUTH": "1"})
    .add_local_python_source("model", "embed", copy=True)
    .run_function(download_model)
)

app = modal.App("img-browser-embed", image=image)


@app.cls(
    cpu=1.0,
    memory=2048,
    scaledown_window=20 * 60,
    enable_memory_snapshot=True,
    secrets=[modal.Secret.from_name("img-browser-bucket")],
)
@modal.concurrent(max_inputs=8)
class Embed:
    @modal.enter(snap=True)
    def load(self):
        from model import Embedder

        self.embedder = Embedder(device="cpu")

    @modal.asgi_app()
    def web(self):
        from embed import create_app

        return create_app(self.embedder)
