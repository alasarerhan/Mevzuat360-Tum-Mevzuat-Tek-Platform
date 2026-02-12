"""
Memory service for managing chat context and history.
"""

from typing import List, Dict, Any, Optional
from collections import deque

from app.models.database import Database


class MemoryService:
    """Service for managing conversation memory."""

    def __init__(self, db: Database, max_history: int = 20):
        self.db = db
        self.max_history = max_history
        self._cache: Dict[str, deque] = {}

    async def get_context(
        self, conversation_id: str, limit: Optional[int] = None
    ) -> List[Dict[str, str]]:
        """Get conversation context for LLM."""
        limit = limit or self.max_history

        # Check cache first
        if conversation_id in self._cache:
            cached = list(self._cache[conversation_id])
            return cached[-limit:]

        # Load from database
        messages = await self.db.get_messages(
            conversation_id, limit=limit, descending=True
        )
        messages.reverse()

        context = [{"role": msg["role"], "content": msg["content"]} for msg in messages]

        # Update cache
        self._cache[conversation_id] = deque(context, maxlen=self.max_history)

        return context

    async def add_message(self, conversation_id: str, role: str, content: str) -> None:
        """Add a message to memory."""
        message = {"role": role, "content": content}

        if conversation_id not in self._cache:
            self._cache[conversation_id] = deque(maxlen=self.max_history)

        self._cache[conversation_id].append(message)

    def clear_cache(self, conversation_id: Optional[str] = None) -> None:
        """Clear memory cache."""
        if conversation_id:
            self._cache.pop(conversation_id, None)
        else:
            self._cache.clear()

    async def summarize_history(self, conversation_id: str, llm_client: Any) -> str:
        """Summarize long conversation history for context compression."""
        context = await self.get_context(conversation_id)

        if len(context) < 10:
            # Not enough history to summarize
            return ""

        # Build history text
        history_text = "\n".join(
            [
                f"{msg['role'].upper()}: {msg['content']}"
                for msg in context[:-4]  # Exclude last 4 messages
            ]
        )

        # Get summary from LLM
        messages = [
            {
                "role": "system",
                "content": "Aşağıdaki konuşmayı kısa bir özet haline getir. Önemli bilgileri koru.",
            },
            {"role": "user", "content": f"Konuşma:\n{history_text}\n\nÖzet:"},
        ]

        try:
            summary = await llm_client.generate(
                messages=messages, temperature=0.3, max_tokens=500
            )
            return summary.strip()
        except Exception as e:
            print(f"Summary generation error: {e}")
            return ""
