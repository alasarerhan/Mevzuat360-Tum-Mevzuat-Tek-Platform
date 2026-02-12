"""
MongoDB database connection and collections.
"""

from datetime import datetime
from typing import Optional, List, Dict, Any

from motor.motor_asyncio import (
    AsyncIOMotorClient,
    AsyncIOMotorDatabase,
    AsyncIOMotorGridFSBucket,
)
from bson import ObjectId


class Database:
    """MongoDB database connection manager."""

    def __init__(self, uri: str, database_name: str):
        self.uri = uri
        self.database_name = database_name
        self.client: Optional[AsyncIOMotorClient] = None
        self.db: Optional[AsyncIOMotorDatabase] = None
        self.fs: Optional[AsyncIOMotorGridFSBucket] = None

    def get_db(self) -> AsyncIOMotorDatabase:
        if self.db is None:
            raise RuntimeError("Database is not connected")
        return self.db

    def get_fs(self) -> AsyncIOMotorGridFSBucket:
        if self.fs is None:
            raise RuntimeError("GridFS is not initialized")
        return self.fs

    async def connect(self) -> None:
        """Connect to MongoDB."""
        self.client = AsyncIOMotorClient(self.uri)
        self.db = self.client[self.database_name]
        self.fs = AsyncIOMotorGridFSBucket(self.db)

        # Create indexes
        await self._create_indexes()

        print(f"Connected to MongoDB: {self.database_name}")

    async def disconnect(self) -> None:
        """Disconnect from MongoDB."""
        if self.client:
            self.client.close()
            print("Disconnected from MongoDB")

    async def _create_indexes(self) -> None:
        """Create necessary indexes."""
        db = self.get_db()
        # Conversations indexes
        await db.conversations.create_index("created_at")
        await db.conversations.create_index("updated_at")

        # Messages indexes
        await db.messages.create_index("conversation_id")
        await db.messages.create_index("created_at")

        # Documents indexes
        await db.documents.create_index("created_at")
        await db.documents.create_index("status")
        await db.documents.create_index("file_hash")
        await db.documents.create_index("is_temporary")

        # Embeddings indexes
        await db.embeddings.create_index("document_id")
        await db.embeddings.create_index("chunk_index")

        # Full-text search index for conversations
        await db.messages.create_index([("content", "text")])

    # ============== Conversations ==============

    async def create_conversation(self, title: Optional[str] = None) -> Dict[str, Any]:
        """Create a new conversation."""
        db = self.get_db()
        now = datetime.utcnow()
        doc = {
            "title": title or "Yeni Konuşma",
            "message_count": 0,
            "created_at": now,
            "updated_at": now,
        }
        result = await db.conversations.insert_one(doc)
        doc["_id"] = result.inserted_id
        return self._serialize_doc(doc)

    async def get_conversation(self, conversation_id: str) -> Optional[Dict[str, Any]]:
        """Get conversation by ID."""
        db = self.get_db()
        # Validate ObjectId format (24-char hex string)
        if not ObjectId.is_valid(conversation_id):
            return None

        doc = await db.conversations.find_one({"_id": ObjectId(conversation_id)})
        return self._serialize_doc(doc) if doc else None

    async def list_conversations(
        self, skip: int = 0, limit: int = 50
    ) -> List[Dict[str, Any]]:
        """List all conversations ordered by updated_at."""
        db = self.get_db()
        cursor = db.conversations.find().sort("updated_at", -1).skip(skip).limit(limit)
        docs = await cursor.to_list(length=limit)
        return [self._serialize_doc(doc) for doc in docs]

    async def update_conversation(
        self, conversation_id: str, updates: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Update conversation."""
        db = self.get_db()
        updates["updated_at"] = datetime.utcnow()
        result = await db.conversations.find_one_and_update(
            {"_id": ObjectId(conversation_id)}, {"$set": updates}, return_document=True
        )
        return self._serialize_doc(result) if result else None

    async def delete_conversation(self, conversation_id: str) -> bool:
        """Delete conversation and its messages."""
        db = self.get_db()
        if not ObjectId.is_valid(conversation_id):
            return False
        # Delete messages
        await db.messages.delete_many({"conversation_id": conversation_id})
        # Delete conversation
        result = await db.conversations.delete_one({"_id": ObjectId(conversation_id)})
        return result.deleted_count > 0

    async def search_conversations(
        self, query: str, limit: int = 20
    ) -> List[Dict[str, Any]]:
        """Search conversations by message content."""
        db = self.get_db()
        # Return empty results if query is empty
        if not query or not query.strip():
            return []

        # Find messages matching the query
        message_cursor = (
            db.messages.find(
                {"$text": {"$search": query}}, {"score": {"$meta": "textScore"}}
            )
            .sort([("score", {"$meta": "textScore"})])
            .limit(limit)
        )

        messages = await message_cursor.to_list(length=limit)

        # Get unique conversation IDs
        conv_ids = list(set(msg["conversation_id"] for msg in messages))

        # Get conversations
        if conv_ids:
            conv_cursor = db.conversations.find(
                {"_id": {"$in": [ObjectId(cid) for cid in conv_ids]}}
            )
            docs = await conv_cursor.to_list(length=len(conv_ids))
            return [self._serialize_doc(doc) for doc in docs]

        return []

    # ============== Messages ==============

    async def create_message(
        self,
        conversation_id: str,
        content: str,
        role: str,
        citations: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """Create a new message."""
        db = self.get_db()
        now = datetime.utcnow()
        doc = {
            "conversation_id": conversation_id,
            "content": content,
            "role": role,
            "citations": citations or [],
            "created_at": now,
        }
        result = await db.messages.insert_one(doc)
        doc["_id"] = result.inserted_id

        # Update conversation message count and timestamp
        await db.conversations.update_one(
            {"_id": ObjectId(conversation_id)},
            {"$inc": {"message_count": 1}, "$set": {"updated_at": now}},
        )

        return self._serialize_doc(doc)

    async def get_messages(
        self, conversation_id: str, limit: int = 100, descending: bool = False
    ) -> List[Dict[str, Any]]:
        """Get messages for a conversation."""
        db = self.get_db()
        sort_dir = -1 if descending else 1
        cursor = (
            db.messages.find({"conversation_id": conversation_id})
            .sort("created_at", sort_dir)
            .limit(limit)
        )
        docs = await cursor.to_list(length=limit)
        return [self._serialize_doc(doc) for doc in docs]

    # ============== Documents ==============

    async def create_document(self, document_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new document record."""
        db = self.get_db()
        now = datetime.utcnow()
        doc = {
            **document_data,
            "chunk_count": 0,
            "status": "pending",
            "created_at": now,
        }
        result = await db.documents.insert_one(doc)
        doc["_id"] = result.inserted_id
        return self._serialize_doc(doc)

    async def get_document(self, document_id: str) -> Optional[Dict[str, Any]]:
        """Get document by ID."""
        db = self.get_db()
        doc = await db.documents.find_one({"_id": ObjectId(document_id)})
        return self._serialize_doc(doc) if doc else None

    async def list_documents(
        self, skip: int = 0, limit: int = 50
    ) -> List[Dict[str, Any]]:
        """List all documents."""
        db = self.get_db()
        cursor = db.documents.find().sort("created_at", -1).skip(skip).limit(limit)
        docs = await cursor.to_list(length=limit)
        return [self._serialize_doc(doc) for doc in docs]

    async def update_document(
        self, document_id: str, updates: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Update document."""
        db = self.get_db()
        result = await db.documents.find_one_and_update(
            {"_id": ObjectId(document_id)}, {"$set": updates}, return_document=True
        )
        return self._serialize_doc(result) if result else None

    async def delete_document(self, document_id: str) -> bool:
        """Delete document and its embeddings."""
        db = self.get_db()
        # Delete embeddings
        await db.embeddings.delete_many({"document_id": document_id})
        # Delete document
        result = await db.documents.delete_one({"_id": ObjectId(document_id)})
        return result.deleted_count > 0

    # ============== Embeddings ==============

    async def store_embeddings(
        self, document_id: str, chunks: List[Dict[str, Any]]
    ) -> int:
        """Store document chunks with embeddings."""
        db = self.get_db()
        if not chunks:
            return 0

        docs = [
            {
                "document_id": document_id,
                "content": chunk["content"],
                "embedding": chunk["embedding"],
                "chunk_index": chunk["chunk_index"],
                "metadata": chunk.get("metadata", {}),
            }
            for chunk in chunks
        ]

        result = await db.embeddings.insert_many(docs)

        # Update document chunk count
        await db.documents.update_one(
            {"_id": ObjectId(document_id)},
            {"$set": {"chunk_count": len(chunks), "status": "completed"}},
        )

        return len(result.inserted_ids)

    async def get_embeddings_for_document(
        self, document_id: str
    ) -> List[Dict[str, Any]]:
        """Get all embeddings for a document."""
        db = self.get_db()
        cursor = db.embeddings.find({"document_id": document_id}).sort("chunk_index", 1)
        docs = await cursor.to_list(length=1000)
        return [self._serialize_doc(doc) for doc in docs]

    # ============== Helpers ==============

    @staticmethod
    def _serialize_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
        """Convert MongoDB document to serializable format."""
        doc["id"] = str(doc.pop("_id"))
        return doc
