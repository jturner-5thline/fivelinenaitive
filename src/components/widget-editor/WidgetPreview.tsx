import { WidgetConfig, getField } from './widgetTypes';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface Props {
  config: WidgetConfig;
}

function buildInterpretation(config: WidgetConfig): string {
  const parts: string[] = [];
  const valueNames = config.values.map((v) => {
    const f = getField(v.fieldId);
    return `${v.agg.charAt(0).toUpperCase() + v.agg.slice(1)} of ${f?.name ?? '?'}`;
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

export function WidgetPreview({ config }: Props) {
  const interpretation = buildInterpretation(config);
  const rows = generateMockRows(config);
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  const hasData = config.values.length > 0 || config.xAxis.fieldId;

  // Build a format map for value columns
  const formatMap: Record<string, string> = {};
  for (const vc of config.values) {
    const f = getField(vc.fieldId);
    if (f) formatMap[f.name] = vc.format;
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-5 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">Preview</h2>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-5 space-y-4">
          {/* interpretation */}
          <div className="rounded-lg bg-primary/5 border border-primary/10 px-4 py-2.5">
            <p className="text-xs text-primary font-medium">{interpretation}</p>
          </div>

          {hasData ? (
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
                  {rows.map((row, i) => (
                    <TableRow key={i}>
                      {columns.map((col) => (
                        <TableCell key={col} className="text-xs whitespace-nowrap">
                          {formatCell(row[col], formatMap[col])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
              Drag fields to the configuration panel to build your widget
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
