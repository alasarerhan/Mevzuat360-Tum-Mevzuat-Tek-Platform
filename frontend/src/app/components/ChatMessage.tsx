import { Bot, User, Settings } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatMessageProps {
  role: "user" | "assistant" | "system";
  content: string;
  citations?: Array<{
    document_id: string;
    document_title: string;
    chunk_text: string;
    relevance_score: number;
  }>;
  isDarkMode?: boolean;
}

export function ChatMessage({ role, content, citations, isDarkMode }: ChatMessageProps) {
  const isSystem = role === "system";
  const isAssistant = role === "assistant";
  const sourceDocs = citations
    ? Array.from(new Map(citations.map((c) => [c.document_id, c])).values())
    : [];
  // Remove all inline citation tags — the bottom "Kaynaklar" section is enough.
  const renderedContent = content
    .replace(/\[Kaynak\s+\d+\]/gi, "")
    .replace(/\[[^\]]*\.pdf\]/gi, "")
    .replace(/  +/g, " ")
    .trim();

  return (
    <div
      className={`flex gap-4 px-4 py-6 ${isDarkMode ? 'text-neutral-100' : 'text-neutral-900'} ${isAssistant
        ? isDarkMode ? "bg-neutral-700/50" : "bg-neutral-50"
        : isSystem
          ? isDarkMode ? "bg-neutral-800/50" : "bg-neutral-50/50"
          : isDarkMode ? "bg-neutral-800" : ""
        }`}
    >
      <div className="flex-shrink-0">
        <div
          className={`size-8 rounded-full flex items-center justify-center ${isAssistant
            ? "bg-emerald-500 text-white"
            : isSystem
              ? isDarkMode ? "bg-neutral-600 text-neutral-300" : "bg-neutral-200 text-neutral-600"
              : isDarkMode ? "bg-neutral-600 text-white" : "bg-neutral-700 text-white"
            }`}
        >
          {isAssistant ? (
            <Bot className="size-5" />
          ) : isSystem ? (
            <Settings className="size-5" />
          ) : (
            <User className="size-5" />
          )}
        </div>
      </div>
      <div className="flex-1 space-y-2 overflow-hidden">
        <div className={`prose ${isDarkMode ? 'prose-invert' : 'prose-neutral'} max-w-none`}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline" />,
            }}
          >
            {renderedContent}
          </ReactMarkdown>
        </div>
        {isAssistant && sourceDocs.length > 0 && (
          <div className={`text-xs ${isDarkMode ? 'text-neutral-300' : 'text-neutral-600'}`}>
            <div className="font-semibold mb-2">Kaynaklar</div>
            <div className="space-y-1">
              {sourceDocs.map((source) => (
                <div key={source.document_id} className="flex items-start gap-2">
                  <span className="mt-0.5 size-1.5 rounded-full bg-neutral-400" />
                  <span>{source.document_title}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
