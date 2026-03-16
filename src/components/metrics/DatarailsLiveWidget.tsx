import { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { Loader2 } from 'lucide-react';
import { CardContent } from '@/components/ui/card';
import { StatWidgetContent, ChartWidgetContent } from '@/components/metrics/SortableMetricWidget';
import { useDashboardCardData } from '@/hooks/useDashboardCardData';
import { type WidgetConfig, type TimeWindow } from '@/components/widget-editor/widgetTypes';
import { type MetricWidgetConfig } from '@/contexts/MetricsWidgetsContext';

const COLORS = [
  'hsl(213, 90%, 60%)',
  'hsl(142, 71%, 45%)',
  'hsl(38, 92%, 50%)',
  'hsl(270, 60%, 58%)',
  'hsl(220, 15%, 55%)',
];

function formatCurrency(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${abs.toLocaleString()}`;
}

interface DatarailsLiveStatProps {
  widget: MetricWidgetConfig;
}

export function DatarailsLiveStat({ widget }: DatarailsLiveStatProps) {
  const dc = widget.datarailsConfig;
  const format = dc?.values?.[0]?.format;
  const selectedFieldId = dc?.values?.[0]?.fieldId as string | undefined;

  const timeWindow: TimeWindow = (dc?.xAxis as any)?.window ?? 'ytd';

  const { total, isLoading } = useDashboardCardData(
    dc as Partial<WidgetConfig> | undefined,
    timeWindow,
    dc?.entityId,
  );

  const metricLabel = selectedFieldId
    ? (selectedFieldId.startsWith('qb-account-')
        ? 'QB Account'
        : selectedFieldId.replace(/^[a-z]-/, '').replace(/-/g, ' '))
    : 'metric';

  if (isLoading) {
    return (
      <CardContent className="pt-6 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </CardContent>
    );
  }

  const displayValue = format === 'percent'
    ? `${total.toFixed(1)}%`
    : format === 'currency'
      ? formatCurrency(total)
      : Math.round(total).toLocaleString();

  return (
    <StatWidgetContent
      title={widget.title}
      value={displayValue}
      subtitle={`Custom KPI · ${metricLabel}`}
      icon="dollar"
      color={widget.color}
    />
  );
}

interface DatarailsLiveChartProps {
  widget: MetricWidgetConfig;
}

export function DatarailsLiveChart({ widget }: DatarailsLiveChartProps) {
  const dc = widget.datarailsConfig as {
    type?: string;
    values?: Array<{ fieldId?: string | null; format?: string }>;
    xAxis?: { window?: TimeWindow };
    entityId?: string;
    dataLabels?: { allowNegative?: boolean };
  } | undefined;

  const selectedType = dc?.type ?? 'bar';
  const timeWindow: TimeWindow = dc?.xAxis?.window ?? 'ytd';
  const valueNames = (dc?.values || []).map(v => v.fieldId || 'Value').filter(Boolean) as string[];
  const allowNegative = dc?.dataLabels?.allowNegative ?? false;

  const { chartData: rawChartData, seriesKeys, isLoading } = useDashboardCardData(
    dc as Partial<WidgetConfig> | undefined,
    timeWindow,
    dc?.entityId,
  );

  // Apply allowNegative: when off, take Math.abs of all numeric values
  const chartData = useMemo(() => {
    if (allowNegative) return rawChartData;
    return rawChartData.map(row => {
      const newRow = { ...row };
      for (const key of Object.keys(newRow)) {
        if (key !== 'period' && typeof newRow[key] === 'number') {
          newRow[key] = Math.abs(newRow[key] as number);
        }
      }
      return newRow;
    });
  }, [rawChartData, allowNegative]);

  const chartHeight = widget.size === 'small' ? 180 : widget.size === 'medium' ? 240 : 280;

  if (valueNames.length === 0) {
    return (
      <ChartWidgetContent title={widget.title} description="Custom widget">
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
          Add at least one value to visualize this widget
        </div>
      </ChartWidgetContent>
    );
  }

  if (isLoading) {
    return (
      <ChartWidgetContent title={widget.title} description="Custom widget">
        <div className="flex items-center justify-center" style={{ height: chartHeight }}>
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </ChartWidgetContent>
    );
  }

  // Use real data keys from the response, falling back to configured value names
  const dataKeys = seriesKeys.length > 0 ? seriesKeys : valueNames;
  const isLine = selectedType === 'line';
  const isStacked = selectedType === 'stackedBar';
  const barRadius: [number, number, number, number] = [6, 6, 0, 0];

  return (
    <ChartWidgetContent title={widget.title} description="Custom widget">
      <div style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          {isLine ? (
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value: number) => [formatCurrency(value)]}
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              {dataKeys.map((name, i) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name={name.replace('f-', '').replace(/-/g, ' ')}
                />
              ))}
            </LineChart>
          ) : (
            <BarChart data={chartData}>
              <defs>
                {dataKeys.map((name, i) => {
                  const [c1, c2] = [
                    ['hsl(213, 90%, 70%)', 'hsl(213, 80%, 50%)'],
                    ['hsl(142, 71%, 55%)', 'hsl(142, 71%, 38%)'],
                    ['hsl(38, 92%, 58%)', 'hsl(38, 92%, 42%)'],
                    ['hsl(270, 60%, 68%)', 'hsl(270, 60%, 48%)'],
                    ['hsl(220, 15%, 65%)', 'hsl(220, 15%, 45%)'],
                  ][i % 5];
                  return (
                    <linearGradient key={name} id={`drGrad-live-${i}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={c1} />
                      <stop offset="100%" stopColor={c2} />
                    </linearGradient>
                  );
                })}
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value: number) => [formatCurrency(value)]}
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              {dataKeys.map((name, i) => (
                <Bar
                  key={name}
                  dataKey={name}
                  fill={`url(#drGrad-live-${i})`}
                  name={name.replace('f-', '').replace(/-/g, ' ')}
                  radius={barRadius}
                  stackId={isStacked ? 'stack' : undefined}
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </ChartWidgetContent>
  );
}
