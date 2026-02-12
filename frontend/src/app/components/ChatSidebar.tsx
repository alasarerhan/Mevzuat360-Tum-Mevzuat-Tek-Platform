import { MessageSquare, Plus, Menu, Search, Library, Upload, ChevronDown, Moon, Sun, MoreVertical, Trash2, Edit } from "lucide-react";
import { useState } from "react";

interface ChatSidebarProps {
  isExpanded: boolean;
  onToggle: () => void;
  conversations: Array<{ id: string; title: string; date: string }>;
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onOpenSearch: () => void;
  onOpenLibrary: () => void;
  onOpenUpload: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation: (id: string, newTitle: string) => void;
}

export function ChatSidebar({
  isExpanded,
  onToggle,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewChat,
  onOpenSearch,
  onOpenLibrary,
  onOpenUpload,
  isDarkMode,
  onToggleTheme,
  onDeleteConversation,
  onRenameConversation,
}: ChatSidebarProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const handleDeleteClick = (id: string) => {
    setDeleteConfirmId(id);
    setOpenMenuId(null);
  };

  const handleConfirmDelete = () => {
    if (deleteConfirmId) {
      onDeleteConversation(deleteConfirmId);
      setDeleteConfirmId(null);
    }
  };

  const handleRenameClick = (id: string, currentTitle: string) => {
    setRenameId(id);
    setRenameValue(currentTitle);
    setOpenMenuId(null);
  };

  const handleConfirmRename = () => {
    if (renameId && renameValue.trim()) {
      if (typeof onRenameConversation === 'function') {
        onRenameConversation(renameId, renameValue.trim());
      }
      setRenameId(null);
      setRenameValue("");
    }
  };

  return (
    <>
      <div
        className={`h-full ${isDarkMode ? 'bg-neutral-950 text-white' : 'bg-white text-neutral-700'} flex flex-col transition-all duration-300 ${isDarkMode ? 'border-r border-neutral-700' : 'border-r border-neutral-200'} ${isExpanded ? "w-64" : "w-0 md:w-16"
          }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3">
          {isExpanded ? (
            <>
              <button
                onClick={onToggle}
                className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'} transition-colors`}
              >
                <Menu className="size-5" />
              </button>
              <button
                onClick={onNewChat}
                className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'} transition-colors`}
              >
                <Plus className="size-5" />
              </button>
            </>
          ) : (
            <button
              onClick={onToggle}
              className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'} transition-colors mx-auto hidden md:block`}
            >
              <Menu className="size-5" />
            </button>
          )}
        </div>

        {/* Content */}
        {isExpanded && (
          <>
            {/* Yeni sohbet */}
            <div className="px-3 py-2">
              <button
                onClick={onNewChat}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg ${isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'} transition-colors text-sm`}
              >
                <MessageSquare className="size-4" />
                <span>Yeni sohbet</span>
              </button>
            </div>

            {/* Sohbetleri ara */}
            <div className="px-3 py-2">
              <button
                onClick={onOpenSearch}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg ${isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'} transition-colors text-sm`}
              >
                <Search className="size-4" />
                <span>Sohbetleri ara</span>
              </button>
            </div>

            {/* Kütüphane */}
            <div className="px-3 py-2">
              <button
                onClick={onOpenLibrary}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg ${isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'} transition-colors text-sm`}
              >
                <Library className="size-4" />
                <span>Kütüphane</span>
              </button>
            </div>

            {/* Döküman Yükle */}
            <div className="px-3 py-2">
              <button
                onClick={onOpenUpload}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg ${isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'} transition-colors text-sm`}
              >
                <Upload className="size-4" />
                <span>Döküman Yükle</span>
              </button>
            </div>

            {/* Divider */}
            <div className={`my-2 ${isDarkMode ? 'border-t border-neutral-700' : 'border-t border-neutral-200'}`}></div>

            {/* Sohbetlerin Section */}
            <div className="flex-1 overflow-y-auto">
              <div className="px-3 py-2">
                <button className={`w-full flex items-center justify-between px-3 py-1 text-xs ${isDarkMode ? 'text-neutral-400 hover:text-neutral-200' : 'text-neutral-500 hover:text-neutral-700'}`}>
                  <span>Sohbetlerin</span>
                  <ChevronDown className="size-3" />
                </button>
              </div>

              {/* Sohbetler Subsection */}
              <div className="px-3 space-y-1">
                {conversations.map((conv) => (
                  <div key={conv.id} className="relative group">
                    <div
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors text-sm ${activeConversationId === conv.id
                          ? isDarkMode ? "bg-neutral-800" : "bg-neutral-100"
                          : isDarkMode ? "hover:bg-neutral-800" : "hover:bg-neutral-100"
                        }`}
                    >
                      <button
                        onClick={() => onSelectConversation(conv.id)}
                        className="flex-1 text-left truncate"
                      >
                        {conv.title}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(openMenuId === conv.id ? null : conv.id);
                        }}
                        className={`p-1 rounded opacity-0 group-hover:opacity-100 ${isDarkMode ? 'hover:bg-neutral-700' : 'hover:bg-neutral-200'} transition-opacity`}
                      >
                        <MoreVertical className="size-4" />
                      </button>
                    </div>

                    {/* Dropdown Menu */}
                    {openMenuId === conv.id && (
                      <div className={`absolute right-0 mt-1 w-48 ${isDarkMode ? 'bg-neutral-800 border-neutral-700' : 'bg-white border-neutral-200'} border rounded-lg shadow-lg z-50`}>
                        <button
                          onClick={() => handleRenameClick(conv.id, conv.title)}
                          className={`w-full flex items-center gap-2 px-4 py-2 text-sm ${isDarkMode ? 'hover:bg-neutral-700 text-white' : 'hover:bg-neutral-100'} transition-colors`}
                        >
                          <Edit className="size-4" />
                          <span>Yeniden adlandır</span>
                        </button>
                        <button
                          onClick={() => handleDeleteClick(conv.id)}
                          className={`w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 ${isDarkMode ? 'hover:bg-neutral-700' : 'hover:bg-neutral-100'} transition-colors`}
                        >
                          <Trash2 className="size-4" />
                          <span>Sil</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Theme Toggle at Bottom */}
            <div className={`${isDarkMode ? 'border-t border-neutral-700' : 'border-t border-neutral-200'} p-3`}>
              <button
                onClick={onToggleTheme}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg ${isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'} transition-colors`}
              >
                {isDarkMode ? (
                  <>
                    <Sun className="size-5" />
                    <span className="text-sm">Light Mode</span>
                  </>
                ) : (
                  <>
                    <Moon className="size-5" />
                    <span className="text-sm">Dark Mode</span>
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setDeleteConfirmId(null)}>
          <div className={`${isDarkMode ? 'bg-neutral-800 text-white' : 'bg-white'} rounded-lg p-6 max-w-md w-full mx-4`} onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-semibold mb-4">Silmek istediğinize emin misiniz?</h2>
            <p className={`${isDarkMode ? 'text-neutral-300' : 'text-neutral-600'} mb-6`}>
              Bu sohbet kalıcı olarak silinecektir.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className={`px-4 py-2 rounded-lg ${isDarkMode ? 'bg-neutral-700 hover:bg-neutral-600' : 'bg-neutral-200 hover:bg-neutral-300'} transition-colors`}
              >
                İptal
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                Sil
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Dialog */}
      {renameId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setRenameId(null)}>
          <div className={`${isDarkMode ? 'bg-neutral-800 text-white' : 'bg-white'} rounded-lg p-6 max-w-md w-full mx-4`} onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-semibold mb-4">Yeniden adlandır</h2>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className={`w-full px-3 py-2 rounded-lg border ${isDarkMode ? 'bg-neutral-700 border-neutral-600 text-white' : 'bg-white border-neutral-300'} focus:outline-none focus:border-neutral-500 mb-6`}
              placeholder="Sohbet adı"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleConfirmRename();
                }
              }}
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setRenameId(null)}
                className={`px-4 py-2 rounded-lg ${isDarkMode ? 'bg-neutral-700 hover:bg-neutral-600' : 'bg-neutral-200 hover:bg-neutral-300'} transition-colors`}
              >
                İptal
              </button>
              <button
                onClick={handleConfirmRename}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
