import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DollarSign, FileText, StickyNote } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { DealSpaceAskAITab } from './DealSpaceAskAITab';
import { DealSpaceDocumentsTab } from './DealSpaceDocumentsTab';
import { DealSpaceNotesTab } from './DealSpaceNotesTab';
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
  // Controlled value lets React batch the tab-switch render correctly
  // and avoids the synchronous re-mount cost we get with `defaultValue`
  // when the panel contents are heavy.
  const [activeTab, setActiveTab] = useState<string>('ask-ai');
  const triggerCls =
    "gap-1.5 relative whitespace-nowrap flex-shrink-0 px-4 h-8 text-[13px] leading-none rounded-sm font-medium text-white/80 border-0 bg-white/[0.04] shadow-none hover:text-white hover:bg-white/10 transition-all duration-150 data-[state=active]:text-white data-[state=active]:font-semibold data-[state=active]:h-10 data-[state=active]:-mt-2 data-[state=active]:rounded-t-sm data-[state=active]:rounded-b-none data-[state=active]:border data-[state=active]:border-b-0 data-[state=active]:border-white/15 data-[state=active]:bg-gradient-to-b data-[state=active]:from-slate-700 data-[state=active]:via-slate-800 data-[state=active]:to-slate-900 data-[state=active]:shadow-[0_-8px_18px_-8px_rgba(0,0,0,0.7),inset_0_1px_0_0_rgba(255,255,255,0.18)] data-[state=active]:before:content-[''] data-[state=active]:before:absolute data-[state=active]:before:inset-x-2 data-[state=active]:before:top-0 data-[state=active]:before:h-[2px] data-[state=active]:before:rounded-full data-[state=active]:before:bg-[hsl(var(--primary))] data-[state=active]:after:content-[''] data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:-bottom-1 data-[state=active]:after:h-1 data-[state=active]:after:bg-gradient-to-b data-[state=active]:after:from-slate-900 data-[state=active]:after:to-transparent";
  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList
        className="mb-3 inline-flex h-auto items-center justify-start rounded-sm bg-gradient-to-b from-slate-800/95 to-slate-950 backdrop-blur-xl p-0 gap-0 border border-white/10 border-l-0 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.75),inset_0_1px_0_0_rgba(255,255,255,0.07)] max-w-full overflow-x-visible overflow-y-visible scrollbar-none [&>button+button]:border-l [&>button+button]:border-white/10"
      >
        <TabsTrigger value="ask-ai" className={triggerCls}>
          <Sparkles className="h-3.5 w-3.5" />
          Ask AI
        </TabsTrigger>
        <TabsTrigger value="notes" className={triggerCls}>
          <StickyNote className="h-3.5 w-3.5" />
          Notes
        </TabsTrigger>
        <TabsTrigger value="financials" className={triggerCls}>
          <DollarSign className="h-3.5 w-3.5" />
          Analysis
        </TabsTrigger>
        <TabsTrigger value="documents" className={triggerCls}>
          <FileText className="h-3.5 w-3.5" />
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
    </Tabs>
  );
}
