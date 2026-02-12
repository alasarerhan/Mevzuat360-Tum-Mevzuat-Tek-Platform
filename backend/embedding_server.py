#!/usr/bin/env python
"""
Simple OpenAI-compatible embedding server using sentence-transformers
"""

import argparse
from typing import List
from fastapi import FastAPI
from pydantic import BaseModel
import uvicorn
from sentence_transformers import SentenceTransformer

app = FastAPI(title="Embedding Server", version="1.0.0")

# Load model
model = None
model_name = "BAAI/bge-m3"


class EmbeddingRequest(BaseModel):
    input: str | List[str]
    model: str = "BAAI/bge-m3"


class EmbeddingData(BaseModel):
    object: str = "embedding"
    embedding: List[float]
    index: int


class EmbeddingResponse(BaseModel):
    object: str = "list"
    data: List[EmbeddingData]
    model: str
    usage: dict


@app.on_event("startup")
async def load_model():
    global model, model_name
    print(f"Loading embedding model: {model_name}")
    model = SentenceTransformer(model_name, trust_remote_code=True)
    print("Model loaded successfully!")


@app.post("/v1/embeddings")
async def create_embeddings(request: EmbeddingRequest):
    if isinstance(request.input, str):
        texts = [request.input]
    else:
        texts = request.input

    if model is None:
        raise RuntimeError("Model not loaded")
    assert model is not None
    embeddings = model.encode(texts, normalize_embeddings=True)

    data = []
    for i, emb in enumerate(embeddings):
        data.append(EmbeddingData(embedding=emb.tolist(), index=i))

    return EmbeddingResponse(
        data=data,
        model=request.model,
        usage={
            "prompt_tokens": sum(len(t.split()) for t in texts),
            "total_tokens": sum(len(t.split()) for t in texts),
        },
    )


@app.get("/v1/models")
async def list_models():
    return {
        "object": "list",
        "data": [{"id": model_name, "object": "model", "owned_by": "local"}],
    }


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8081)
    parser.add_argument("--host", type=str, default="0.0.0.0")
    parser.add_argument("--model", type=str, default="BAAI/bge-m3")
    args = parser.parse_args()

    model_name = args.model
    uvicorn.run(app, host=args.host, port=args.port)
