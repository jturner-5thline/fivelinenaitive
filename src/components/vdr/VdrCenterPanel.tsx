import type { VdrDocument } from './types';
import type { VdrView } from './VdrSidebar';
import { VdrChatDataroom } from './views/VdrChatDataroom';

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
  activeView?: VdrView;
}

export function VdrCenterPanel({ dealId, documents, documentsLoading, onPreview, vdrDocs, canPushToFlex, isPushingToFlex, onPushToFlex, dealType, companyId, mappingRefreshKey, activeView = 'internal' }: VdrCenterPanelProps) {
  return (
    <div className="flex flex-col h-full min-w-0">
      <VdrChatDataroom
        dealId={dealId}
        documents={documents}
        documentsLoading={documentsLoading}
        onPreview={onPreview}
        vdrDocs={vdrDocs}
        canPushToFlex={canPushToFlex}
        isPushingToFlex={isPushingToFlex}
        onPushToFlex={onPushToFlex}
        dealType={dealType}
        companyId={companyId}
        mappingRefreshKey={mappingRefreshKey}
        activeView={activeView}
      />
    </div>
  );
}
