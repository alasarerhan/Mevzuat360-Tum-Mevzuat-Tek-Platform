import { useState, useEffect, useRef } from "react";
import { Menu, X } from "lucide-react";
import { Toaster, toast } from "sonner";
import { ChatSidebar } from "./components/ChatSidebar";
import { ChatMessage } from "./components/ChatMessage";
import { ChatInput } from "./components/ChatInput";
import { SearchDialog } from "./components/SearchDialog";
import { LibraryDialog } from "./components/LibraryDialog";
import { DocumentViewer } from "./components/DocumentViewer";
import { UploadDialog } from "./components/UploadDialog";
import { api } from "../lib/api";

// Adapters for Frontend interfaces
interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  citations?: Array<{
    document_id: string;
    document_title: string;
    chunk_text: string;
    relevance_score: number;
  }>;
}

interface Conversation {
  id: string;
  title: string;
  date: string;
  messages: Message[];
}

interface Document {
  id: string;
  name: string;
  uploadDate: string;
  size: string;
  fileType: string;
}

const STORAGE_KEYS = {
  conversations: "mevzuat.conversations",
  activeConversationId: "mevzuat.activeConversationId",
};

const isTempId = (value: string | null) => Boolean(value && value.startsWith("temp_"));

const loadConversations = (): Conversation[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.conversations);
    const parsed = raw ? (JSON.parse(raw) as Conversation[]) : [];
    return parsed.filter((conv) => !isTempId(conv.id));
  } catch {
    return [];
  }
};

const loadActiveConversationId = (): string | null => {
  // Always start with a fresh landing page on app open
  return null;
};

