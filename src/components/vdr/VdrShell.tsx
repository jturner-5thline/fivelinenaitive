import { useState, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useDealsContext } from '@/contexts/DealsContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { useProfile } from '@/hooks/useProfile';
import { useVdrDocuments } from '@/hooks/useVdrDocuments';
import type { VdrView, VdrDocument } from './types';
import { VdrSidebar } from './VdrSidebar';
import { VdrCenterPanel } from './VdrCenterPanel';
import { VdrPreviewPanel } from './VdrPreviewPanel';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';

interface VdrShellProps {
  dealId: string;
  embedded?: boolean;
}

export function VdrShell({ dealId, embedded = false }: VdrShellProps) {
  const [activeView, setActiveView] = useState<VdrView>('chat-dataroom');
  const [previewDoc, setPreviewDoc] = useState<VdrDocument | null>(null);
  const { deals } = useDealsContext();
  const { user } = useAuth();
  const { company } = useCompany();
  const { profile } = useProfile();
  const navigate = useNavigate();

  const currentDeal = useMemo(() => deals.find(d => d.id === dealId), [deals, dealId]);

  const vdrDocs = useVdrDocuments(dealId);

  const handleDealChange = useCallback((newDealId: string) => {
    navigate(`/vdr/${newDealId}`, { replace: true });
  }, [navigate]);

  const handlePreview = useCallback((doc: VdrDocument) => {
    setPreviewDoc(doc);
  }, []);

  const handleClosePreview = useCallback(() => {
    setPreviewDoc(null);
  }, []);

  return (
    <div className={cn("flex overflow-hidden", embedded ? "h-full w-full" : "h-screen w-screen")} style={{ background: 'hsl(var(--background))' }}>
      {/* LEFT SIDEBAR */}
      <VdrSidebar
        dealId={dealId}
        deals={deals}
        currentDeal={currentDeal}
        activeView={activeView}
        onViewChange={setActiveView}
        onDealChange={handleDealChange}
        fileCount={vdrDocs.fileCount}
        ingestionStats={vdrDocs.ingestionStats}
        profile={profile}
        onFileDrop={async (files) => {
          for (const file of files) {
            await vdrDocs.uploadFile(file, '/Team Communications/', 'team_comms');
          }
        }}
      />

      {/* CENTER + RIGHT PANELS */}
      <div className="flex-1 flex min-w-0 min-h-0">
        <ResizablePanelGroup direction="horizontal" className="flex-1">
          <ResizablePanel defaultSize={previewDoc ? 65 : 100} minSize={40}>
            <VdrCenterPanel
              dealId={dealId}
              activeView={activeView}
              documents={vdrDocs.documents}
              documentsLoading={vdrDocs.loading}
              onPreview={handlePreview}
              vdrDocs={vdrDocs}
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
