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
import { useTtmPerHead, type TtmHeadScope } from '@/hooks/useTtmPerHead';
import { HEADCOUNT_DUPLICATE_NOTE } from '@/lib/monthlyHeadcount';
import type { TtmNumeratorMetric } from '@/hooks/useTtmRevenuePerDealHour';
import { formatUSDFromDollars } from '@/lib/formatters/currency';
import type { TtmHeadMonth } from '@/lib/metrics/ttmPerHead';

const rateLabel = (rate: number | null) => rate == null ? '—' : `${formatUSDFromDollars(rate)} / head`;
const fullDollars = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n);
const hc = (n: number | null) => n == null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: 2 });
type Row = NonNullable<ReturnType<typeof useTtmPerHead>['data']>[number];

function Delta({ row }: { row: Row }) {
  if (row.delta == null) return null;
  return <span className={row.delta >= 0 ? 'text-primary' : 'text-muted-foreground'}>
    {row.delta >= 0 ? '+' : '−'}{formatUSDFromDollars(Math.abs(row.delta))}
    {row.deltaPct != null ? ` (${row.deltaPct >= 0 ? '+' : ''}${row.deltaPct.toFixed(1)}%)` : ''}
    <span className="text-muted-foreground"> vs {row.priorLabel}</span>
  </span>;
}

function Bars({ rows, onSelect, height, noun }: { rows: Row[]; onSelect: (r: Row) => void; height: number; noun: string }) {
  if (rows.every(r => r.rate == null)) return <p className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">No complete 12-month headcount for these periods.</p>;
  return <div className="w-full" style={{ height }}>
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 8 }} accessibilityLayer>
        <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} minTickGap={14} />
        <YAxis width={70} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} tickFormatter={v => formatUSDFromDollars(Number(v))} />
        <Tooltip cursor={{ fill: 'hsl(var(--primary) / 0.08)' }} content={({ active, payload }) => {
          const row = payload?.[0]?.payload as Row | undefined;
          if (!active || !row) return null;
          return <div className="rounded-md border border-border bg-popover p-3 text-xs text-popover-foreground shadow-lg">
            <p className="font-semibold">TTM ending {row.label}</p>
            <p className="mt-1 text-lg font-semibold">{rateLabel(row.rate)}</p>
            <p>{fullDollars(row.revenue)} {noun.toLowerCase()}</p><p>{hc(row.avgHeadcount)} avg headcount</p>
            <p className="mt-1"><Delta row={row} /></p>
            <p className="mt-1 text-muted-foreground">{row.start} – {row.end}</p>
          </div>;
        }} />
        <Bar dataKey="rate" name={`${noun} per head`} fill="hsl(var(--primary))" shape={createGlassBarShape({ radius: 4 })} cursor="pointer" isAnimationActive={false} onClick={(_, i) => { const r = rows[i]; if (r) onSelect(r); }} />
      </BarChart>
    </ResponsiveContainer>
  </div>;
}

const COPY: Record<TtmNumeratorMetric, { title: string; noun: string; id: string }> = {
  revenue: { title: 'TTM Revenue per Head', noun: 'Revenue', id: 'ttm-revenue-per-head' },
  gross_profit: { title: 'TTM Gross Profit per Head', noun: 'Gross Profit', id: 'ttm-gross-profit-per-head' },
};

