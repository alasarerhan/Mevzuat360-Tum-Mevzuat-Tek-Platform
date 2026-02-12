import { X, Download, FileText, Loader2, Search, Maximize2, Minimize2, ChevronUp, ChevronDown } from "lucide-react";
import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { api } from "../../lib/api";

interface Document {
  id: string;
  name: string;
  uploadDate: string;
  size: string;
  fileType: string;
}

interface DocumentViewerProps {
  document: Document | null;
  onClose: () => void;
  isDarkMode?: boolean;
}

interface SearchSnippet {
  before: string;
  match: string;
  after: string;
  page: number;
}

export function DocumentViewer({ document, onClose, isDarkMode = false }: DocumentViewerProps) {
  const [content, setContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [matchIndex, setMatchIndex] = useState(0);
  const matchRefs = useRef<(HTMLElement | null)[]>([]);

  // PDF search: page-level text fetched on demand, results shown as overlay
  const [pdfPages, setPdfPages] = useState<{ page: number; text: string }[]>([]);
  const [pdfTextLoading, setPdfTextLoading] = useState(false);
  const [pdfTextFetched, setPdfTextFetched] = useState(false);
  const [showPdfSearchBar, setShowPdfSearchBar] = useState(false);
  const [pdfPageUrl, setPdfPageUrl] = useState<string>("");
  const snippetRefs = useRef<(HTMLDivElement | null)[]>([]);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const isPdf = document?.fileType === "pdf";

  // Set initial PDF url
  useEffect(() => {
    if (document && isPdf) {
      setPdfPageUrl(api.getDocumentDownloadUrl(document.id));
    }
  }, [document?.id, isPdf]);

  useEffect(() => {
    if (!document) {
      setContent("");
      setPdfPages([]);
      setPdfTextFetched(false);
      setError(null);
      setSearchQuery("");
      setShowPdfSearchBar(false);
      setPdfPageUrl("");
      return;
    }

    if (isPdf) return;

    const fetchContent = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await api.getDocumentContent(document.id);
        setContent(data.content || "");
      } catch (err: any) {
        console.error("Failed to fetch document content:", err);
        setError(err?.response?.data?.detail || "Doküman içeriği yüklenemedi");
      } finally {
        setIsLoading(false);
      }
    };

    fetchContent();
  }, [document?.id, document?.fileType]);

  // Open search bar for PDF & fetch page-level text on demand
  const openPdfSearch = useCallback(async () => {
    if (!document) return;
    setShowPdfSearchBar(true);
    if (pdfTextFetched) return;

    setPdfTextLoading(true);
    try {
      const data = await api.getDocumentPages(document.id);
      setPdfPages(data.pages || []);
    } catch {
      setPdfPages([]);
    } finally {
      setPdfTextLoading(false);
      setPdfTextFetched(true);
    }
  }, [document, pdfTextFetched]);

  const closePdfSearch = () => {
    setShowPdfSearchBar(false);
    setSearchQuery("");
    setMatchIndex(0);
  };

  // Navigate PDF iframe to a specific page
  const navigateToPage = useCallback((page: number) => {
    if (!document || !iframeRef.current) return;
    const baseUrl = api.getDocumentDownloadUrl(document.id);
    // Force iframe reload by setting src directly on the DOM element
    iframeRef.current.src = `${baseUrl}#page=${page}`;
  }, [document]);

  // Text content for non-PDF files
  const nonPdfMatches = useMemo(() => {
    if (isPdf || !searchQuery.trim() || !content) return [];
    const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return content.split(regex);
  }, [content, searchQuery, isPdf]);

  const nonPdfMatchCount = useMemo(() => {
    if (isPdf || !searchQuery.trim() || !content) return 0;
    const regex = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    return (content.match(regex) || []).length;
  }, [content, searchQuery, isPdf]);

  // PDF search snippets — search across pages, include page number
  const pdfSnippets = useMemo<SearchSnippet[]>(() => {
    if (!isPdf || !searchQuery.trim() || pdfPages.length === 0) return [];
    const snippets: SearchSnippet[] = [];
    const contextLen = 100;
    const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedQuery, 'gi');

    for (const pageData of pdfPages) {
      regex.lastIndex = 0;
      let m: RegExpExecArray | null;

      while (snippets.length < 200 && (m = regex.exec(pageData.text)) !== null) {
        const idx = m.index;
        const matchedText = m[0];

        const before = pageData.text.slice(Math.max(0, idx - contextLen), idx);
        const after = pageData.text.slice(idx + matchedText.length, idx + matchedText.length + contextLen);

        snippets.push({
          before: (idx > contextLen ? "..." : "") + before,
          match: matchedText,
          after: after + (idx + matchedText.length + contextLen < pageData.text.length ? "..." : ""),
          page: pageData.page,
        });
      }
    }

    return snippets;
  }, [pdfPages, searchQuery, isPdf]);

  // Scroll to active match (non-PDF)
  useEffect(() => {
    if (!isPdf && matchRefs.current[matchIndex]) {
      matchRefs.current[matchIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [matchIndex, searchQuery, isPdf]);

  // Scroll to active snippet (PDF)
  useEffect(() => {
    if (isPdf && snippetRefs.current[matchIndex]) {
      snippetRefs.current[matchIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [matchIndex, isPdf]);

  if (!document) return null;

  const handleDownload = () => {
    window.open(api.getDocumentDownloadUrl(document.id), '_blank');
  };

  const currentMatchCount = isPdf ? pdfSnippets.length : nonPdfMatchCount;

  let currentMatchIdx = 0;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className={`${isDarkMode ? 'bg-neutral-800 text-neutral-100' : 'bg-white text-neutral-900'} shadow-xl flex flex-col transition-all duration-200 ${
          isFullscreen
            ? 'w-full h-full rounded-none'
            : 'w-full max-w-5xl h-[90vh] rounded-lg'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b ${isDarkMode ? 'border-neutral-700' : 'border-neutral-200'}`}>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <FileText className="size-5 text-blue-600 flex-shrink-0" />
            <div className="min-w-0">
              <h2 className="font-semibold truncate">{document.name}</h2>
              <div className={`flex items-center gap-2 mt-0.5 text-xs ${isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>
                <span>{document.uploadDate}</span>
                <span>•</span>
                <span>{document.size}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Search bar — non-PDF always, PDF when toggled */}
            {(!isPdf || showPdfSearchBar) && (
              <div className="flex items-center gap-1">
                <div className="relative">
                  <Search className={`absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 ${isDarkMode ? 'text-neutral-500' : 'text-neutral-400'}`} />
                  <input
                    type="text"
                    placeholder="Ara..."
                    autoFocus={isPdf}
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setMatchIndex(0);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && currentMatchCount > 0) {
                        const nextIdx = (matchIndex + 1) % currentMatchCount;
                        setMatchIndex(nextIdx);
                        if (isPdf && pdfSnippets[nextIdx]) navigateToPage(pdfSnippets[nextIdx].page);
                      }
                      if (e.key === 'Escape' && isPdf) {
                        closePdfSearch();
                      }
                    }}
                    className={`pl-8 pr-3 py-1.5 text-sm rounded-lg border w-44 focus:outline-none ${isDarkMode ? 'bg-neutral-700 border-neutral-600 text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500' : 'bg-neutral-50 border-neutral-300 focus:border-neutral-400'}`}
                  />
                </div>
                {searchQuery && currentMatchCount > 0 && (
                  <span className={`text-xs whitespace-nowrap ${isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>
                    {matchIndex + 1}/{currentMatchCount}
                  </span>
                )}
                {searchQuery && currentMatchCount > 1 && (
                  <div className="flex items-center">
                    <button
                      onClick={() => {
                        const prevIdx = (matchIndex - 1 + currentMatchCount) % currentMatchCount;
                        setMatchIndex(prevIdx);
                        if (isPdf && pdfSnippets[prevIdx]) navigateToPage(pdfSnippets[prevIdx].page);
                      }}
                      className={`p-1 rounded transition-colors ${isDarkMode ? 'hover:bg-neutral-700' : 'hover:bg-neutral-100'}`}
                    >
                      <ChevronUp className={`size-3.5 ${isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}`} />
                    </button>
                    <button
                      onClick={() => {
                        const nextIdx = (matchIndex + 1) % currentMatchCount;
                        setMatchIndex(nextIdx);
                        if (isPdf && pdfSnippets[nextIdx]) navigateToPage(pdfSnippets[nextIdx].page);
                      }}
                      className={`p-1 rounded transition-colors ${isDarkMode ? 'hover:bg-neutral-700' : 'hover:bg-neutral-100'}`}
                    >
                      <ChevronDown className={`size-3.5 ${isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}`} />
                    </button>
                  </div>
                )}
                {isPdf && (
                  <button
                    onClick={closePdfSearch}
                    className={`p-1 rounded transition-colors ${isDarkMode ? 'hover:bg-neutral-700' : 'hover:bg-neutral-100'}`}
                    title="Aramayı kapat"
                  >
                    <X className={`size-3.5 ${isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}`} />
                  </button>
                )}
              </div>
            )}
            {/* Search button for PDF (when search bar is hidden) */}
            {isPdf && !showPdfSearchBar && (
              <button
                onClick={openPdfSearch}
                className={`p-2 ${isDarkMode ? 'hover:bg-neutral-700' : 'hover:bg-neutral-100'} rounded-lg transition-colors`}
                title="Dokümanda ara"
              >
                <Search className={`size-5 ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`} />
              </button>
            )}
            <button
              onClick={handleDownload}
              className={`p-2 ${isDarkMode ? 'hover:bg-neutral-700' : 'hover:bg-neutral-100'} rounded-lg transition-colors`}
              title="İndir"
            >
              <Download className={`size-5 ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`} />
            </button>
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className={`p-2 ${isDarkMode ? 'hover:bg-neutral-700' : 'hover:bg-neutral-100'} rounded-lg transition-colors`}
              title={isFullscreen ? "Küçült" : "Tam ekran"}
            >
              {isFullscreen ? (
                <Minimize2 className={`size-5 ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`} />
              ) : (
                <Maximize2 className={`size-5 ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`} />
              )}
            </button>
            <button
              onClick={onClose}
              className={`p-2 ${isDarkMode ? 'hover:bg-neutral-700' : 'hover:bg-neutral-100'} rounded-lg transition-colors`}
            >
              <X className={`size-5 ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`} />
            </button>
          </div>
        </div>

        {/* Document Content */}
        <div className="flex-1 overflow-hidden relative">
          {isPdf ? (
            <>
              {/* PDF iframe — ALWAYS visible */}
              <iframe
                ref={iframeRef}
                src={pdfPageUrl}
                className="w-full h-full border-0"
                title={document.name}
              />

              {/* PDF search results overlay panel (right side) */}
              {showPdfSearchBar && searchQuery.trim() && (
                <div
                  className={`absolute top-0 right-0 h-full w-80 flex flex-col border-l shadow-xl z-10 ${
                    isDarkMode ? 'bg-neutral-800/95 border-neutral-700' : 'bg-white/95 border-neutral-200'
                  }`}
                >
                  <div className={`px-3 py-2 border-b text-xs font-medium ${isDarkMode ? 'border-neutral-700 text-neutral-400' : 'border-neutral-200 text-neutral-500'}`}>
                    {pdfTextLoading ? "Aranıyor..." : `${pdfSnippets.length} sonuç bulundu`}
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {pdfTextLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="size-5 animate-spin text-blue-500" />
                      </div>
                    ) : pdfSnippets.length === 0 ? (
                      <div className={`text-center py-8 text-sm ${isDarkMode ? 'text-neutral-500' : 'text-neutral-400'}`}>
                        Sonuç bulunamadı
                      </div>
                    ) : (
                      pdfSnippets.map((snippet, i) => (
                        <div
                          key={i}
                          ref={(el) => { snippetRefs.current[i] = el; }}
                          onClick={() => {
                            setMatchIndex(i);
                            navigateToPage(snippet.page);
                          }}
                          className={`px-3 py-2.5 border-b cursor-pointer transition-colors text-xs leading-relaxed ${
                            i === matchIndex
                              ? isDarkMode ? 'bg-blue-900/40 border-neutral-600' : 'bg-blue-50 border-neutral-200'
                              : isDarkMode ? 'hover:bg-neutral-700/50 border-neutral-700/50' : 'hover:bg-neutral-50 border-neutral-100'
                          }`}
                        >
                          <div className={`mb-1 text-[10px] font-medium ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                            Sayfa {snippet.page}
                          </div>
                          <span className={isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}>{snippet.before}</span>
                          <mark className="bg-orange-400 text-black rounded px-0.5 font-medium">{snippet.match}</mark>
                          <span className={isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}>{snippet.after}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </>
          ) : isLoading ? (
            <div className={`flex flex-col items-center justify-center h-full gap-3 ${isDarkMode ? 'bg-neutral-900/50' : 'bg-neutral-50'}`}>
              <Loader2 className="size-8 animate-spin text-blue-500" />
              <p className={`text-sm ${isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>Doküman yükleniyor...</p>
            </div>
          ) : error ? (
            <div className={`flex flex-col items-center justify-center h-full gap-3 ${isDarkMode ? 'bg-neutral-900/50' : 'bg-neutral-50'}`}>
              <p className="text-red-500 text-sm">{error}</p>
            </div>
          ) : (
            <div className={`h-full overflow-y-auto p-6 ${isDarkMode ? 'bg-neutral-900/50' : 'bg-neutral-50'}`}>
              <div className={`${isDarkMode ? 'bg-neutral-800' : 'bg-white'} rounded-lg shadow-sm p-8 max-w-3xl mx-auto`}>
                <div className={`whitespace-pre-wrap text-sm leading-relaxed font-mono ${isDarkMode ? 'text-neutral-300' : 'text-neutral-700'}`}>
                  {nonPdfMatches.length > 0 ? (
                    nonPdfMatches.map((part, i) => {
                      if (part.toLowerCase() === searchQuery.toLowerCase()) {
                        const thisIdx = currentMatchIdx++;
                        const isActive = thisIdx === matchIndex;
                        return (
                          <mark
                            key={i}
                            ref={(el) => { matchRefs.current[thisIdx] = el; }}
                            className={`${isActive ? 'bg-orange-400' : 'bg-yellow-300'} text-black rounded px-0.5`}
                          >
                            {part}
                          </mark>
                        );
                      }
                      return <span key={i}>{part}</span>;
                    })
                  ) : (
                    content || "Doküman içeriği boş."
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
