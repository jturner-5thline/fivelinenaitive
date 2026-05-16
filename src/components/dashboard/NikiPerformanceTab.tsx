import { Fragment, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RepPerformanceModelGrid } from '@/components/metrics/rep-model/RepPerformanceModelGrid';
import { formatUSD } from '@/lib/formatters/currency';
import { cn } from '@/lib/utils';
import {
  useNikiPerformanceMetrics,
  NIKI_PLAN_2026,
  NIKI_QUARTERS,
  type MetricRow,
  type PerfDeal,
  type QuarterKey,
} from '@/hooks/useNikiPerformanceMetrics';

function fmt(value: number, unit: 'count' | 'currency'): string {
  if (unit === 'currency') return formatUSD(value);
  return String(value);
}

function variance(actual: number, plan: number) {
  const diff = actual - plan;
  if (!plan) return { diff, pct: null as number | null };
  return { diff, pct: diff / plan };
}

export function NikiPerformanceTab() {
  const { rows, isLoading } = useNikiPerformanceMetrics();
  const [drill, setDrill] = useState<{ title: string; deals: PerfDeal[] } | null>(null);

  const openDrill = (row: MetricRow, q: QuarterKey | 'YEAR') => {
    const deals = q === 'YEAR' ? row.yearDeals : row.byQuarter[q].deals;
    const label = q === 'YEAR' ? '2026' : `${q} 2026`;
    setDrill({ title: `${row.label} — ${label}`, deals });
  };

  return (
    <div className="mt-4 space-y-6">
      {/* Plan table — existing Google-sheet mirror */}
      <RepPerformanceModelGrid />

      {/* Actuals vs Plan */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Actuals vs Plan — 2026 (Niki Heikali)</CardTitle>
          <CardDescription>
            Live actuals from Active Pipeline stage-entry events, scoped to deals where Niki is the
            owner or deal manager. Click any actual cell to see the underlying deals.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 bg-muted">
              <tr className="text-muted-foreground">
                <th className="text-left px-3 py-2 font-medium border-b border-border">Metric</th>
                {NIKI_QUARTERS.map((q) => (
                  <th key={q.key} className="text-right px-3 py-2 font-medium border-b border-border" colSpan={2}>
                    {q.key} 2026
                  </th>
                ))}
                <th className="text-right px-3 py-2 font-medium border-b border-border" colSpan={2}>
                  2026 Total
                </th>
                <th className="text-right px-3 py-2 font-medium border-b border-border">Variance</th>
                <th className="text-right px-3 py-2 font-medium border-b border-border">Var %</th>
              </tr>
              <tr className="text-[10px] text-muted-foreground/80">
                <th className="px-3 py-1 border-b border-border" />
                {NIKI_QUARTERS.map((q) => (
                  <Fragment key={q.key}>
                    <th className="text-right px-2 py-1 border-b border-border font-normal">Plan</th>
                    <th className="text-right px-2 py-1 border-b border-border font-normal">Actual</th>
                  </Fragment>
                ))}
                <th className="text-right px-2 py-1 border-b border-border font-normal">Plan</th>
                <th className="text-right px-2 py-1 border-b border-border font-normal">Actual</th>
                <th className="px-2 py-1 border-b border-border" />
                <th className="px-2 py-1 border-b border-border" />
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={13} className="text-center text-muted-foreground py-6">
                    Loading actuals…
                  </td>
                </tr>
              )}
              {!isLoading && rows.map((row) => {
                const plan = NIKI_PLAN_2026[row.key];
                const v = variance(row.yearTotal, plan.total);
                return (
                  <tr key={row.key} className="border-b border-border/40 hover:bg-muted/30">
                    <td className="px-3 py-1.5 font-medium whitespace-nowrap">{row.label}</td>
                    {NIKI_QUARTERS.map((q) => {
                      const actual = row.byQuarter[q.key].value;
                      const planQ = plan[q.key];
                      return (
                        <Fragment key={q.key}>
                          <td className="text-right px-2 py-1.5 font-mono text-muted-foreground">
                            {fmt(planQ, row.unit)}
                          </td>
                          <td
                            className={cn(
                              'text-right px-2 py-1.5 font-mono cursor-pointer hover:underline',
                              actual >= planQ ? 'text-emerald-500' : 'text-foreground',
                            )}
                            onClick={() => openDrill(row, q.key)}
                          >
                            {fmt(actual, row.unit)}
                          </td>
                        </Fragment>
                      );
                    })}
                    <td className="text-right px-2 py-1.5 font-mono text-muted-foreground">
                      {fmt(plan.total, row.unit)}
                    </td>
                    <td
                      className={cn(
                        'text-right px-2 py-1.5 font-mono font-semibold cursor-pointer hover:underline',
                        row.yearTotal >= plan.total ? 'text-emerald-500' : 'text-foreground',
                      )}
                      onClick={() => openDrill(row, 'YEAR')}
                    >
                      {fmt(row.yearTotal, row.unit)}
                    </td>
                    <td
                      className={cn(
                        'text-right px-2 py-1.5 font-mono',
                        v.diff >= 0 ? 'text-emerald-500' : 'text-destructive',
                      )}
                    >
                      {v.diff > 0 ? '+' : ''}
                      {fmt(v.diff, row.unit)}
                    </td>
                    <td
                      className={cn(
                        'text-right px-2 py-1.5 font-mono',
                        v.pct === null ? 'text-muted-foreground' : v.pct >= 0 ? 'text-emerald-500' : 'text-destructive',
                      )}
                    >
                      {v.pct === null
                        ? '—'
                        : `${v.pct >= 0 ? '+' : ''}${(v.pct * 100).toFixed(1)}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{drill?.title}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {drill && drill.deals.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">No deals in this bucket.</p>
            )}
            {drill && drill.deals.length > 0 && (
              <table className="w-full text-xs">
                <thead className="text-muted-foreground border-b border-border">
                  <tr>
                    <th className="text-left px-2 py-2 font-medium">Company</th>
                    <th className="text-right px-2 py-2 font-medium">Value</th>
                    <th className="text-right px-2 py-2 font-medium">Entered</th>
                  </tr>
                </thead>
                <tbody>
                  {drill.deals.map((d) => (
                    <tr key={d.deal_id} className="border-b border-border/40">
                      <td className="px-2 py-1.5">
                        <a href={`/deals/${d.deal_id}`} className="hover:underline">{d.company}</a>
                      </td>
                      <td className="text-right px-2 py-1.5 font-mono">{formatUSD(d.value)}</td>
                      <td className="text-right px-2 py-1.5 text-muted-foreground">
                        {new Date(d.entered_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}