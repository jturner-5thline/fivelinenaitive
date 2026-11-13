import { useState } from 'react';
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Maximize2, RotateCw } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { createGlassBarShape } from '@/components/metrics/charts/LiquidGlassBar';
import { InsightsDrilldownDrawer, type DrilldownColumn } from '@/components/metrics/insights/InsightsDrilldownDrawer';
import { useTtmRevenuePerDealHour, type TtmNumeratorMetric } from '@/hooks/useTtmRevenuePerDealHour';
import { formatUSDFromDollars } from '@/lib/formatters/currency';
import type { TtmDealContribution } from '@/lib/metrics/ttmRevenuePerDealHour';

const rateLabel = (rate: number | null) => rate == null ? '—' : `${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(rate)}/hr`;
const fullDollars = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amount);
const hoursLabel = (hours: number) => hours.toLocaleString('en-US', { maximumFractionDigits: 2 });
type ChartRow = NonNullable<ReturnType<typeof useTtmRevenuePerDealHour>['data']>[number];

function Delta({ row }: { row: ChartRow }) {
  if (row.delta == null) return null;
  return <span className={row.delta >= 0 ? 'text-primary' : 'text-muted-foreground'}>
    {row.delta >= 0 ? '+' : '−'}{rateLabel(Math.abs(row.delta))}
    {row.deltaPct != null ? ` (${row.deltaPct >= 0 ? '+' : ''}${row.deltaPct.toFixed(1)}%)` : ''}
    <span className="text-muted-foreground"> vs {row.priorLabel}</span>
  </span>;
}

function TtmBars({ rows, onSelect, height, noun }: { rows: ChartRow[]; onSelect: (row: ChartRow) => void; height: number; noun: string }) {
  return rows.every(row => row.rate == null) ? <p className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">No qualifying deal hours in these periods.</p> :
              <div className="w-full" style={{ height }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 8 }} accessibilityLayer>
                    <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} minTickGap={14} />
                    <YAxis width={70} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} tickFormatter={value => `$${Number(value).toLocaleString()}`} />
                    <Tooltip cursor={{ fill: 'hsl(var(--primary) / 0.08)' }} content={({ active, payload }) => {
                      const row = payload?.[0]?.payload as ChartRow | undefined;
                      if (!active || !row) return null;
                      return <div className="rounded-md border border-border bg-popover p-3 text-xs text-popover-foreground shadow-lg">
                        <p className="font-semibold">TTM ending {row.label}</p>
                        <p className="mt-1 text-lg font-semibold">{rateLabel(row.rate)}</p>
                        <p>{fullDollars(row.revenue)} {noun.toLowerCase()}</p><p>{hoursLabel(row.hours)} deal hours</p>
                        <p className="mt-1"><Delta row={row} /></p>
                        <p className="mt-1 text-muted-foreground">{row.start} – {row.end}</p>
                      </div>;
                    }} />
                    <Bar dataKey="rate" name={`${noun} per deal hour`} fill="hsl(var(--primary))" shape={createGlassBarShape({ radius: 4 })} cursor="pointer" isAnimationActive={false} onClick={(_, index) => { const row = rows[index]; if (row) onSelect(row); }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>;
}

const METRIC_COPY: Record<TtmNumeratorMetric, { title: string; noun: string; id: string }> = {
  revenue: { title: 'TTM Revenue per Deal Hour', noun: 'Revenue', id: 'ttm-revenue-per-deal-hour' },
  gross_profit: { title: 'TTM Gross Margin per Deal Hour', noun: 'Gross Profit', id: 'ttm-gross-margin-per-deal-hour' },
};

