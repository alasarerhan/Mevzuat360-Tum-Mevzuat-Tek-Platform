import { Send, Paperclip, Square } from "lucide-react";
import { useState } from "react";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  isStreaming?: boolean;
  onStop?: () => void;
  onAttach?: () => void;
  isDarkMode?: boolean;
  variant?: "default" | "landing";
}

export function ChatInput({ onSend, disabled, isStreaming, onStop, onAttach, isDarkMode, variant = "default" }: ChatInputProps) {
  const [message, setMessage] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !disabled && !isStreaming) {
      onSend(message.trim());
      setMessage("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (message.trim() && !disabled && !isStreaming) {
        onSend(message.trim());
        setMessage("");
      }
    }
  };

  const handleAttach = () => {
    if (onAttach) {
      onAttach();
    }
  };

  const isLanding = variant === "landing";

  return (
    <div className={
      isLanding
        ? "" // No wrapper styling for landing variant — parent handles layout
        : `${isDarkMode ? 'border-t border-neutral-700 bg-neutral-800' : 'border-t border-neutral-200 bg-white'} p-4`
    }>
      <form onSubmit={handleSubmit} className={isLanding ? "" : "max-w-3xl mx-auto"}>
        <div className={`relative flex items-end gap-2 border ${
          isLanding
            ? `${isDarkMode ? 'bg-neutral-700 border-neutral-600' : 'bg-white border-neutral-300'} rounded-2xl shadow-lg`
            : `${isDarkMode ? 'bg-neutral-700 border-neutral-600' : 'bg-white border-neutral-300'} rounded-2xl shadow-sm`
        } focus-within:border-neutral-400 transition-colors`}>
          <button
            type="button"
            onClick={handleAttach}
            className={`ml-2 mb-2 p-2 rounded-lg ${isDarkMode ? 'hover:bg-neutral-600' : 'hover:bg-neutral-100'} transition-colors`}
          >
            <Paperclip className={`size-5 ${isDarkMode ? 'text-neutral-300' : 'text-neutral-600'}`} />
          </button>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isLanding ? "Mevzuat hakkında bir soru sorun..." : "Mesaj..."}
            disabled={disabled}
            rows={1}
            className={`flex-1 py-3 bg-transparent resize-none focus:outline-none max-h-32 disabled:opacity-50 ${isDarkMode ? 'text-white placeholder:text-neutral-400' : ''}`}
            style={{
              minHeight: isLanding ? "52px" : "48px",
              maxHeight: "128px",
            }}
            autoFocus={isLanding}
          />
          <button
            type={isStreaming ? "button" : "submit"}
            onClick={isStreaming ? onStop : undefined}
            disabled={isStreaming ? !onStop : !message.trim() || disabled}
            className={`mb-2 mr-2 p-2 rounded-lg text-white transition-colors ${
              isStreaming
                ? 'bg-neutral-500 hover:bg-neutral-600'
                : message.trim() && !disabled
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-neutral-300 cursor-not-allowed'
            }`}
          >
            {isStreaming ? <Square className="size-4" /> : <Send className="size-5" />}
          </button>
        </div>
        {isLanding && (
          <p className={`text-xs text-center mt-3 ${isDarkMode ? 'text-neutral-500' : 'text-neutral-400'}`}>
            Mevzuat Asistanı yürürlükteki mevzuatlar hakkında bilgi sağlar.
          </p>
        )}
      </form>
    </div>
  );
}
