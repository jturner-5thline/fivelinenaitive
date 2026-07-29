import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles } from 'lucide-react';
import { differenceInCalendarMonths, parseISO, startOfMonth, subMonths, subYears, endOfMonth } from 'date-fns';
import { cn } from '@/lib/utils';
import { useQuickBooksInvoices, useQuickBooksPayments } from '@/hooks/useQuickBooks';
import { useQuickBooksExpanded } from '@/hooks/useQuickBooksExpanded';
import { useInsightsTimeframeOptional } from '@/contexts/InsightsTimeframeContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { sendClaudeMessage, isStaleClaudeResponse } from '@/services/claude';
import { toast } from 'sonner';
import {
  formatDeltaValue,
  type DeltaResult,
} from '@/hooks/useInsightsComparison';

export type DrillComparison = 'MoM' | 'YoY';

interface DriverRow {
  name: string;
  current: number;
  compare: number;
  delta: number;
  pct: number | null;
}

interface DriverGroup {
  title: string;
  rows: DriverRow[];
  format: 'currency' | 'number';
}

function pct(a: number, b: number): number | null {
  if (!b) return null;
  return ((a - b) / Math.abs(b)) * 100;
}

function inRange(d: string | null, start: Date, end: Date) {
  if (!d) return false;
  const dt = new Date(d);
  return dt >= start && dt < end;
}

