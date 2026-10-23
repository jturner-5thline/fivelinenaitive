import { Clock, Layers, DollarSign, Hash, TrendingUp } from 'lucide-react';

const KPIS = [
  { key: 'rev_hour', label: 'Current Revenue / Hour', icon: Clock },
  { key: 'active_pipeline', label: 'Total Active Pipeline', icon: Layers },
  { key: 'sales_pipeline', label: 'Total Sales Pipeline', icon: TrendingUp },
  { key: 'total_revenue', label: 'Total Revenue', icon: DollarSign },
  { key: 'total_deals', label: 'Total Deals', icon: Hash },
] as const;

/** 5th Line active-pipeline KPI row. Values are placeholders until wired up. */
export function ActivePipelineKPIRow() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
      {KPIS.map(({ key, label, icon: Icon }) => (
        <div key={key} className="rounded-lg border border-border bg-card px-4 py-3 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground truncate">{label}</p>
            <Icon className="h-4 w-4 text-primary shrink-0" />
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">—</p>
        </div>
      ))}
    </div>
  );
}
