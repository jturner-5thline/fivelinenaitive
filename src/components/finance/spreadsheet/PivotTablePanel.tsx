import { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { X, GripVertical, Table2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SpreadsheetSheet, CellRange } from '@/hooks/useSpreadsheetWorkbook';

interface PivotTablePanelProps {
  sheet: SpreadsheetSheet;
  selectionRange: CellRange | null;
  onClose: () => void;
}

interface PivotConfig {
  rowField: number | null;
  colField: number | null;
  valueField: number | null;
  aggregation: 'sum' | 'count' | 'avg' | 'min' | 'max';
}

export function PivotTablePanel({ sheet, selectionRange, onClose }: PivotTablePanelProps) {
  const [config, setConfig] = useState<PivotConfig>({
    rowField: null,
    colField: null,
    valueField: null,
    aggregation: 'sum',
  });

  // Get headers from first row of selection or sheet
  const range = selectionRange || { startRow: 0, startCol: 0, endRow: sheet.data.length - 1, endCol: Math.max(...sheet.data.map(r => r.length)) - 1 };
  const minR = Math.min(range.startRow, range.endRow);
  const maxR = Math.max(range.startRow, range.endRow);
  const minC = Math.min(range.startCol, range.endCol);
  const maxC = Math.max(range.startCol, range.endCol);

  const headers = useMemo(() => {
    const row = sheet.data[minR];
    if (!row) return [];
    return Array.from({ length: maxC - minC + 1 }, (_, i) => ({
      index: minC + i,
      label: String(row[minC + i] ?? `Column ${String.fromCharCode(65 + minC + i)}`),
    }));
  }, [sheet.data, minR, minC, maxC]);

  const dataRows = useMemo(() => {
    return sheet.data.slice(minR + 1, maxR + 1);
  }, [sheet.data, minR, maxR]);

  // Compute pivot
  const pivotResult = useMemo(() => {
    if (config.rowField === null || config.valueField === null) return null;

    const rowGroups = new Map<string, Map<string, number[]>>();
    const colKeys = new Set<string>();

    dataRows.forEach(row => {
      const rowKey = String(row[config.rowField!] ?? '(empty)');
      const colKey = config.colField !== null ? String(row[config.colField] ?? '(empty)') : 'Value';
      const val = typeof row[config.valueField!] === 'number' ? row[config.valueField!] as number : parseFloat(String(row[config.valueField!]));

      colKeys.add(colKey);
      if (!rowGroups.has(rowKey)) rowGroups.set(rowKey, new Map());
      const colMap = rowGroups.get(rowKey)!;
      if (!colMap.has(colKey)) colMap.set(colKey, []);
      if (!isNaN(val)) colMap.get(colKey)!.push(val);
    });

    const aggregate = (nums: number[]): number => {
      if (!nums.length) return 0;
      switch (config.aggregation) {
        case 'sum': return nums.reduce((a, b) => a + b, 0);
        case 'count': return nums.length;
        case 'avg': return nums.reduce((a, b) => a + b, 0) / nums.length;
        case 'min': return Math.min(...nums);
        case 'max': return Math.max(...nums);
      }
    };

    const sortedCols = Array.from(colKeys).sort();
    const rows = Array.from(rowGroups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, colMap]) => ({
        key,
        values: sortedCols.map(ck => aggregate(colMap.get(ck) || [])),
        total: aggregate(Array.from(colMap.values()).flat()),
      }));

    // Grand totals
    const grandTotals = sortedCols.map((ck) => {
      const allVals = rows.flatMap(r => {
        const idx = sortedCols.indexOf(ck);
        return [r.values[idx]];
      });
      return aggregate(allVals);
    });

    return { columns: sortedCols, rows, grandTotals };
  }, [config, dataRows]);

  return (
    <div className="border-t bg-background">
      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Table2 className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium">Pivot Table</span>
        </div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex gap-2 p-3">
        {/* Config */}
        <div className="w-52 space-y-2 shrink-0">
          <div>
            <label className="text-[10px] text-muted-foreground font-medium">Row Labels</label>
            <Select value={config.rowField !== null ? String(config.rowField) : ''} onValueChange={v => setConfig(c => ({ ...c, rowField: v ? Number(v) : null }))}>
              <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select field" /></SelectTrigger>
              <SelectContent>
                {headers.map(h => <SelectItem key={h.index} value={String(h.index)}>{h.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground font-medium">Column Labels (optional)</label>
            <Select value={config.colField !== null ? String(config.colField) : 'none'} onValueChange={v => setConfig(c => ({ ...c, colField: v === 'none' ? null : Number(v) }))}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {headers.map(h => <SelectItem key={h.index} value={String(h.index)}>{h.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground font-medium">Values</label>
            <Select value={config.valueField !== null ? String(config.valueField) : ''} onValueChange={v => setConfig(c => ({ ...c, valueField: v ? Number(v) : null }))}>
              <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select field" /></SelectTrigger>
              <SelectContent>
                {headers.map(h => <SelectItem key={h.index} value={String(h.index)}>{h.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground font-medium">Aggregation</label>
            <Select value={config.aggregation} onValueChange={v => setConfig(c => ({ ...c, aggregation: v as any }))}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sum">Sum</SelectItem>
                <SelectItem value="count">Count</SelectItem>
                <SelectItem value="avg">Average</SelectItem>
                <SelectItem value="min">Min</SelectItem>
                <SelectItem value="max">Max</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Result */}
        <div className="flex-1 overflow-auto max-h-[250px] border rounded">
          {pivotResult ? (
            <table className="border-collapse text-xs w-full">
              <thead className="sticky top-0">
                <tr>
                  <th className="bg-muted border border-border px-2 py-1 text-left font-medium text-muted-foreground">
                    {headers.find(h => h.index === config.rowField)?.label || 'Row'}
                  </th>
                  {pivotResult.columns.map(col => (
                    <th key={col} className="bg-muted border border-border px-2 py-1 text-right font-medium text-muted-foreground">{col}</th>
                  ))}
                  <th className="bg-muted/80 border border-border px-2 py-1 text-right font-bold text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody>
                {pivotResult.rows.map(row => (
                  <tr key={row.key}>
                    <td className="border border-border px-2 py-1 font-medium bg-muted/20">{row.key}</td>
                    {row.values.map((v, i) => (
                      <td key={i} className="border border-border px-2 py-1 text-right font-mono">{v.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                    ))}
                    <td className="border border-border px-2 py-1 text-right font-mono font-bold bg-muted/10">{row.total.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}
                <tr className="font-bold">
                  <td className="border border-border px-2 py-1 bg-muted/30">Grand Total</td>
                  {pivotResult.grandTotals.map((v, i) => (
                    <td key={i} className="border border-border px-2 py-1 text-right font-mono bg-muted/20">{v.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                  ))}
                  <td className="border border-border px-2 py-1 text-right font-mono bg-muted/30">
                    {pivotResult.grandTotals.reduce((a, b) => a + b, 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tbody>
            </table>
          ) : (
            <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
              Select Row Labels and Values fields to generate pivot table
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
