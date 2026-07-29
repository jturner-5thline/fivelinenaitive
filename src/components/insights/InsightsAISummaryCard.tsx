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
  Settings2,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { sendClaudeMessage, isStaleClaudeResponse } from '@/services/claude';
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
import { useInsightsDrivers } from '@/hooks/useInsightsDrivers';
import { useInsightsForecast } from '@/hooks/useInsightsForecast';
import { useInsightsTargets } from '@/hooks/useInsightsTargets';
import { useRecordAnomalies } from '@/hooks/useAnomalyHistory';
import { InsightsDriversPanel } from './InsightsDriversPanel';
import { InsightsForecastPanel } from './InsightsForecastPanel';
import { AnomalyHistoryPanel } from './AnomalyHistoryPanel';
import { DeltaDrillDownDialog, type DrillComparison } from './DeltaDrillDownDialog';
import { InsightsAlertSettingsDialog } from './InsightsAlertSettingsDialog';
import { format, parseISO } from 'date-fns';

function ChangeChip({
  pct,
  abs,
  fmt,
  sentiment,
  suffix,
  onClick,
}: {
  pct: number | null;
  abs: number;
  fmt: DeltaResult['format'];
  sentiment: 'improvement' | 'decline' | 'neutral';
  suffix: string;
  onClick?: () => void;
}) {
  const cls =
    sentiment === 'improvement'
      ? 'text-success'
      : sentiment === 'decline'
      ? 'text-destructive'
      : 'text-muted-foreground';
  if (pct == null) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className="text-[10px] text-muted-foreground text-left hover:text-foreground disabled:cursor-default"
      >
        — {suffix}
      </button>
    );
  }
  const Arrow = pct >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      title={onClick ? 'Click for AI drill-down' : undefined}
      className={cn(
        'inline-flex items-center gap-0.5 text-[10px] font-medium tabular-nums hover:underline underline-offset-2 disabled:no-underline disabled:cursor-default',
        cls,
      )}
    >
      <Arrow className="h-3 w-3" />
      {Math.abs(pct).toFixed(1)}% ({formatDeltaValue(abs, fmt)}) {suffix}
    </button>
  );
}

function buildClaudePrompt(
  deltas: DeltaResult[],
  alerts: TrendAlert[],
  periodLabel: string,
  drivers?: Record<string, { contributors: { name: string; delta: number }[] }>,
  forecasts?: { label: string; current: number; nextProjection: number; band: number; format: DeltaResult['format'] }[],
  targets?: { label: string; target: number; current: number; format: DeltaResult['format'] }[],
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
  const driverLines: string[] = [];
  if (drivers) {
    for (const [k, b] of Object.entries(drivers)) {
      if (!b.contributors.length) continue;
      const top = b.contributors.slice(0, 3).map(c => `${c.name} (${c.delta >= 0 ? '+' : ''}${formatDeltaValue(c.delta, 'currency')})`).join(', ');
      driverLines.push(`- ${k}: ${top}`);
    }
  }
  const fcLines = (forecasts ?? []).map(f =>
    `- ${f.label}: current ${formatDeltaValue(f.current, f.format)}, next-period projection ${formatDeltaValue(f.nextProjection, f.format)} (±${formatDeltaValue(f.band, f.format)})`,
  );
  const tgLines = (targets ?? []).map(t => {
    const variance = t.current - t.target;
    return `- ${t.label}: actual ${formatDeltaValue(t.current, t.format)} vs plan ${formatDeltaValue(t.target, t.format)} (Δ ${variance >= 0 ? '+' : ''}${formatDeltaValue(variance, t.format)})`;
  });
  return `You are writing the executive narrative for the naitive Insights dashboard.

Reporting period: ${periodLabel}

Metrics (current vs. prior period vs. prior year):
${lines.join('\n')}

Auto-detected trend alerts:
${alertLines}
${driverLines.length ? `\nTop driver attribution (largest contributors to MoM change):\n${driverLines.join('\n')}` : ''}
${fcLines.length ? `\nForward-looking projections (linear, trailing 6mo):\n${fcLines.join('\n')}` : ''}
${tgLines.length ? `\nPlan / target variance:\n${tgLines.join('\n')}` : ''}

Write a 2-3 paragraph executive summary, in plain English, for senior leadership. Lead with the headline change, quantify with specific deltas, attribute the change to the named drivers above, and explicitly call out plan variance and the next-period projection where they materially differ. Do not invent data or deal names not present above. Keep under 260 words. No headings, no bullet lists.`;
}

