import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, X } from 'lucide-react';
import { ExcelViewer } from './ExcelViewer';
import { supabase } from '@/integrations/supabase/client';
import { DealSpaceDocument } from '@/hooks/useDealSpaceDocuments';
import { toast } from '@/hooks/use-toast';
import ExcelJS from 'exceljs';
import { workbookToBlob } from '@/lib/excelUtils';

interface ExcelViewerDialogProps {
  document: DealSpaceDocument | null;
  isOpen: boolean;
  onClose: () => void;
  onDownload: (doc: DealSpaceDocument) => void;
}

export function ExcelViewerDialog({
  document,
  isOpen,
  onClose,
  onDownload,
}: ExcelViewerDialogProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!document || !isOpen) {
      setSignedUrl(null);
      return;
    }

    const getSignedUrl = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase.storage
          .from('deal-space')
          .createSignedUrl(document.file_path, 3600);

        if (error) throw error;
        setSignedUrl(data.signedUrl);
      } catch (error) {
        console.error('Error getting signed URL:', error);
        toast({
          title: 'Error',
          description: 'Could not load the file',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    getSignedUrl();
  }, [document, isOpen]);

  const handleSave = useCallback(async (workbook: ExcelJS.Workbook) => {
    if (!document) return;

    try {
      // Convert workbook to blob
      const blob = await workbookToBlob(workbook);

      // Upload to storage (overwrite existing file)
      const { error } = await supabase.storage
        .from('deal-space')
        .update(document.file_path, blob, {
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          upsert: true,
        });

      if (error) throw error;

      toast({ title: 'Saved', description: 'Excel file updated successfully' });
    } catch (error) {
      console.error('Error saving Excel file:', error);
      throw error;
    }
  }, [document]);

  const handleDownload = useCallback(() => {
    if (document) {
      onDownload(document);
    }
  }, [document, onDownload]);

  if (!document) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[95vw] w-[1400px] h-[85vh] flex flex-col p-0">
        <DialogHeader className="flex-shrink-0 px-4 py-3 border-b">
          <div className="flex items-center justify-between">
            <DialogTitle className="truncate max-w-[500px] text-base">
              {document.name}
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0">
          {signedUrl && (
            <ExcelViewer
              fileUrl={signedUrl}
              fileName={document.name}
              onSave={handleSave}
              onDownload={handleDownload}
              readOnly={false}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
