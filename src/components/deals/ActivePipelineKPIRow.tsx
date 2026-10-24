import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Layers, DollarSign, Hash, TrendingUp } from 'lucide-react';
import type { Deal } from '@/types/deal';
import { activeDealsCount, currentRevenuePerHour, kpiDrilldownRows, totalActivePipelineValue, totalActiveRevenue, totalSalesPipelineValue, type KpiKey } from '@/lib/activePipelineKpis';
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-baseline justify-between gap-4 pr-6">
              <span>{kpi?.label}</span>
              <span className="tabular-nums text-primary">{open ? values[open] : ''}</span>
            </DialogTitle>
            <DialogDescription>{rows.length} deal{rows.length === 1 ? '' : 's'} included · click a deal to open it</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto -mx-2">
            {rows.length === 0 ? (
              <p className="px-2 py-6 text-sm text-muted-foreground text-center">No deals currently count toward this number.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="text-left font-medium px-2 py-2">Deal</th>
                    <th className="text-left font-medium px-2 py-2">Stage</th>
                    <th className="text-right font-medium px-2 py-2">{kpi?.amountLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
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
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
