import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ExternalLink, Download, Maximize2, Minimize2, X, FileText, AlertTriangle } from 'lucide-react';

interface GammaViewerProps {
  url: string;
  pdfUrl?: string;
  pptxUrl?: string;
  onClose?: () => void;
}

function getEmbedUrl(url: string) {
  return url.includes('gamma.app') ? `${url}/embed` : url;
}

function getGoogleDocsViewerUrl(pdfUrl: string) {
  return `https://docs.google.com/gview?url=${encodeURIComponent(pdfUrl)}&embedded=true`;
}

export function GammaViewer({ url, pdfUrl, pptxUrl, onClose }: GammaViewerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  const [viewMode, setViewMode] = useState<'gamma' | 'pdf'>(pdfUrl ? 'pdf' : 'gamma');

  const embedSrc = viewMode === 'pdf' && pdfUrl
    ? getGoogleDocsViewerUrl(pdfUrl)
    : getEmbedUrl(url);

  return (
    <div className={isExpanded ? 'fixed inset-0 z-50 bg-background flex flex-col' : 'rounded-xl border overflow-hidden bg-card'}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-red-400" />
          <div className="h-3 w-3 rounded-full bg-yellow-400" />
          <div className="h-3 w-3 rounded-full bg-green-400" />
          {pdfUrl && (
            <div className="ml-3 flex items-center gap-1 text-xs">
              <button
                onClick={() => { setViewMode('pdf'); setIframeError(false); }}
                className={`px-2 py-0.5 rounded transition-colors ${viewMode === 'pdf' ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground'}`}
              >
                PDF Preview
              </button>
              <button
                onClick={() => { setViewMode('gamma'); setIframeError(false); }}
                className={`px-2 py-0.5 rounded transition-colors ${viewMode === 'gamma' ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Gamma Embed
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {pdfUrl && (
            <Button variant="ghost" size="sm" className="h-7 px-2 gap-1.5 text-xs" asChild>
              <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
                <Download className="h-3 w-3" /> PDF
              </a>
            </Button>
          )}
          {pptxUrl && (
            <Button variant="ghost" size="sm" className="h-7 px-2 gap-1.5 text-xs" asChild>
              <a href={pptxUrl} target="_blank" rel="noopener noreferrer">
                <Download className="h-3 w-3" /> PPTX
              </a>
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-7 px-2 gap-1.5 text-xs" asChild>
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3 w-3" /> Open
            </a>
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsExpanded(!isExpanded)}>
            {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>
          {onClose && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className={isExpanded ? 'flex-1' : ''}>
        {iframeError ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center" style={{ height: isExpanded ? '100%' : '500px' }}>
            <AlertTriangle className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Unable to preview inline. The document may not allow embedding.</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Open in Gamma
                </a>
              </Button>
              {pdfUrl && viewMode === 'gamma' && (
                <Button variant="outline" size="sm" onClick={() => { setViewMode('pdf'); setIframeError(false); }}>
                  <FileText className="h-3.5 w-3.5 mr-1.5" /> View PDF Instead
                </Button>
              )}
            </div>
          </div>
        ) : (
          <iframe
            src={embedSrc}
            className="w-full border-0"
            style={{ height: isExpanded ? '100%' : '500px' }}
            allow="fullscreen"
            title="Gamma Presentation"
            onError={() => setIframeError(true)}
          />
        )}
      </div>
    </div>
  );
}
