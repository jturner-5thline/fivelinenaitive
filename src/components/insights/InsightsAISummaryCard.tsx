import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  GitCompareArrows,
  Loader2,
  Lock,
  Pencil,
  Save,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { sendClaudeMessage } from '@/services/claude';
import { toast } from 'sonner';
import {
  formatDeltaValue,
  useInsightsComparison,
  type DeltaResult,
  type TrendAlert,
} from '@/hooks/useInsightsComparison';
import { useInsightsTimeframeOptional } from '@/contexts/InsightsTimeframeContext';
import { InsightsCompareDialog } from './InsightsCompareDialog';
import { useReportDefinitions } from '@/hooks/useReportDefinitions';
import { useReportAISummaries, useSaveReportAISummary } from '@/hooks/useReportAISummaries';

function ChangeChip({
  pct,
  abs,
  fmt,
  sentiment,
  suffix,
}: {
  pct: number | null;
  abs: number;
  fmt: DeltaResult['format'];
  sentiment: 'improvement' | 'decline' | 'neutral';
  suffix: string;
}) {
  const cls =
    sentiment === 'improvement'
      ? 'text-success'
      : sentiment === 'decline'
      ? 'text-destructive'
      : 'text-muted-foreground';
  if (pct == null) {
    return <span className="text-[10px] text-muted-foreground">— {suffix}</span>;
  }
  const Arrow = pct >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-[10px] font-medium tabular-nums', cls)}>
      <Arrow className="h-3 w-3" />
      {Math.abs(pct).toFixed(1)}% ({formatDeltaValue(abs, fmt)}) {suffix}
    </span>
  );
}

function buildClaudePrompt(
  deltas: DeltaResult[],
  alerts: TrendAlert[],
  periodLabel: string,
) {
  const lines = deltas.map(d => {
    const cur = formatDeltaValue(d.current, d.format);
    const prev = formatDeltaValue(d.prevPeriod, d.format);
    const yoy = formatDeltaValue(d.prevYear, d.format);
    const mom = d.pctMoM == null ? 'n/a' : `${d.pctMoM.toFixed(1)}%`;
    const yoyPct = d.pctYoY == null ? 'n/a' : `${d.pctYoY.toFixed(1)}%`;
    return `- ${d.label}: current ${cur}, prior period ${prev} (MoM ${mom}), prior year ${yoy} (YoY ${yoyPct}). Higher is ${d.goodWhen === 'up' ? 'better' : 'worse'}.`;
  });
  const alertLines = alerts.length
    ? alerts.map(a => `- [${a.level.toUpperCase()}] ${a.message}`).join('\n')
    : '- No automated trend alerts.';
  return `You are writing the executive narrative for the naitive Insights dashboard.

Reporting period: ${periodLabel}

Metrics (current vs. prior period vs. prior year):
${lines.join('\n')}

Auto-detected trend alerts:
${alertLines}

Write a 2-3 paragraph executive summary, in plain English, for senior leadership. Lead with the headline change, quantify with specific deltas, and call out the most important risk. Do not invent data or deal names not present above. Keep under 220 words. No headings, no bullet lists.`;
}

