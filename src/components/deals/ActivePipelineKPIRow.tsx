import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Layers, DollarSign, Hash, TrendingUp } from 'lucide-react';
import { STATUS_CONFIG, type Deal, type DealStatus } from '@/types/deal';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const STATUS_COLORS: Record<string, string> = {
  'on-track': 'hsl(var(--success, 142 70% 45%))',
  'at-risk': 'hsl(var(--warning, 38 92% 50%))',
  'off-track': 'hsl(var(--destructive))',
  'on-hold': 'hsl(var(--muted-foreground))',
  archived: 'hsl(var(--border))',
  none: 'hsl(var(--primary))',
};
const statusLabel = (s: string) => STATUS_CONFIG[s as DealStatus]?.label ?? 'No status';
import { activeDealsCount, currentRevenuePerHour, kpiDrilldownRows, pendingRevenueRows, totalRevenueByStatus, totalActivePipelineValue, totalActiveRevenue, totalSalesPipelineValue, type KpiKey } from '@/lib/activePipelineKpis';
import { formatUSDFromDollars } from '@/lib/formatters/currency';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const KPIS = [
  { key: 'rev_hour', label: 'Current Revenue / Hour', icon: Clock, amountLabel: 'Total Fee' },
  { key: 'active_pipeline', label: 'Total Active Pipeline', icon: Layers, amountLabel: 'Volume' },
  { key: 'sales_pipeline', label: 'Total Sales Pipeline', icon: TrendingUp, amountLabel: 'Volume' },
  { key: 'total_revenue', label: 'Total Revenue', icon: DollarSign, amountLabel: 'Revenue' },
  { key: 'active_deals', label: 'Active Deals', icon: Hash, amountLabel: 'Volume' },
] as const;