export function TtmRevenuePerDealHourChart({ metric = 'revenue' }: { metric?: TtmNumeratorMetric } = {}) {
  const { title, noun, id } = METRIC_COPY[metric];
  const query = useTtmRevenuePerDealHour(1, true, metric);
  const [selected, setSelected] = useState<ChartRow | null>(null);
  const [expanded, setExpanded] = useState(false);
  const wide = useTtmRevenuePerDealHour(3, expanded, metric);
  const wideRows = wide.data ?? [];
  const rows = query.data ?? [];
  const latest = rows.at(-1);
  if (!query.hasAccess) return null;
  const columns: DrilldownColumn<TtmDealContribution>[] = [
    { key: 'name', label: 'Deal', sortable: true },
    { key: 'pipeline', label: 'Pipeline', sortable: true },
    { key: 'hours', label: 'TTM hours', align: 'right', sortable: true, render: row => hoursLabel(row.hours) },
    { key: 'share', label: '% of hours', align: 'right', sortable: true, sortAccessor: row => row.hours, render: row => selected && selected.hours > 0 ? `${(row.hours / selected.hours * 100).toFixed(1)}%` : '—' },
  ];
  return <>
    <Card className="glass-module min-w-0" data-testid={id}>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <div className="flex items-center gap-1">
            {latest && <Badge variant="outline">TTM ending {latest.label}</Badge>}
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Expand chart" onClick={() => setExpanded(true)}><Maximize2 className="h-4 w-4" /></Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">5th Line Capital Advisors</p>
      </CardHeader>
      <CardContent>
        {query.isLoading ? <Skeleton className="h-[300px] w-full" /> : query.isError ?
          <div role="alert" className="flex min-h-[300px] flex-col items-center justify-center gap-3">
            <p className="text-sm text-destructive">{noun} and deal hours could not be loaded.</p>
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}><RotateCw />Retry</Button>
          </div> : <>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <Button variant="link" className="h-auto p-0 text-3xl font-semibold text-foreground" aria-label="View selected period deal hours" onClick={() => latest && setSelected(latest)}>{rateLabel(latest?.rate ?? null)}</Button>
                {latest && <div className="mt-1 text-xs"><Delta row={latest} /></div>}
              </div>
              {latest && <div className="text-xs text-muted-foreground" title={`${fullDollars(latest.revenue)} ÷ ${hoursLabel(latest.hours)} hours`}>
                {formatUSDFromDollars(latest.revenue)} {noun.toLowerCase()} · {hoursLabel(latest.hours)} deal hours
              </div>}
            </div>
            <TtmBars rows={rows} onSelect={setSelected} height={240} noun={noun} />
            <div className="mt-2 flex flex-wrap gap-1" aria-label="TTM period details">
              {rows.map(row => <Button key={row.end} variant="ghost" size="sm" className="text-xs" aria-label={`View TTM deal hours for ${row.label}`} onClick={() => setSelected(row)}>{row.label}</Button>)}
            </div>
          </>}
      </CardContent>
    </Card>
    <Dialog open={expanded} onOpenChange={setExpanded}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>5th Line Capital Advisors · {wideRows.length} rolling periods{wideRows.length ? ` (${wideRows[0].label} – ${wideRows.at(-1)!.label})` : ''}</DialogDescription>
        </DialogHeader>
        {wide.isLoading ? <Skeleton className="h-[480px] w-full" /> : wide.isError ?
          <div role="alert" className="flex h-[480px] flex-col items-center justify-center gap-3">
            <p className="text-sm text-destructive">{noun} and deal hours could not be loaded.</p>
            <Button variant="outline" size="sm" onClick={() => void wide.refetch()}><RotateCw />Retry</Button>
          </div> : <TtmBars rows={wideRows} onSelect={row => { setExpanded(false); setSelected(row); }} height={480} noun={noun} />}
      </DialogContent>
    </Dialog>
    <InsightsDrilldownDrawer<TtmDealContribution>
      open={selected != null} onClose={() => setSelected(null)}
      context={selected ? { sourceId: id, sourceLabel: title, selection: selected.label, periodLabel: `${selected.start} – ${selected.end}`, filters: [{ label: noun, value: '5th Line Capital Advisors' }, { label: 'Hours', value: 'Active Pipeline + In Development' }] } : null}
      columns={columns} rows={selected?.deals ?? []} rowHref={row => `/deals/${row.id}`}
      emptyHint="No qualifying deal hours in this trailing 12-month period."
      summary={selected && <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
        <div><p className="text-xs text-muted-foreground">TTM {noun.toLowerCase()}</p><p className="font-semibold">{fullDollars(selected.revenue)}</p></div>
        <div><p className="text-xs text-muted-foreground">TTM deal hours</p><p className="font-semibold">{hoursLabel(selected.hours)}</p></div>
        <div><p className="text-xs text-muted-foreground">{noun} / hour</p><p className="font-semibold">{rateLabel(selected.rate)}</p></div>
      </div>}
    />
  </>;
}