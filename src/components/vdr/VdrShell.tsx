import { useState, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useDealsContext } from '@/contexts/DealsContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';

import { useVdrDocuments } from '@/hooks/useVdrDocuments';
import { usePageAccessFlags } from '@/hooks/useFeatureFlags';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { VdrDocument } from './types';
import { classifyFileToFolder } from '@/utils/vdrFileClassifier';
import { VdrSidebar } from './VdrSidebar';
import { VdrCenterPanel } from './VdrCenterPanel';
import { VdrPreviewPanel } from './VdrPreviewPanel';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';

interface VdrShellProps {
  dealId: string;
  embedded?: boolean;
}

export function VdrShell({ dealId, embedded = false }: VdrShellProps) {
  const [previewDoc, setPreviewDoc] = useState<VdrDocument | null>(null);
  const { deals } = useDealsContext();
  const { user } = useAuth();
  const { company } = useCompany();
  
  const navigate = useNavigate();

  const currentDeal = useMemo(() => deals.find(d => d.id === dealId), [deals, dealId]);

  const vdrDocs = useVdrDocuments(dealId);
  const { hasPageAccess } = usePageAccessFlags();
  const canPushToFlex = hasPageAccess('flex_push');
  const [isPushingToFlex, setIsPushingToFlex] = useState(false);

  const handlePushToFlex = useCallback(async () => {
    if (isPushingToFlex) return;
    setIsPushingToFlex(true);
    try {
      const files = vdrDocs.documents.filter(d => !d.is_folder && d.file_path);
      const fileData = await Promise.all(
        files.map(async (doc) => {
          const { data: signedData } = await supabase.storage
            .from('vdr-files')
            .createSignedUrl(doc.file_path!, 3600);
          return {
            name: doc.filename,
            category: doc.folder_path,
            url: signedData?.signedUrl || null,
            size_bytes: doc.file_size,
            content_type: doc.file_type,
          };
        })
      );
      const { error } = await supabase.functions.invoke('push-to-flex', {
        body: {
          dealId,
          action: 'sync_data_room',
          dataRoomFiles: fileData.filter(f => f.url !== null),
        },
      });
      if (error) throw error;
      toast.success('Data Room pushed to FLEx', {
        description: files.length > 0 ? `${files.length} file(s) synced successfully.` : 'Data room cleared on FLEx.',
      });
    } catch (error) {
      console.error('Error pushing data room to FLEx:', error);
      toast.error('Failed to push to FLEx', {
        description: error instanceof Error ? error.message : 'An error occurred',
      });
    } finally {
      setIsPushingToFlex(false);
    }
  }, [dealId, isPushingToFlex, vdrDocs.documents]);

  const handlePreview = useCallback((doc: VdrDocument) => {
    setPreviewDoc(doc);
  }, []);

  const handleClosePreview = useCallback(() => {
    setPreviewDoc(null);
  }, []);

  return (
    <div className={cn("flex overflow-hidden divide-x divide-border/50", embedded ? "h-full w-full bg-card" : "h-screen w-screen bg-background")}>
      <VdrSidebar
        dealId={dealId}
        deals={deals}
        currentDeal={currentDeal}
        onFilesDropped={useCallback((files: File[]) => {
          files.forEach(file => vdrDocs.uploadFile(file, '/', 'dataroom'));
        }, [vdrDocs])}
      />

      <div className="flex-1 flex min-w-0 min-h-0">
        <ResizablePanelGroup direction="horizontal" className="flex-1">
          <ResizablePanel defaultSize={previewDoc ? 65 : 100} minSize={40}>
            <VdrCenterPanel
              dealId={dealId}
              documents={vdrDocs.documents}
              documentsLoading={vdrDocs.loading}
              onPreview={handlePreview}
              vdrDocs={vdrDocs}
              canPushToFlex={canPushToFlex}
              isPushingToFlex={isPushingToFlex}
              onPushToFlex={handlePushToFlex}
              dealType={currentDeal?.dealTypes?.[0] ?? null}
              companyId={company?.id ?? null}
            />
          </ResizablePanel>

          {previewDoc && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={35} minSize={20} maxSize={50}>
                <VdrPreviewPanel
                  document={previewDoc}
                  onClose={handleClosePreview}
                  getDownloadUrl={vdrDocs.getDownloadUrl}
                />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
