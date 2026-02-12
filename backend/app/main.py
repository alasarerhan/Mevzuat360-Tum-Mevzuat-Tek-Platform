"""
FastAPI application entry point.
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.models.database import Database
from app.services.memory_service import MemoryService
from app.core.embeddings import EmbeddingService
from app.core.llm import LLMClient
from app.core.vector_store import VectorStore
from app.core.agent import MevzuatAgent
from app.api.routes import chat, documents, history, search


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator:
    """Application lifespan handler for startup/shutdown."""
    # Startup
    settings = get_settings()
    app.state.db = Database(settings.mongodb_uri, settings.mongodb_database)
    await app.state.db.connect()

    # Core services (singletons for app lifetime)
    app.state.embedding_service = EmbeddingService()
    app.state.llm_client = LLMClient()
    app.state.vector_store = VectorStore(app.state.db, app.state.embedding_service)
    app.state.agent = MevzuatAgent(
        app.state.db, app.state.vector_store, app.state.llm_client
    )
    app.state.memory = MemoryService(
        app.state.db, max_history=settings.memory_max_history
    )

    yield

    # Shutdown
    await app.state.llm_client.close()
    await app.state.embedding_service.close()
    await app.state.db.disconnect()


def create_app() -> FastAPI:
    """Create and configure FastAPI application."""
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        description="Mevzuat dokümanları üzerinde agentic search yapan AI asistan",
        version="1.0.0",
        lifespan=lifespan,
    )

    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include routers
    app.include_router(chat.router, prefix="/api/chat", tags=["Chat"])
    app.include_router(documents.router, prefix="/api/documents", tags=["Documents"])
    app.include_router(history.router, prefix="/api/conversations", tags=["History"])
    app.include_router(search.router, prefix="/api/search", tags=["Search"])
    if settings.debug:
        from app.api.routes import debug
        app.include_router(debug.router, prefix="/api/debug", tags=["Debug"])

    @app.get("/health")
    async def health_check():
        """Health check endpoint."""
        return {"status": "healthy", "app": settings.app_name}

    return app


app = create_app()
