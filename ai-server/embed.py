import sys
import torch
from PIL import Image
import clip
import io
from fastapi import FastAPI, HTTPException, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from concurrent.futures import ThreadPoolExecutor
import uvicorn
from typing import List, Tuple
import numpy as np
import asyncio
import face_recognition

# Initialize FastAPI app
app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Global model and preprocessing function
print("Loading CLIP model...", file=sys.stderr)
device = "cuda" if torch.cuda.is_available() else "cpu"
model, preprocess = clip.load("ViT-B/32", device=device)
print(f"Model loaded on {device}", file=sys.stderr)

# Thread pool for parallel processing
executor = ThreadPoolExecutor(max_workers=4)  # Adjust based on your CPU/GPU

class TextRequest(BaseModel):
    content: str

class FaceRecognitionResponse(BaseModel):
    faces: List[dict]
    count: int

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

def detect_faces(image_bytes: bytes) -> List[dict]:
    """
    Detect faces in an image and return face encodings with bounding boxes.
    Returns list of face data dictionaries.
    """
    try:
        # Load image using PIL and convert to RGB
        pil_image = Image.open(io.BytesIO(image_bytes))
        if pil_image.mode != 'RGB':
            pil_image = pil_image.convert('RGB')
        
        # Convert PIL image to numpy array
        image_array = np.array(pil_image)
        
        # Find face locations and encodings
        face_locations = face_recognition.face_locations(image_array, model="hog")
        face_encodings = face_recognition.face_encodings(image_array, face_locations)
        
        # Combine encodings with normalized bounding boxes
        results = []
        height, width = image_array.shape[:2]
        
        for encoding, (top, right, bottom, left) in zip(face_encodings, face_locations):
            # Normalize coordinates to 0-1 range
            norm_left = left / width
            norm_top = top / height
            norm_right = right / width
            norm_bottom = bottom / height
            
            results.append({
                "encoding": encoding.tolist(),
                "bbox": {
                    "left": norm_left,
                    "top": norm_top,
                    "right": norm_right,
                    "bottom": norm_bottom
                }
            })
        
        return results
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error detecting faces: {str(e)}")

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

@app.post("/faces/detect")
async def detect_faces_endpoint(file: bytes = File(...)):
    """Detect faces in an image and return face encodings with bounding boxes."""
    faces = await app.state.loop.run_in_executor(
        executor, detect_faces, file
    )
    return {"faces": faces, "count": len(faces)}

@app.post("/faces/batch_detect")
async def batch_detect_faces_endpoint(files: List[bytes] = File(...)):
    """Detect faces in multiple images in parallel."""
    tasks = [
        app.state.loop.run_in_executor(executor, detect_faces, file)
        for file in files
    ]
    
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    response_results = []
    for faces_result in results:
        if isinstance(faces_result, Exception):
            response_results.append({
                "error": str(faces_result),
                "faces": [],
                "count": 0
            })
        else:
            response_results.append({
                "error": None,
                "faces": faces_result,
                "count": len(faces_result)
            })
    
    return {"results": response_results}

@app.on_event("startup")
async def startup():
    app.state.loop = asyncio.get_running_loop()

if __name__ == "__main__":
    uvicorn.run("embed:app", host="0.0.0.0", port=8000, workers=1)
