"""SigLIP 2 image/text embeddings, shared by the local server (embed.py) and Modal (modal_app.py)."""

import io
from typing import List

import torch
from PIL import Image, ImageOps
from transformers import AutoModel, AutoProcessor

MODEL_ID = "google/siglip2-base-patch16-256"
EMBED_DIM = 768
# SigLIP was trained on lowercased text padded to 64 tokens; queries have to match that.
TEXT_MAX_LENGTH = 64


def pick_device() -> str:
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def _features(output) -> torch.Tensor:
    # get_*_features returns a tensor in older transformers and a model output in newer ones.
    return output if torch.is_tensor(output) else output.pooler_output


class Embedder:
    def __init__(self, device: str | None = None):
        self.device = device or pick_device()
        self.model = AutoModel.from_pretrained(MODEL_ID).to(self.device).eval()
        self.processor = AutoProcessor.from_pretrained(MODEL_ID)

    @staticmethod
    def _normalize(features: torch.Tensor) -> List[List[float]]:
        features = features / features.norm(dim=-1, keepdim=True)
        return features.float().cpu().tolist()

    @torch.no_grad()
    def images(self, blobs: List[bytes]) -> List[List[float]]:
        # Thumbnails can carry an EXIF orientation tag instead of rotated pixels.
        images = [ImageOps.exif_transpose(Image.open(io.BytesIO(b))).convert("RGB") for b in blobs]
        inputs = self.processor(images=images, return_tensors="pt").to(self.device)
        return self._normalize(_features(self.model.get_image_features(**inputs)))

    @torch.no_grad()
    def texts(self, texts: List[str]) -> List[List[float]]:
        inputs = self.processor(
            text=[t.lower() for t in texts],
            padding="max_length",
            max_length=TEXT_MAX_LENGTH,
            truncation=True,
            return_tensors="pt",
        ).to(self.device)
        return self._normalize(_features(self.model.get_text_features(**inputs)))
