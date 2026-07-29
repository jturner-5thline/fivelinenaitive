import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowDownRight, ArrowUpRight, Loader2, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMetricsData } from '@/hooks/useMetricsData';
import { useQuickBooksMetrics } from '@/hooks/useQuickBooksMetrics';
import { useReportDefinitions } from '@/hooks/useReportDefinitions';
import { formatDeltaValue } from '@/hooks/useInsightsComparison';
import { sendClaudeMessage, isStaleClaudeResponse } from '@/services/claude';
import { toast } from 'sonner';

// Tiny inline 2-point sparkline that visualises Period A → Period B for a Top Mover row.
const MoverSparkline = ({ a, b, tone }: { a: number; b: number; tone: 'success' | 'destructive' }) => {
  const w = 36;
  const h = 14;
  const pad = 2;
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  const range = max - min || 1;
  const y = (v: number) => h - pad - ((v - min) / range) * (h - pad * 2);
  const x1 = pad;
  const x2 = w - pad;
  const stroke = tone === 'success' ? 'hsl(var(--success))' : 'hsl(var(--destructive))';
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" aria-hidden>
      <line x1={x1} y1={y(a)} x2={x2} y2={y(b)} stroke={stroke} strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={x1} cy={y(a)} r={1.6} fill={stroke} opacity={0.65} />
      <circle cx={x2} cy={y(b)} r={1.8} fill={stroke} />
    </svg>
  );
};

interface MetricRow {
  key: string;
  label: string;
  format: 'currency' | 'number' | 'percent';
  goodWhen: 'up' | 'down';
  /** length 12, oldest -> newest, aligned with monthlyData. */
  series: number[];
}

function pctChange(a: number, b: number): number | null {
  if (!b) return null;
  return ((a - b) / Math.abs(b)) * 100;
}