export function TtmPerHeadChart({ metric = 'revenue', scope = 'debt' }: { metric?: TtmNumeratorMetric; scope?: TtmHeadScope }) {
  const firm = scope === 'firm';
  const base = COPY[metric];
  const fin = scope === 'finserv';
  const title = firm ? `${base.title} (Firm-wide)` : fin ? `${base.title} (FinServ)` : base.title;
  const noun = base.noun;
  const id = firm ? `${base.id}-firm` : fin ? `${base.id}-finserv` : base.id;
  const entity = firm ? 'All entities' : fin ? '5th Line Financial Services' : '5th Line Capital Advisors';
  const unitLabel = fin ? 'FinServ' : 'Debt';
  const query = useTtmPerHead(1, true, metric, scope);
  const [selected, setSelected] = useState<Row | null>(null);
  const [expanded, setExpanded] = useState(false);
  const wide = useTtmPerHead(3, expanded, metric, scope);
  const rows = query.data ?? [];
  const wideRows = wide.data ?? [];
  const latest = rows.at(-1);
  if (!query.hasAccess) return null;
  const columns: DrilldownColumn<TtmHeadMonth>[] = [
    { key: 'label', label: 'Month', sortable: true, sortAccessor: r => r.month },
    { key: 'amount', label: noun, align: 'right', sortable: true, render: r => fullDollars(r.amount) },
    { key: 'headcount', label: 'Headcount', align: 'right', sortable: true, sortAccessor: r => r.headcount ?? -1, render: r => hc(r.headcount) },
    { key: 'ratio', label: `${noun} / head`, align: 'right', sortable: true, sortAccessor: r => r.headcount ? r.amount / r.headcount : -Infinity, render: r => r.headcount ? formatUSDFromDollars(r.amount / r.headcount) : '—' },
  ];
  const errorBox = (h: string, retry: () => void) => <div role="alert" className={`flex ${h} flex-col items-center justify-center gap-3`}>
    <p className="text-sm text-destructive">{noun} and headcount could not be loaded.</p>
    <Button variant="outline" size="sm" onClick={retry}><RotateCw />Retry</Button>
  </div>;
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
        <p className="text-xs text-muted-foreground">{firm ? <>All entities · ÷ avg <span title={HEADCOUNT_DUPLICATE_NOTE} className="cursor-help underline decoration-dotted underline-offset-4">firm-wide headcount</span></> : `${entity} · ÷ avg ${unitLabel} headcount`}</p>
      </CardHeader>
      <CardContent>
        {query.isLoading ? <Skeleton className="h-[300px] w-full" /> : query.isError ? errorBox('min-h-[300px]', () => void query.refetch()) : <>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <Button variant="link" className="h-auto p-0 text-3xl font-semibold text-foreground" aria-label="View selected period months" onClick={() => latest && setSelected(latest)}>{rateLabel(latest?.rate ?? null)}</Button>
              {latest && <div className="mt-1 text-xs"><Delta row={latest} /></div>}
            </div>
            {latest && <div className="text-xs text-muted-foreground">{formatUSDFromDollars(latest.revenue)} {noun.toLowerCase()} · {hc(latest.avgHeadcount)} avg headcount</div>}
          </div>
          <Bars rows={rows} onSelect={setSelected} height={240} noun={noun} />
        </>}
      </CardContent>
    </Card>
    <Dialog open={expanded} onOpenChange={setExpanded}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{entity} · {wideRows.length} rolling periods{wideRows.length ? ` (${wideRows[0].label} – ${wideRows.at(-1)!.label})` : ''}</DialogDescription>
        </DialogHeader>
        {wide.isLoading ? <Skeleton className="h-[480px] w-full" /> : wide.isError ? errorBox('h-[480px]', () => void wide.refetch()) :
          <Bars rows={wideRows} onSelect={r => { setExpanded(false); setSelected(r); }} height={480} noun={noun} />}
      </DialogContent>
    </Dialog>
    <InsightsDrilldownDrawer<TtmHeadMonth>
      open={selected != null} onClose={() => setSelected(null)}
      context={selected ? { sourceId: id, sourceLabel: title, selection: selected.label, periodLabel: `${selected.start} – ${selected.end}`, filters: [{ label: noun, value: entity }, { label: 'Headcount', value: firm ? 'Firm-wide (less 1 duplicate)' : unitLabel }] } : null}
      columns={columns} rows={selected?.months ?? []}
      emptyHint="No months in this trailing 12-month period."
      summary={selected && <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
        <div><p className="text-xs text-muted-foreground">TTM {noun.toLowerCase()}</p><p className="font-semibold">{fullDollars(selected.revenue)}</p></div>
        <div><p className="text-xs text-muted-foreground">Avg headcount</p><p className="font-semibold">{hc(selected.avgHeadcount)}</p></div>
        <div><p className="text-xs text-muted-foreground">{noun} / head</p><p className="font-semibold">{rateLabel(selected.rate)}</p></div>
      </div>}
    />
  </>;
}
