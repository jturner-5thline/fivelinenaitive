import type { VdrView, VdrDocument } from './types';
import { VdrChatDataroom } from './views/VdrChatDataroom';
import { VdrIrlTracker } from './views/VdrIrlTracker';
import { VdrIncomingData } from './views/VdrIncomingData';
import { VdrTasksView } from './views/VdrTasksView';

interface VdrCenterPanelProps {
  dealId: string;
  activeView: VdrView;
  documents: VdrDocument[];
  documentsLoading: boolean;
  onPreview: (doc: VdrDocument) => void;
  vdrDocs: any;
}

export function VdrCenterPanel({ dealId, activeView, documents, documentsLoading, onPreview, vdrDocs }: VdrCenterPanelProps) {
  return (
    <div className="flex flex-col h-full min-w-0 bg-background">
      {activeView === 'chat-dataroom' && (
        <VdrChatDataroom
          dealId={dealId}
          documents={documents}
          documentsLoading={documentsLoading}
          onPreview={onPreview}
          vdrDocs={vdrDocs}
        />
      )}
      {activeView === 'irl-tracker' && <VdrIrlTracker dealId={dealId} />}
      {activeView === 'incoming-data' && <VdrIncomingData dealId={dealId} vdrDocs={vdrDocs} onPreview={onPreview} />}
      {activeView === 'tasks' && <VdrTasksView dealId={dealId} />}
    </div>
  );
}
