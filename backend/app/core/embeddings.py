"""
Embedding service using OpenAI-compatible API (supports local models like BGE-M3).
"""

from typing import List, Optional
import httpx

from app.config import get_settings


class EmbeddingService:
    """Service for generating text embeddings."""

    def __init__(
        self,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        api_key: Optional[str] = None,
        dimension: Optional[int] = None,
    ):
        settings = get_settings()
        self.base_url = base_url or settings.embedding_base_url
        self.model = model or settings.embedding_model
        self.api_key = api_key or settings.vllm_api_key
        self.dimension = (
            settings.embedding_dimension if dimension is None else dimension
        )

        self.client = httpx.AsyncClient(
            base_url=self.base_url,
            headers={"Authorization": f"Bearer {self.api_key}"},
            timeout=60.0,
        )

    async def embed_text(self, text: str) -> List[float]:
        """Generate embedding for a single text."""
        embeddings = await self.embed_texts([text])
        return embeddings[0] if embeddings else []

    async def embed_texts(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for multiple texts."""
        if not texts:
            return []

        try:
            response = await self.client.post(
                "/embeddings",
                json={
                    "model": self.model,
                    "input": texts,
                },
            )
            response.raise_for_status()
            data = response.json()

            # Sort by index to maintain order
            embeddings_data = sorted(data["data"], key=lambda x: x["index"])
            return [item["embedding"] for item in embeddings_data]

        except httpx.HTTPError as e:
            print(f"Embedding API error: {e}")
            # Return empty list to signal embedding failure
            return []

    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()


