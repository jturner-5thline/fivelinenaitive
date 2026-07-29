import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { ArrowDownRight, ArrowUpRight, Calculator, Loader2, Sparkles } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { sendClaudeMessage, isStaleClaudeResponse } from '@/services/claude';
import { useQuickBooksInvoices, useQuickBooksPayments } from '@/hooks/useQuickBooks';
import { useQuickBooksExpanded } from '@/hooks/useQuickBooksExpanded';
import { useInsightsTimeframeOptional } from '@/contexts/InsightsTimeframeContext';
import { formatDeltaValue } from '@/hooks/useInsightsComparison';
import {
  differenceInCalendarMonths,
  startOfMonth,
  subMonths,
} from 'date-fns';

type MetricKey = 'qb-revenue' | 'qb-payments' | 'qb-expenses';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metricKey: MetricKey | null;
  contributorName: string | null;
  contributorDelta: number;
  totalDelta: number;
}

interface LineItem {
  id: string;
  date: string | null;
  reference: string;
  description: string;
  amount: number;
  bucket: 'current' | 'previous';
}

const LABELS: Record<MetricKey, { entityLabel: string; sourceLabel: string; cohortLabel: string }> = {
  'qb-revenue': { entityLabel: 'Customer', sourceLabel: 'Invoices', cohortLabel: 'Customer cohort' },
  'qb-payments': { entityLabel: 'Customer', sourceLabel: 'Payments', cohortLabel: 'Customer cohort' },
  'qb-expenses': { entityLabel: 'Category', sourceLabel: 'Expenses', cohortLabel: 'Account cohort' },
};

