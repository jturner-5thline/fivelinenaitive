import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowUpRight, ArrowDownRight, ChevronRight, Info
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ResponsiveContainer, AreaChart, Area
} from 'recharts';
import { useQBKPIData } from '@/hooks/useQBKPIData';

export interface KPI {
  id: string;
  label: string;
  value: string;
  change: string;
  trend: 'up' | 'down' | 'flat';
  isPositive: boolean;
  period: string;
  detail: string;
  sparkline: number[];
  category: 'revenue' | 'cost' | 'margin' | 'operational';
}

const KPI_TOOLTIPS: Record<string, string> = {
  revenue: 'Total top-line revenue from all streams (QuickBooks invoices). Current month accrual basis.',
  'gross-margin': 'Revenue minus COGS as a percentage. Sourced from QuickBooks P&L report.',
  opex: 'Total operating expenses from QuickBooks. Excludes COGS and interest.',
  ebitda: 'Revenue minus OPEX (simplified EBITDA proxy from QuickBooks data).',
  runway: 'Months of operations remaining at current net burn rate. Computed from cash balance ÷ net burn.',
  burn: 'Monthly net cash outflow (expenses minus revenue). Decreasing burn is positive.',
};

const fmtCurrency = (v: number): string => {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${v < 0 ? '-' : ''}$${(abs / 1_000_000).toFixed(1)}MM`;
  if (abs >= 1_000) return `${v < 0 ? '-' : ''}$${(abs / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
};

const fmtPct = (v: number): string => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
const fmtPp = (v: number): string => `${v >= 0 ? '+' : ''}${v.toFixed(1)}pp`;

function computeChange(current: number, previous: number): { change: string; pct: number } {
  if (previous === 0) return { change: '—', pct: 0 };
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  return { change: fmtPct(pct), pct };
}

interface KPICardsProps {
  onKPIClick?: (kpi: KPI) => void;
  selectedKPI?: string | null;
}

export function KPICards({ onKPIClick, selectedKPI }: KPICardsProps) {
  const { data, isLoading } = useQBKPIData();

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-3 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-3 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const revChange = computeChange(data.totalRevenue, data.prevRevenue);
  const opexChange = computeChange(data.totalOpex, data.prevOpex);
  const ebitdaChange = computeChange(data.ebitda, data.prevEbitda);
  const burnChange = computeChange(data.netBurn, data.prevNetBurn);
  const runwayChange = computeChange(data.runwayMonths, data.prevRunwayMonths);
  const marginDiff = data.grossMarginPct - data.prevGrossMarginPct;

  const kpis: KPI[] = [
    {
      id: 'revenue',
      label: 'Total Revenue',
      value: fmtCurrency(data.totalRevenue),
      change: revChange.change,
      trend: revChange.pct >= 0 ? 'up' : 'down',
      isPositive: revChange.pct >= 0,
      period: 'MoM',
      detail: `${fmtCurrency(data.prevRevenue)} → ${fmtCurrency(data.totalRevenue)}`,
      sparkline: data.revenueSparkline,
      category: 'revenue',
    },
    {
      id: 'gross-margin',
      label: 'Gross Margin',
      value: `${data.grossMarginPct.toFixed(1)}%`,
      change: fmtPp(marginDiff),
      trend: marginDiff >= 0 ? 'up' : 'down',
      isPositive: marginDiff >= 0,
      period: 'MoM',
      detail: `${data.prevGrossMarginPct.toFixed(1)}% → ${data.grossMarginPct.toFixed(1)}%`,
      sparkline: data.revenueSparkline.map((r, i) => {
        const e = data.opexSparkline[i] || 0;
        return r > 0 ? ((r - e) / r) * 100 : 0;
      }),
      category: 'margin',
    },
    {
      id: 'opex',
      label: 'Total OPEX',
      value: fmtCurrency(data.totalOpex),
      change: opexChange.change,
      trend: opexChange.pct >= 0 ? 'up' : 'down',
      isPositive: opexChange.pct <= 0, // lower opex is positive
      period: 'MoM',
      detail: `${fmtCurrency(data.prevOpex)} → ${fmtCurrency(data.totalOpex)}`,
      sparkline: data.opexSparkline,
      category: 'cost',
    },
    {
      id: 'ebitda',
      label: 'EBITDA',
      value: fmtCurrency(data.ebitda),
      change: ebitdaChange.change,
      trend: ebitdaChange.pct >= 0 ? 'up' : 'down',
      isPositive: ebitdaChange.pct >= 0,
      period: 'MoM',
      detail: `${fmtCurrency(data.prevEbitda)} → ${fmtCurrency(data.ebitda)}`,
      sparkline: data.ebitdaSparkline,
      category: 'margin',
    },
    {
      id: 'runway',
      label: 'Cash Runway',
      value: data.runwayMonths >= 999 ? '∞' : `${data.runwayMonths} mo`,
      change: runwayChange.change,
      trend: runwayChange.pct >= 0 ? 'up' : 'down',
      isPositive: runwayChange.pct >= 0,
      period: 'MoM',
      detail: data.prevRunwayMonths >= 999
        ? `∞ → ${data.runwayMonths >= 999 ? '∞' : data.runwayMonths + ' months'}`
        : `${data.prevRunwayMonths} → ${data.runwayMonths >= 999 ? '∞' : data.runwayMonths + ' months'}`,
      sparkline: [0, 0, 0, 0, 0, data.runwayMonths >= 999 ? 100 : data.runwayMonths],
      category: 'operational',
    },
    {
      id: 'burn',
      label: 'Net Burn',
      value: fmtCurrency(data.netBurn),
      change: burnChange.change,
      trend: burnChange.pct >= 0 ? 'up' : 'down',
      isPositive: burnChange.pct <= 0, // lower burn is positive
      period: 'MoM',
      detail: `${fmtCurrency(data.prevNetBurn)} → ${fmtCurrency(data.netBurn)}`,
      sparkline: data.burnSparkline,
      category: 'cost',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3" role="list" aria-label="Key Performance Indicators">
      {kpis.map((kpi) => {
        const sparkData = kpi.sparkline.map((v) => ({ v }));
        const sparkColor = kpi.isPositive ? 'hsl(var(--chart-2))' : 'hsl(var(--chart-5))';
        const isSelected = selectedKPI === kpi.id;

        return (
          <Card
            key={kpi.id}
            className={cn(
              "cursor-pointer transition-all hover:shadow-md",
              isSelected && "ring-2 ring-primary shadow-md"
            )}
            onClick={() => onKPIClick?.(kpi)}
            role="listitem"
            tabIndex={0}
            aria-label={`${kpi.label}: ${kpi.value}, ${kpi.change} ${kpi.period}`}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onKPIClick?.(kpi); } }}
          >
            <CardContent className="p-3">
              <div className="flex items-start justify-between mb-1">
                <div className="flex items-center gap-1">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide leading-tight">{kpi.label}</p>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 text-muted-foreground/50 hover:text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[220px] text-xs">
                      {KPI_TOOLTIPS[kpi.id] || kpi.label}
                    </TooltipContent>
                  </Tooltip>
                </div>
                <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <span className="text-lg font-bold leading-none">{kpi.value}</span>
                  <div className="flex items-center gap-1 mt-1">
                    <span className={cn(
                      "text-[10px] font-medium flex items-center gap-0.5",
                      kpi.isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                    )}>
                      {kpi.trend === 'up' ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
                      {kpi.change}
                    </span>
                    <span className="text-[9px] text-muted-foreground">{kpi.period}</span>
                  </div>
                </div>
                <div className="w-16 h-8">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={sparkData}>
                      <Area
                        type="monotone"
                        dataKey="v"
                        stroke={sparkColor}
                        fill={sparkColor}
                        fillOpacity={0.15}
                        strokeWidth={0.75}
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <p className="text-[9px] text-muted-foreground mt-1">{kpi.detail}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
