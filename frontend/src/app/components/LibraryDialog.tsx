import { X, FileText, Search } from "lucide-react";
import { useState } from "react";

interface Document {
  id: string;
  name: string;
  uploadDate: string;
  size: string;
  fileType: string;
}

interface LibraryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  documents: Document[];
  onOpenDocument: (doc: Document) => void;
  isDarkMode?: boolean;
}

export function LibraryDialog({
  isOpen,
  onClose,
  documents,
  onOpenDocument,
  isDarkMode = false,
}: LibraryDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");

  if (!isOpen) return null;

  const filteredDocuments = documents.filter((doc) =>
    doc.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleOpenDocument = (doc: Document) => {
    onOpenDocument(doc);
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
        {/* Header */}
        <div className={`p-4 border-b ${isDarkMode ? 'border-neutral-700' : 'border-neutral-200'}`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Kütüphane</h2>
            <button
              onClick={onClose}
              className={`p-1 ${isDarkMode ? 'hover:bg-neutral-700' : 'hover:bg-neutral-100'} rounded transition-colors`}
            >
              <X className={`size-5 ${isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}`} />
            </button>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 size-4 ${isDarkMode ? 'text-neutral-500' : 'text-neutral-400'}`} />
            <input
              type="text"
              placeholder="Döküman ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none ${isDarkMode ? 'bg-neutral-700 border-neutral-600 text-neutral-100 placeholder:text-neutral-400 focus:border-neutral-500' : 'border-neutral-300 focus:border-neutral-400'}`}
            />
          </div>
        </div>

        {/* Documents List */}
        <div className="flex-1 overflow-y-auto p-2">
          {filteredDocuments.length > 0 ? (
            <div className="space-y-1">
              {filteredDocuments.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => handleOpenDocument(doc)}
                  className={`w-full flex items-start gap-3 px-4 py-3 ${isDarkMode ? 'hover:bg-neutral-700' : 'hover:bg-neutral-100'} rounded-lg transition-colors text-left`}
                >
                  <FileText className="size-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className={`${isDarkMode ? 'text-neutral-100' : 'text-neutral-900'} truncate`}>{doc.name}</p>
                    <div className={`flex items-center gap-2 mt-1 text-xs ${isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>
                      <span>{doc.uploadDate}</span>
                      <span>•</span>
                      <span>{doc.size}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className={`px-4 py-8 text-center ${isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>
              {searchQuery ? "Döküman bulunamadı" : "Henüz döküman yüklenmemiş"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
