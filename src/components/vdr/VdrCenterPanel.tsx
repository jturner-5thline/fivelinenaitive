import type { VdrDocument } from './types';
import { VdrChatDataroom } from './views/VdrChatDataroom';

interface VdrCenterPanelProps {
  dealId: string;
  documents: VdrDocument[];
  documentsLoading: boolean;
  onPreview: (doc: VdrDocument) => void;
  vdrDocs: any;
}

export function VdrCenterPanel({ dealId, documents, documentsLoading, onPreview, vdrDocs }: VdrCenterPanelProps) {
  return (
    <div className="flex flex-col h-full min-w-0">
      <VdrChatDataroom
        dealId={dealId}
        documents={documents}
        documentsLoading={documentsLoading}
        onPreview={onPreview}
        vdrDocs={vdrDocs}
      />
    </div>
  );
}