function topRows<T>(
  cur: T[],
  prev: T[],
  getKey: (i: T) => string,
  getAmt: (i: T) => number,
  limit = 8,
): DriverRow[] {
  const c = new Map<string, number>();
  const p = new Map<string, number>();
  for (const it of cur) c.set(getKey(it) || 'Unknown', (c.get(getKey(it) || 'Unknown') || 0) + (getAmt(it) || 0));
  for (const it of prev) p.set(getKey(it) || 'Unknown', (p.get(getKey(it) || 'Unknown') || 0) + (getAmt(it) || 0));
  const keys = new Set([...c.keys(), ...p.keys()]);
  return [...keys]
    .map(k => {
      const current = c.get(k) || 0;
      const compare = p.get(k) || 0;
      const delta = current - compare;
      return { name: k, current, compare, delta, pct: pct(current, compare) };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, limit);
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  delta: DeltaResult | null;
  comparison: DrillComparison;
}

export function DeltaDrillDownDialog({ open, onOpenChange, delta, comparison }: Props) {
  const tf = useInsightsTimeframeOptional();
  const { data: invoices = [] } = useQuickBooksInvoices();
  const { data: payments = [] } = useQuickBooksPayments();
  const { expenses } = useQuickBooksExpanded();

  // Pull all deals once when dialog opens (lightweight columns).
  const { data: deals = [] } = useQuery({
    queryKey: ['drilldown-deals'],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('id, company, value, total_fee, status, stage, deal_type, manager, updated_at')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const [narrative, setNarrative] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    setNarrative('');
  }, [delta?.key, comparison, open]);

  // Compute current / comparison windows from active timeframe.
  const windows = useMemo(() => {
    const now = new Date();
    const anchor = tf?.timeframe.end ? parseISO(tf.timeframe.end) : now;
    const monthsBack = Math.max(0, Math.min(11, differenceInCalendarMonths(now, anchor)));
    const curStart = startOfMonth(subMonths(now, monthsBack));
    const curEnd = endOfMonth(curStart);
    const compStart =
      comparison === 'MoM'
        ? startOfMonth(subMonths(curStart, 1))
        : startOfMonth(subYears(curStart, 1));
    const compEnd = endOfMonth(compStart);
    return { curStart, curEnd, compStart, compEnd };
  }, [tf?.timeframe.end, comparison]);

  const groups: DriverGroup[] = useMemo(() => {
    if (!delta) return [];
    const { curStart, curEnd, compStart, compEnd } = windows;
    const within = (d: any, k: 'cur' | 'comp') => {
      const s = k === 'cur' ? curStart : compStart;
      const e = k === 'cur' ? new Date(curEnd.getTime() + 1) : new Date(compEnd.getTime() + 1);
      return inRange(d, s, e);
    };
    switch (delta.key) {
      case 'qb-revenue': {
        const cur = invoices.filter(i => within(i.txn_date, 'cur'));
        const prev = invoices.filter(i => within(i.txn_date, 'comp'));
        return [{
          title: 'Top customers by invoiced revenue',
          format: 'currency',
          rows: topRows(cur, prev, i => i.customer_name || 'Unknown', i => i.total_amt || 0),
        }];
      }
      case 'qb-payments': {
        const cur = payments.filter(p => within(p.txn_date, 'cur'));
        const prev = payments.filter(p => within(p.txn_date, 'comp'));
        return [{
          title: 'Top customers by payments received',
          format: 'currency',
          rows: topRows(cur, prev, p => p.customer_name || 'Unknown', p => p.total_amt || 0),
        }];
      }
      case 'qb-expenses': {
        const cur = expenses.filter(e => within(e.txn_date, 'cur'));
        const prev = expenses.filter(e => within(e.txn_date, 'comp'));
        return [
          {
            title: 'Top expense categories',
            format: 'currency',
            rows: topRows(cur, prev, (e: any) => e.account_ref_name || 'Uncategorized', (e: any) => e.total_amt || 0),
          },
          {
            title: 'Top vendors',
            format: 'currency',
            rows: topRows(cur, prev, (e: any) => e.vendor_ref_name || 'Unknown', (e: any) => e.total_amt || 0),
          },
        ];
      }
      case 'closed-won-value':
      case 'total-fees':
      case 'deal-count': {
        const isClosedWon = (d: any) => d.status === 'archived' && d.stage === 'closed-won';
        const dealsCur = deals.filter(d => isClosedWon(d) && within(d.updated_at, 'cur'));
        const dealsPrev = deals.filter(d => isClosedWon(d) && within(d.updated_at, 'comp'));
        const amtFn =
          delta.key === 'total-fees'
            ? (d: any) => Number(d.total_fee || 0)
            : delta.key === 'deal-count'
            ? () => 1
            : (d: any) => Number(d.value || 0);
        const fmt: 'currency' | 'number' = delta.key === 'deal-count' ? 'number' : 'currency';
        return [
          {
            title: `Closed-won deals contributing to ${delta.label}`,
            format: fmt,
            rows: topRows(dealsCur, dealsPrev, (d: any) => d.company || 'Unknown', amtFn, 10),
          },
          {
            title: 'By manager',
            format: fmt,
            rows: topRows(dealsCur, dealsPrev, (d: any) => d.manager || 'Unassigned', amtFn),
          },
        ];
      }
      default:
        return [];
    }
  }, [delta, invoices, payments, expenses, deals, windows]);

  const generate = async () => {
    if (!delta || isGenerating) return;
    setIsGenerating(true);
    try {
      const change = comparison === 'MoM' ? delta.changeMoM : delta.changeYoY;
      const pctChange = comparison === 'MoM' ? delta.pctMoM : delta.pctYoY;
      const baseline = comparison === 'MoM' ? delta.prevPeriod : delta.prevYear;
      const driverLines = groups.flatMap(g => [
        `\n${g.title}:`,
        ...g.rows.slice(0, 6).map(r =>
          `  • ${r.name}: ${formatDeltaValue(r.current, g.format)} (was ${formatDeltaValue(r.compare, g.format)}, Δ ${r.delta >= 0 ? '+' : ''}${formatDeltaValue(r.delta, g.format)})`,
        ),
      ]);
      const prompt = `You are explaining why a single metric moved on the naitive Insights dashboard.

Metric: ${delta.label}
Comparison: ${comparison} (${comparison === 'MoM' ? 'vs prior month' : 'vs same month last year'})
Current value: ${formatDeltaValue(delta.current, delta.format)}
Baseline value: ${formatDeltaValue(baseline, delta.format)}
Change: ${change >= 0 ? '+' : ''}${formatDeltaValue(change, delta.format)} (${pctChange == null ? 'n/a' : pctChange.toFixed(1) + '%'})
Higher is ${delta.goodWhen === 'up' ? 'better' : 'worse'}.

Underlying drivers (current vs comparison period):${driverLines.join('\n')}

Write 1-2 short paragraphs in plain English: explain WHY the metric moved, naming the 2-4 most material drivers above with their dollar/count contribution. Quantify. If the move is favorable vs goodWhen polarity, frame positively; otherwise flag the risk. Do not invent any names not listed. Under 160 words. No bullets, no headings.`;
      const resp = await sendClaudeMessage({
        messages: [{ role: 'user', content: prompt }],
        context: 'chat',
        usage: { feature_subtype: 'insights_delta_drilldown' },
        requestManager: { panelKey: `insights:delta:${delta?.label ?? 'x'}:${comparison}` },
      });
      if (isStaleClaudeResponse(resp)) return;
      if (!resp.success) throw new Error(resp.error || 'AI failed');
      setNarrative(resp.response.trim());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to explain delta');
    } finally {
      setIsGenerating(false);
    }
  };

  if (!delta) return null;
  const change = comparison === 'MoM' ? delta.changeMoM : delta.changeYoY;
  const pctChange = comparison === 'MoM' ? delta.pctMoM : delta.pctYoY;
  const baseline = comparison === 'MoM' ? delta.prevPeriod : delta.prevYear;
  const sent = comparison === 'MoM' ? delta.sentimentMoM : delta.sentimentYoY;
  const sentClass =
    sent === 'improvement' ? 'text-success'
    : sent === 'decline' ? 'text-destructive'
    : 'text-muted-foreground';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {delta.label}
            <Badge variant="outline" className="text-[10px]">{comparison}</Badge>
          </DialogTitle>
          <DialogDescription>
            Drill-down into the drivers behind this delta — top contributing deals, customers, categories, or vendors.
          </DialogDescription>
        </DialogHeader>

        {/* Headline change */}
        <div className="rounded-lg border border-border/60 bg-muted/30 p-3 grid grid-cols-3 gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Current</p>
            <p className="text-base font-semibold tabular-nums">{formatDeltaValue(delta.current, delta.format)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{comparison === 'MoM' ? 'Prior month' : 'Prior year'}</p>
            <p className="text-base font-semibold tabular-nums">{formatDeltaValue(baseline, delta.format)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Change</p>
            <p className={cn('text-base font-semibold tabular-nums', sentClass)}>
              {change >= 0 ? '+' : ''}{formatDeltaValue(change, delta.format)}
              {pctChange != null && <span className="ml-1 text-xs opacity-80">({pctChange >= 0 ? '+' : ''}{pctChange.toFixed(1)}%)</span>}
            </p>
          </div>
        </div>

        {/* Driver groups */}
        {groups.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            No driver-level breakdown available for this metric.
          </p>
        ) : (
          <div className="space-y-4">
            {groups.map(g => (
              <div key={g.title} className="rounded-lg border border-border/60 overflow-hidden">
                <p className="text-xs font-medium px-3 py-2 bg-muted/40">{g.title}</p>
                <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr] text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/20 px-3 py-1.5">
                  <div>Name</div>
                  <div className="text-right">Current</div>
                  <div className="text-right">{comparison === 'MoM' ? 'Prior mo.' : 'Prior yr.'}</div>
                  <div className="text-right">Δ</div>
                </div>
                {g.rows.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-3 py-3">No data in either period.</p>
                ) : (
                  <ul className="divide-y divide-border/40">
                    {g.rows.map(r => {
                      const positive = r.delta >= 0;
                      return (
                        <li key={r.name} className="grid grid-cols-[1.6fr_1fr_1fr_1fr] items-center px-3 py-1.5 text-xs">
                          <span className="truncate" title={r.name}>{r.name}</span>
                          <span className="text-right tabular-nums">{formatDeltaValue(r.current, g.format)}</span>
                          <span className="text-right tabular-nums text-muted-foreground">{formatDeltaValue(r.compare, g.format)}</span>
                          <span className={cn('text-right tabular-nums', positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive')}>
                            {positive ? '+' : ''}{formatDeltaValue(r.delta, g.format)}
                            {r.pct != null && <span className="ml-1 text-[10px] opacity-70">({r.pct >= 0 ? '+' : ''}{r.pct.toFixed(0)}%)</span>}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}

        {/* AI explanation */}
        <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> AI Explanation
            </p>
            <Button size="sm" onClick={generate} disabled={isGenerating}>
              {isGenerating ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
              {narrative ? 'Regenerate' : 'Explain this change'}
            </Button>
          </div>
          {narrative ? (
            <div className="text-sm leading-relaxed whitespace-pre-wrap">{narrative}</div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Click to have naitive AI walk through which drivers above caused the {comparison} change in {delta.label}.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
