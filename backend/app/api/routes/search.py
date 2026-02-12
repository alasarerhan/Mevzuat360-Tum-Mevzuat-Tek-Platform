"""
Search API routes for vector and hybrid search.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request

from app.models.schemas import SearchQuery, SearchResult, SearchResponse
from app.core.vector_store import VectorStore
from app.models.database import Database

logger = logging.getLogger(__name__)

router = APIRouter()


def get_vector_store(request: Request) -> VectorStore:
    """Get vector store instance from app state."""
    return request.app.state.vector_store


def get_db(request: Request) -> Database:
    """Get database from app state."""
    return request.app.state.db


async def _enrich_results(db: Database, results):
    """Batch-enrich search results with document titles."""
    doc_ids = list(set(r["document_id"] for r in results))
    docs_map = await db.get_documents_batch(doc_ids)
    for result in results:
        doc = docs_map.get(result["document_id"])
        result["document_title"] = (
            doc.get("title", "Bilinmeyen Doküman") if doc else "Bilinmeyen Doküman"
        )
    return results


@router.post("", response_model=SearchResponse)
async def search_documents(
    search_query: SearchQuery,
    vector_store: VectorStore = Depends(get_vector_store),
    request: Request = None,
):
    """Search documents using vector or hybrid search."""
    db = get_db(request)

    try:
        if search_query.use_hybrid:
            results = await vector_store.hybrid_search(
                query=search_query.query, limit=search_query.limit
            )
        else:
            results = await vector_store.vector_search(
                query=search_query.query, limit=search_query.limit
            )

        # Batch enrich with document titles
        results = await _enrich_results(db, results)

        search_results = [
            SearchResult(
                chunk_id=result["id"],
                document_id=result["document_id"],
                document_title=result.get("document_title", "Bilinmeyen Doküman"),
                content=result["content"],
                score=result.get("score", 0.0),
                search_type=result.get("search_type", "vector"),
            )
            for result in results
        ]

        return SearchResponse(
            query=search_query.query,
            results=search_results,
            total_results=len(search_results),
        )
    except Exception as e:
        logger.error("Search error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Arama sırasında bir hata oluştu.")


@router.get("/vector")
async def vector_search(
    q: str,
    limit: int = 10,
    vector_store: VectorStore = Depends(get_vector_store),
    request: Request = None,
):
    """Perform vector similarity search."""
    db = get_db(request)

    try:
        results = await vector_store.vector_search(query=q, limit=limit)
        results = await _enrich_results(db, results)
        return {"query": q, "results": results, "search_type": "vector"}
    except Exception as e:
        logger.error("Vector search error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Arama sırasında bir hata oluştu.")


@router.get("/keyword")
async def keyword_search(
    q: str,
    limit: int = 10,
    vector_store: VectorStore = Depends(get_vector_store),
    request: Request = None,
):
    """Perform keyword-based text search."""
    db = get_db(request)

    try:
        results = await vector_store.keyword_search(query=q, limit=limit)
        results = await _enrich_results(db, results)
        return {"query": q, "results": results, "search_type": "keyword"}
    except Exception as e:
        logger.error("Keyword search error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Arama sırasında bir hata oluştu.")


@router.get("/hybrid")
async def hybrid_search(
    q: str,
    limit: int = 10,
    vector_weight: float = 0.7,
    keyword_weight: float = 0.3,
    vector_store: VectorStore = Depends(get_vector_store),
    request: Request = None,
):
    """Perform hybrid search combining vector and keyword search."""
    db = get_db(request)

    try:
        results = await vector_store.hybrid_search(
            query=q,
            limit=limit,
            vector_weight=vector_weight,
            keyword_weight=keyword_weight,
        )
        results = await _enrich_results(db, results)

        return {
            "query": q,
            "results": results,
            "search_type": "hybrid",
            "weights": {"vector": vector_weight, "keyword": keyword_weight},
        }
    except Exception as e:
        logger.error("Hybrid search error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Arama sırasında bir hata oluştu.")
