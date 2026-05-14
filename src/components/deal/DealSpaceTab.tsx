import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DollarSign, FileText, StickyNote, Presentation } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { DealSpaceAskAITab } from './DealSpaceAskAITab';
import { DealSpaceDocumentsTab } from './DealSpaceDocumentsTab';
import { DealSpaceNotesTab } from './DealSpaceNotesTab';
import { GammaIntegrationPanel } from './GammaIntegrationPanel';
import { SaaSModelTab } from './saas-model/SaaSModelTab';
import { useNaitivePipelineAccess } from '@/hooks/useNaitivePipelineAccess';

interface DealSpaceTabProps {
  dealId: string;
  dealData?: {
    company: string;
    value?: number;
    stage?: string;
    status?: string;
    deal_type?: string;
    notes?: string;
    narrative?: string;
    lenders?: Array<{ name: string; stage: string }>;
    milestones?: Array<{ title: string; completed: boolean }>;
  };
}

export function DealSpaceTab({ dealId, dealData }: DealSpaceTabProps) {
  const { hasAccess: isFifthLine } = useNaitivePipelineAccess();
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
          Analysis
        </TabsTrigger>
        <TabsTrigger value="documents" className="flex items-center gap-2 rounded-sm">
          <FileText className="h-4 w-4" />
          Documents
        </TabsTrigger>
        <TabsTrigger value="gamma" className="flex items-center gap-2 rounded-sm">
          <Presentation className="h-4 w-4" />
          Gamma
        </TabsTrigger>
      </TabsList>

      <TabsContent value="ask-ai">
        <DealSpaceAskAITab dealId={dealId} />
      </TabsContent>

      <TabsContent value="notes">
        <DealSpaceNotesTab dealId={dealId} />
      </TabsContent>

      <TabsContent value="financials">
        {isFifthLine ? (
          <SaaSModelTab dealId={dealId} dealData={dealData ? { company: dealData.company, value: dealData.value, stage: dealData.stage } : undefined} />
        ) : (
          <div className="flex flex-col items-center justify-center min-h-[420px] rounded-lg border border-border/50 bg-card/30 px-6 py-16 text-center">
            <p className="text-3xl font-semibold tracking-tight text-foreground">COMING SOON!</p>
            <p className="mt-2 text-sm text-muted-foreground">Deal analysis is on its way.</p>
          </div>
        )}
      </TabsContent>

      <TabsContent value="documents">
        <DealSpaceDocumentsTab dealId={dealId} />
      </TabsContent>

      <TabsContent value="gamma">
        {dealData ? (
          <GammaIntegrationPanel dealId={dealId} dealData={dealData} />
        ) : (
          <div className="text-center py-8 text-muted-foreground">Deal data not available</div>
        )}
      </TabsContent>
    </Tabs>
  );
}
