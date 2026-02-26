import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ExternalLink, Download, Maximize2, Minimize2, X } from 'lucide-react';

interface GammaViewerProps {
  url: string;
  pdfUrl?: string;
  pptxUrl?: string;
  onClose?: () => void;
}

function getEmbedUrl(url: string) {
  return url.includes('gamma.app') ? `${url}/embed` : url;
}

export function GammaViewer({ url, pdfUrl, pptxUrl, onClose }: GammaViewerProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className={isExpanded ? 'fixed inset-0 z-50 bg-background flex flex-col' : 'rounded-xl border overflow-hidden bg-card'}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-red-400" />
          <div className="h-3 w-3 rounded-full bg-yellow-400" />
          <div className="h-3 w-3 rounded-full bg-green-400" />
          <span className="ml-3 text-xs text-muted-foreground truncate max-w-[250px]">{url}</span>
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

      {/* Iframe */}
      <div className={isExpanded ? 'flex-1' : ''}>
        <iframe
          src={getEmbedUrl(url)}
          className="w-full border-0"
          style={{ height: isExpanded ? '100%' : '500px' }}
          allow="fullscreen"
          title="Gamma Presentation"
        />
      </div>
    </div>
  );
}
