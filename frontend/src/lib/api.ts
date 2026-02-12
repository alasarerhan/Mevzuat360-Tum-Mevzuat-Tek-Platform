
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface Citation {
    source: string;
    text: string;
    page?: number;
}

export interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    citations?: Citation[];
}

export interface Conversation {
    id: string;
    title: string;
    updated_at: string;
    messages: Message[];
}

export interface Document {
    id: string;
    title: string;
    filename: string;
    file_type: string;
    file_size: number;
    upload_date: string;
    status: string;
}

export type StreamChunk = {
    type: string;
    [key: string]: any;
};

export const api = {
    // Chat
    async streamMessage(message: string, conversationId?: string, documentId?: string, signal?: AbortSignal) {
        const response = await fetch(`${API_URL}/api/chat/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message,
                conversation_id: conversationId,
                document_id: documentId
            }),
            signal,
        });
        return response.body;
    },

    async *streamChat(message: string, conversationId?: string, documentId?: string, signal?: AbortSignal): AsyncGenerator<StreamChunk> {
        const body = await this.streamMessage(message, conversationId, documentId, signal);
        if (!body) {
            throw new Error('Streaming response body is empty');
        }

        const reader = body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split('\n\n');
            buffer = parts.pop() || '';

            for (const part of parts) {
                const lines = part.split('\n');
                for (const line of lines) {
                    if (!line.startsWith('data:')) {
                        continue;
                    }
                    const jsonText = line.replace(/^data:\s*/, '').trim();
                    if (!jsonText) {
                        continue;
                    }
                    yield JSON.parse(jsonText) as StreamChunk;
                }
            }
        }

        const tail = buffer.trim();
        if (tail.startsWith('data:')) {
            const jsonText = tail.replace(/^data:\s*/, '').trim();
            if (jsonText) {
                yield JSON.parse(jsonText) as StreamChunk;
            }
        }
    },

    // Conversations
    async getConversations() {
        const response = await axios.get(`${API_URL}/api/conversations`);
        return response.data;
    },

    async getConversation(id: string) {
        const response = await axios.get(`${API_URL}/api/conversations/${id}`);
        return response.data;
    },

    async searchConversations(query: string, limit: number = 20) {
        const response = await axios.get(`${API_URL}/api/conversations/search`, {
            params: { q: query, limit }
        });
        return response.data;
    },

    async deleteConversation(id: string) {
        const response = await axios.delete(`${API_URL}/api/conversations/${id}`);
        return response.data;
    },

    async updateConversationTitle(id: string, title: string) {
        const response = await axios.patch(`${API_URL}/api/conversations/${id}`, { title });
        return response.data;
    },

    // Documents
    async uploadDocument(file: File, isTemporary: boolean = false) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('temporary', String(isTemporary));

        // Use fetch instead of axios to avoid header conflicts
        const response = await fetch(`${API_URL}/api/documents/upload`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Upload failed');
        }

        return await response.json();
    },

    async getDocuments() {
        const response = await axios.get(`${API_URL}/api/documents`);
        return response.data;
    },

    async deleteDocument(id: string) {
        const response = await axios.delete(`${API_URL}/api/documents/${id}`);
        return response.data;
    },

    async getDocumentContent(id: string) {
        const response = await axios.get(`${API_URL}/api/documents/${id}/content`);
        return response.data;
    },

    async getDocumentPages(id: string) {
        const response = await axios.get(`${API_URL}/api/documents/${id}/pages`);
        return response.data as { id: string; pages: { page: number; text: string }[]; total_pages: number };
    },

    getDocumentDownloadUrl(id: string) {
        return `${API_URL}/api/documents/${id}/download`;
    }
};
