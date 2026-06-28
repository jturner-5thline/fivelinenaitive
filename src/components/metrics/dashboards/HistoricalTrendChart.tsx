import { useMemo, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import { ChartTypeToggle, type ChartType } from '@/components/insights/ChartTypeToggle';
import { Skeleton } from '@/components/ui/skeleton';
import { buildCustomPeriod } from '@/hooks/useQBQuarterlyRevenue';
import { useQBStackedDebtRevenue } from '@/hooks/useQBStackedDebtRevenue';
import { useQBStackedFinServRevenue } from '@/hooks/useQBStackedFinServRevenue';
import { useMonthlyEntityProfit } from '@/hooks/useMonthlyEntityProfit';

const RANGE_OPTIONS = [
  { value: 6, label: '6M' },
  { value: 12, label: '12M' },
  { value: 24, label: '24M' },
] as const;

type RangeMonths = (typeof RANGE_OPTIONS)[number]['value'];

function fmtShort(value: number) {
  const neg = value < 0;
  const abs = Math.abs(value);
  let s: string;
  if (abs >= 1_000_000) s = `$${(abs / 1_000_000).toFixed(1)}M`;
  else if (abs >= 1_000) s = `$${(abs / 1_000).toFixed(1)}K`;
  else s = `$${abs.toFixed(0)}`;
  return neg ? `(${s})` : s;
}

function fmtFull(value: number) {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
  });
}

function trailingPeriod(months: RangeMonths) {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth() - (months - 1), 1);
  return buildCustomPeriod(start, end);
}

interface TrendPoint {
  monthKey: string;
  label: string;
  value: number;
}

interface ChartProps {
  title?: string;
  data: TrendPoint[];
  isLoading: boolean;
  color: string;
  allowNegative?: boolean;
  range: RangeMonths;
  onRangeChange: (r: RangeMonths) => void;
  chartType: ChartType;
  onChartTypeChange: (t: ChartType) => void;
}

function HistoricalTrendChart({
  title = 'Historical trend',
  data,
  isLoading,
  color,
  allowNegative = false,
  range,
  onRangeChange,
  chartType,
  onChartTypeChange,
}: ChartProps) {
  return (
    <div className="rounded-lg border border-border/50 bg-card/40 p-3 mt-4">
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {title}
        </div>
        <div className="flex items-center gap-2">
          <div
            className="inline-flex items-center gap-0.5 rounded p-0.5"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)' }}
            role="group"
            aria-label="Trend range"
          >
            {RANGE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onRangeChange(opt.value)}
                className={`inline-flex items-center justify-center h-6 px-2 text-[10px] font-medium rounded transition-colors ${
                  range === opt.value
                    ? 'bg-white/15 text-white'
                    : 'text-white/55 hover:text-white hover:bg-white/10'
                }`}
                aria-pressed={range === opt.value}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <ChartTypeToggle value={chartType} onChange={onChartTypeChange} />
        </div>
      </div>
      <div className="h-[220px]">
        {isLoading ? (
          <Skeleton className="h-full w-full" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'bar' ? (
              <BarChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={{ stroke: 'hsl(var(--border))' }} tickLine={false} />
                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={56} />
                <Tooltip
                  formatter={(v: number) => [fmtFull(v), 'Value']}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: 'hsl(var(--popover-foreground))',
                  }}
                  cursor={{ fill: 'hsl(var(--accent))', fillOpacity: 0.15 }}
                />
                {allowNegative && <ReferenceLine y={0} stroke="rgba(220,232,255,0.7)" strokeWidth={0.75} />}
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {data.map((p, i) => (
                    <Cell
                      key={i}
                      fill={allowNegative && p.value < 0 ? 'hsl(354, 62%, 56%)' : color}
                      fillOpacity={0.85}
                    />
                  ))}
                </Bar>
              </BarChart>
            ) : (
              <LineChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={{ stroke: 'hsl(var(--border))' }} tickLine={false} />
                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={56} />
                <Tooltip
                  formatter={(v: number) => [fmtFull(v), 'Value']}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: 'hsl(var(--popover-foreground))',
                  }}
                />
                {allowNegative && <ReferenceLine y={0} stroke="rgba(220,232,255,0.7)" strokeWidth={0.75} />}
                <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={{ r: 3, fill: color }} activeDot={{ r: 5 }} />
              </LineChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function withYearLabel(monthKey: string, range: RangeMonths) {
  // monthKey: "2026-04"
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return range > 12
    ? d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    : d.toLocaleDateString('en-US', { month: 'short' });
}

export function RevenueHistoricalTrend({
  variant,
  color,
}: {
  variant: 'debt' | 'finserv';
  color: string;
}) {
  const [range, setRange] = useState<RangeMonths>(12);
  const [chartType, setChartType] = useState<ChartType>('bar');
  const period = useMemo(() => trailingPeriod(range), [range]);

  const debt = useQBStackedDebtRevenue(variant === 'debt' ? period : null);
  const fin = useQBStackedFinServRevenue(variant === 'finserv' ? period : null);
  const src = variant === 'debt' ? debt : fin;

  const data: TrendPoint[] = src.months.map(m => ({
    monthKey: m.monthKey,
    label: withYearLabel(m.monthKey, range),
    value: m.totalRevenue,
  }));

  return (
    <HistoricalTrendChart
      title={`Monthly revenue · trailing ${range} months`}
      data={data}
      isLoading={src.isLoading}
      color={color}
      range={range}
      onRangeChange={setRange}
      chartType={chartType}
      onChartTypeChange={setChartType}
    />
  );
}

export function ProfitHistoricalTrend({
  entityName,
  color,
}: {
  entityName: string;
  color: string;
}) {
  const [range, setRange] = useState<RangeMonths>(12);
  const [chartType, setChartType] = useState<ChartType>('bar');
  const period = useMemo(() => trailingPeriod(range), [range]);
  const { months, isLoading } = useMonthlyEntityProfit(entityName, period.months);

  const data: TrendPoint[] = months.map(m => ({
    monthKey: m.key,
    label: withYearLabel(m.key, range),
    value: m.profit,
  }));

  return (
    <HistoricalTrendChart
      title={`Monthly profit · trailing ${range} months`}
      data={data}
      isLoading={isLoading}
      color={color}
      allowNegative
      range={range}
      onRangeChange={setRange}
      chartType={chartType}
      onChartTypeChange={setChartType}
    />
  );
}