import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown,
  DollarSign, BarChart3, Percent, Clock, ChevronRight, Info
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ResponsiveContainer, AreaChart, Area
} from 'recharts';

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
  revenue: 'Total top-line revenue from all streams. Includes recurring, one-time, and service revenue before any deductions.',
  'gross-margin': 'Revenue minus COGS as a percentage. Measures production efficiency — higher is better. Target: >65%.',
  opex: 'Total operating expenses including payroll, rent, marketing, and G&A. Excludes COGS and interest.',
  ebitda: 'Earnings Before Interest, Taxes, Depreciation & Amortization. Key profitability proxy used by lenders.',
  runway: 'Months of operations remaining at current net burn rate. Below 12 months signals urgency.',
  burn: 'Monthly net cash outflow (expenses minus revenue). Decreasing burn is positive for runway.',
};

const KPIS: KPI[] = [
  { id: 'revenue', label: 'Total Revenue', value: '$9.5M', change: '+6.2%', trend: 'up', isPositive: true, period: 'MoM', detail: '$8.94M → $9.5M', sparkline: [7800, 8200, 8500, 8700, 8940, 9500], category: 'revenue' },
  { id: 'gross-margin', label: 'Gross Margin', value: '70.0%', change: '+5.3pp', trend: 'up', isPositive: true, period: 'MoM', detail: '63.3% → 70.0%', sparkline: [62, 63, 64, 63, 63.3, 70], category: 'margin' },
  { id: 'opex', label: 'Total OPEX', value: '$5.45M', change: '+2.1%', trend: 'up', isPositive: false, period: 'MoM', detail: '$5.34M → $5.45M', sparkline: [5000, 5100, 5200, 5250, 5340, 5450], category: 'cost' },
  { id: 'ebitda', label: 'EBITDA', value: '$1.2M', change: '+18.4%', trend: 'up', isPositive: true, period: 'MoM', detail: '$1.01M → $1.2M', sparkline: [700, 750, 850, 900, 1010, 1200], category: 'margin' },
  { id: 'runway', label: 'Cash Runway', value: '22 mo', change: '-4.3%', trend: 'down', isPositive: false, period: 'MoM', detail: '23 → 22 months', sparkline: [26, 25, 24, 24, 23, 22], category: 'operational' },
  { id: 'burn', label: 'Net Burn', value: '$320K', change: '-12.3%', trend: 'down', isPositive: true, period: 'MoM', detail: '$365K → $320K', sparkline: [420, 400, 380, 370, 365, 320], category: 'cost' },
];

interface KPICardsProps {
  onKPIClick?: (kpi: KPI) => void;
  selectedKPI?: string | null;
}

export function KPICards({ onKPIClick, selectedKPI }: KPICardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3" role="list" aria-label="Key Performance Indicators">
      {KPIS.map((kpi) => {
        const sparkData = kpi.sparkline.map((v, i) => ({ v }));
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
                      kpi.isPositive ? 'text-emerald-600' : 'text-amber-600'
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
                        strokeWidth={1.5}
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
