import { WidgetConfig, getField, isQBAccountField, ComparisonConfig, TrendLineConfig, DataLabelsConfig, NegativeStylingConfig } from './widgetTypes';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, LabelList, ReferenceLine } from 'recharts';
import React, { useMemo } from 'react';
import { BarChart3, LineChart as LineChartIcon, Hash, Loader2, Database, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQBPreviewData, PreviewDataPoint } from '@/hooks/useQBPreviewData';

interface Props {
  config: WidgetConfig;
  onTypeChange?: (type: WidgetConfig['type']) => void;
}

const CHART_COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2, 160 60% 45%))', 'hsl(var(--chart-3, 30 80% 55%))', 'hsl(var(--chart-4, 280 65% 60%))', 'hsl(var(--chart-5, 340 75% 55%))'];

// Gradient definitions for bar charts — pairs of [start, end] HSL
const CHART_GRADIENT_PAIRS: [string, string][] = [
  ['hsl(213, 90%, 70%)', 'hsl(213, 80%, 50%)'],
  ['hsl(142, 71%, 55%)', 'hsl(142, 71%, 38%)'],
  ['hsl(38, 92%, 58%)', 'hsl(38, 92%, 42%)'],
  ['hsl(270, 60%, 68%)', 'hsl(270, 60%, 48%)'],
  ['hsl(220, 15%, 65%)', 'hsl(220, 15%, 45%)'],
];

/** Check if widget config uses fields that can pull real data */
function hasRealDataFields(config: WidgetConfig): boolean {
  return config.values.some(v => v.fieldId && (
    ['f-revenue', 'f-total-revenue', 'f-amount', 'f-expenses', 'f-cogs', 'f-net-income'].includes(v.fieldId) ||
    isQBAccountField(v.fieldId) ||
    v.fieldId.startsWith('n-')
  ));
}

function buildInterpretation(config: WidgetConfig): string {
  const parts: string[] = [];
  const valueNames = config.values.map((v) => {
    const f = getField(v.fieldId);
    const name = f?.name ?? (isQBAccountField(v.fieldId) ? 'QB Account' : '?');
    return `${v.agg.charAt(0).toUpperCase() + v.agg.slice(1)} of ${name}`;
  });
  if (valueNames.length > 0) parts.push(valueNames.join(', '));
  else parts.push('(no values selected)');

  const xField = getField(config.xAxis.fieldId);
  if (xField) {
    const grain = config.xAxis.grain ? ` (${config.xAxis.grain})` : '';
    const win = config.xAxis.window && config.xAxis.window !== 'all' ? ` — ${config.xAxis.window}` : '';
    parts.push(`by ${xField.name}${grain}${win}`);
  }

  const seriesField = getField(config.series.fieldId);
  if (seriesField) parts.push(`broken down by ${seriesField.name}`);

  if (config.filters.length > 0) parts.push(`with ${config.filters.length} filter(s)`);

  return parts.join(' ');
}

function generateChartData(config: WidgetConfig): Record<string, string | number>[] {
  const periods = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  return periods.map((p) => {
    const row: Record<string, string | number> = { period: p };
    for (const vc of config.values) {
      const f = getField(vc.fieldId);
      const name = f?.name ?? 'Value';
      row[name] = vc.format === 'percent'
        ? +(Math.random() * 100).toFixed(1)
        : Math.round(Math.random() * 500000 + 50000);
    }
    return row;
  });
}

function generateMockRows(config: WidgetConfig): Record<string, string | number>[] {
  const periods = ['Jan-26', 'Feb-26', 'Mar-26', 'Apr-26', 'May-26'];
  const seriesField = getField(config.series.fieldId);
  const seriesValues = seriesField ? ['Revenue', 'COGS', 'OpEx'] : [null];

  const rows: Record<string, string | number>[] = [];
  const xField = getField(config.xAxis.fieldId);

  for (const period of periods.slice(0, config.xAxis.window === 'last3Months' ? 3 : 5)) {
    for (const sv of seriesValues) {
      const row: Record<string, string | number> = {};
      if (xField) row[xField.name] = period;
      if (sv) row[seriesField!.name] = sv;
      for (const vc of config.values) {
        const f = getField(vc.fieldId);
        const val = Math.round(Math.random() * 500000 + 50000);
        row[f?.name ?? 'Value'] = vc.format === 'currency'
          ? val
          : vc.format === 'percent'
          ? +(Math.random() * 100).toFixed(1)
          : val;
      }
      rows.push(row);
    }
  }
  return rows;
}

