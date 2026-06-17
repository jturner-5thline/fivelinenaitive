import { useState, useEffect } from 'react';
import { X, Download, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { VdrDocument } from './types';

interface VdrPreviewPanelProps {
  document: VdrDocument;
  onClose: () => void;
  getDownloadUrl: (path: string) => Promise<string | null>;
}

export function VdrPreviewPanel({ document: doc, onClose, getDownloadUrl }: VdrPreviewPanelProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!doc.file_path) { setLoading(false); return; }
    setLoading(true);
    getDownloadUrl(doc.file_path).then(url => {
      setSignedUrl(url);
      setLoading(false);
    });
  }, [doc.file_path, getDownloadUrl]);

  const safeName = typeof doc.filename === 'string' ? doc.filename : '';
  const ext = safeName.includes('.') ? safeName.split('.').pop()?.toLowerCase() : '';
  const isPdf = ext === 'pdf';
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext || '');
  const isText = ['txt', 'csv', 'md', 'json', 'xml'].includes(ext || '');

  const handleDownload = () => {
    if (signedUrl) {
      const a = document.createElement('a');
      a.href = signedUrl;
      a.download = doc.filename;
      a.click();
    }
  };

  const handleFullscreen = () => {
    if (signedUrl) window.open(signedUrl, '_blank');
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40">
        <span className="text-sm font-medium truncate flex-1">{doc.filename}</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDownload} title="Download">
          <Download className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleFullscreen} title="Fullscreen">
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} title="Close">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Loading preview…</div>
        ) : isPdf && signedUrl ? (
          <iframe src={signedUrl} className="w-full h-full rounded-md border border-border/40" title={doc.filename} />
        ) : isImage && signedUrl ? (
          <img src={signedUrl} alt={doc.filename} className="max-w-full rounded-md" />
        ) : isText && signedUrl ? (
          <TextPreview url={signedUrl} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <p className="text-sm font-medium">{doc.filename}</p>
            <p className="text-xs">{formatSize(doc.file_size)}</p>
            <p className="text-xs">Preview not available</p>
            <Button size="sm" variant="secondary" onClick={handleDownload}>Download</Button>
          </div>
        )}
      </div>
    </div>
  );
}

function TextPreview({ url }: { url: string }) {
  const [text, setText] = useState('');
  useEffect(() => {
    fetch(url).then(r => r.text()).then(setText).catch(() => setText('Failed to load file'));
  }, [url]);
  return <pre className="text-xs whitespace-pre-wrap font-mono text-foreground/80 p-2 rounded bg-secondary/30">{text}</pre>;
}
