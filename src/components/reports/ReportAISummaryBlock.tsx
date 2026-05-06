import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Lock, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useReportAISummaries } from '@/hooks/useReportAISummaries';
import { useInsightsComparison } from '@/hooks/useInsightsComparison';
import type { ReportDefinition } from '@/hooks/useReportDefinitions';

/**
 * Renders the latest persisted AI summary for a saved report. When the
 * report's `ai_regenerate_on_run` flag is true and no locked summary exists,
 * offers a one-click regenerate that calls the edge function and persists
 * a fresh narrative.
 */
export function ReportAISummaryBlock({ report }: { report: ReportDefinition }) {
  const { data: summaries } = useReportAISummaries(report.id);
  const { deltas, alerts, periodKey, periodLabel } = useInsightsComparison();
  const [isRunning, setIsRunning] = useState(false);
  const [freshNarrative, setFreshNarrative] = useState<string | null>(null);

  const latest = summaries?.[0];
  const locked = summaries?.find(s => s.locked_at);
  const display = freshNarrative ?? locked?.narrative ?? latest?.narrative ?? null;
  const isShowingLocked = !freshNarrative && !!locked;

  useEffect(() => { setFreshNarrative(null); }, [report.id]);

  const regenerate = async () => {
    if (isRunning) return;
    setIsRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('regenerate-insights-summary', {
        body: {
          reportId: report.id,
          periodKey,
          periodLabel,
          deltas,
          alerts,
          persist: true,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'AI failed');
      setFreshNarrative(data.narrative);
      toast.success('AI summary regenerated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to regenerate');
    } finally {
      setIsRunning(false);
    }
  };

  if (!report.ai_summary_enabled && !display) return null;

  return (
    <div className="mb-4 rounded-lg border border-border/60 bg-muted/20 p-4 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">AI Executive Summary</span>
          {isShowingLocked && (
            <Badge variant="secondary" className="gap-1 text-[10px]">
              <Lock className="h-3 w-3" /> Locked
            </Badge>
          )}
          {display && (
            <Badge variant="outline" className="text-[10px]">{periodLabel}</Badge>
          )}
        </div>
        {report.ai_regenerate_on_run && (
          <Button size="sm" variant="outline" onClick={regenerate} disabled={isRunning}>
            {isRunning ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            )}
            {display ? 'Regenerate' : 'Generate'}
          </Button>
        )}
      </div>
      {display ? (
        <div className="text-sm leading-relaxed whitespace-pre-wrap">{display}</div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No saved AI summary yet. Click Generate to create one for this period.
        </p>
      )}
    </div>
  );
}