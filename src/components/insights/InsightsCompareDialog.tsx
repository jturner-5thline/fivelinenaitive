import { useEffect, useMemo, useState } from 'react';
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
import { ArrowDownRight, ArrowUpRight, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMetricsData } from '@/hooks/useMetricsData';
import { useQuickBooksMetrics } from '@/hooks/useQuickBooksMetrics';
import { useReportDefinitions } from '@/hooks/useReportDefinitions';
import { formatDeltaValue } from '@/hooks/useInsightsComparison';
import { sendClaudeMessage } from '@/services/claude';
import { toast } from 'sonner';

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
      });
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
              return (
                <div key={r.key} className="grid grid-cols-[1.4fr_1fr_1fr_1fr] items-center px-3 py-2 text-sm">
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