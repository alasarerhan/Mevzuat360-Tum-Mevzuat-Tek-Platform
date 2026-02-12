import { X, Search as SearchIcon, MessageSquare } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

interface Conversation {
  id: string;
  title: string;
  date: string;
}

interface SearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  conversations: Conversation[];
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  isDarkMode?: boolean;
}

export function SearchDialog({
  isOpen,
  onClose,
  conversations,
  onSelectConversation,
  onNewChat,
  isDarkMode = false,
}: SearchDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [remoteResults, setRemoteResults] = useState<Conversation[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<number | null>(null);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return "Bugün";
    if (date.toDateString() === yesterday.toDateString()) return "Dün";
    return date.toLocaleDateString("tr-TR", { month: "short", day: "numeric" });
  };

  useEffect(() => {
    if (!isOpen || !searchQuery.trim()) {
      setRemoteResults(null);
      setIsSearching(false);
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
      return;
    }

    setIsSearching(true);
    let isActive = true;
    debounceRef.current = window.setTimeout(async () => {
      try {
        const data = await api.searchConversations(searchQuery.trim(), 20);
        if (!isActive) {
          return;
        }

        const mapped: Conversation[] = data.map((item: any) => ({
          id: item.id,
          title: item.title || "Yeni Sohbet",
          date: formatDate(item.updated_at)
        }));

        setRemoteResults(mapped);
      } catch {
        if (isActive) {
          setRemoteResults([]);
        }
      } finally {
        if (isActive) {
          setIsSearching(false);
        }
      }
    }, 300);

    return () => {
      isActive = false;
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [searchQuery, isOpen]);

  if (!isOpen) return null;

  const filteredConversations = searchQuery.trim()
    ? (remoteResults || [])
    : conversations.filter((conv) =>
        conv.title.toLowerCase().includes(searchQuery.toLowerCase())
      );

  // Group conversations by date
  const groupedConversations = filteredConversations.reduce(
    (acc, conv) => {
      const group = conv.date;
      if (!acc[group]) {
        acc[group] = [];
      }
      acc[group].push(conv);
      return acc;
    },
    {} as Record<string, Conversation[]>
  );

  const handleSelectConversation = (id: string) => {
    onSelectConversation(id);
    onClose();
  };

  const handleNewChat = () => {
    onNewChat();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center pt-20 z-50"
      onClick={onClose}
    >
      <div
        className={`${isDarkMode ? 'bg-neutral-800 text-neutral-100' : 'bg-white text-neutral-900'} rounded-lg shadow-xl w-full max-w-2xl max-h-[70vh] flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className={`p-4 border-b ${isDarkMode ? 'border-neutral-700' : 'border-neutral-200'}`}>
          <div className="relative">
            <input
              type="text"
              placeholder="Sohbetleri ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
              className={`w-full px-4 py-2 pr-10 border rounded-lg focus:outline-none ${isDarkMode ? 'bg-neutral-700 border-neutral-600 text-neutral-100 placeholder:text-neutral-400 focus:border-neutral-500' : 'border-neutral-300 focus:border-neutral-400'}`}
            />
            <button
              onClick={onClose}
              className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 ${isDarkMode ? 'hover:bg-neutral-600' : 'hover:bg-neutral-100'} rounded transition-colors`}
            >
              <X className={`size-5 ${isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}`} />
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-2">
          {/* Yeni sohbet option */}
          <button
            onClick={handleNewChat}
            className={`w-full flex items-center gap-3 px-4 py-3 ${isDarkMode ? 'hover:bg-neutral-700' : 'hover:bg-neutral-100'} rounded-lg transition-colors text-left`}
          >
            <MessageSquare className={`size-5 ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`} />
            <span>Yeni sohbet</span>
          </button>

          {/* Grouped conversations */}
          {Object.entries(groupedConversations).map(([date, convs]) => (
            <div key={date} className="mt-4">
              <div className={`px-4 py-2 text-xs font-medium ${isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>
                {date}
              </div>
              {convs.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 ${isDarkMode ? 'hover:bg-neutral-700' : 'hover:bg-neutral-100'} rounded-lg transition-colors text-left`}
                >
                  <SearchIcon className={`size-5 ${isDarkMode ? 'text-neutral-500' : 'text-neutral-400'}`} />
                  <span className={`${isDarkMode ? 'text-neutral-200' : 'text-neutral-700'}`}>{conv.title}</span>
                </button>
              ))}
            </div>
          ))}

          {/* No results */}
          {filteredConversations.length === 0 && searchQuery && (
            <div className={`px-4 py-8 text-center ${isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>
              {isSearching ? "Aranıyor..." : "Sonuç bulunamadı"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
