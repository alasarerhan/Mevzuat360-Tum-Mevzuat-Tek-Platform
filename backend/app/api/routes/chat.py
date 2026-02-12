"""
Chat API routes.
"""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

logger = logging.getLogger(__name__)

from app.models.schemas import ChatRequest
from app.services.chat_service import ChatService


router = APIRouter()


def get_chat_service(request: Request) -> ChatService:
    """Get chat service instance from app state singletons."""
    return ChatService(
        db=request.app.state.db,
        agent=request.app.state.agent,
        memory=request.app.state.memory,
    )


@router.post("/stream")
async def stream_message(
    request_data: ChatRequest, chat_service: ChatService = Depends(get_chat_service)
):
    """Send a message and stream the response."""

    async def event_generator():
        try:
            async for chunk in chat_service.stream_message(
                message=request_data.message,
                conversation_id=request_data.conversation_id,
                document_id=request_data.document_id,
            ):
                yield f"data: {json.dumps(chunk)}\n\n"
        except Exception as e:
            logger.error("Chat stream error: %s", e, exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'error': 'Bir hata oluştu. Lütfen tekrar deneyin.'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@router.get("/{conversation_id}")
async def get_conversation(
    conversation_id: str, chat_service: ChatService = Depends(get_chat_service)
):
    """Get conversation with messages."""
    conversation = await chat_service.get_conversation(conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Konuşma bulunamadı")
    return conversation


@router.delete("/{conversation_id}")
async def delete_conversation(
    conversation_id: str, chat_service: ChatService = Depends(get_chat_service)
):
    """Delete a conversation."""
    deleted = await chat_service.delete_conversation(conversation_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Konuşma bulunamadı")
    return {"message": "Konuşma silindi"}
