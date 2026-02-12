"""
LangGraph-based Agentic RAG Agent for Mevzuat (legislation) Q&A.
Implements: retrieve -> grade -> rewrite query -> generate with citations.
"""

import asyncio
import logging
import re
from typing import List, Dict, Any, Optional, TypedDict, AsyncGenerator

from langgraph.graph import StateGraph, END
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage

from app.core.llm import LLMClient, SYSTEM_PROMPTS
from app.core.vector_store import VectorStore
from app.models.database import Database

logger = logging.getLogger(__name__)


class AgentState(TypedDict):
    """State for the agent graph."""

    query: str
    conversation_id: str
    chat_history: List[Dict[str, str]]
    documents: List[Dict[str, Any]]
    citations: List[Dict[str, Any]]
    response: str
    needs_web_search: bool
    query_rewrite_count: int
    max_rewrites: int
    doc_filter: Optional[Dict[str, Any]]


class MevzuatAgent:
    """
    Agentic RAG agent for answering questions about Turkish legislation.

    Workflow:
    1. Retrieve relevant documents using hybrid search
    2. Grade documents for relevance
    3. If not enough relevant docs, rewrite query and retry
    4. Generate response with citations
    """

    def __init__(
        self,
        db: Database,
        vector_store: VectorStore,
        llm_client: LLMClient,
    ):
        self.db = db
        self.vector_store = vector_store
        self.llm = llm_client
        self._streaming_context: Optional[Dict[str, Any]] = None
        self.graph = self._build_graph()

    def _build_graph(self) -> StateGraph:
        """Build the LangGraph workflow."""
        workflow = StateGraph(AgentState)

        # Add nodes
        workflow.add_node("classify_intent", self._classify_intent_node)
        workflow.add_node("retrieve", self._retrieve_node)
        workflow.add_node("grade_documents", self._grade_documents_node)
        workflow.add_node("rewrite_query", self._rewrite_query_node)
        workflow.add_node("generate", self._generate_node)
        workflow.add_node("direct_response", self._direct_response_node)

        # Define edges
        workflow.set_entry_point("classify_intent")

        workflow.add_conditional_edges(
            "classify_intent",
            self._route_by_intent,
            {"search": "retrieve", "chat": "direct_response"},
        )

        workflow.add_edge("retrieve", "grade_documents")

        workflow.add_conditional_edges(
            "grade_documents",
            self._should_rewrite,
            {
                "rewrite": "rewrite_query",
                "generate": "generate",
            },
        )

        workflow.add_edge("rewrite_query", "retrieve")
        workflow.add_edge("generate", END)
        workflow.add_edge("direct_response", END)

        return workflow.compile()

    def _route_by_intent(self, state: AgentState) -> str:
        """Route based on whether query needs document search."""
        if state.get("needs_web_search", True):
            return "search"
        return "chat"

    async def _classify_intent_node(self, state: AgentState) -> Dict[str, Any]:
        """Classify whether query needs document search or is casual conversation."""
        query = state["query"].lower().strip()

        strict_casual = {
            "merhaba", "selam", "slm", "günaydın", "iyi akşamlar",
            "iyi geceler", "teşekkür", "teşekkürler", "sağol", "tşk",
            "bye", "görüşürüz",
        }

        cleaned_query = query.lower().strip(" .!,?")
        is_casual = cleaned_query in strict_casual

        if "kimsin" in cleaned_query or "nesin" in cleaned_query:
            is_casual = True

        logger.debug("Intent Classification: Query='%s' -> IsCasual=%s", query, is_casual)

        return {"needs_web_search": not is_casual}

    async def _direct_response_node(self, state: AgentState) -> Dict[str, Any]:
        """Generate a direct conversational response without document search."""
        query = state["query"]
        chat_history = state.get("chat_history", [])

        messages = [SystemMessage(content=SYSTEM_PROMPTS["general_chat"])]

        for msg in chat_history[-4:]:
            if msg["role"] == "user":
                messages.append(HumanMessage(content=msg["content"]))
            else:
                messages.append(AIMessage(content=msg["content"]))

        messages.append(HumanMessage(content=query))

        message_dicts = []
        for msg in messages:
            if isinstance(msg, SystemMessage):
                message_dicts.append({"role": "system", "content": msg.content})
            elif isinstance(msg, HumanMessage):
                message_dicts.append({"role": "user", "content": msg.content})
            elif isinstance(msg, AIMessage):
                message_dicts.append({"role": "assistant", "content": msg.content})

        response = await self.llm.generate(messages=message_dicts)

        return {"response": response, "documents": [], "citations": []}

    async def _retrieve_node(self, state: AgentState) -> Dict[str, Any]:
        """Retrieve relevant documents using hybrid search."""
        query = state["query"]
        doc_filter = state.get("doc_filter")

        results = await self.vector_store.hybrid_search(
            query=query, limit=10, vector_weight=0.7, keyword_weight=0.3,
            doc_filter=doc_filter,
        )

        # Batch-enrich results with document info
        doc_ids = list(set(r["document_id"] for r in results))
        docs_map = await self.db.get_documents_batch(doc_ids)

        enriched_results = []
        for result in results:
            doc = docs_map.get(result["document_id"])
            result["document_title"] = (
                doc.get("title", "Bilinmeyen Doküman") if doc else "Bilinmeyen Doküman"
            )
            enriched_results.append(result)

        return {"documents": enriched_results}

    async def _grade_documents_node(self, state: AgentState) -> Dict[str, Any]:
        """Grade retrieved documents for relevance using parallel LLM calls."""
        query = state["query"]
        documents = state["documents"]

        if not documents:
            return {"documents": [], "needs_web_search": True}

        async def grade_single(doc: Dict[str, Any]) -> Optional[Dict[str, Any]]:
            messages = [
                {"role": "system", "content": SYSTEM_PROMPTS["document_grader"]},
                {
                    "role": "user",
                    "content": f"""Soru: {query}

Doküman:
{doc['content'][:1000]}

Bu doküman soruyla ilgili mi?""",
                },
            ]
            try:
                grade = await self.llm.generate(
                    messages, temperature=0.0, max_tokens=20
                )
                return doc if "RELEVANT" in grade.upper() else None
            except Exception as e:
                logger.warning("Grading error: %s", e)
                return doc  # Optimistic on error

        # Grade all documents in parallel
        results = await asyncio.gather(*[grade_single(doc) for doc in documents])
        relevant_docs = [doc for doc in results if doc is not None]

        needs_rewrite = len(relevant_docs) < 2

        return {
            "documents": relevant_docs,
            "needs_web_search": needs_rewrite
            and state["query_rewrite_count"] >= state["max_rewrites"],
        }

    async def _rewrite_query_node(self, state: AgentState) -> Dict[str, Any]:
        """Rewrite query for better retrieval."""
        original_query = state["query"]

        messages = [
            {"role": "system", "content": SYSTEM_PROMPTS["query_rewriter"]},
            {
                "role": "user",
                "content": f"""Orijinal soru: {original_query}

Mevzuat araması için bu soruyu daha etkili hale getir.
Sadece yeni sorguyu yaz, başka açıklama yapma.""",
            },
        ]

        try:
            rewritten = await self.llm.generate(
                messages, temperature=0.3, max_tokens=100
            )
            return {
                "query": rewritten.strip(),
                "query_rewrite_count": state["query_rewrite_count"] + 1,
                "documents": [],  # Clear documents for new search
            }
        except Exception as e:
            logger.warning("Query rewrite error: %s", e)
            return {"query_rewrite_count": state["query_rewrite_count"] + 1}

    def _build_generate_messages(
        self, state: AgentState
    ) -> tuple:
        """Build messages and citations for generation, without calling LLM."""
        query = state["query"]
        documents = state["documents"]
        chat_history = state.get("chat_history", [])

        if documents:
            context_parts = []
            citations = []

            for i, doc in enumerate(documents[:5]):
                context_parts.append(
                    f"[Kaynak {i+1}] {doc['document_title']}:\n{doc['content']}"
                )
                citations.append(
                    {
                        "document_id": doc["document_id"],
                        "document_title": doc["document_title"],
                        "chunk_text": doc["content"][:200] + "..."
                        if len(doc["content"]) > 200
                        else doc["content"],
                        "relevance_score": doc.get("score", 0.0),
                    }
                )

            context = "\n\n---\n\n".join(context_parts)
        else:
            context = "İlgili doküman bulunamadı."
            citations = []

        if not documents:
            messages = [
                {"role": "system", "content": SYSTEM_PROMPTS["general_chat"]},
            ]
            for msg in chat_history[-10:]:
                messages.append({"role": msg["role"], "content": msg["content"]})
            messages.append({"role": "user", "content": query})
        else:
            messages = [
                {"role": "system", "content": SYSTEM_PROMPTS["mevzuat_agent"]},
            ]
            for msg in chat_history[-10:]:
                messages.append({"role": msg["role"], "content": msg["content"]})
            messages.append(
                {
                    "role": "user",
                    "content": f"""Kaynaklar:
{context}

---

Kullanıcı sorusu: {query}

Yukarıdaki kaynaklara dayanarak soruyu yanıtla. Kaynak numaralarına atıfta bulun.""",
                }
            )

        return messages, citations

    async def _generate_node(self, state: AgentState) -> Dict[str, Any]:
        """Generate final response with citations."""
        messages, citations = self._build_generate_messages(state)

        # If streaming context is set, store messages for streaming and skip LLM call
        if self._streaming_context is not None:
            self._streaming_context["messages"] = messages
            return {"response": "", "citations": citations}

        try:
            response = await self.llm.generate(
                messages, temperature=0.7, max_tokens=2048
            )
            if not response or not response.strip():
                response = "Yanıt üretilemedi. LLM servisi boş yanıt döndürdü."
            else:
                response = self._clean_response(state["query"], response)
            return {"response": response, "citations": citations}
        except Exception as e:
            return {
                "response": f"Yanıt oluşturulurken bir hata oluştu: {str(e)}",
                "citations": [],
            }

    @staticmethod
    def _clean_response(query: str, response: str) -> str:
        """Remove echoed query from the beginning of the response."""
        normalized_query = query.strip()
        if normalized_query:
            escaped_query = re.escape(normalized_query)
            response = re.sub(
                rf"^\s*{escaped_query}\s*[:\-–—]?\s*\n+",
                "", response, count=1, flags=re.IGNORECASE,
            )
            response = re.sub(
                rf"^\s*{escaped_query}\s*[:\-–—]?\s*",
                "", response, count=1, flags=re.IGNORECASE,
            )
        return response

    def _should_rewrite(self, state: AgentState) -> str:
        """Decide whether to rewrite query or generate response."""
        documents = state.get("documents", [])
        rewrite_count = state.get("query_rewrite_count", 0)
        max_rewrites = state.get("max_rewrites", 2)

        if len(documents) >= 2 or rewrite_count >= max_rewrites:
            return "generate"

        return "rewrite"

    async def run(
        self,
        query: str,
        conversation_id: str,
        chat_history: Optional[List[Dict[str, str]]] = None,
        doc_filter: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Run the agent and return the result."""
        try:
            initial_state: AgentState = {
                "query": query,
                "conversation_id": conversation_id,
                "chat_history": chat_history or [],
                "documents": [],
                "citations": [],
                "response": "",
                "needs_web_search": False,
                "query_rewrite_count": 0,
                "max_rewrites": 2,
                "doc_filter": doc_filter,
            }

            logger.info("Running agent with query: %s", query[:50])
            result = await self.graph.ainvoke(initial_state)
            logger.info("Agent completed successfully")

            return {
                "response": result.get("response", ""),
                "citations": result.get("citations", []),
                "documents_used": len(result.get("documents", [])),
            }
        except Exception as e:
            logger.error("Agent run failed: %s", e, exc_info=True)
            raise

    async def run_stream(
        self,
        query: str,
        conversation_id: str,
        chat_history: Optional[List[Dict[str, str]]] = None,
        doc_filter: Optional[Dict[str, Any]] = None,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Run the agent with true streaming response."""
        # Enable streaming context so _generate_node skips the LLM call
        self._streaming_context = {}

        initial_state: AgentState = {
            "query": query,
            "conversation_id": conversation_id,
            "chat_history": chat_history or [],
            "documents": [],
            "citations": [],
            "response": "",
            "needs_web_search": False,
            "query_rewrite_count": 0,
            "max_rewrites": 2,
            "doc_filter": doc_filter,
        }

        try:
            async for event in self.graph.astream(initial_state):
                node_name = list(event.keys())[0]
                node_output = event[node_name]

                if node_name == "direct_response":
                    response = node_output.get("response", "")
                    yield {"type": "content", "content": response}
                    yield {
                        "type": "done",
                        "conversation_id": conversation_id,
                        "full_response": response,
                        "citations": [],
                    }
                    return

                if node_name == "generate":
                    citations = node_output.get("citations", [])
                    for citation in citations:
                        yield {"type": "citation", "citation": citation}

                    # Stream the LLM response using stored messages
                    messages = self._streaming_context.get("messages", [])
                    full_response = ""

                    if messages:
                        async for token in self.llm.generate_stream(
                            messages, temperature=0.7, max_tokens=2048
                        ):
                            full_response += token
                            yield {"type": "content", "content": token}

                        full_response = self._clean_response(query, full_response)
                    else:
                        full_response = node_output.get("response", "")
                        if full_response:
                            yield {"type": "content", "content": full_response}

                    yield {
                        "type": "done",
                        "conversation_id": conversation_id,
                        "full_response": full_response,
                        "citations": citations,
                    }
        finally:
            self._streaming_context = None
