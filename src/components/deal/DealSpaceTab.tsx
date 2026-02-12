import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sparkles, DollarSign, FileText, StickyNote } from 'lucide-react';
import { DealSpaceAskAITab } from './DealSpaceAskAITab';
import { DealSpaceFinancialsTab } from './DealSpaceFinancialsTab';
import { DealSpaceDocumentsTab } from './DealSpaceDocumentsTab';
import { DealSpaceNotesTab } from './DealSpaceNotesTab';

interface DealSpaceTabProps {
  dealId: string;
}

export function DealSpaceTab({ dealId }: DealSpaceTabProps) {
  return (
    <Tabs defaultValue="ask-ai" className="w-full">
      <TabsList className="mb-2 rounded-sm">
        <TabsTrigger value="ask-ai" className="flex items-center gap-2 rounded-sm">
          <Sparkles className="h-4 w-4" />
          Ask AI
        </TabsTrigger>
        <TabsTrigger value="notes" className="flex items-center gap-2 rounded-sm">
          <StickyNote className="h-4 w-4" />
          Notes
        </TabsTrigger>
        <TabsTrigger value="financials" className="flex items-center gap-2 rounded-sm">
          <DollarSign className="h-4 w-4" />
          Financials
        </TabsTrigger>
        <TabsTrigger value="documents" className="flex items-center gap-2 rounded-sm">
          <FileText className="h-4 w-4" />
          Documents
        </TabsTrigger>
      </TabsList>

      <TabsContent value="ask-ai">
        <DealSpaceAskAITab dealId={dealId} />
      </TabsContent>

      <TabsContent value="notes">
        <DealSpaceNotesTab dealId={dealId} />
      </TabsContent>

      <TabsContent value="financials">
        <DealSpaceFinancialsTab dealId={dealId} />
      </TabsContent>

      <TabsContent value="documents">
        <DealSpaceDocumentsTab dealId={dealId} />
      </TabsContent>
    </Tabs>
  );
}