/** 5th Line active-pipeline KPI row; each card opens a list of the deals behind it. */
export function ActivePipelineKPIRow({ deals, stages = [] }: { deals: Deal[]; stages?: { id: string; label: string }[] }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState<KpiKey | null>(null);
  const rph = currentRevenuePerHour(deals);
  const values: Record<string, string> = {
    rev_hour: rph == null ? '—' : `$${Math.round(rph).toLocaleString()}/hr`,
    active_pipeline: formatUSDFromDollars(totalActivePipelineValue(deals, stages)),
    sales_pipeline: formatUSDFromDollars(totalSalesPipelineValue(deals, stages)),
    total_revenue: formatUSDFromDollars(totalActiveRevenue(deals, stages)),
    active_deals: activeDealsCount(deals, stages).toLocaleString(),
  };
  const kpi = KPIS.find(k => k.key === open);
  const rows = useMemo(() => (open ? kpiDrilldownRows(open, deals, stages) : []), [open, deals, stages]);
  const byStatus = useMemo(() => (open === 'total_revenue' ? totalRevenueByStatus(deals, stages) : []), [open, deals, stages]);
  const pending = useMemo(() => (open === 'total_revenue' ? pendingRevenueRows(deals, stages) : []), [open, deals, stages]);
  const pendingTotal = pending.reduce((t, r) => t + (r.amount ?? 0), 0);
  const revTotal = byStatus.reduce((t, r) => t + r.value, 0);
  const dealTable = (list: typeof rows, amountLabel?: string) => (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-card">
        <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
          <th className="text-left font-medium px-2 py-2">Deal</th>
          <th className="text-left font-medium px-2 py-2">Stage</th>
          <th className="text-right font-medium px-2 py-2">{amountLabel}</th>
        </tr>
      </thead>
      <tbody>
        {list.map(r => (
          <tr key={r.deal.id} onClick={() => navigate(`/deals/${r.deal.id}`)} className="cursor-pointer border-t border-border hover:bg-foreground/[0.04]">
            <td className="px-2 py-2 text-foreground truncate max-w-[220px]">{r.deal.company}</td>
            <td className="px-2 py-2 text-muted-foreground">{r.stageLabel}</td>
            <td className="px-2 py-2 text-right tabular-nums text-foreground">
              {r.amount == null ? '—' : formatUSDFromDollars(r.amount)}
              {r.detail && <div className="text-[11px] text-muted-foreground">{r.detail}</div>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <>
      <div className="grid grid-cols-5 gap-2 sm:gap-3 mb-4">
        {KPIS.map(({ key, label, icon: Icon }) => (
          <button
            type="button"
            key={key}
            onClick={() => setOpen(key)}
            className="text-left rounded-lg border-0 bg-transparent shadow-none px-2 sm:px-4 py-3 min-w-0 transition-colors hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[9px] sm:text-[11px] font-medium uppercase tracking-wider text-foreground truncate">{label}</p>
              <Icon className="h-4 w-4 text-primary shrink-0" />
            </div>
            <p className="mt-2 text-lg sm:text-2xl font-semibold tabular-nums text-foreground truncate">{values[key] ?? '—'}</p>
          </button>
        ))}
      </div>

      <Dialog open={!!open} onOpenChange={o => !o && setOpen(null)}>
        {open === 'total_revenue' ? (
        <DialogContent className="max-w-6xl w-[95vw] h-[85vh] flex flex-col gap-3 overflow-hidden">
          <DialogHeader>
            <DialogTitle>Total Revenue</DialogTitle>
            <DialogDescription>Click a deal to open it</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 shrink-0">
            {[
              ['Total Revenue', values.total_revenue, `${rows.length} deals`],
              ['Pending Revenue', formatUSDFromDollars(pendingTotal), `${pending.length} deals · Agreement Pending onward`],
              ['Largest Status', byStatus[0] ? statusLabel([...byStatus].sort((a, b) => b.value - a.value)[0].status) : '—', revTotal ? `${Math.round(([...byStatus].sort((a, b) => b.value - a.value)[0].value / revTotal) * 100)}% of revenue` : ''],
            ].map(([l, v, sub]) => (
              <div key={l} className="rounded-lg border border-border bg-card px-4 py-3 min-w-0">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground truncate">{l}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-primary truncate">{v}</p>
                <p className="text-[11px] text-muted-foreground truncate">{sub}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 flex-1 min-h-0">
            <div className="rounded-lg border border-border bg-card p-4 flex flex-col min-h-0 overflow-hidden">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Revenue by status</p>
              <div className="flex-1 min-h-0 overflow-y-auto">
                {revTotal === 0 ? (
                  <p className="text-sm text-muted-foreground">No revenue yet.</p>
                ) : (
                  <div className="flex flex-col items-center gap-4">
                    <div className="relative h-[170px] w-[170px] shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={byStatus} dataKey="value" nameKey="status" innerRadius={50} outerRadius={78} paddingAngle={2} stroke="none">
                            {byStatus.map(d => <Cell key={d.status} fill={STATUS_COLORS[d.status] ?? STATUS_COLORS.none} />)}
                          </Pie>
                          <Tooltip
                            contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                            itemStyle={{ color: 'hsl(var(--foreground))' }}
                            formatter={(v: number, n: string) => [`${formatUSDFromDollars(v)} (${Math.round((v / revTotal) * 100)}%)`, statusLabel(n)]}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-sm font-semibold tabular-nums">{formatUSDFromDollars(revTotal)}</span>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</span>
                      </div>
                    </div>
                    <div className="flex-1 w-full space-y-1">
                      {byStatus.map(d => (
                        <div key={d.status} className="flex items-center gap-2 text-sm">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLORS[d.status] ?? STATUS_COLORS.none }} />
                          <span className="flex-1 text-foreground">{statusLabel(d.status)}</span>
                          <span className="tabular-nums text-foreground">{formatUSDFromDollars(d.value)}</span>
                          <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">{Math.round((d.value / revTotal) * 100)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-3 flex flex-col min-h-0">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1 px-1">Deals in Total Revenue</p>
              <div className="flex-1 min-h-0 overflow-y-auto">
                {rows.length === 0 ? <p className="py-6 text-sm text-muted-foreground text-center">No deals.</p> : dealTable(rows, 'Revenue')}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-3 flex flex-col min-h-0">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1 px-1">Pending Revenue deals</p>
              <div className="flex-1 min-h-0 overflow-y-auto">
                {pending.length === 0 ? <p className="py-6 text-sm text-muted-foreground text-center">No deals at Agreement Pending or later.</p> : dealTable(pending, 'Total Fee')}
              </div>
            </div>
          </div>
        </DialogContent>
        ) : (
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-baseline justify-between gap-4 pr-6">
              <span>{kpi?.label}</span>
              <span className="tabular-nums text-primary">{open ? values[open] : ''}</span>
            </DialogTitle>
            <DialogDescription>{rows.length} deal{rows.length === 1 ? '' : 's'} included · click a deal to open it</DialogDescription>
          </DialogHeader>
          <div className="max-h-[65vh] overflow-y-auto -mx-2 px-2">
            {rows.length === 0 ? (
              <p className="px-2 py-6 text-sm text-muted-foreground text-center">No deals currently count toward this number.</p>
            ) : dealTable(rows, kpi?.amountLabel)}
          </div>
        </DialogContent>
        )}
      </Dialog>
    </>
  );
}
