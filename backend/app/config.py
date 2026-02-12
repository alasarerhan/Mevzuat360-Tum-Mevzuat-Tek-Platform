"""
Application configuration using Pydantic Settings.
"""

from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # MongoDB
    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_database: str = "mevzuat_agent"

    # LLM Configuration
    vllm_base_url: str = "http://localhost:8080/v1"
    vllm_model_name: str = "qwen2.5:7b"
    vllm_api_key: str = "dummy-key"

    # Embedding Configuration
    embedding_base_url: str = "http://localhost:8081/v1"
    embedding_model: str = "BAAI/bge-m3"
    embedding_dimension: int = 1024

    # Application Settings
    app_name: str = "Mevzuat Agent"
    app_env: str = "development"
    debug: bool = False
    cors_origins: str = "http://localhost:3000,http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176,http://127.0.0.1:3000,http://127.0.0.1:5173,http://127.0.0.1:5174,http://127.0.0.1:5175"

    # Document Processing
    max_upload_size_mb: int = 50
    chunk_size: int = 1000
    chunk_overlap: int = 200

    # Conversation Memory
    memory_max_history: int = 20
    memory_summary_trigger: int = 30

    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS origins as a list."""
        return [origin.strip() for origin in self.cors_origins.split(",")]


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
