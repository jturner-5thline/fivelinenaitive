import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart3, LineChart, PieChart, X, Plus, TrendingUp } from 'lucide-react';
import { BarChart, Bar, LineChart as ReLineChart, Line, PieChart as RePieChart, Pie, Cell, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area, ScatterChart, Scatter } from 'recharts';
import { SpreadsheetSheet, CellRange } from '@/hooks/useSpreadsheetWorkbook';
import { evaluateCell } from '@/lib/formulaEngine';

export type ChartType = 'bar' | 'line' | 'area' | 'pie' | 'scatter';

export interface ChartConfig {
  id: string;
  title: string;
  type: ChartType;
  range: CellRange;
  firstRowHeader: boolean;
  firstColLabel: boolean;
}

const CHART_COLORS = [
  'hsl(var(--primary))', 'hsl(var(--chart-2, 173 58% 39%))', 'hsl(var(--chart-3, 197 37% 24%))',
  'hsl(var(--chart-4, 43 74% 66%))', 'hsl(var(--chart-5, 27 87% 67%))',
  '#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#0088FE',
];

interface ChartPanelProps {
  charts: ChartConfig[];
  sheet: SpreadsheetSheet;
  selectionRange: CellRange | null;
  onAddChart: (config: ChartConfig) => void;
  onRemoveChart: (id: string) => void;
}

function getColumnLabel(index: number): string {
  let label = '';
  let num = index;
  while (num >= 0) { label = String.fromCharCode(65 + (num % 26)) + label; num = Math.floor(num / 26) - 1; }
  return label;
}

function getRangeLabel(range: CellRange): string {
  return `${getColumnLabel(range.startCol)}${range.startRow + 1}:${getColumnLabel(range.endCol)}${range.endRow + 1}`;
}

function extractChartData(sheet: SpreadsheetSheet, config: ChartConfig) {
  const { range, firstRowHeader, firstColLabel } = config;
  const minR = Math.min(range.startRow, range.endRow);
  const maxR = Math.max(range.startRow, range.endRow);
  const minC = Math.min(range.startCol, range.endCol);
  const maxC = Math.max(range.startCol, range.endCol);

  const headers: string[] = [];
  const dataStartRow = firstRowHeader ? minR + 1 : minR;
  const dataStartCol = firstColLabel ? minC + 1 : minC;

  // Get series headers
  if (firstRowHeader) {
    for (let c = dataStartCol; c <= maxC; c++) {
      const val = evaluateCell(minR, c, sheet.data);
      headers.push(val !== null ? String(val) : `Series ${c - dataStartCol + 1}`);
    }
  } else {
    for (let c = dataStartCol; c <= maxC; c++) {
      headers.push(`Series ${c - dataStartCol + 1}`);
    }
  }

  const chartData: Record<string, any>[] = [];
  for (let r = dataStartRow; r <= maxR; r++) {
    const point: Record<string, any> = {};
    if (firstColLabel) {
      const label = evaluateCell(r, minC, sheet.data);
      point.name = label !== null ? String(label) : `Row ${r - dataStartRow + 1}`;
    } else {
      point.name = `${r - dataStartRow + 1}`;
    }
    
    for (let c = dataStartCol; c <= maxC; c++) {
      const val = evaluateCell(r, c, sheet.data);
      const numVal = val !== null ? Number(val) : 0;
      point[headers[c - dataStartCol]] = isNaN(numVal) ? 0 : numVal;
    }
    chartData.push(point);
  }

  return { chartData, headers };
}

