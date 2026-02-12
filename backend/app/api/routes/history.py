"""
Conversation history API routes.
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, Query

from app.models.schemas import ConversationResponse, ConversationUpdate
from app.services.chat_service import ChatService


router = APIRouter()


def get_chat_service(request: Request) -> ChatService:
    """Get chat service instance from app state singletons."""
    return ChatService(
        db=request.app.state.db,
        agent=request.app.state.agent,
        memory=request.app.state.memory,
    )


@router.get("", response_model=List[ConversationResponse])
async def list_conversations(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    chat_service: ChatService = Depends(get_chat_service),
):
    """List all conversations ordered by most recent first."""
    conversations = await chat_service.list_conversations(skip=skip, limit=limit)

    return [
        ConversationResponse(
            id=conv["id"],
            title=conv["title"],
            message_count=conv.get("message_count", 0),
            created_at=conv["created_at"],
            updated_at=conv["updated_at"],
        )
        for conv in conversations
    ]


@router.get("/search")
async def search_conversations(
    q: str = Query(..., min_length=1, description="Arama sorgusu"),
    limit: int = Query(20, ge=1, le=50),
    chat_service: ChatService = Depends(get_chat_service),
):
    """Search conversations by message content."""
    conversations = await chat_service.search_conversations(query=q, limit=limit)

    return [
        ConversationResponse(
            id=conv["id"],
            title=conv["title"],
            message_count=conv.get("message_count", 0),
            created_at=conv["created_at"],
            updated_at=conv["updated_at"],
        )
        for conv in conversations
    ]


@router.get("/{conversation_id}")
async def get_conversation(
    conversation_id: str, chat_service: ChatService = Depends(get_chat_service)
):
    """Get conversation with all messages."""
    conversation = await chat_service.get_conversation(conversation_id)

    if not conversation:
        raise HTTPException(status_code=404, detail="Konuşma bulunamadı")

    return conversation


@router.patch("/{conversation_id}", response_model=ConversationResponse)
async def update_conversation(
    conversation_id: str,
    update_data: ConversationUpdate,
    chat_service: ChatService = Depends(get_chat_service),
):
    """Update conversation (e.g., rename)."""
    conversation = await chat_service.update_conversation(
        conversation_id=conversation_id, title=update_data.title
    )

    if not conversation:
        raise HTTPException(status_code=404, detail="Konuşma bulunamadı")

    return ConversationResponse(
        id=conversation["id"],
        title=conversation["title"],
        message_count=conversation.get("message_count", 0),
        created_at=conversation["created_at"],
        updated_at=conversation["updated_at"],
    )


@router.delete("/{conversation_id}")
async def delete_conversation(
    conversation_id: str, chat_service: ChatService = Depends(get_chat_service)
):
    """Delete a conversation and all its messages."""
    deleted = await chat_service.delete_conversation(conversation_id)

    if not deleted:
        raise HTTPException(status_code=404, detail="Konuşma bulunamadı")

    return {"message": "Konuşma silindi"}
