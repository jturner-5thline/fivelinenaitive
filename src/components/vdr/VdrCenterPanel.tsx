import type { VdrDocument } from './types';
import { VdrThreeColumnWorkspace } from './views/VdrThreeColumnWorkspace';

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
}

export function VdrCenterPanel({ dealId, documents, documentsLoading, onPreview, vdrDocs, canPushToFlex, isPushingToFlex, onPushToFlex, companyId, mappingRefreshKey }: VdrCenterPanelProps) {
  return (
    <div className="flex flex-col h-full min-w-0">
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
  );
}