function ChartRenderer({ chart, sheet }: { chart: ChartConfig; sheet: SpreadsheetSheet }) {
  const { chartData, headers } = useMemo(() => extractChartData(sheet, chart), [sheet.data, chart]);

  if (chartData.length === 0) {
    return <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">No data in range</div>;
  }

  switch (chart.type) {
    case 'bar':
      return (
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {headers.map((h, i) => (
              <Bar key={h} dataKey={h} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      );
    case 'line':
      return (
        <ResponsiveContainer width="100%" height={250}>
          <ReLineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {headers.map((h, i) => (
              <Line key={h} type="monotone" dataKey={h} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={1} dot={{ r: 3 }} />
            ))}
          </ReLineChart>
        </ResponsiveContainer>
      );
    case 'area':
      return (
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {headers.map((h, i) => (
              <Area key={h} type="monotone" dataKey={h} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.3} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      );
    case 'pie':
      return (
        <ResponsiveContainer width="100%" height={250}>
          <RePieChart>
            <Pie data={chartData} dataKey={headers[0] || 'value'} nameKey="name" cx="50%" cy="50%" outerRadius={90} label={{ fontSize: 10 }}>
              {chartData.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </RePieChart>
        </ResponsiveContainer>
      );
    case 'scatter':
      return (
        <ResponsiveContainer width="100%" height={250}>
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ fontSize: 11 }} />
            {headers.map((h, i) => (
              <Scatter key={h} name={h} data={chartData} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      );
  }
}

export function ChartPanel({ charts, sheet, selectionRange, onAddChart, onRemoveChart }: ChartPanelProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newChart, setNewChart] = useState<Partial<ChartConfig>>({
    type: 'bar',
    title: 'New Chart',
    firstRowHeader: true,
    firstColLabel: true,
  });

  const handleCreate = () => {
    if (!selectionRange && !newChart.range) return;
    const config: ChartConfig = {
      id: crypto.randomUUID(),
      title: newChart.title || 'Chart',
      type: newChart.type as ChartType || 'bar',
      range: newChart.range || selectionRange!,
      firstRowHeader: newChart.firstRowHeader ?? true,
      firstColLabel: newChart.firstColLabel ?? true,
    };
    onAddChart(config);
    setIsCreating(false);
    setNewChart({ type: 'bar', title: 'New Chart', firstRowHeader: true, firstColLabel: true });
  };

  if (charts.length === 0 && !isCreating) {
    return null;
  }

  return (
    <div className="border-t bg-muted/20">
      <div className="flex items-center justify-between px-3 py-1.5 border-b">
        <span className="text-xs font-medium text-muted-foreground">Charts</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs gap-1"
          onClick={() => setIsCreating(true)}
          disabled={!selectionRange}
        >
          <Plus className="h-3 w-3" /> Add Chart
        </Button>
      </div>

      {isCreating && (
        <div className="p-3 border-b bg-background space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Title</Label>
              <Input
                value={newChart.title || ''}
                onChange={(e) => setNewChart(p => ({ ...p, title: e.target.value }))}
                className="h-7 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={newChart.type} onValueChange={(v) => setNewChart(p => ({ ...p, type: v as ChartType }))}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bar">Bar</SelectItem>
                  <SelectItem value="line">Line</SelectItem>
                  <SelectItem value="area">Area</SelectItem>
                  <SelectItem value="pie">Pie</SelectItem>
                  <SelectItem value="scatter">Scatter</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Range</Label>
              <div className="text-xs h-7 flex items-center px-2 bg-muted rounded border">
                {selectionRange ? getRangeLabel(selectionRange) : 'Select range first'}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={newChart.firstRowHeader} onChange={(e) => setNewChart(p => ({ ...p, firstRowHeader: e.target.checked }))} />
              First row is header
            </label>
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={newChart.firstColLabel} onChange={(e) => setNewChart(p => ({ ...p, firstColLabel: e.target.checked }))} />
              First col is label
            </label>
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setIsCreating(false)}>Cancel</Button>
            <Button size="sm" className="h-7 text-xs" onClick={handleCreate} disabled={!selectionRange}>Create</Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3">
        {charts.map(chart => (
          <div key={chart.id} className="border rounded-lg bg-background p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium">{chart.title}</span>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground">{getRangeLabel(chart.range)}</span>
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => onRemoveChart(chart.id)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <ChartRenderer chart={chart} sheet={sheet} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChartCreatorButton({ hasRange, onClick }: { hasRange: boolean; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 gap-1 px-1.5 text-xs"
      onClick={onClick}
      disabled={!hasRange}
      title={hasRange ? 'Create chart from selection' : 'Select a range first'}
    >
      <BarChart3 className="h-3.5 w-3.5" />
      Chart
    </Button>
  );
}
