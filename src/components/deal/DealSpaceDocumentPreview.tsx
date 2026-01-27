import { useState, useEffect } from 'react';
import { Loader2, FileText, Download, ExternalLink, Table2, Presentation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { DealSpaceDocument } from '@/hooks/useDealSpaceDocuments';
import { ExcelViewerDialog } from './ExcelViewerDialog';

interface DealSpaceDocumentPreviewProps {
  document: DealSpaceDocument | null;
  isOpen: boolean;
  onClose: () => void;
  onDownload: (doc: DealSpaceDocument) => void;
}

export function DealSpaceDocumentPreview({ 
  document, 
  isOpen, 
  onClose, 
  onDownload 
}: DealSpaceDocumentPreviewProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [previewType, setPreviewType] = useState<'embed' | 'text' | 'excel' | 'unsupported'>('unsupported');

  useEffect(() => {
    if (!document || !isOpen) {
      setPreviewUrl(null);
      setTextContent(null);
      return;
    }

    const loadPreview = async () => {
      setIsLoading(true);
      try {
        const fileName = document.name.toLowerCase();
        
        // Get signed URL for the file
        const { data, error } = await supabase.storage
          .from('deal-space')
          .createSignedUrl(document.file_path, 3600);

        if (error) throw error;
        
        setPreviewUrl(data.signedUrl);

        // Determine preview type - Excel files use special viewer
        if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
          setPreviewType('excel');
        } else if (fileName.endsWith('.pdf')) {
          setPreviewType('embed');
        } else if (
          fileName.endsWith('.txt') || 
          fileName.endsWith('.md') || 
          fileName.endsWith('.csv') ||
          fileName.endsWith('.json')
        ) {
          // Load text content
          const response = await fetch(data.signedUrl);
          const text = await response.text();
          setTextContent(text);
          setPreviewType('text');
        } else if (
          fileName.endsWith('.docx') || 
          fileName.endsWith('.pptx')
        ) {
          // For Office documents (non-Excel), use Google Docs Viewer
          setPreviewType('embed');
        } else {
          setPreviewType('unsupported');
        }
      } catch (error) {
        console.error('Error loading preview:', error);
        setPreviewType('unsupported');
      } finally {
        setIsLoading(false);
      }
    };

    loadPreview();
  }, [document, isOpen]);

  if (!document) return null;

  const fileName = document.name.toLowerCase();
  const isExcelFile = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
  const isOfficeDoc = fileName.endsWith('.docx') || fileName.endsWith('.pptx');

  // Use the dedicated Excel viewer for Excel files
  if (isExcelFile) {
    return (
      <ExcelViewerDialog
        document={document}
        isOpen={isOpen}
        onClose={onClose}
        onDownload={onDownload}
      />
    );
  }

  const getFileIcon = () => {
    if (fileName.endsWith('.pptx')) {
      return <Presentation className="h-5 w-5 text-orange-500" />;
    }
    return <FileText className="h-5 w-5 text-blue-500" />;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getFileIcon()}
              <DialogTitle className="truncate max-w-[400px]">
                {document.name}
              </DialogTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDownload(document)}
              >
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
              {previewUrl && isOfficeDoc && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(
                    `https://docs.google.com/viewer?url=${encodeURIComponent(previewUrl)}&embedded=true`,
                    '_blank'
                  )}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open in Google Docs
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 mt-4">
          {isLoading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : previewType === 'embed' && previewUrl ? (
            <div className="h-full">
              {fileName.endsWith('.pdf') ? (
                <iframe
                  src={previewUrl}
                  className="w-full h-full rounded-lg border"
                  title={document.name}
                />
              ) : isOfficeDoc ? (
                <iframe
                  src={`https://docs.google.com/viewer?url=${encodeURIComponent(previewUrl)}&embedded=true`}
                  className="w-full h-full rounded-lg border"
                  title={document.name}
                />
              ) : null}
            </div>
          ) : previewType === 'text' && textContent ? (
            <ScrollArea className="h-full rounded-lg border bg-muted/30 p-4">
              <pre className="text-sm whitespace-pre-wrap font-mono">{textContent}</pre>
            </ScrollArea>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <FileText className="h-16 w-16 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground mb-2">
                Preview not available for this file type
              </p>
              <Button onClick={() => onDownload(document)}>
                <Download className="h-4 w-4 mr-2" />
                Download to view
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