function sentiment(a: number, b: number, goodWhen: 'up' | 'down'): 'good' | 'bad' | 'flat' {
  if (a === b) return 'flat';
  const better = a > b;
  if (goodWhen === 'up') return better ? 'good' : 'bad';
  return better ? 'bad' : 'good';
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function InsightsCompareDialog({ open, onOpenChange }: Props) {
  const { data: deal } = useMetricsData();
  const { data: qb } = useQuickBooksMetrics();
  const { data: reports } = useReportDefinitions();

  // Build month options from deal monthly series (rolling 12).
  const months = useMemo(() => deal?.monthlyData?.map(m => m.month) ?? [], [deal]);

  // Default A = current month, B = prior month.
  const [periodA, setPeriodA] = useState<string>('');
  const [periodB, setPeriodB] = useState<string>('');
  const [reportA, setReportA] = useState<string>('none');
  const [reportB, setReportB] = useState<string>('none');
  const [narrative, setNarrative] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [highlightedKey, setHighlightedKey] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const focusRow = (key: string) => {
    const el = rowRefs.current[key];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    setHighlightedKey(key);
    window.clearTimeout((focusRow as any)._t);
    (focusRow as any)._t = window.setTimeout(() => setHighlightedKey(null), 2200);
  };

  // Initialize defaults when months become available
  useEffect(() => {
    if (months.length && (!periodA || !months.includes(periodA))) {
      setPeriodA(months[months.length - 1]);
    }
    if (months.length >= 2 && (!periodB || !months.includes(periodB))) {
      setPeriodB(months[months.length - 2]);
    }
  }, [months, periodA, periodB]);

  const rows: MetricRow[] = useMemo(() => {
    const dm = deal?.monthlyData ?? [];
    const qm = qb?.monthlyRevenue ?? [];
    return [
      { key: 'revenue', label: 'Revenue', format: 'currency', goodWhen: 'up', series: qm.map(x => x.revenue) },
      { key: 'payments', label: 'Payments Received', format: 'currency', goodWhen: 'up', series: qm.map(x => x.payments) },
      { key: 'expenses', label: 'Expenses', format: 'currency', goodWhen: 'down', series: qm.map(x => x.expenses) },
      { key: 'closed-won', label: 'Closed Won Value', format: 'currency', goodWhen: 'up', series: dm.map(x => x.closedWonValue) },
      { key: 'fees', label: 'Total Fees', format: 'currency', goodWhen: 'up', series: dm.map(x => x.totalFees) },
      { key: 'deal-count', label: 'Deals', format: 'number', goodWhen: 'up', series: dm.map(x => x.dealCount) },
    ];
  }, [deal, qb]);

  const idxA = months.indexOf(periodA);
  const idxB = months.indexOf(periodB);

  const reportLabel = (id: string) => reports?.find(r => r.id === id)?.name ?? null;

  // Top movers: rank rows by absolute % change, then split by sentiment polarity.
  const topMovers = useMemo(() => {
    if (idxA < 0 || idxB < 0) return { gainers: [] as any[], losers: [] as any[] };
    const ranked = rows
      .map(r => {
        const a = r.series[idxA] ?? 0;
        const b = r.series[idxB] ?? 0;
        const diff = a - b;
        const pct = pctChange(a, b);
        const sent = sentiment(a, b, r.goodWhen);
        return { row: r, a, b, diff, pct, sent };
      })
      .filter(m => m.pct != null && m.sent !== 'flat');
    const gainers = ranked
      .filter(m => m.sent === 'good')
      .sort((x, y) => Math.abs(y.pct ?? 0) - Math.abs(x.pct ?? 0))
      .slice(0, 3);
    const losers = ranked
      .filter(m => m.sent === 'bad')
      .sort((x, y) => Math.abs(y.pct ?? 0) - Math.abs(x.pct ?? 0))
      .slice(0, 3);
    return { gainers, losers };
  }, [rows, idxA, idxB]);

  const generateCommentary = async () => {
    if (idxA < 0 || idxB < 0 || isGenerating) return;
    setIsGenerating(true);
    try {
      const lines = rows.map(r => {
        const a = r.series[idxA] ?? 0;
        const b = r.series[idxB] ?? 0;
        const pct = pctChange(a, b);
        const pctStr = pct == null ? 'n/a' : `${pct.toFixed(1)}%`;
        return `- ${r.label}: ${periodA} = ${formatDeltaValue(a, r.format)}, ${periodB} = ${formatDeltaValue(b, r.format)} (Δ ${pctStr}). Higher is ${r.goodWhen === 'up' ? 'better' : 'worse'}.`;
      });
      const reportContext: string[] = [];
      const ra = reportLabel(reportA);
      const rb = reportLabel(reportB);
      if (ra) reportContext.push(`Period ${periodA} represents the saved report "${ra}".`);
      if (rb) reportContext.push(`Period ${periodB} represents the saved report "${rb}".`);

      const prompt = `Compare two reporting periods on the naitive Insights dashboard.
${reportContext.join('\n')}

Period A: ${periodA}
Period B: ${periodB}

Metrics:
${lines.join('\n')}

Write 2 short paragraphs of plain-English commentary. Lead with the biggest difference, quantify with the deltas above, and call out any noteworthy improvement or risk. Do not invent metrics not listed. Keep under 180 words. No headings or bullet lists.`;
      const resp = await sendClaudeMessage({
        messages: [{ role: 'user', content: prompt }],
        context: 'chat',
        usage: { feature_subtype: 'insights_compare_periods' },
        requestManager: { panelKey: `insights:compare:${periodA}:${periodB}` },
      });
      if (isStaleClaudeResponse(resp)) return;
      if (!resp.success) throw new Error(resp.error || 'AI failed');
      setNarrative(resp.response.trim());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate commentary');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Compare Reporting Periods</DialogTitle>
          <DialogDescription>
            Pick any two months from the rolling 12-month window. Optionally anchor each
            side to a saved report for naming context.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          {/* Period A picker */}
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Period A</p>
            <Select value={periodA} onValueChange={setPeriodA}>
              <SelectTrigger><SelectValue placeholder="Select month" /></SelectTrigger>
              <SelectContent>
                {months.map(m => <SelectItem key={`a-${m}`} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={reportA} onValueChange={setReportA}>
              <SelectTrigger><SelectValue placeholder="Anchor saved report (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No saved report</SelectItem>
                {reports?.map(r => <SelectItem key={`ra-${r.id}`} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {/* Period B picker */}
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Period B</p>
            <Select value={periodB} onValueChange={setPeriodB}>
              <SelectTrigger><SelectValue placeholder="Select month" /></SelectTrigger>
              <SelectContent>
                {months.map(m => <SelectItem key={`b-${m}`} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={reportB} onValueChange={setReportB}>
              <SelectTrigger><SelectValue placeholder="Anchor saved report (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No saved report</SelectItem>
                {reports?.map(r => <SelectItem key={`rb-${r.id}`} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Side-by-side metric grid */}
        <div className="rounded-lg border border-border/60 overflow-hidden">
          <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/40 px-3 py-2">
            <div>Metric</div>
            <div className="text-right">{periodA || 'Period A'}{reportLabel(reportA) ? ` · ${reportLabel(reportA)}` : ''}</div>
            <div className="text-right">{periodB || 'Period B'}{reportLabel(reportB) ? ` · ${reportLabel(reportB)}` : ''}</div>
            <div className="text-right">Δ A vs B</div>
          </div>
          <div className="divide-y divide-border/40">
            {rows.map(r => {
              const a = r.series[idxA] ?? 0;
              const b = r.series[idxB] ?? 0;
              const diff = a - b;
              const pct = pctChange(a, b);
              const sent = sentiment(a, b, r.goodWhen);
              const cls =
                sent === 'good' ? 'text-success' : sent === 'bad' ? 'text-destructive' : 'text-muted-foreground';
              const Arrow = diff >= 0 ? ArrowUpRight : ArrowDownRight;
              const isHighlighted = highlightedKey === r.key;
              return (
                <div
                  key={r.key}
                  ref={el => (rowRefs.current[r.key] = el)}
                  className={cn(
                    'grid grid-cols-[1.4fr_1fr_1fr_1fr] items-center px-3 py-2 text-sm transition-colors duration-500',
                    isHighlighted && 'bg-primary/15 ring-1 ring-inset ring-primary/40',
                  )}
                >
                  <div>
                    <span className="font-medium">{r.label}</span>
                    <Badge variant="outline" className="ml-2 text-[9px] uppercase">
                      good {r.goodWhen === 'up' ? '↑' : '↓'}
                    </Badge>
                  </div>
                  <div className="text-right tabular-nums">{formatDeltaValue(a, r.format)}</div>
                  <div className="text-right tabular-nums">{formatDeltaValue(b, r.format)}</div>
                  <div className={cn('text-right tabular-nums inline-flex justify-end items-center gap-0.5', cls)}>
                    <Arrow className="h-3 w-3" />
                    {pct == null ? '—' : `${Math.abs(pct).toFixed(1)}%`}
                    <span className="ml-1 text-[10px] opacity-70">({formatDeltaValue(diff, r.format)})</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top movers */}
        {(topMovers.gainers.length > 0 || topMovers.losers.length > 0) && (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-success/40 bg-success/5 p-3">
              <p className="text-xs font-semibold flex items-center gap-1.5 text-success mb-2">
                <TrendingUp className="h-3.5 w-3.5" /> Top Positive Movers
              </p>
              {topMovers.gainers.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No positive movers between these periods.</p>
              ) : (
                <ul className="space-y-1.5">
                  {topMovers.gainers.map(m => (
                    <li key={m.row.key}>
                      <button
                        type="button"
                        onClick={() => focusRow(m.row.key)}
                        title={`${m.row.label} — ${periodA}: ${formatDeltaValue(m.a, m.row.format)} · ${periodB}: ${formatDeltaValue(m.b, m.row.format)} (Δ ${formatDeltaValue(m.diff, m.row.format)}). Click to jump to row.`}
                        className="w-full flex flex-col gap-0.5 text-xs min-w-0 rounded-md px-1.5 py-1 -mx-1.5 hover:bg-success/10 transition-colors text-left"
                      >
                        <span className="flex items-center justify-between gap-2 min-w-0">
                          <span className="font-medium truncate hover:underline underline-offset-2">{m.row.label}</span>
                          <span className="flex items-center gap-1.5 shrink-0">
                            <MoverSparkline a={m.a} b={m.b} tone="success" />
                            <span className="tabular-nums text-success">
                              {m.pct! >= 0 ? '+' : ''}{m.pct!.toFixed(1)}%
                              <span className="ml-1 text-[10px] opacity-70">({formatDeltaValue(m.diff, m.row.format)})</span>
                            </span>
                          </span>
                        </span>
                        <span className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground tabular-nums">
                          <span className="truncate">{periodA}: {formatDeltaValue(m.a, m.row.format)}</span>
                          <span className="truncate">{periodB}: {formatDeltaValue(m.b, m.row.format)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
              <p className="text-xs font-semibold flex items-center gap-1.5 text-destructive mb-2">
                <TrendingDown className="h-3.5 w-3.5" /> Top Negative Movers
              </p>
              {topMovers.losers.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No negative movers between these periods.</p>
              ) : (
                <ul className="space-y-1.5">
                  {topMovers.losers.map(m => (
                    <li key={m.row.key}>
                      <button
                        type="button"
                        onClick={() => focusRow(m.row.key)}
                        title={`${m.row.label} — ${periodA}: ${formatDeltaValue(m.a, m.row.format)} · ${periodB}: ${formatDeltaValue(m.b, m.row.format)} (Δ ${formatDeltaValue(m.diff, m.row.format)}). Click to jump to row.`}
                        className="w-full flex flex-col gap-0.5 text-xs min-w-0 rounded-md px-1.5 py-1 -mx-1.5 hover:bg-destructive/10 transition-colors text-left"
                      >
                        <span className="flex items-center justify-between gap-2 min-w-0">
                          <span className="font-medium truncate hover:underline underline-offset-2">{m.row.label}</span>
                          <span className="flex items-center gap-1.5 shrink-0">
                            <MoverSparkline a={m.a} b={m.b} tone="destructive" />
                            <span className="tabular-nums text-destructive">
                              {m.pct! >= 0 ? '+' : ''}{m.pct!.toFixed(1)}%
                              <span className="ml-1 text-[10px] opacity-70">({formatDeltaValue(m.diff, m.row.format)})</span>
                            </span>
                          </span>
                        </span>
                        <span className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground tabular-nums">
                          <span className="truncate">{periodA}: {formatDeltaValue(m.a, m.row.format)}</span>
                          <span className="truncate">{periodB}: {formatDeltaValue(m.b, m.row.format)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* AI commentary */}
        <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> AI Commentary
            </p>
            <Button size="sm" onClick={generateCommentary} disabled={isGenerating || !periodA || !periodB}>
              {isGenerating ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              )}
              {narrative ? 'Regenerate' : 'Generate'}
            </Button>
          </div>
          {narrative ? (
            <div className="text-sm leading-relaxed whitespace-pre-wrap">{narrative}</div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Click Generate to have naitive AI write commentary on the differences between
              the two selected periods.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}