export default function App() {
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>(() => loadConversations());
  const [activeConversationId, setActiveConversationId] = useState<string | null>(() => loadActiveConversationId());
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Pending messages that are being sent (shown immediately, removed on confirmation)
  const [pendingMessages, setPendingMessages] = useState<{ convId: string | null, message: Message }[]>([]);
  const [streamingMessages, setStreamingMessages] = useState<{ convId: string | null, message: Message }[]>([]);

  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);

  const activeConversation = activeConversationId
    ? conversations.find((conv) => conv.id === activeConversationId)
    : null;

  const hasTransientMessages = pendingMessages.length > 0 || streamingMessages.length > 0;

  const activeDocument = activeDocumentId
    ? documents.find((doc) => doc.id === activeDocumentId)
    : null;

  const getSignature = (message: Message) => `${message.role}:${message.content.trim()}`;

  const addUniqueMessages = (existing: Message[], toAdd: Message[]) => {
    const existingSignatures = new Set(existing.map(getSignature));
    const unique: Message[] = [];

    for (const message of toAdd) {
      const signature = getSignature(message);
      if (!existingSignatures.has(signature)) {
        existingSignatures.add(signature);
        unique.push(message);
      }
    }

    return [...existing, ...unique];
  };

  // Fetch initial data
  useEffect(() => {
    fetchConversations();
    fetchDocuments();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.conversations, JSON.stringify(conversations));
    } catch {
      // Ignore storage failures (private mode or quota)
    }
  }, [conversations]);

  useEffect(() => {
    try {
      if (activeConversationId) {
        localStorage.setItem(STORAGE_KEYS.activeConversationId, activeConversationId);
      } else {
        localStorage.removeItem(STORAGE_KEYS.activeConversationId);
      }
    } catch {
      // Ignore storage failures (private mode or quota)
    }
  }, [activeConversationId]);

  // Fetch messages when active conversation changes — but NEVER during streaming.
  // During streaming the frontend already holds all state; fetching would cause
  // a re-render that resets pending/streaming messages and makes the UI freeze.
  useEffect(() => {
    if (activeConversationId && !activeConversationId.startsWith('temp_') && !isLoading) {
      fetchMessages(activeConversationId);
    }
  }, [activeConversationId, isLoading]);

  const fetchConversations = async () => {
    try {
      const data = await api.getConversations();

      // Merge backend data with existing local state to preserve messages
      setConversations(prevConversations => {
        const mapped: Conversation[] = data.map((item: any) => {
          // Find existing conversation to preserve its messages
          const existing = prevConversations.find(c => c.id === item.id);
          return {
            id: item.id,
            title: item.title || "Yeni Sohbet",
            date: formatDate(item.updated_at),
            messages: existing?.messages || [] // Keep existing messages, don't overwrite
          };
        });

        // Also keep any temp conversations that aren't in backend yet
        const tempConvs = prevConversations.filter(c => c.id.startsWith('temp_'));
        return [...tempConvs, ...mapped];
      });
    } catch (error) {
      console.error("Failed to fetch conversations:", error);
      toast.error("Sohbet geçmişi yüklenemedi");
    }
  };

  const fetchMessages = async (id: string) => {
    try {
      const data = await api.getConversation(id);
      if (data && data.messages) {
        setConversations(prev => prev.map(conv => {
          if (conv.id === id) {
            // Get existing local messages
            const existingMessages = conv.messages || [];

            // Map backend messages
            const backendMessages: Message[] = data.messages.map((msg: any) => ({
              id: msg.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              role: msg.role as "user" | "assistant" | "system",
              content: msg.content,
              citations: msg.citations || []
            }));

            // If no local messages, just use backend
            if (existingMessages.length === 0) {
              return { ...conv, messages: backendMessages };
            }

            // CONTENT-BASED DEDUPLICATION
            // Create a signature for each message based on role + content (trimmed)
            const getSignature = (m: Message) => `${m.role}:${m.content.trim()}`;
            const backendSignatures = new Set(backendMessages.map(getSignature));

            // Keep local messages that aren't in backend (by content, not ID)
            // This handles the case where local IDs differ from backend IDs
            const localOnlyMessages = existingMessages.filter(m =>
              !backendSignatures.has(getSignature(m))
            );

            // Backend is source of truth, add any truly local-only messages
            // (e.g., messages still being sent that backend hasn't received yet)
            return {
              ...conv,
              messages: [...backendMessages, ...localOnlyMessages]
            };
          }
          return conv;
        }));
      }
    } catch (error) {
      console.error("Failed to fetch messages:", error);
    }
  };

  const fetchDocuments = async () => {
    try {
      const data = await api.getDocuments();
      const mapped: Document[] = data.map((doc: any) => ({
        id: doc.id,
        name: doc.title || doc.filename,
        uploadDate: new Date(doc.created_at).toLocaleDateString("tr-TR"),
        size: formatFileSize(doc.file_size),
        fileType: doc.file_type || 'txt'
      }));
      setDocuments(mapped);
    } catch (error) {
      console.error("Failed to fetch documents:", error);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return "Bugün";
    if (date.toDateString() === yesterday.toDateString()) return "Dün";
    return date.toLocaleDateString("tr-TR", { month: "short", day: "numeric" });
  };

  const handleSendMessage = async (content: string) => {
    if (isLoading) {
      return;
    }
    const conversationIdAtStart = activeConversationId;
    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();

    const userMessage: Message = {
      id: `pending_${Date.now()}`,
      role: "user",
      content,
    };

    setPendingMessages(prev => [...prev, { convId: conversationIdAtStart, message: userMessage }]);

    const assistantMessageId = `streaming_${Date.now()}`;
    setStreamingMessages(prev => [
      ...prev,
      { convId: conversationIdAtStart, message: { id: assistantMessageId, role: "assistant", content: "" } }
    ]);

    setIsLoading(true);

    let currentConversationId = conversationIdAtStart;
    let fullResponse = "";
    let collectedCitations: Message["citations"] = [];

    try {
      for await (const chunk of api.streamChat(
        content,
        conversationIdAtStart || undefined,
        activeDocumentId || undefined,
        abortRef.current.signal
      )) {
        if (chunk.type === "conversation_id" && chunk.conversation_id) {
          const realConvId = chunk.conversation_id as string;
          if (!conversationIdAtStart && currentConversationId !== realConvId) {
            // Add conversation to sidebar but do NOT switch activeConversationId.
            // Switching mid-stream causes a render branch change that drops
            // pending/streaming messages (the classic "freeze" bug).
            const newConv: Conversation = {
              id: realConvId,
              title: content.slice(0, 30) + (content.length > 30 ? "..." : ""),
              date: "Bugün",
              messages: []
            };
            setConversations(prev => [newConv, ...prev]);
            // Keep pending/streaming convId as null so they stay visible in
            // the "no active conversation" render path.
            currentConversationId = realConvId;
          }
        }

        if (chunk.type === "content" && typeof chunk.content === "string") {
          fullResponse += chunk.content;
          setStreamingMessages(prev => prev.map(p =>
            p.message.id === assistantMessageId
              ? { ...p, message: { ...p.message, content: fullResponse } }
              : p
          ));
        }

        if (chunk.type === "citation" && chunk.citation) {
          collectedCitations = [...(collectedCitations || []), chunk.citation];
        }

        if (chunk.type === "error") {
          throw new Error(chunk.error || "Streaming error");
        }

        if (chunk.type === "done") {
          const finalCitations = chunk.citations || collectedCitations;
          const confirmedUserMessage: Message = {
            id: `user_${Date.now()}`,
            role: "user",
            content,
          };

          const assistantMessage: Message = {
            id: `assistant_${Date.now()}`,
            role: "assistant",
            content: fullResponse,
            citations: finalCitations,
          };

          setPendingMessages(prev => prev.filter(p => p.message.id !== userMessage.id));
          setStreamingMessages(prev => prev.filter(p => p.message.id !== assistantMessageId));

          if (currentConversationId) {
            setConversations(prev => prev.map(conv =>
              conv.id === currentConversationId
                ? {
                  ...conv,
                  messages: addUniqueMessages(conv.messages, [confirmedUserMessage, assistantMessage])
                }
                : conv
            ));
            // NOW switch to the conversation — streaming is complete,
            // messages are already in the conversation object.
            setActiveConversationId(currentConversationId);
          }
          break;
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        if (currentConversationId) {
          // Switch to conversation on abort too
          setActiveConversationId(currentConversationId);
          const finalCitations = collectedCitations || [];
          const confirmedUserMessage: Message = {
            id: `user_${Date.now()}`,
            role: "user",
            content,
          };

          const assistantMessage: Message | null = fullResponse.trim().length > 0
            ? {
              id: `assistant_${Date.now()}`,
              role: "assistant",
              content: fullResponse,
              citations: finalCitations,
            }
            : null;

          setConversations(prev => prev.map(conv =>
            conv.id === currentConversationId
              ? {
                ...conv,
                messages: addUniqueMessages(
                  conv.messages,
                  assistantMessage
                    ? [confirmedUserMessage, assistantMessage]
                    : [confirmedUserMessage]
                )
              }
              : conv
          ));
        }
      } else {
        console.error("Failed to send message:", error);
        toast.error("Mesaj gönderilemedi");
      }
      setPendingMessages(prev => prev.filter(p => p.message.id !== userMessage.id));
      setStreamingMessages(prev => prev.filter(p => p.message.id !== assistantMessageId));
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  };

  const handleStopGeneration = () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  };

  const handleNewChat = () => {
    setActiveConversationId(null);
    setActiveDocumentId(null); // Reset active document on new chat? Optional.
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      if (id.startsWith("temp_")) {
        setConversations(conversations.filter(conv => conv.id !== id));
        if (activeConversationId === id) {
          setActiveConversationId(null);
        }
        return;
      }
      await api.deleteConversation(id);
      const filteredConversations = conversations.filter(conv => conv.id !== id);
      setConversations(filteredConversations);
      if (activeConversationId === id) {
        setActiveConversationId(null);
      }
      toast.success("Sohbet silindi");
    } catch (error) {
      console.error("Failed to delete conversation:", error);
      toast.error("Sohbet silinemedi");
    }
  };

  const handleRenameConversation = async (id: string, newTitle: string) => {
    try {
      await api.updateConversationTitle(id, newTitle);
      setConversations(conversations.map(conv =>
        conv.id === id ? { ...conv, title: newTitle } : conv
      ));
    } catch (error) {
      console.error("Failed to rename:", error);
    }
  };

  const handleUploadDocuments = async (files: File[], isTemporary: boolean = false) => {
    const toastId = toast.loading("Döküman yükleniyor...");
    try {
      for (const file of files) {
        const response = await api.uploadDocument(file, isTemporary);

        if (isTemporary) {
          setActiveDocumentId(response.id);

          // Add to temp documents list if we want to show it in UI,
          // but mapped documents are from fetchDocuments() which filters temp ones usually.
          // Maybe we should add it to a separate "temp" list or just rely on activeDocumentId
          const tempDoc: Document = {
            id: response.id,
            name: response.title || response.filename,
            uploadDate: new Date().toLocaleDateString("tr-TR"),
            size: formatFileSize(response.file_size),
            fileType: response.file_type || 'txt'
          };
          setDocuments(prev => [...prev, tempDoc]);
        }
      }
      toast.success("Dökümanlar başarıyla yüklendi", { id: toastId });
      if (!isTemporary) {
        fetchDocuments(); // Refresh list for permanent docs
      }
    } catch (error) {
      console.error("Upload failed:", error);
      toast.error("Yükleme başarısız oldu", { id: toastId });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <div className={`h-screen w-full flex ${isDarkMode ? 'bg-neutral-950 text-neutral-100' : 'bg-white text-neutral-900'}`}>
      <Toaster position="top-center" />

      {/* Search Dialog */}
      <SearchDialog
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        conversations={conversations}
        onSelectConversation={setActiveConversationId}
        onNewChat={handleNewChat}
        isDarkMode={isDarkMode}
      />

      {/* Library Dialog */}
      <LibraryDialog
        isOpen={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
        documents={documents}
        onOpenDocument={setSelectedDocument}
        isDarkMode={isDarkMode}
      />

      {/* Document Viewer */}
      <DocumentViewer
        document={selectedDocument}
        onClose={() => setSelectedDocument(null)}
        isDarkMode={isDarkMode}
      />

      {/* Upload Dialog */}
      <UploadDialog
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUpload={handleUploadDocuments}
        isDarkMode={isDarkMode}
      />

      {/* Sidebar */}
      <ChatSidebar
        isExpanded={isSidebarExpanded}
        onToggle={() => setIsSidebarExpanded(!isSidebarExpanded)}
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={setActiveConversationId}
        onNewChat={handleNewChat}
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenLibrary={() => setIsLibraryOpen(true)}
        onOpenUpload={() => setIsUploadOpen(true)}
        isDarkMode={isDarkMode}
        onToggleTheme={() => setIsDarkMode(!isDarkMode)}
        onDeleteConversation={handleDeleteConversation}
        onRenameConversation={handleRenameConversation}
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Chat Header */}
        <div className={`flex items-center p-3 ${isDarkMode ? 'border-b border-neutral-700' : 'border-b border-neutral-200'}`}>
          <button
            onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
            className={`md:hidden p-2 rounded-lg ${isDarkMode ? 'hover:bg-neutral-700' : 'hover:bg-neutral-100'} transition-colors`}
          >
            <Menu className="size-5" />
          </button>
          <div className="ml-3 flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="bg-neutral-900 px-2 py-1 rounded">
                <img
                  src="/tim_logotype_dikey_TR_beyaz.jpg"
                  alt="TIM"
                  className="h-6 w-auto"
                />
              </div>
              <h1 className={`font-semibold ${isDarkMode ? 'text-white' : ''}`}>
                Mevzuat Asistanı
              </h1>
            </div>
            {activeDocument && (
              <div className="flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">
                <span className="truncate max-w-[200px]">{activeDocument.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveDocumentId(null);
                  }}
                  className="hover:bg-blue-200 rounded-full p-0.5"
                >
                  <X className="size-3" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Messages or Landing Page */}
        {(!activeConversation && !hasTransientMessages) ? (
          /* ── Landing Page (Grok/ChatGPT style) ── */
          <div className="flex-1 flex flex-col items-center justify-center px-4">
            <div className="flex flex-col items-center gap-6 mb-8 animate-fade-in">
              {/* TIM Logo */}
              <div className="bg-neutral-900 p-4 rounded-2xl shadow-lg">
                <img
                  src="/tim_logotype_yatay_TR.jpg"
                  alt="TIM"
                  className="h-16 w-auto"
                />
              </div>
              {/* Greeting */}
              <h1 className={`text-2xl font-semibold ${isDarkMode ? 'text-neutral-100' : 'text-neutral-800'}`}>
                Size nasıl yardımcı olabilirim?
              </h1>
            </div>

            {/* Centered Input */}
            <div className="w-full max-w-2xl">
              <ChatInput
                onSend={handleSendMessage}
                onAttach={() => setIsUploadOpen(true)}
                onStop={handleStopGeneration}
                isStreaming={isLoading}
                disabled={isLoading}
                isDarkMode={isDarkMode}
                variant="landing"
              />
            </div>
          </div>
        ) : (
          /* ── Chat View ── */
          <>
            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto">
              {activeConversation ? (
                <>
                  {activeConversation.messages.map((message) => (
                    <ChatMessage
                      key={message.id}
                      role={message.role}
                      content={message.content}
                      citations={message.citations}
                      isDarkMode={isDarkMode}
                    />
                  ))}
                  {/* Show pending messages for this conversation */}
                  {pendingMessages
                    .filter(p => p.convId === activeConversationId)
                    .filter(p => !activeConversation.messages.some(m => getSignature(m) === getSignature(p.message)))
                    .map(p => (
                      <div key={p.message.id} className="opacity-70">
                        <ChatMessage
                          role={p.message.role}
                          content={p.message.content}
                          citations={p.message.citations}
                          isDarkMode={isDarkMode}
                        />
                      </div>
                    ))}
                  {streamingMessages
                    .filter(p => p.convId === activeConversationId)
                    .map(p => (
                      <div key={p.message.id} className="opacity-80">
                        {p.message.content.trim().length > 0 ? (
                          <ChatMessage
                            role={p.message.role}
                            content={p.message.content}
                            citations={p.message.citations}
                            isDarkMode={isDarkMode}
                          />
                        ) : (
                          <div className="px-4 py-6 text-sm text-neutral-500 animate-pulse">
                            Yanıt hazırlanıyor...
                          </div>
                        )}
                      </div>
                    ))}
                </>
              ) : (
                <>
                  {pendingMessages.map(p => (
                    <div key={p.message.id} className="opacity-70">
                      <ChatMessage
                        role={p.message.role}
                        content={p.message.content}
                        citations={p.message.citations}
                        isDarkMode={isDarkMode}
                      />
                    </div>
                  ))}
                  {streamingMessages.map(p => (
                    <div key={p.message.id} className="opacity-80">
                      {p.message.content.trim().length > 0 ? (
                        <ChatMessage
                          role={p.message.role}
                          content={p.message.content}
                          citations={p.message.citations}
                          isDarkMode={isDarkMode}
                        />
                      ) : (
                        <div className="px-4 py-6 text-sm text-neutral-500 animate-pulse">
                          Yanıt hazırlanıyor...
                        </div>
                      )}
                    </div>
                  ))}
                  {isLoading && !streamingMessages.length && (
                    <div className="p-4 flex justify-center">
                      <div className="animate-pulse text-sm text-neutral-500">Yanıt hazırlanıyor...</div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Input (bottom bar) */}
            <ChatInput
              onSend={handleSendMessage}
              onAttach={() => setIsUploadOpen(true)}
              onStop={handleStopGeneration}
              isStreaming={isLoading}
              disabled={isLoading}
              isDarkMode={isDarkMode}
            />
          </>
        )}
      </div>
    </div>
  );
}
