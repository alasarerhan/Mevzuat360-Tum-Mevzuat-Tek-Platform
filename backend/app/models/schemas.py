"""
Pydantic schemas for request/response models.
"""

from datetime import datetime
from typing import List, Optional
from enum import Enum

from pydantic import BaseModel, Field


# ============== Enums ==============


class MessageRole(str, Enum):
    """Message role enum."""

    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class DocumentStatus(str, Enum):
    """Document processing status."""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


# ============== Message Schemas ==============


class MessageBase(BaseModel):
    """Base message schema."""

    content: str
    role: MessageRole = MessageRole.USER


class MessageCreate(MessageBase):
    """Create message request."""

    conversation_id: Optional[str] = None


class Citation(BaseModel):
    """Citation reference."""

    document_id: str
    document_title: str
    chunk_text: str
    relevance_score: float


class MessageResponse(MessageBase):
    """Message response with metadata."""

    id: str
    conversation_id: str
    citations: List[Citation] = []
    created_at: datetime

    class Config:
        from_attributes = True


# ============== Conversation Schemas ==============


class ConversationBase(BaseModel):
    """Base conversation schema."""

    title: Optional[str] = None


class ConversationCreate(ConversationBase):
    """Create conversation request."""

    pass


class ConversationUpdate(BaseModel):
    """Update conversation request."""

    title: Optional[str] = None


class ConversationResponse(ConversationBase):
    """Conversation response."""

    id: str
    title: str
    message_count: int = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ConversationDetail(ConversationResponse):
    """Conversation with messages."""

    messages: List[MessageResponse] = []


# ============== Document Schemas ==============


class DocumentBase(BaseModel):
    """Base document schema."""

    title: str
    description: Optional[str] = None


class DocumentCreate(DocumentBase):
    """Create document request (used internally)."""

    filename: str
    file_type: str
    file_size: int


class DocumentResponse(DocumentBase):
    """Document response."""

    id: str
    filename: str
    file_type: str
    file_size: int
    chunk_count: int = 0
    status: DocumentStatus = DocumentStatus.PENDING
    created_at: datetime

    class Config:
        from_attributes = True


class DocumentChunk(BaseModel):
    """Document chunk with embedding."""

    id: str
    document_id: str
    content: str
    chunk_index: int
    metadata: dict = {}


# ============== Search Schemas ==============


class SearchQuery(BaseModel):
    """Search query request."""

    query: str
    limit: int = Field(default=10, ge=1, le=50)
    use_hybrid: bool = True


class SearchResult(BaseModel):
    """Search result item."""

    chunk_id: str
    document_id: str
    document_title: str
    content: str
    score: float
    search_type: str  # "vector", "keyword", or "hybrid"


class SearchResponse(BaseModel):
    """Search response."""

    query: str
    results: List[SearchResult]
    total_results: int


# ============== Chat Schemas ==============


class ChatRequest(BaseModel):
    """Chat request."""

    message: str
    conversation_id: Optional[str] = None
    document_id: Optional[str] = None


class ChatResponse(BaseModel):
    """Chat response (for non-streaming)."""

    message: MessageResponse
    conversation_id: str


class StreamingChunk(BaseModel):
    """Streaming response chunk."""

    type: str  # "content", "citation", "done", "error"
    content: Optional[str] = None
    citation: Optional[Citation] = None
    conversation_id: Optional[str] = None
    error: Optional[str] = None