export function DriverDrillDownDialog({
  open,
  onOpenChange,
  metricKey,
  contributorName,
  contributorDelta,
  totalDelta,
}: Props) {
  const tf = useInsightsTimeframeOptional();
  const { data: invoices = [] } = useQuickBooksInvoices();
  const { data: payments = [] } = useQuickBooksPayments();
  const { expenses } = useQuickBooksExpanded();

  const [explanation, setExplanation] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const periods = useMemo(() => {
    const now = new Date();
    const anchor = tf?.timeframe.end ? parseISO(tf.timeframe.end) : now;
    const monthsBack = Math.max(0, Math.min(11, differenceInCalendarMonths(now, anchor)));
    const curMonthStart = startOfMonth(subMonths(now, monthsBack));
    const prevMonthStart = startOfMonth(subMonths(now, monthsBack + 1));
    const nextMonthStart = startOfMonth(subMonths(now, monthsBack - 1));
    return { curMonthStart, prevMonthStart, nextMonthStart };
  }, [tf?.timeframe.end]);

  const items: LineItem[] = useMemo(() => {
    if (!open || !metricKey || !contributorName) return [];
    const { curMonthStart, prevMonthStart, nextMonthStart } = periods;
    const inRange = (d: string | null, start: Date, end: Date) => {
      if (!d) return false;
      const dt = new Date(d);
      return dt >= start && dt < end;
    };
    const bucketOf = (d: string | null): 'current' | 'previous' | null => {
      if (inRange(d, curMonthStart, nextMonthStart)) return 'current';
      if (inRange(d, prevMonthStart, curMonthStart)) return 'previous';
      return null;
    };
    const out: LineItem[] = [];
    if (metricKey === 'qb-revenue') {
      for (const inv of invoices) {
        if ((inv.customer_name || 'Unknown') !== contributorName) continue;
        const b = bucketOf(inv.txn_date);
        if (!b) continue;
        out.push({
          id: String((inv as any).id ?? `${inv.txn_date}-${inv.total_amt}`),
          date: inv.txn_date,
          reference: (inv as any).doc_number || '—',
          description: inv.customer_name || 'Unknown',
          amount: inv.total_amt || 0,
          bucket: b,
        });
      }
    } else if (metricKey === 'qb-payments') {
      for (const p of payments) {
        if ((p.customer_name || 'Unknown') !== contributorName) continue;
        const b = bucketOf(p.txn_date);
        if (!b) continue;
        out.push({
          id: String((p as any).id ?? `${p.txn_date}-${p.total_amt}`),
          date: p.txn_date,
          reference: (p as any).doc_number || '—',
          description: p.customer_name || 'Unknown',
          amount: p.total_amt || 0,
          bucket: b,
        });
      }
    } else if (metricKey === 'qb-expenses') {
      for (const e of expenses as any[]) {
        if ((e.account_ref_name || 'Uncategorized') !== contributorName) continue;
        const b = bucketOf(e.txn_date);
        if (!b) continue;
        out.push({
          id: String(e.id ?? `${e.txn_date}-${e.total_amt}`),
          date: e.txn_date,
          reference: e.doc_number || e.entity_ref_name || '—',
          description: e.entity_ref_name || e.account_ref_name || 'Expense',
          amount: e.total_amt || 0,
          bucket: b,
        });
      }
    }
    return out.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [open, metricKey, contributorName, invoices, payments, expenses, periods]);

  const totals = useMemo(() => {
    const cur = items.filter(i => i.bucket === 'current').reduce((s, i) => s + i.amount, 0);
    const prev = items.filter(i => i.bucket === 'previous').reduce((s, i) => s + i.amount, 0);
    const curCount = items.filter(i => i.bucket === 'current').length;
    const prevCount = items.filter(i => i.bucket === 'previous').length;
    return { cur, prev, delta: cur - prev, curCount, prevCount };
  }, [items]);

  const labels = metricKey ? LABELS[metricKey] : null;
  const positive = contributorDelta >= 0;
  const ArrowIcon = positive ? ArrowUpRight : ArrowDownRight;

  const explain = async () => {
    if (busy || !labels || !contributorName) return;
    setBusy(true);
    try {
      const sample = items.slice(0, 30).map(i =>
        `- ${i.bucket.toUpperCase()} | ${i.date ?? 'n/a'} | ref ${i.reference} | ${formatDeltaValue(i.amount, 'currency')} | ${i.description}`,
      ).join('\n');
      const prompt = `You are explaining one driver of an Insights MoM change.

Metric: ${metricKey}
${labels.entityLabel}: ${contributorName}
Current period total: ${formatDeltaValue(totals.cur, 'currency')} across ${totals.curCount} transactions
Prior period total: ${formatDeltaValue(totals.prev, 'currency')} across ${totals.prevCount} transactions
Δ: ${formatDeltaValue(totals.delta, 'currency')} (this driver = ${((contributorDelta / (totalDelta || 1)) * 100).toFixed(0)}% of metric Δ)

Sample transactions (max 30):
${sample || '- (none in window)'}

Write 2-4 sentences explaining what changed for this ${labels.entityLabel.toLowerCase()}. Cite specific reference numbers or dates from the sample only — do not invent. End with one short follow-up the user should investigate.`;
      const resp = await sendClaudeMessage({
        messages: [{ role: 'user', content: prompt }],
        context: 'chat',
        usage: { feature_subtype: 'insights_driver_drilldown' },
        requestManager: { panelKey: `insights:driver:${contributorName ?? 'none'}` },
      });
      if (isStaleClaudeResponse(resp)) return;
      if (!resp.success) throw new Error(resp.error || 'AI failed');
      setExplanation(resp.response.trim());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to explain driver');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setExplanation(''); onOpenChange(v); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {labels?.entityLabel ?? 'Driver'}: <span className="text-primary">{contributorName ?? '—'}</span>
            {labels && <Badge variant="outline" className="text-[10px]">{labels.sourceLabel}</Badge>}
          </DialogTitle>
          <DialogDescription>
            Underlying line items, cohort totals, and the math behind this driver's contribution.
          </DialogDescription>
        </DialogHeader>

        {/* Calculation summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <SummaryStat label="Current" value={formatDeltaValue(totals.cur, 'currency')} sub={`${totals.curCount} txns`} />
          <SummaryStat label="Prior" value={formatDeltaValue(totals.prev, 'currency')} sub={`${totals.prevCount} txns`} />
          <SummaryStat
            label="Δ this driver"
            value={`${positive ? '+' : ''}${formatDeltaValue(totals.delta, 'currency')}`}
            valueClass={positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}
            icon={<ArrowIcon className="h-3.5 w-3.5" />}
          />
          <SummaryStat
            label="% of metric Δ"
            value={`${totalDelta ? ((contributorDelta / totalDelta) * 100).toFixed(0) : '—'}%`}
            sub={`Total Δ ${formatDeltaValue(totalDelta, 'currency')}`}
          />
        </div>

        <Tabs defaultValue="items" className="flex-1 flex flex-col min-h-0">
          <TabsList className="self-start">
            <TabsTrigger value="items">Line items ({items.length})</TabsTrigger>
            <TabsTrigger value="cohort">Cohort math</TabsTrigger>
            <TabsTrigger value="explain">AI explanation</TabsTrigger>
          </TabsList>

          <TabsContent value="items" className="flex-1 min-h-0 mt-2">
            <ScrollArea className="h-[360px] rounded-lg border border-border/60">
              {items.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No transactions for this driver in the selected window.
                </div>
              ) : (
                <Table>
                  <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur">
                    <TableRow>
                      <TableHead className="w-[100px]">Date</TableHead>
                      <TableHead className="w-[100px]">Period</TableHead>
                      <TableHead className="w-[120px]">Ref</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map(i => (
                      <TableRow key={i.id}>
                        <TableCell className="text-xs tabular-nums">
                          {i.date ? format(new Date(i.date), 'MMM d') : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px]',
                              i.bucket === 'current' ? 'border-primary/50 text-primary' : 'border-border/70 text-muted-foreground',
                            )}
                          >
                            {i.bucket === 'current' ? 'Current' : 'Prior'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{i.reference}</TableCell>
                        <TableCell className="text-xs truncate max-w-[280px]">{i.description}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {formatDeltaValue(i.amount, 'currency')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="cohort" className="flex-1 min-h-0 mt-2">
            <div className="rounded-lg border border-border/60 p-4 space-y-3 text-sm">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <Calculator className="h-3.5 w-3.5" />
                {labels?.cohortLabel ?? 'Cohort'}
              </div>
              <CalcRow label="Current period total" value={formatDeltaValue(totals.cur, 'currency')} sub={`${totals.curCount} transactions, avg ${formatDeltaValue(totals.curCount ? totals.cur / totals.curCount : 0, 'currency')}`} />
              <CalcRow label="− Prior period total" value={formatDeltaValue(totals.prev, 'currency')} sub={`${totals.prevCount} transactions, avg ${formatDeltaValue(totals.prevCount ? totals.prev / totals.prevCount : 0, 'currency')}`} />
              <div className="border-t border-border/60 pt-3">
                <CalcRow
                  label="= Driver Δ"
                  value={`${positive ? '+' : ''}${formatDeltaValue(totals.delta, 'currency')}`}
                  valueClass={positive ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-destructive font-semibold'}
                />
                <CalcRow
                  label="÷ Total metric Δ"
                  value={formatDeltaValue(totalDelta, 'currency')}
                />
                <CalcRow
                  label="= Share of metric Δ"
                  value={`${totalDelta ? ((contributorDelta / totalDelta) * 100).toFixed(1) : '—'}%`}
                  valueClass="font-semibold"
                />
              </div>
              <p className="text-[11px] text-muted-foreground pt-1">
                Shares are computed against the absolute total Δ across all contributors so positive and
                negative drivers can be compared on the same scale.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="explain" className="flex-1 min-h-0 mt-2">
            <div className="rounded-lg border border-border/60 p-4 space-y-3 text-sm">
              {explanation ? (
                <div className="whitespace-pre-wrap leading-relaxed">{explanation}</div>
              ) : (
                <div className="text-muted-foreground">
                  Generate a concise AI narrative explaining what changed for this driver, citing
                  the specific reference numbers above.
                </div>
              )}
              <Button onClick={explain} disabled={busy || items.length === 0} size="sm">
                {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
                {explanation ? 'Regenerate explanation' : 'Explain this driver'}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function SummaryStat({
  label,
  value,
  sub,
  valueClass,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn('text-base font-semibold tabular-nums flex items-center gap-1', valueClass)}>
        {icon}
        {value}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function CalcRow({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="text-sm">{label}</div>
        {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
      </div>
      <div className={cn('tabular-nums text-sm', valueClass)}>{value}</div>
    </div>
  );
}