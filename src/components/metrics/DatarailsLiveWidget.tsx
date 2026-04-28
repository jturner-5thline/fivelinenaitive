import { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  ReferenceLine,
  LabelList,
} from 'recharts';
import { Loader2, TrendingUp } from 'lucide-react';
import { CardContent } from '@/components/ui/card';
import { StatWidgetContent, ChartWidgetContent } from '@/components/metrics/SortableMetricWidget';
import { useDashboardCardData } from '@/hooks/useDashboardCardData';
import { type WidgetConfig, type TimeWindow, type NegativeStylingConfig } from '@/components/widget-editor/widgetTypes';
import { type MetricWidgetConfig } from '@/contexts/MetricsWidgetsContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const COLORS = [
  'hsl(213, 90%, 60%)',
  'hsl(142, 71%, 45%)',
  'hsl(38, 92%, 50%)',
  'hsl(270, 60%, 58%)',
  'hsl(220, 15%, 55%)',
];

const DEFAULT_NEGATIVE_COLOR = 'hsl(0, 72%, 51%)';

function formatCurrency(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${abs.toLocaleString()}`;
}

function getNegConfig(widget: MetricWidgetConfig): NegativeStylingConfig | undefined {
  return (widget.datarailsConfig as any)?.negativeStyling;
}

// ─── Stat Widget ───

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

// ─── Chart Widget ───

interface DatarailsLiveChartProps {
  widget: MetricWidgetConfig;
}

export function DatarailsLiveChart({ widget }: DatarailsLiveChartProps) {
  const [showTrendLine, setShowTrendLine] = useState(false);
  const dc = widget.datarailsConfig as {
    type?: string;
    values?: Array<{ fieldId?: string | null; format?: string }>;
    xAxis?: { window?: TimeWindow };
    entityId?: string;
  } | undefined;

  const selectedType = dc?.type ?? 'bar';
  const timeWindow: TimeWindow = dc?.xAxis?.window ?? 'ytd';
  const valueNames = (dc?.values || []).map(v => v.fieldId || 'Value').filter(Boolean) as string[];

  const { chartData, seriesKeys, isLoading } = useDashboardCardData(
    dc as Partial<WidgetConfig> | undefined,
    timeWindow,
    dc?.entityId,
  );

  const neg = getNegConfig(widget);
  const negEnabled = neg?.enableNegativeStyling ?? false;
  const negThreshold = neg?.negativeThreshold ?? 0;
  const negColor = neg?.negativeColor ?? DEFAULT_NEGATIVE_COLOR;

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

  const dataKeys = seriesKeys.length > 0 ? seriesKeys : valueNames;
  const isLine = selectedType === 'line';
  const isStacked = selectedType === 'stackedBar';
  const barRadius: [number, number, number, number] = [3, 3, 0, 0];
  const trendLineColor = '#94A3B8';

  const trendData = showTrendLine ? chartData.map((entry: any) => {
    const total = dataKeys.reduce((sum: number, key: string) => sum + (Number(entry[key]) || 0), 0);
    return { ...entry, __trendLine: total };
  }) : chartData;

  const trendLineToggle = !isLine ? (
    <Button
      variant="ghost"
      size="icon"
      className={cn('h-6 w-6', showTrendLine && 'text-primary')}
      onClick={(e) => { e.stopPropagation(); setShowTrendLine(v => !v); }}
      aria-label="Toggle trend line"
    >
      <TrendingUp className="h-3.5 w-3.5" />
    </Button>
  ) : null;

  return (
    <ChartWidgetContent title={widget.title} description="Custom widget" footer={trendLineToggle}>
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
              {negEnabled && <ReferenceLine y={negThreshold} stroke={negColor} strokeDasharray="4 4" strokeWidth={0.5} />}
              {dataKeys.map((name, i) => {
                const normalColor = COLORS[i % COLORS.length];
                if (negEnabled) {
                  return (
                    <NegativeAwareLine
                      key={name}
                      dataKey={name}
                      data={chartData}
                      normalColor={normalColor}
                      negativeColor={negColor}
                      threshold={negThreshold}
                      name={name.replace('f-', '').replace(/-/g, ' ')}
                    />
                  );
                }
                return (
                  <Line
                    key={name}
                    type="monotone"
                    dataKey={name}
                    stroke={normalColor}
                    strokeWidth={1}
                    dot={{ r: 3 }}
                    name={name.replace('f-', '').replace(/-/g, ' ')}
                  />
                );
              })}
            </LineChart>
          ) : (
            <ComposedChart data={trendData}>
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
                {negEnabled && (
                  <linearGradient id="drGrad-negative" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(0, 72%, 60%)" />
                    <stop offset="100%" stopColor={negColor} />
                  </linearGradient>
                )}
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <YAxis yAxisId="left" tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
              {showTrendLine && <YAxis yAxisId="right" orientation="right" tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />}
              <Tooltip
                formatter={(value: number) => [formatCurrency(value)]}
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              {negEnabled && <ReferenceLine yAxisId="left" y={negThreshold} stroke={negColor} strokeDasharray="4 4" strokeWidth={0.5} />}
              {dataKeys.map((name, i) => (
                <Bar
                  key={name}
                  yAxisId="left"
                  dataKey={name}
                  fill={`url(#drGrad-live-${i})`}
                  name={name.replace('f-', '').replace(/-/g, ' ')}
                  radius={barRadius}
                  stackId={isStacked ? 'stack' : undefined}
                >
                  {negEnabled && trendData.map((entry: any, idx: number) => {
                    const val = entry[name];
                    const isBelowThreshold = typeof val === 'number' && val < negThreshold;
                    return (
                      <Cell
                        key={`cell-${idx}`}
                        fill={isBelowThreshold ? 'url(#drGrad-negative)' : `url(#drGrad-live-${i})`}
                      />
                    );
                  })}
                </Bar>
              ))}
              {showTrendLine && (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="__trendLine"
                  stroke={trendLineColor}
                  strokeWidth={1}
                  dot={{ r: 4, fill: trendLineColor }}
                  name="Trend"
                >
                  <LabelList
                    dataKey="__trendLine"
                    position="top"
                    formatter={(value: number) => formatCurrency(value)}
                    style={{ fontSize: 9, fill: trendLineColor, fontWeight: 600 }}
                  />
                </Line>
              )}
            </ComposedChart>
          )}
        </ResponsiveContainer>
      </div>
    </ChartWidgetContent>
  );
}

// ─── Helper: renders two overlapping Line series for above/below threshold ───

function NegativeAwareLine({
  dataKey,
  data,
  normalColor,
  negativeColor,
  threshold,
  name,
}: {
  dataKey: string;
  data: any[];
  normalColor: string;
  negativeColor: string;
  threshold: number;
  name: string;
}) {
  return (
    <>
      <Line
        type="monotone"
        dataKey={(entry: any) => {
          const v = entry[dataKey];
          return typeof v === 'number' && v >= threshold ? v : undefined;
        }}
        stroke={normalColor}
        strokeWidth={1}
        dot={{ r: 3, fill: normalColor }}
        name={name}
        connectNulls={false}
      />
      <Line
        type="monotone"
        dataKey={(entry: any) => {
          const v = entry[dataKey];
          return typeof v === 'number' && v < threshold ? v : undefined;
        }}
        stroke={negativeColor}
        strokeWidth={1}
        dot={{ r: 3, fill: negativeColor }}
        name={`${name} (below threshold)`}
        connectNulls={false}
        legendType="none"
      />
    </>
  );
}
