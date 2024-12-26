import sys
import torch
from PIL import Image
import clip
import io
from fastapi import FastAPI, HTTPException, File
from pydantic import BaseModel
from concurrent.futures import ThreadPoolExecutor
import uvicorn
from typing import  List
import numpy as np
import asyncio

# Initialize FastAPI app
app = FastAPI()

# Global model and preprocessing function
print("Loading CLIP model...", file=sys.stderr)
device = "cuda" if torch.cuda.is_available() else "cpu"
model, preprocess = clip.load("ViT-B/32", device=device)
print(f"Model loaded on {device}", file=sys.stderr)

# Thread pool for parallel processing
executor = ThreadPoolExecutor(max_workers=4)  # Adjust based on your CPU/GPU

class TextRequest(BaseModel):
    content: str

def process_image(image_bytes: bytes) -> np.ndarray:
    """Process image bytes and return its embedding."""
    try:
        image = Image.open(io.BytesIO(image_bytes))
        
        # Preprocess and get embedding
        image_input = preprocess(image).unsqueeze(0).to(device)
        with torch.no_grad():
            image_features = model.encode_image(image_input)
            image_features = image_features / image_features.norm(dim=-1, keepdim=True)
        return image_features.cpu().numpy()[0]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error processing image: {str(e)}")

def process_text(text: str) -> np.ndarray:
    """Process a text string and return its embedding."""
    try:
        text_tokens = clip.tokenize([text]).to(device)
        with torch.no_grad():
            text_features = model.encode_text(text_tokens)
            text_features = text_features / text_features.norm(dim=-1, keepdim=True)
        return text_features.cpu().numpy()[0]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error processing text: {str(e)}")

@app.post("/embed/image")
async def get_image_embedding(file: bytes = File(...)):
    """Generate embedding for an image."""
    embedding = await app.state.loop.run_in_executor(
        executor, process_image, file
    )
    return {"embedding": embedding.tolist()}

@app.post("/embed/text")
async def get_text_embedding(request: TextRequest):
    """Generate embedding for text."""
    embedding = await app.state.loop.run_in_executor(
        executor, process_text, request.content
    )
    return {"embedding": embedding.tolist()}

@app.post("/batch_embed/text")
async def batch_get_text_embeddings(requests: List[TextRequest]):
    """Generate embeddings for multiple text inputs in parallel."""
    tasks = [
        app.state.loop.run_in_executor(executor, process_text, req.content)
        for req in requests
    ]
    
    embeddings = await asyncio.gather(*tasks, return_exceptions=True)
    
    results = []
    for embedding in embeddings:
        if isinstance(embedding, Exception):
            results.append({
                "error": str(embedding),
                "embedding": None
            })
        else:
            results.append({
                "error": None,
                "embedding": embedding.tolist()
            })
    
    return {"results": results}

@app.post("/batch_embed/images")
async def batch_get_image_embeddings(files: List[bytes] = File(...)):
    """Generate embeddings for multiple images in parallel."""
    tasks = [
        app.state.loop.run_in_executor(executor, process_image, file)
        for file in files
    ]
    
    embeddings = await asyncio.gather(*tasks, return_exceptions=True)
    
    results = []
    for embedding in embeddings:
        if isinstance(embedding, Exception):
            results.append({
                "error": str(embedding),
                "embedding": None
            })
        else:
            results.append({
                "error": None,
                "embedding": embedding.tolist()
            })
    
    return {"results": results}

@app.on_event("startup")
async def startup():
    app.state.loop = asyncio.get_running_loop()

if __name__ == "__main__":
    uvicorn.run("embed:app", host="0.0.0.0", port=8000, workers=1)
