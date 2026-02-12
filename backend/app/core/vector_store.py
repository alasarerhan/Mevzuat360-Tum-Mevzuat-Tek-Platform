"""
Vector store operations with hybrid search (vector + keyword).
Uses MongoDB Atlas Vector Search + text search for hybrid retrieval.
"""

import logging
import re
from typing import List, Dict, Any, Optional, Tuple

import numpy as np

from app.models.database import Database
from app.core.embeddings import EmbeddingService

logger = logging.getLogger(__name__)


class VectorStore:
    """Vector store with hybrid search capabilities."""

    def __init__(self, db: Database, embedding_service: EmbeddingService):
        self.db = db
        self.embedding_service = embedding_service

    async def add_documents(
        self,
        document_id: str,
        chunks: List[str],
        metadata: Optional[List[Dict[str, Any]]] = None,
    ) -> int:
        """Add document chunks with embeddings to the vector store."""
        if not chunks:
            return 0

        # Generate embeddings for all chunks
        embeddings = await self.embedding_service.embed_texts(chunks)

        # Prepare chunks with embeddings
        chunk_data = []
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            chunk_data.append(
                {
                    "content": chunk,
                    "embedding": embedding,
                    "chunk_index": i,
                    "metadata": metadata[i] if metadata and i < len(metadata) else {},
                }
            )

        # Store in database
        return await self.db.store_embeddings(document_id, chunk_data)

    async def vector_search(
        self,
        query: str,
        limit: int = 10,
        min_score: float = 0.0,
        doc_filter: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """Perform vector similarity search."""
        db = self.db.get_db()
        # Generate query embedding
        query_embedding = await self.embedding_service.embed_text(query)
        if not query_embedding or all(value == 0.0 for value in query_embedding):
            logger.warning("Empty or zero query embedding; skipping vector search.")
            return []

        # Perform vector search using MongoDB aggregation
        # Note: This requires MongoDB Atlas Vector Search index
        vector_search_stage = {
            "index": "vector_index",
            "path": "embedding",
            "queryVector": query_embedding,
            "numCandidates": limit * 10,
            "limit": limit,
        }

        # Add filter if provided
        if doc_filter:
            vector_search_stage["filter"] = doc_filter

        logger.debug("Vector Search Query: '%s'", query)
        logger.debug("Vector Search Filter: %s", doc_filter)

        pipeline: List[Dict[str, Any]] = [
            {"$vectorSearch": vector_search_stage},
            {
                "$project": {
                    "_id": 1,
                    "document_id": 1,
                    "content": 1,
                    "chunk_index": 1,
                    "metadata": 1,
                    "score": {"$meta": "vectorSearchScore"},
                }
            },
        ]

        try:
            cursor = db.embeddings.aggregate(pipeline)
            results = await cursor.to_list(length=limit)

            logger.debug("Vector Search Results Count: %d", len(results))
            if results:
                logger.debug("Top Result Score: %s", results[0]["score"])
            else:
                return await self._fallback_vector_search(
                    query_embedding, limit, min_score
                )

            # Filter by minimum score and serialize
            return [
                {
                    "id": str(r["_id"]),
                    "document_id": r["document_id"],
                    "content": r["content"],
                    "chunk_index": r.get("chunk_index", 0),
                    "metadata": r.get("metadata", {}),
                    "score": r["score"],
                    "search_type": "vector",
                }
                for r in results
                if r["score"] >= min_score
            ]
        except Exception as e:
            logger.error("Vector search error: %s", e)
            # Fallback to cosine similarity in memory (for non-Atlas deployments)
            return await self._fallback_vector_search(query_embedding, limit, min_score)

    async def keyword_search(
        self, query: str, limit: int = 10, doc_filter: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """Perform keyword-based text search."""
        db = self.db.get_db()
        # Return empty results if query is empty
        if not query or not query.strip():
            return []

        search_stage = {
            "index": "text_index",
            "text": {"query": query, "path": "content"},
        }

        pipeline: List[Dict[str, Any]] = [{"$search": search_stage}]

        # Apply filter as a $match stage after search
        if doc_filter:
            pipeline.append({"$match": doc_filter})

        pipeline.append(
            {
                "$project": {
                    "_id": 1,
                    "document_id": 1,
                    "content": 1,
                    "chunk_index": 1,
                    "metadata": 1,
                    "score": {"$meta": "searchScore"},
                }
            }
        )
        pipeline.append({"$limit": limit})

        try:
            cursor = db.embeddings.aggregate(pipeline)
            results = await cursor.to_list(length=limit)

            return [
                {
                    "id": str(r["_id"]),
                    "document_id": r["document_id"],
                    "content": r["content"],
                    "chunk_index": r.get("chunk_index", 0),
                    "metadata": r.get("metadata", {}),
                    "score": r.get("score", 0.0),
                    "search_type": "keyword",
                }
                for r in results
            ]
        except Exception as e:
            logger.error("Keyword search error: %s", e)
            # Fallback to regex search
            return await self._fallback_keyword_search(query, limit)

    async def hybrid_search(
        self,
        query: str,
        limit: int = 10,
        vector_weight: float = 0.7,
        keyword_weight: float = 0.3,
        doc_filter: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Perform hybrid search combining vector and keyword search.
        Uses Reciprocal Rank Fusion (RRF) for result combination.
        """
        # Get results from both search methods
        vector_results = await self.vector_search(query, limit=limit * 2, doc_filter=doc_filter)
        keyword_results = await self.keyword_search(
            query, limit=limit * 2, doc_filter=doc_filter
        )

        # Apply RRF (Reciprocal Rank Fusion)
        rrf_scores: Dict[str, Tuple[float, Dict]] = {}
        k = 60  # RRF constant

        # Score vector results
        for rank, result in enumerate(vector_results):
            chunk_id = result["id"]
            rrf_score = vector_weight / (k + rank + 1)
            if chunk_id in rrf_scores:
                rrf_scores[chunk_id] = (rrf_scores[chunk_id][0] + rrf_score, result)
            else:
                rrf_scores[chunk_id] = (rrf_score, result)

        # Score keyword results
        for rank, result in enumerate(keyword_results):
            chunk_id = result["id"]
            rrf_score = keyword_weight / (k + rank + 1)
            if chunk_id in rrf_scores:
                rrf_scores[chunk_id] = (rrf_scores[chunk_id][0] + rrf_score, result)
            else:
                rrf_scores[chunk_id] = (rrf_score, result)

        # Sort by RRF score and return top results
        sorted_results = sorted(
            rrf_scores.items(), key=lambda x: x[1][0], reverse=True
        )[:limit]

        return [
            {**item[1][1], "score": item[1][0], "search_type": "hybrid"}
            for item in sorted_results
        ]

    async def _fallback_vector_search(
        self, query_embedding: List[float], limit: int, min_score: float
    ) -> List[Dict[str, Any]]:
        """Fallback vector search using in-memory cosine similarity."""
        FALLBACK_LIMIT = 1000
        logger.warning(
            "Using fallback in-memory vector search. This is inefficient for large "
            "collections. Configure MongoDB Atlas Vector Search index for production."
        )
        cursor = self.db.get_db().embeddings.find(
            {},
            {"embedding": 1, "_id": 1, "document_id": 1, "content": 1,
             "chunk_index": 1, "metadata": 1},
        ).limit(FALLBACK_LIMIT)
        all_docs = await cursor.to_list(length=FALLBACK_LIMIT)

        if not all_docs:
            return []

        # Calculate cosine similarities
        query_vec = np.array(query_embedding)
        results = []

        for doc in all_docs:
            if "embedding" not in doc:
                continue
            doc_vec = np.array(doc["embedding"])
            similarity = np.dot(query_vec, doc_vec) / (
                np.linalg.norm(query_vec) * np.linalg.norm(doc_vec) + 1e-8
            )
            if similarity >= min_score:
                results.append(
                    {
                        "id": str(doc["_id"]),
                        "document_id": doc["document_id"],
                        "content": doc["content"],
                        "chunk_index": doc.get("chunk_index", 0),
                        "metadata": doc.get("metadata", {}),
                        "score": float(similarity),
                        "search_type": "vector",
                    }
                )

        # Sort by score and limit
        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:limit]

    async def _fallback_keyword_search(
        self, query: str, limit: int
    ) -> List[Dict[str, Any]]:
        """Fallback keyword search using regex."""
        # Simple keyword matching with escaped regex
        keywords = query.lower().split()
        regex_pattern = "|".join(re.escape(kw) for kw in keywords)

        cursor = (
            self.db.get_db()
            .embeddings.find({"content": {"$regex": regex_pattern, "$options": "i"}})
            .limit(limit)
        )

        results = await cursor.to_list(length=limit)

        return [
            {
                "id": str(r["_id"]),
                "document_id": r["document_id"],
                "content": r["content"],
                "chunk_index": r.get("chunk_index", 0),
                "metadata": r.get("metadata", {}),
                "score": 1.0,  # No scoring in fallback
                "search_type": "keyword",
            }
            for r in results
        ]
