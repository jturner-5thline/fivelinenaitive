import { useEffect, useState } from 'react';
import { HardDrive, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import type { VdrDocument } from './types';
import { VdrThreeColumnWorkspace } from './views/VdrThreeColumnWorkspace';
import { DriveDataRoomPanel } from './DriveDataRoomPanel';

interface VdrCenterPanelProps {
  dealId: string;
  documents: VdrDocument[];
  documentsLoading: boolean;
  onPreview: (doc: VdrDocument) => void;
  vdrDocs: any;
  canPushToFlex?: boolean;
  isPushingToFlex?: boolean;
  onPushToFlex?: () => void;
  dealType?: string | null;
  companyId?: string | null;
  mappingRefreshKey?: number;
  dealName?: string;
  companyName?: string;
}

export function VdrCenterPanel({
  dealId, documents, documentsLoading, onPreview, vdrDocs, canPushToFlex,
  isPushingToFlex, onPushToFlex, companyId, mappingRefreshKey, dealName, companyName,
}: VdrCenterPanelProps) {
  // 'drive' renders the linked Google Drive folder live; 'uploads' is the
  // classic three-column workspace over documents stored in nAItive.
  const [mode, setMode] = useState<'uploads' | 'drive' | null>(null);

  // Default to the Drive view whenever this deal already has a folder linked.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('deal_drive_folders')
        .select('id')
        .eq('deal_id', dealId)
        .maybeSingle();
      if (!cancelled) setMode(data ? 'drive' : 'uploads');
    })();
    return () => { cancelled = true; };
  }, [dealId]);

  if (mode === null) return <div className="flex-1" />;

  return (
    <div className="flex flex-col h-full min-w-0">
      {mode === 'drive' ? (
        <DriveDataRoomPanel
          dealId={dealId}
          dealName={dealName}
          companyName={companyName}
          onUseUploads={() => setMode('uploads')}
        />
      ) : (
        <>
          <div className="flex items-center justify-end px-3 py-1 border-b border-border/40">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] gap-1.5 text-muted-foreground"
              onClick={() => setMode('drive')}
            >
              <HardDrive className="h-3 w-3" /> Use Google Drive folder
            </Button>
          </div>
          <div className="flex-1 min-h-0">
            <VdrThreeColumnWorkspace
              dealId={dealId}
              documents={documents}
              documentsLoading={documentsLoading}
              onPreview={onPreview}
              vdrDocs={vdrDocs}
              canPushToFlex={canPushToFlex}
              isPushingToFlex={isPushingToFlex}
              onPushToFlex={onPushToFlex}
              companyId={companyId}
              mappingRefreshKey={mappingRefreshKey}
            />
          </div>
        </>
      )}
    </div>
  );
}
