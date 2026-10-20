import { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Deal } from '@/types/deal';
import { buildClientTypeMix, type ClientTypeMetric, type ClientTypeSlice } from './clientTypeMix';

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--muted-foreground))'];

function fmtMrr(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}MM`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(2)}K`;
  return `$${Math.round(v)}`;
}

export function ClientTypeDonut({ deals, onDrill }: { deals: Deal[]; onDrill: (slice: ClientTypeSlice, metric: ClientTypeMetric) => void }) {
  const [metric, setMetric] = useState<ClientTypeMetric>('count');
  const data = useMemo(() => buildClientTypeMix(deals, metric), [deals, metric]);
  const total = data.reduce((s, d) => s + d.value, 0);
  const fmt = (v: number) => (metric === 'count' ? String(v) : fmtMrr(v));

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Client Types</CardTitle>
        <div className="flex rounded-md border border-border p-0.5" role="group" aria-label="Client type metric">
          {(['count', 'mrr'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={metric === m}
              onClick={() => setMetric(m)}
              className={cn(
                'px-2 py-0.5 text-[11px] rounded-sm transition-colors',
                metric === m ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {m === 'count' ? 'Clients' : 'MRR'}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative h-[180px]">
          {total === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No data yet</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data} dataKey="value" nameKey="name" innerRadius={52} outerRadius={80} paddingAngle={2} stroke="none"
                    onClick={(d: any) => { const s = data.find((x) => x.name === d?.name); if (s) onDrill(s, metric); }}
                    className="cursor-pointer">
                    {data.map((d, i) => <Cell key={d.name} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number, n: string) => [`${fmt(v)} (${Math.round((v / total) * 100)}%)`, n]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-bold tabular-nums font-mono">{fmt(total)}</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{metric === 'count' ? 'Clients' : 'MRR'}</span>
              </div>
            </>
          )}
        </div>
        <div className="mt-2 space-y-0.5">
          {data.map((d, i) => (
            <button key={d.name} type="button" onClick={() => onDrill(d, metric)}
              className="w-full flex items-center gap-2 px-2 py-1 -mx-2 rounded-md text-left hover:bg-muted/40 transition-colors">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              <span className="text-xs truncate flex-1 min-w-0">{d.name}</span>
              <span className="text-xs font-semibold tabular-nums font-mono">{fmt(d.value)}</span>
              <span className="text-[10px] text-muted-foreground w-8 text-right tabular-nums">{total ? Math.round((d.value / total) * 100) : 0}%</span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