export function InsightsAISummaryCard() {
  const { deltas, alerts, isLoading, periodKey, periodLabel } = useInsightsComparison();
  const tf = useInsightsTimeframeOptional();
  const { drivers } = useInsightsDrivers();
  const { forecasts } = useInsightsForecast();
  const { data: targetRows } = useInsightsTargets();

  // Persist detected anomalies into history for trend tracking
  useRecordAnomalies({
    alerts,
    periodKey,
    periodLabel,
    detailsByMetric: Object.fromEntries(
      deltas.flatMap(d => [
        [`${d.key}-up`, { metricKey: d.key, pct: d.pctMoM, abs: d.changeMoM }],
        [`${d.key}-warn`, { metricKey: d.key, pct: d.pctMoM, abs: d.changeMoM }],
        [`${d.key}-crit`, { metricKey: d.key, pct: d.pctMoM, abs: d.changeMoM }],
      ]),
    ),
  });

  const targetsForPrompt = useMemo(() => {
    if (!targetRows?.length) return [];
    // Anchor target lookup to the selected Reporting period (timeframe end)
    // so historical periods don't fall back to today's month.
    const anchor = tf?.timeframe.end ? parseISO(tf.timeframe.end) : new Date();
    const monthKey = format(anchor, 'yyyy-MM');
    const map = new Map<string, { target: number; label: string }>();
    for (const t of targetRows) {
      const exact = t.period_month === monthKey;
      const def = !t.period_month;
      if (exact || (def && !map.has(t.metric_key))) {
        map.set(t.metric_key, { target: Number(t.target_value), label: t.metric_label });
      }
    }
    return deltas
      .filter(d => map.has(d.key))
      .map(d => ({ label: map.get(d.key)!.label, target: map.get(d.key)!.target, current: d.current, format: d.format }));
  }, [targetRows, deltas, tf?.timeframe.end]);

  // periodLabel sourced from comparison hook (timeframe-aware).

  const [narrative, setNarrative] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<string>('none');
  const [drill, setDrill] = useState<{ delta: DeltaResult; comparison: DrillComparison } | null>(null);

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
      const prompt = buildClaudePrompt(
        deltas,
        alerts,
        periodLabel,
        drivers,
        forecasts.map(f => ({ label: f.label, current: f.current, nextProjection: f.nextProjection, band: f.band, format: f.format })),
        targetsForPrompt,
      );
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
            {/* Alert settings disabled — kept for future re-enablement */}
            {false && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSettingsOpen(true)}
                title="Configure thresholds and metric coverage"
              >
                <Settings2 className="h-3.5 w-3.5 mr-1.5" />
                Alert settings
              </Button>
            )}
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
                onClick={() => setDrill({ delta: d, comparison: 'MoM' })}
              />
              <ChangeChip
                pct={d.pctYoY}
                abs={d.changeYoY}
                fmt={d.format}
                sentiment={d.sentimentYoY}
                suffix="YoY"
                onClick={() => setDrill({ delta: d, comparison: 'YoY' })}
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
      <InsightsAlertSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <DeltaDrillDownDialog
        open={!!drill}
        onOpenChange={open => !open && setDrill(null)}
        delta={drill?.delta ?? null}
        comparison={drill?.comparison ?? 'MoM'}
      />
    </Card>
  );
}