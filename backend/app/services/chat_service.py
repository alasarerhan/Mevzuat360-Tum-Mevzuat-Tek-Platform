"""
Chat service for managing conversations and generating responses.
"""

from typing import List, Dict, Any, Optional, AsyncGenerator

from app.models.database import Database
from app.core.agent import MevzuatAgent
from app.services.memory_service import MemoryService
from app.config import get_settings


class ChatService:
    """Service for chat operations."""

    def __init__(
        self, db: Database, agent: MevzuatAgent, memory: Optional[MemoryService] = None
    ):
        self.db = db
        self.agent = agent
        self.memory = memory
        self.settings = get_settings()

    async def stream_message(
        self,
        message: str,
        conversation_id: Optional[str] = None,
        document_id: Optional[str] = None,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Send a message and stream the response."""
        # Create or get conversation
        if not conversation_id:
            conversation = await self.db.create_conversation()
            conversation_id = conversation["id"]
        assert conversation_id is not None

        # Get chat history (get last 20 messages)
        # Fetch in descending order (newest first) to get the latest context
        messages = await self.db.get_messages(
            conversation_id, limit=20, descending=True
        )
        # Reverse to chronological order (oldest to newest) for the agent
        messages.reverse()

        chat_history = [
            {"role": msg["role"], "content": msg["content"]} for msg in messages
        ]

        if self.memory:
            conversation_record = await self.db.get_conversation(conversation_id)
            message_count = (
                conversation_record.get("message_count", 0)
                if conversation_record
                else 0
            )
            if message_count >= self.settings.memory_summary_trigger:
                summary = await self.memory.summarize_history(
                    conversation_id, self.agent.llm
                )
                if summary:
                    chat_history = [
                        {"role": "system", "content": f"Konusma ozeti: {summary}"}
                    ] + chat_history

        # Store user message
        await self.db.create_message(
            conversation_id=conversation_id, content=message, role="user"
        )
        if self.memory:
            await self.memory.add_message(conversation_id, "user", message)

        # Yield conversation ID first
        yield {"type": "conversation_id", "conversation_id": conversation_id}

        full_response = ""
        all_citations: List[Dict[str, Any]] = []

        # Prepare filter
        filter = {"document_id": document_id} if document_id else None

        # Stream agent response
        async for chunk in self.agent.run_stream(
            query=message,
            conversation_id=conversation_id,
            chat_history=chat_history,
            filter=filter,
        ):
            if chunk["type"] == "content":
                full_response += chunk.get("content", "")
            elif chunk["type"] == "citation":
                citation = chunk.get("citation")
                if citation:
                    all_citations.append(citation)

            yield chunk

        # Store the complete assistant response
        if full_response:
            await self.db.create_message(
                conversation_id=conversation_id,
                content=full_response,
                role="assistant",
                citations=all_citations,
            )
            if self.memory:
                await self.memory.add_message(
                    conversation_id, "assistant", full_response
                )

        # Update conversation title if first message
        if len(messages) == 0:
            title = message[:50] + "..." if len(message) > 50 else message
            await self.db.update_conversation(conversation_id, {"title": title})

    async def get_conversation(self, conversation_id: str) -> Optional[Dict[str, Any]]:
        """Get conversation with messages."""
        conversation = await self.db.get_conversation(conversation_id)
        if not conversation:
            return None

        messages = await self.db.get_messages(conversation_id)
        conversation["messages"] = messages

        return conversation

    async def list_conversations(
        self, skip: int = 0, limit: int = 50
    ) -> List[Dict[str, Any]]:
        """List all conversations."""
        return await self.db.list_conversations(skip=skip, limit=limit)

    async def search_conversations(
        self, query: str, limit: int = 20
    ) -> List[Dict[str, Any]]:
        """Search conversations by content."""
        return await self.db.search_conversations(query=query, limit=limit)

    async def update_conversation(
        self, conversation_id: str, title: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Update conversation."""
        updates = {}
        if title:
            updates["title"] = title

        if updates:
            return await self.db.update_conversation(conversation_id, updates)

        return await self.db.get_conversation(conversation_id)

    async def delete_conversation(self, conversation_id: str) -> bool:
        """Delete conversation and its messages."""
        if conversation_id.startswith("temp_"):
            return False
        return await self.db.delete_conversation(conversation_id)
