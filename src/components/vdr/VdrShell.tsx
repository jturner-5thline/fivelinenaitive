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

import { VdrSidebar } from './VdrSidebar';
import { VdrCenterPanel } from './VdrCenterPanel';
import { VdrPreviewPanel } from './VdrPreviewPanel';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FolderOpen, FolderClosed } from 'lucide-react';

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

  // Folder picker state for sidebar uploads
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string>('/');

  const availableFolders = useMemo(() => {
    return vdrDocs.documents
      .filter(d => d.is_folder && d.folder_path === '/')
      .sort((a, b) => a.sort_order - b.sort_order || a.filename.localeCompare(b.filename));
  }, [vdrDocs.documents]);

  const handleFilesDropped = useCallback((files: File[]) => {
    setPendingFiles(files);
    setSelectedFolder('/');
  }, []);

  const handleFolderPickConfirm = useCallback(() => {
    if (!pendingFiles) return;
    pendingFiles.forEach(file => {
      vdrDocs.uploadFile(file, selectedFolder, 'dataroom');
    });
    setPendingFiles(null);
    setSelectedFolder('/');
  }, [pendingFiles, selectedFolder, vdrDocs]);

  const handleFolderPickCancel = useCallback(() => {
    setPendingFiles(null);
    setSelectedFolder('/');
  }, []);

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
        onFilesDropped={handleFilesDropped}
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

      {/* Folder Picker Modal */}
      <Dialog open={!!pendingFiles} onOpenChange={open => { if (!open) handleFolderPickCancel(); }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm">Choose upload folder</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Select a folder for {pendingFiles?.length === 1 ? `"${pendingFiles[0].name}"` : `${pendingFiles?.length} files`}:
          </p>
          <div className="space-y-1 max-h-[240px] overflow-auto">
            <button
              onClick={() => setSelectedFolder('/')}
              className={cn(
                'flex items-center gap-2 w-full px-3 py-2 rounded-md text-xs font-medium transition-colors',
                selectedFolder === '/'
                  ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                  : 'text-foreground hover:bg-secondary/50'
              )}
            >
              <FolderOpen className="h-4 w-4 flex-shrink-0" />
              Root (no folder)
            </button>
            {availableFolders.map(folder => {
              const path = `/${folder.filename}/`;
              return (
                <button
                  key={folder.id}
                  onClick={() => setSelectedFolder(path)}
                  className={cn(
                    'flex items-center gap-2 w-full px-3 py-2 rounded-md text-xs font-medium transition-colors',
                    selectedFolder === path
                      ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                      : 'text-foreground hover:bg-secondary/50'
                  )}
                >
                  <FolderClosed className="h-4 w-4 flex-shrink-0" />
                  {folder.filename}
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={handleFolderPickCancel}>Cancel</Button>
            <Button size="sm" onClick={handleFolderPickConfirm}>Upload</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
