import { useEffect, useRef } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Activity, AlertTriangle, MessageCircleQuestion, Sparkles, Target } from 'lucide-react';
import { InsightsAISummaryCard } from './InsightsAISummaryCard';
import { AskAboutPeriodChat } from './AskAboutPeriodChat';
import { InsightsDriversPanel } from './InsightsDriversPanel';
import { InsightsForecastPanel } from './InsightsForecastPanel';
import { AnomalyHistoryPanel } from './AnomalyHistoryPanel';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Element to return focus to on close (typically the header trigger button).
   * Provided for accessibility — the parent owns the ref.
   */
  returnFocusRef?: React.RefObject<HTMLElement>;
}

/**
 * Insights Assistant — a single contextual slide-over launched from the
 * Insights Dashboard header. Re-homes the AI Summary, Ask about this period,
 * Driver Attribution, Forecast & Plan Variance, and Anomaly History sections
 * so they live in one place tied to the currently active dashboard state.
 *
 * Each child component already pulls its data via the existing /insights
 * hooks (`useInsightsComparison`, `useInsightsDrivers`, `useInsightsForecast`,
 * `useAnomalyHistory`, `useInsightsTargets`, alert config), so the assistant
 * automatically reflects the user's current period, filters, visible metrics,
 * and permission scope without forwarding any extra props.
 */
export function InsightsAssistantSheet({ open, onOpenChange, returnFocusRef }: Props) {
  const lastOpen = useRef(open);
  useEffect(() => {
    if (lastOpen.current && !open) {
      // Restore focus to the launcher when the sheet closes.
      requestAnimationFrame(() => returnFocusRef?.current?.focus());
    }
    lastOpen.current = open;
  }, [open, returnFocusRef]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl lg:max-w-3xl p-0 flex flex-col"
      >
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/50">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Insights Assistant
          </SheetTitle>
          <SheetDescription>
            Contextual AI summary, Q&amp;A, drivers, forecast variance, and
            anomalies — scoped to the metrics currently visible on this
            dashboard.
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="summary" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-6 mt-4 grid grid-cols-5 h-auto">
            <TabsTrigger value="summary" className="flex flex-col gap-1 py-2">
              <Sparkles className="h-3.5 w-3.5" />
              <span className="text-[10px]">Summary</span>
            </TabsTrigger>
            <TabsTrigger value="ask" className="flex flex-col gap-1 py-2">
              <MessageCircleQuestion className="h-3.5 w-3.5" />
              <span className="text-[10px]">Ask</span>
            </TabsTrigger>
            <TabsTrigger value="drivers" className="flex flex-col gap-1 py-2">
              <Activity className="h-3.5 w-3.5" />
              <span className="text-[10px]">Drivers</span>
            </TabsTrigger>
            <TabsTrigger value="forecast" className="flex flex-col gap-1 py-2">
              <Target className="h-3.5 w-3.5" />
              <span className="text-[10px]">Forecast</span>
            </TabsTrigger>
            <TabsTrigger value="anomalies" className="flex flex-col gap-1 py-2">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="text-[10px]">Anomalies</span>
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <TabsContent value="summary" className="mt-0">
              <InsightsAISummaryCard />
            </TabsContent>
            <TabsContent value="ask" className="mt-0">
              <AskAboutPeriodChat />
            </TabsContent>
            <TabsContent value="drivers" className="mt-0">
              <InsightsDriversPanel />
            </TabsContent>
            <TabsContent value="forecast" className="mt-0">
              <InsightsForecastPanel />
            </TabsContent>
            <TabsContent value="anomalies" className="mt-0">
              <AnomalyHistoryPanel />
            </TabsContent>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}