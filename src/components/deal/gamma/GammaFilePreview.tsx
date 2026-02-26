import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { FileText, Presentation, Download, Eye, Loader2 } from 'lucide-react';

interface GammaFilePreviewProps {
  pdfUrl?: string;
  pptxUrl?: string;
  title?: string;
}

export function GammaFilePreview({ pdfUrl, pptxUrl, title }: GammaFilePreviewProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<'pdf' | 'pptx'>('pdf');

  if (!pdfUrl && !pptxUrl) return null;

  const openPreview = (url: string, type: 'pdf' | 'pptx') => {
    setPreviewUrl(url);
    setPreviewType(type);
  };

  // Google Docs Viewer for PPTX, direct embed for PDF
  const getViewerUrl = (url: string, type: 'pdf' | 'pptx') => {
    if (type === 'pptx') {
      return `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;
    }
    return url;
  };

  return (
    <div className="flex items-center gap-1.5">
      {pdfUrl && (
        <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 gap-1.5 text-xs"
              onClick={() => openPreview(pdfUrl, 'pdf')}
            >
              <Eye className="h-3 w-3" />
              <FileText className="h-3 w-3" />
              PDF
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl h-[80vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4" />
                {title || 'PDF Preview'}
                <Button variant="ghost" size="sm" className="ml-auto h-7 px-2 gap-1.5 text-xs" asChild>
                  <a href={pdfUrl} target="_blank" rel="noopener noreferrer" download>
                    <Download className="h-3 w-3" /> Download
                  </a>
                </Button>
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 h-full min-h-0">
              <iframe
                src={getViewerUrl(pdfUrl, 'pdf')}
                className="w-full h-full border-0 rounded-lg"
                title="PDF Preview"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {pptxUrl && (
        <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 gap-1.5 text-xs"
              onClick={() => openPreview(pptxUrl, 'pptx')}
            >
              <Eye className="h-3 w-3" />
              <Presentation className="h-3 w-3" />
              PPTX
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl h-[80vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-sm">
                <Presentation className="h-4 w-4" />
                {title || 'PPTX Preview'}
                <Button variant="ghost" size="sm" className="ml-auto h-7 px-2 gap-1.5 text-xs" asChild>
                  <a href={pptxUrl} target="_blank" rel="noopener noreferrer" download>
                    <Download className="h-3 w-3" /> Download
                  </a>
                </Button>
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 h-full min-h-0">
              <iframe
                src={getViewerUrl(pptxUrl, 'pptx')}
                className="w-full h-full border-0 rounded-lg"
                title="PPTX Preview"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