function formatCell(val: string | number, format?: string): string {
  if (typeof val === 'number') {
    if (format === 'currency') return formatCompact(val, 'currency');
    if (format === 'percent') return `${val}%`;
    return val.toLocaleString();
  }
  return String(val);
}

function formatCompact(val: number, format: string): string {
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (format === 'currency') {
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}k`;
    return `${sign}$${abs.toLocaleString()}`;
  }
  if (format === 'percent') return `${val.toFixed(1)}%`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)}k`;
  return val.toLocaleString();
}

/** Compute linear regression trend line data */
function computeTrendLine(data: Record<string, string | number>[], dataKey: string, trendConfig: TrendLineConfig): (number | null)[] {
  const values = data.map(d => (typeof d[dataKey] === 'number' ? d[dataKey] as number : null));

  if (trendConfig.type === 'movingAvg') {
    const w = trendConfig.window || 3;
    return values.map((_, i) => {
      if (i < w - 1) return null;
      let sum = 0, count = 0;
      for (let j = i - w + 1; j <= i; j++) {
        if (values[j] !== null) { sum += values[j]!; count++; }
      }
      return count > 0 ? sum / count : null;
    });
  }

  // Linear regression for 'linear' and 'polynomial' (simple linear fallback)
  const pts: { x: number; y: number }[] = [];
  values.forEach((v, i) => { if (v !== null) pts.push({ x: i, y: v }); });
  if (pts.length < 2) return values.map(() => null);

  const n = pts.length;
  const sumX = pts.reduce((s, p) => s + p.x, 0);
  const sumY = pts.reduce((s, p) => s + p.y, 0);
  const sumXY = pts.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = pts.reduce((s, p) => s + p.x * p.x, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  return values.map((_, i) => slope * i + intercept);
}

const isChartType = (type: string) => ['bar', 'line', 'column', 'columnChart', 'stackedBar'].includes(type);

function getValueFieldNames(config: WidgetConfig): string[] {
  return config.values.map((v) => {
    const f = getField(v.fieldId);
    return f?.name ?? (isQBAccountField(v.fieldId) ? 'QB Account' : 'Value');
  });
}

/** Custom bar shape that only rounds the top if this segment is the topmost with data */
function StackedBarShape(props: Record<string, unknown> & { dataKeys: string[]; currentKey: string }) {
  const { x, y, width, height, fill, dataKeys, currentKey, ...rest } = props;
  const payload = (rest as { payload?: Record<string, unknown> }).payload;
  const R = 6;

  // Determine if this key is the topmost segment with a non-zero value
  let isTop = true;
  if (payload && dataKeys) {
    const myIdx = dataKeys.indexOf(currentKey as string);
    for (let j = myIdx + 1; j < dataKeys.length; j++) {
      const val = (payload as Record<string, number>)[dataKeys[j]];
      if (val && val > 0) {
        isTop = false;
        break;
      }
    }
  }

  const rx = (x as number) ?? 0;
  const ry = (y as number) ?? 0;
  const rw = (width as number) ?? 0;
  const rh = (height as number) ?? 0;

  if (rh <= 0 || rw <= 0) return null;

  if (isTop && rh > R) {
    // Rounded top corners
    const path = `M${rx},${ry + R}
      Q${rx},${ry} ${rx + R},${ry}
      L${rx + rw - R},${ry}
      Q${rx + rw},${ry} ${rx + rw},${ry + R}
      L${rx + rw},${ry + rh}
      L${rx},${ry + rh}Z`;
    return <path d={path} fill={fill as string} />;
  }

  return <rect x={rx} y={ry} width={rw} height={rh} fill={fill as string} />;
}

function ChartPreview({ config, data }: { config: WidgetConfig; data: Record<string, string | number>[] }) {
  const valueFields = getValueFieldNames(config);
  const xField = getField(config.xAxis.fieldId);
  const xLabel = xField?.name ?? 'Period';
  const isLine = config.type === 'line';
  const isStacked = config.type === 'stackedBar';

  const trendLine = config.trendLine;
  const dataLabels = config.dataLabels;
  const neg = config.negativeStyling;
  const negEnabled = neg?.enableNegativeStyling ?? false;
  const negThreshold = neg?.negativeThreshold ?? 0;
  const negColor = neg?.negativeColor ?? 'hsl(0, 72%, 51%)';
  const showPeriodTotals = dataLabels?.showPeriodTotals ?? false;
  const primaryFormat = config.values[0]?.format ?? 'currency';

  // Get all numeric keys from data (excluding 'period' and internal keys)
  const dataKeys = data.length > 0
    ? Object.keys(data[0]).filter(k => k !== 'period' && !k.startsWith('__trend_') && k !== '__period_total')
    : valueFields;

  // Enrich data with trend line values and period totals
  const enrichedData = useMemo(() => {
    let result = data;

    // Add trend line
    if (trendLine?.enabled && dataKeys.length > 0) {
      const trendValues = computeTrendLine(data, dataKeys[0], trendLine);
      result = result.map((d, i) => ({ ...d, __trend_line: trendValues[i] }));
    }

    // Add period totals
    if (showPeriodTotals && dataKeys.length > 0) {
      result = result.map(d => {
        const total = dataKeys.reduce((sum, key) => sum + (Number(d[key]) || 0), 0);
        return { ...d, __period_total: total };
      });
    }

    return result;
  }, [data, trendLine, dataKeys, showPeriodTotals]);

  const renderDataLabel = dataLabels?.enabled ? (props: Record<string, unknown>) => {
    const { x, y, width, value, height } = props as { x: number; y: number; width: number; value: number; height: number };
    if (value === 0 || value === undefined || value === null) return null;
    const formatted = formatCompact(value as number, primaryFormat);
    let labelY = y;
    if (dataLabels.position === 'above') labelY = y - 6;
    else if (dataLabels.position === 'inside') labelY = y + (height || 0) / 2 + 4;
    else if (dataLabels.position === 'below') labelY = y + (height || 0) + 14;
    return (
      <text x={(x || 0) + ((width || 0) / 2)} y={labelY} textAnchor="middle" fontSize={10} fontWeight={500} fill="hsl(var(--foreground))">
        {formatted}
      </text>
    );
  } : undefined;

  // Period total label — rendered on the last series in a stack, or as a summary label
  const renderPeriodTotalLabel = showPeriodTotals ? (props: Record<string, unknown>) => {
    const { x, y, width, value } = props as { x: number; y: number; width: number; value: number };
    if (!value || value === 0) return null;
    const formatted = formatCompact(value, primaryFormat);
    return (
      <text
        x={(x || 0) + ((width || 0) / 2)}
        y={Math.max(12, (y || 0) - 8)}
        textAnchor="middle"
        fontSize={11}
        fontWeight={600}
        fill="hsl(var(--foreground))"
      >
        {formatted}
      </text>
    );
  } : undefined;

  // For line charts with period totals — render as reference dots
  const renderLinePeriodTotalLabel = showPeriodTotals ? (props: Record<string, unknown>) => {
    const { x, y, value } = props as { x: number; y: number; value: number };
    if (!value || value === 0) return null;
    const formatted = formatCompact(value, primaryFormat);
    return (
      <text
        x={x || 0}
        y={Math.max(12, (y || 0) - 10)}
        textAnchor="middle"
        fontSize={11}
        fontWeight={600}
        fill="hsl(var(--foreground))"
      >
        {formatted}
      </text>
    );
  } : undefined;

  const ChartComponent = isLine ? LineChart : BarChart;
  const barRadius: [number, number, number, number] = [6, 6, 0, 0];
  const needsTopMargin = (dataLabels?.enabled || showPeriodTotals);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ChartComponent data={enrichedData} margin={{ top: needsTopMargin ? 24 : 5, right: 20, left: 10, bottom: 5 }}>
        <defs>
          {dataKeys.map((_, i) => {
            const [start, end] = CHART_GRADIENT_PAIRS[i % CHART_GRADIENT_PAIRS.length];
            return (
              <linearGradient key={`grad-${i}`} id={`barGrad-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={start} stopOpacity={0.95} />
                <stop offset="100%" stopColor={end} stopOpacity={0.85} />
              </linearGradient>
            );
          })}
          {negEnabled && (
            <linearGradient id="barGrad-negative" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(0, 72%, 60%)" stopOpacity={0.95} />
              <stop offset="100%" stopColor={negColor} stopOpacity={0.85} />
            </linearGradient>
          )}
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
        <XAxis dataKey="period" tick={{ fontSize: 11 }} label={{ value: xLabel, position: 'insideBottom', offset: -2, fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`} />
        <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {negEnabled && <ReferenceLine y={negThreshold} stroke={negColor} strokeDasharray="4 4" strokeWidth={0.5} />}
        {dataKeys.map((name, i) => {
          const isLastSeries = i === dataKeys.length - 1;
          return isLine ? (
            negEnabled ? (
              <React.Fragment key={name}>
                <Line
                  type="monotone"
                  dataKey={(entry: any) => {
                    const v = entry[name];
                    return typeof v === 'number' && v >= negThreshold ? v : undefined;
                  }}
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  strokeWidth={1}
                  dot={{ r: 3 }}
                  connectNulls={false}
                  name={name}
                />
                <Line
                  type="monotone"
                  dataKey={(entry: any) => {
                    const v = entry[name];
                    return typeof v === 'number' && v < negThreshold ? v : undefined;
                  }}
                  stroke={negColor}
                  strokeWidth={1}
                  dot={{ r: 3, fill: negColor }}
                  connectNulls={false}
                  name={`${name} (neg)`}
                  legendType="none"
                />
              </React.Fragment>
            ) : (
              <Line key={name} type="monotone" dataKey={name} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={1} dot={{ r: 3 }} connectNulls>
                {dataLabels?.enabled && <LabelList dataKey={name} content={renderDataLabel} />}
                {isLastSeries && showPeriodTotals && dataKeys.length > 1 && (
                  <LabelList dataKey="__period_total" content={renderLinePeriodTotalLabel} />
                )}
              </Line>
            )
          ) : isStacked ? (
            <Bar key={name} dataKey={name} fill={`url(#barGrad-${i})`} stackId="stack"
              shape={(props: Record<string, unknown>) => <StackedBarShape {...props} dataKeys={dataKeys} currentKey={name} />}
            >
              {negEnabled && enrichedData.map((entry: any, idx: number) => {
                const val = entry[name];
                const isBelowThreshold = typeof val === 'number' && val < negThreshold;
                return <Cell key={`cell-${idx}`} fill={isBelowThreshold ? 'url(#barGrad-negative)' : `url(#barGrad-${i})`} />;
              })}
              {dataLabels?.enabled && <LabelList dataKey={name} content={renderDataLabel} />}
              {isLastSeries && showPeriodTotals && (
                <LabelList dataKey="__period_total" content={renderPeriodTotalLabel} />
              )}
            </Bar>
          ) : (
            <Bar key={name} dataKey={name} fill={`url(#barGrad-${i})`} radius={barRadius}>
              {negEnabled && enrichedData.map((entry: any, idx: number) => {
                const val = entry[name];
                const isBelowThreshold = typeof val === 'number' && val < negThreshold;
                return <Cell key={`cell-${idx}`} fill={isBelowThreshold ? 'url(#barGrad-negative)' : `url(#barGrad-${i})`} />;
              })}
              {dataLabels?.enabled && <LabelList dataKey={name} content={renderDataLabel} />}
              {isLastSeries && showPeriodTotals && dataKeys.length > 1 && (
                <LabelList dataKey="__period_total" content={renderPeriodTotalLabel} />
              )}
            </Bar>
          );
        })}
        {trendLine?.enabled && (
          <Line type="monotone" dataKey="__trend_line" stroke={CHART_COLORS[0]} strokeWidth={1}
            strokeDasharray="6 3" strokeOpacity={0.45} dot={false} connectNulls legendType="none" />
        )}
      </ChartComponent>
    </ResponsiveContainer>
  );
}

function KpiPreview({ config, data }: { config: WidgetConfig; data?: PreviewDataPoint[] }) {
  const valueField = config.values[0];
  const f = getField(valueField?.fieldId);
  const name = f?.name ?? (isQBAccountField(valueField?.fieldId) ? 'QB Account' : 'Metric');
  const format = valueField?.format ?? 'number';

  // Use real data if available
  let displayVal: number;
  if (data && data.length > 0) {
    // Sum all values across all periods for the first value field
    const keys = Object.keys(data[0]).filter(k => k !== 'period');
    displayVal = data.reduce((sum, row) => {
      const val = keys.length > 0 ? (row[keys[0]] as number) ?? 0 : 0;
      return sum + val;
    }, 0);
  } else {
    displayVal = 0;
  }

  const formatted = format === 'currency' ? `$${displayVal.toLocaleString()}` : format === 'percent' ? `${displayVal.toFixed(1)}%` : displayVal.toLocaleString();

  return (
    <div className="flex flex-col items-center justify-center py-12 gap-2">
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{name}</p>
      <p className="text-4xl font-bold text-foreground">{formatted}</p>
    </div>
  );
}

const VIEW_MODES = [
  { type: 'kpi' as const, icon: Hash, label: 'Metric' },
  { type: 'bar' as const, icon: BarChart3, label: 'Bar' },
  { type: 'stackedBar' as const, icon: Layers, label: 'Stacked' },
  { type: 'line' as const, icon: LineChartIcon, label: 'Line' },
] as const;

export function WidgetPreview({ config, onTypeChange }: Props) {
  const interpretation = buildInterpretation(config);
  const useRealData = hasRealDataFields(config);
  const { data: realData, isLoading: realDataLoading } = useQBPreviewData(config);

  // Fallback mock data
  const mockRows = useMemo(() => generateMockRows(config), [config]);
  const mockChartData = useMemo(() => generateChartData(config), [config]);

  const chartData = useRealData && realData && realData.length > 0 ? realData : mockChartData;
  const tableData = useRealData && realData && realData.length > 0 ? realData : mockRows;
  const isLive = useRealData && realData && realData.length > 0;

  const columns = tableData.length > 0 ? Object.keys(tableData[0]) : [];

  const hasData = config.values.length > 0 || config.xAxis.fieldId;
  const activeType = config.type;
  const showChart = isChartType(activeType) && config.values.length > 0;

  const formatMap: Record<string, string> = {};
  for (const vc of config.values) {
    const f = getField(vc.fieldId);
    if (f) formatMap[f.name] = vc.format;
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Preview</h2>
        {onTypeChange && (
          <div className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/50 p-0.5">
            {VIEW_MODES.map(({ type, icon: Icon, label }) => (
              <button
                key={type}
                onClick={() => onTypeChange(type)}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all',
                  activeType === type
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      <ScrollArea className="flex-1">
        <div className="p-5 space-y-4">
          {/* interpretation */}
          <div className="rounded-lg bg-primary/5 border border-primary/10 px-4 py-2.5">
            <p className="text-xs text-primary font-medium">{interpretation}</p>
          </div>

          {/* Loading state */}
          {useRealData && realDataLoading && (
            <div className="flex items-center justify-center h-32 gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Loading QuickBooks data…</span>
            </div>
          )}

          {hasData && !realDataLoading ? (
            <>
              {/* Data source badge */}
              <div className="flex items-center gap-1.5">
                {isLive ? (
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-[hsl(142,71%,45%)]/10 text-[hsl(142,71%,35%)] border border-[hsl(142,71%,45%)]/20">
                    <Database className="h-3 w-3" />
                    Live QuickBooks data
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground">
                    Sample data
                  </span>
                )}
              </div>

              {activeType === 'kpi' && config.values.length > 0 && (
                <div className="rounded-lg border border-border p-4">
                  <KpiPreview config={config} data={isLive ? realData : undefined} />
                </div>
              )}
              {showChart && (
                <div className="rounded-lg border border-border p-4">
                  <ChartPreview config={config} data={chartData} />
                </div>
              )}
              {(!showChart && activeType !== 'kpi') && (
                <div className="rounded-lg border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {columns.map((col) => (
                          <TableHead key={col} className="text-xs font-semibold whitespace-nowrap">{col}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tableData.map((row, i) => (
                        <TableRow key={i}>
                          {columns.map((col) => (
                            <TableCell key={col} className="text-xs whitespace-nowrap">
                              {formatCell(row[col], formatMap[col] ?? (typeof row[col] === 'number' ? 'currency' : undefined))}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          ) : !realDataLoading ? (
            <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
              Drag fields to the configuration panel to build your widget
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}