export function InsightsAISummaryCard() {
  const { deltas, alerts, isLoading, periodKey, periodLabel } = useInsightsComparison();
  const tf = useInsightsTimeframeOptional();
  // periodLabel sourced from comparison hook (timeframe-aware).

  const [narrative, setNarrative] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<string>('none');

  const headlineDeltas = useMemo(() => deltas.slice(0, 6), [deltas]);

  const { data: reports } = useReportDefinitions();
  const { data: existingSummaries } = useReportAISummaries(
    reportTarget !== 'none' ? reportTarget : undefined,
  );
  const saveSummary = useSaveReportAISummary();

  // Hydrate latest narrative for the selected report + period (locked first).
  useEffect(() => {
    if (!existingSummaries) return;
    const match = existingSummaries.find(s => s.period_key === periodKey);
    if (match && !narrative) {
      setNarrative(match.narrative);
      setIsLocked(!!match.locked_at);
    }
  }, [existingSummaries, periodKey, narrative]);

  const generate = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    try {
      const prompt = buildClaudePrompt(deltas, alerts, periodLabel);
      const resp = await sendClaudeMessage({
        messages: [{ role: 'user', content: prompt }],
        context: 'chat',
        usage: { feature_subtype: 'insights_ai_summary' },
      });
      if (!resp.success) throw new Error(resp.error || 'AI failed');
      setNarrative(resp.response.trim());
      setIsLocked(false);
      setIsEditing(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate summary';
      toast.error(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  const persist = async (lock: boolean) => {
    if (!narrative.trim()) {
      toast.error('Generate a summary first');
      return;
    }
    await saveSummary.mutateAsync({
      reportId: reportTarget !== 'none' ? reportTarget : null,
      periodKey,
      periodLabel,
      narrative,
      deltas,
      alerts,
      lock,
    });
    if (lock) setIsLocked(true);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Summary
            <Badge variant="outline" className="ml-1 text-[10px]">{periodLabel}</Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            {reports && reports.length > 0 && (
              <Select value={reportTarget} onValueChange={setReportTarget}>
                <SelectTrigger className="h-9 w-[180px]">
                  <SelectValue placeholder="Attach to report" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No saved report</SelectItem>
                  {reports.map(r => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button size="sm" variant="outline" onClick={() => setCompareOpen(true)}>
              <GitCompareArrows className="h-3.5 w-3.5 mr-1.5" />
              Compare Periods
            </Button>
            {narrative && !isLocked && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsEditing(e => !e)}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  {isEditing ? 'Preview' : 'Edit'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => persist(false)}
                  disabled={saveSummary.isPending}
                >
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => persist(true)}
                  disabled={saveSummary.isPending}
                >
                  <Lock className="h-3.5 w-3.5 mr-1.5" />
                  Lock for report
                </Button>
              </>
            )}
            {isLocked && (
              <Badge variant="secondary" className="gap-1 text-[10px]">
                <Lock className="h-3 w-3" /> Locked
              </Badge>
            )}
            <Button size="sm" onClick={generate} disabled={isGenerating || isLoading}>
              {isGenerating ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              )}
              {narrative ? 'Regenerate' : 'Generate Summary'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Period-over-period KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {headlineDeltas.map(d => (
            <div
              key={d.key}
              className="rounded-lg border border-border/50 bg-muted/30 p-3 flex flex-col gap-1 min-w-0"
            >
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">
                {d.label}
              </span>
              <span className="text-base font-semibold tabular-nums truncate">
                {formatDeltaValue(d.current, d.format)}
              </span>
              <ChangeChip
                pct={d.pctMoM}
                abs={d.changeMoM}
                fmt={d.format}
                sentiment={d.sentimentMoM}
                suffix="MoM"
              />
              <ChangeChip
                pct={d.pctYoY}
                abs={d.changeYoY}
                fmt={d.format}
                sentiment={d.sentimentYoY}
                suffix="YoY"
              />
            </div>
          ))}
        </div>

        {/* Trend alert callouts */}
        {alerts.length > 0 && (
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {alerts.map(a => {
              const styles =
                a.level === 'critical'
                  ? 'border-destructive/40 bg-destructive/10 text-destructive'
                  : a.level === 'warning'
                  ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400'
                  : 'border-success/40 bg-success/10 text-success';
              const Icon = a.level === 'positive' ? TrendingUp : AlertTriangle;
              return (
                <div
                  key={a.id}
                  className={cn('rounded-lg border p-3 flex items-start gap-2 text-xs', styles)}
                >
                  <Icon className="h-4 w-4 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="font-medium leading-tight">{a.metric}</p>
                    <p className="opacity-90 leading-snug">{a.message}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Narrative */}
        {narrative ? (
          isEditing && !isLocked ? (
            <Textarea
              value={narrative}
              onChange={e => setNarrative(e.target.value)}
              rows={8}
              className="text-sm leading-relaxed"
            />
          ) : (
            <div className="rounded-lg border border-border/50 bg-muted/20 p-4 text-sm leading-relaxed whitespace-pre-wrap">
              {narrative}
            </div>
          )
        ) : (
          <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
            Click <span className="font-medium text-foreground">Generate Summary</span> to have naitive AI write
            an executive narrative comparing this period to the prior period and prior year.
          </div>
        )}
      </CardContent>
      <InsightsCompareDialog open={compareOpen} onOpenChange={setCompareOpen} />
    </Card>
  );
}