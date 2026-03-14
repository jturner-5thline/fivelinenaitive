import { WidgetConfig, getField, isQBAccountField } from './widgetTypes';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useMemo } from 'react';
import { BarChart3, LineChart as LineChartIcon, Hash, Loader2, Database, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQBPreviewData, PreviewDataPoint } from '@/hooks/useQBPreviewData';

interface Props {
  config: WidgetConfig;
  onTypeChange?: (type: WidgetConfig['type']) => void;
}

const CHART_COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2, 160 60% 45%))', 'hsl(var(--chart-3, 30 80% 55%))', 'hsl(var(--chart-4, 280 65% 60%))', 'hsl(var(--chart-5, 340 75% 55%))'];

/** Check if widget config uses QB-backed fields that can pull real data */
function hasRealDataFields(config: WidgetConfig): boolean {
  return config.values.some(v => v.fieldId && (
    ['f-revenue', 'f-amount', 'f-expenses', 'f-cogs'].includes(v.fieldId) ||
    isQBAccountField(v.fieldId)
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
    if (format === 'currency') return `$${val.toLocaleString()}`;
    if (format === 'percent') return `${val}%`;
    return val.toLocaleString();
  }
  return String(val);
}

const isChartType = (type: string) => ['bar', 'line', 'column', 'columnChart', 'stackedBar'].includes(type);

function getValueFieldNames(config: WidgetConfig): string[] {
  return config.values.map((v) => {
    const f = getField(v.fieldId);
    return f?.name ?? (isQBAccountField(v.fieldId) ? 'QB Account' : 'Value');
  });
}

function ChartPreview({ config, data }: { config: WidgetConfig; data: Record<string, string | number>[] }) {
  const valueFields = getValueFieldNames(config);
  const xField = getField(config.xAxis.fieldId);
  const xLabel = xField?.name ?? 'Period';
  const isLine = config.type === 'line';
  const isStacked = config.type === 'stackedBar';

  // Get all numeric keys from data (excluding 'period')
  const dataKeys = data.length > 0
    ? Object.keys(data[0]).filter(k => k !== 'period')
    : valueFields;

  const ChartComponent = isLine ? LineChart : BarChart;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ChartComponent data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
        <XAxis dataKey="period" tick={{ fontSize: 11 }} label={{ value: xLabel, position: 'insideBottom', offset: -2, fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`} />
        <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {dataKeys.map((name, i) =>
          isLine ? (
            <Line key={name} type="monotone" dataKey={name} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
          ) : (
            <Bar key={name} dataKey={name} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={isStacked ? undefined : [3, 3, 0, 0]} stackId={isStacked ? 'stack' : undefined} />
          )
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
    displayVal = format === 'percent' ? 42.7 : 284350;
  }

  const formatted = format === 'currency' ? `$${displayVal.toLocaleString()}` : format === 'percent' ? `${displayVal.toFixed(1)}%` : displayVal.toLocaleString();

  return (
    <div className="flex flex-col items-center justify-center py-12 gap-2">
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{name}</p>
      <p className="text-4xl font-bold text-foreground">{formatted}</p>
      {!data && (
        <div className="flex items-center gap-1 text-xs text-primary font-medium">
          <span>▲ 12.4%</span>
          <span className="text-muted-foreground">vs prior period</span>
        </div>
      )}
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
