import { Clock, Layers, DollarSign, Hash, TrendingUp } from 'lucide-react';
import type { Deal } from '@/types/deal';
import { currentRevenuePerHour, totalActivePipelineValue, totalSalesPipelineValue } from '@/lib/activePipelineKpis';
import { formatUSDFromDollars } from '@/lib/formatters/currency';

const KPIS = [
  { key: 'rev_hour', label: 'Current Revenue / Hour', icon: Clock },
  { key: 'active_pipeline', label: 'Total Active Pipeline', icon: Layers },
  { key: 'sales_pipeline', label: 'Total Sales Pipeline', icon: TrendingUp },
  { key: 'total_revenue', label: 'Total Revenue', icon: DollarSign },
  { key: 'total_deals', label: 'Total Deals', icon: Hash },
] as const;

/** 5th Line active-pipeline KPI row. Unwired values show a placeholder. */
export function ActivePipelineKPIRow({ deals, stages = [] }: { deals: Deal[]; stages?: { id: string; label: string }[] }) {
  const rph = currentRevenuePerHour(deals);
  const values: Record<string, string> = {
    rev_hour: rph == null ? '—' : `$${Math.round(rph).toLocaleString()}/hr`,
    active_pipeline: formatUSDFromDollars(totalActivePipelineValue(deals, stages)),
    sales_pipeline: formatUSDFromDollars(totalSalesPipelineValue(deals, stages)),
  };
  return (
    <div className="grid grid-cols-5 gap-2 sm:gap-3 mb-4">
      {KPIS.map(({ key, label, icon: Icon }) => (
        <div key={key} className="rounded-lg border-0 bg-transparent shadow-none px-2 sm:px-4 py-3 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[9px] sm:text-[11px] font-medium uppercase tracking-wider text-foreground truncate">{label}</p>
            <Icon className="h-4 w-4 text-primary shrink-0" />
          </div>
          <p className="mt-2 text-lg sm:text-2xl font-semibold tabular-nums text-foreground truncate">{values[key] ?? '—'}</p>
        </div>
      ))}
    </div>
  );
}
