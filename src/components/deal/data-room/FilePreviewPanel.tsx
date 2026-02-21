import { useState } from 'react';
import { X, Download, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatBytes } from './helpers';
import type { DealAttachment } from '@/hooks/useDealAttachments';

interface FilePreviewPanelProps {
  file: DealAttachment;
  onClose: () => void;
  onDownload: (att: DealAttachment) => void;
}

export function FilePreviewPanel({ file, onClose, onDownload }: FilePreviewPanelProps) {
  const ext = file.name.split('.').pop()?.toLowerCase();
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext || '');
  const isPdf = ext === 'pdf';
  const [pdfError, setPdfError] = useState(false);

  // For PDFs, try direct embed first; fall back to Google Docs Viewer
  const getPdfSrc = () => {
    if (!file.url) return '';
    if (pdfError) {
      return `https://docs.google.com/viewer?url=${encodeURIComponent(file.url)}&embedded=true`;
    }
    return file.url;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="bg-card border rounded-lg shadow-xl w-[90vw] max-w-4xl h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold truncate">{file.name}</h3>
            <p className="text-xs text-muted-foreground">{formatBytes(file.size_bytes)} · {file.content_type}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-4">
            {file.url && (
              <>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.open(file.url, '_blank')}>
                  <ExternalLink className="h-3.5 w-3.5" /> Open
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onDownload(file)}>
                  <Download className="h-3.5 w-3.5" /> Download
                </Button>
              </>
            )}
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Preview content */}
        <div className="flex-1 overflow-hidden bg-muted/10">
          {!file.url ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p className="text-sm">Preview not available</p>
            </div>
          ) : isImage ? (
            <div className="flex items-center justify-center h-full p-4">
              <img src={file.url} alt={file.name} className="max-w-full max-h-full object-contain rounded" />
            </div>
          ) : isPdf ? (
            <iframe
              src={getPdfSrc()}
              className="w-full h-full border-0"
              title={file.name}
              onError={() => setPdfError(true)}
              onLoad={(e) => {
                // If the iframe loaded but is empty/blocked, try Google Docs fallback
                try {
                  const iframe = e.target as HTMLIFrameElement;
                  if (!pdfError && iframe.contentDocument?.body?.childElementCount === 0) {
                    setPdfError(true);
                  }
                } catch {
                  // Cross-origin - can't inspect, which means it loaded fine
                }
              }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
              <p className="text-sm">Preview not available for .{ext} files</p>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onDownload(file)}>
                <Download className="h-3.5 w-3.5" /> Download to view
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
