import { X, Upload, FileText, Trash2 } from "lucide-react";
import { useState, useRef } from "react";

interface UploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (files: File[], isTemporary: boolean) => void;
  isDarkMode?: boolean;
}

export function UploadDialog({ isOpen, onClose, onUpload, isDarkMode = false }: UploadDialogProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isTemporary, setIsTemporary] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setSelectedFiles((prev) => [...prev, ...files]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files) {
      const files = Array.from(e.dataTransfer.files);
      setSelectedFiles((prev) => [...prev, ...files]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = () => {
    if (selectedFiles.length > 0) {
      onUpload(selectedFiles, isTemporary);
      setSelectedFiles([]);
      setIsTemporary(false);
      onClose();
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className={`${isDarkMode ? 'bg-neutral-800 text-neutral-100' : 'bg-white text-neutral-900'} rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b ${isDarkMode ? 'border-neutral-700' : 'border-neutral-200'}`}>
          <h2 className="text-lg font-semibold">Döküman Yükle</h2>
          <button
            onClick={onClose}
            className={`p-1 ${isDarkMode ? 'hover:bg-neutral-700' : 'hover:bg-neutral-100'} rounded transition-colors`}
          >
            <X className={`size-5 ${isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}`} />
          </button>
        </div>

        {/* Upload Area */}
        <div className="flex-1 overflow-y-auto p-6">
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${isDragging
                ? "border-blue-500 bg-blue-50"
                : isDarkMode ? "border-neutral-600 bg-neutral-700/50" : "border-neutral-300 bg-neutral-50"
              }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              accept=".pdf,.doc,.docx,.txt"
            />

            <div className="flex flex-col items-center gap-4">
              <div className={`size-16 rounded-full ${isDarkMode ? 'bg-blue-900/50' : 'bg-blue-100'} flex items-center justify-center`}>
                <Upload className="size-8 text-blue-600" />
              </div>

              <div>
                <p className={`${isDarkMode ? 'text-neutral-300' : 'text-neutral-700'} mb-2`}>
                  Dosyaları buraya sürükleyin veya
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Dosya Seç
                </button>
              </div>

              <p className={`text-sm ${isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>
                PDF, DOC, DOCX veya TXT formatlarında dosya yükleyebilirsiniz
              </p>
            </div>
          </div>

          {/* Selected Files List */}
          {selectedFiles.length > 0 && (
            <div className="mt-6">
              <h3 className={`text-sm font-semibold ${isDarkMode ? 'text-neutral-300' : 'text-neutral-700'} mb-3`}>
                Seçilen Dosyalar ({selectedFiles.length})
              </h3>
              <div className="space-y-2">
                {selectedFiles.map((file, index) => (
                  <div
                    key={index}
                    className={`flex items-center gap-3 p-3 ${isDarkMode ? 'bg-neutral-700 border-neutral-600' : 'bg-white border-neutral-200'} border rounded-lg`}
                  >
                    <FileText className="size-5 text-blue-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${isDarkMode ? 'text-neutral-100' : 'text-neutral-900'} truncate`}>
                        {file.name}
                      </p>
                      <p className={`text-xs ${isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                    <button
                      onClick={() => removeFile(index)}
                      className={`p-1 ${isDarkMode ? 'hover:bg-neutral-600' : 'hover:bg-neutral-100'} rounded transition-colors`}
                    >
                      <Trash2 className="size-4 text-red-600" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-between p-4 border-t ${isDarkMode ? 'border-neutral-700' : 'border-neutral-200'}`}>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isTemporary}
              onChange={(e) => setIsTemporary(e.target.checked)}
              className="rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
            />
            <span className={`text-sm ${isDarkMode ? 'text-neutral-300' : 'text-neutral-700'}`}>
              Sadece bu sohbet için kullan (Kütüphaneye kaydetme)
            </span>
          </label>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className={`px-4 py-2 ${isDarkMode ? 'text-neutral-300 hover:bg-neutral-700' : 'text-neutral-700 hover:bg-neutral-100'} rounded-lg transition-colors`}
            >
              İptal
            </button>
            <button
              onClick={handleUpload}
              disabled={selectedFiles.length === 0}
              className={`px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 ${isDarkMode ? 'disabled:bg-neutral-600' : 'disabled:bg-neutral-300'} disabled:cursor-not-allowed transition-colors`}
            >
              {isTemporary ? "Sohbete Ekle" : "Yükle"} ({selectedFiles.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
