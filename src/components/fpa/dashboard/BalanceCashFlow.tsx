import { useState, useMemo, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ChevronDown, ChevronRight, Download, Maximize2, Building2, FileText, TrendingUp, TrendingDown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend, Line, ComposedChart, Cell
} from 'recharts';
import { useQBBalanceSheet, type BSLineItem, type ParsedBS } from '@/hooks/useQBBalanceSheet';
import { getComparisonDateRange } from '@/hooks/useQBProfitAndLoss';
import { useQBEntities } from '@/hooks/useQBWidgetData';

const tooltipStyle = { fontSize: 11, background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 6 };

// Cash Flow waterfall (kept as demo data for cashflow view)
const CASH_FLOW = [
  { name: 'Opening Cash', value: 17200, fill: 'hsl(var(--muted-foreground))' },
  { name: 'Operating CF', value: 2800, fill: 'hsl(var(--chart-2))' },
  { name: 'CapEx', value: -400, fill: 'hsl(var(--destructive))' },
  { name: 'Debt Repayment', value: -200, fill: 'hsl(var(--chart-5))' },
  { name: 'Financing', value: 0, fill: 'hsl(var(--chart-4))' },
  { name: 'Working Capital', value: -900, fill: 'hsl(var(--destructive))' },
  { name: 'Closing Cash', value: 18500, fill: 'hsl(var(--primary))' },
];

const CASH_TREND = [
  { month: 'Jul', cash: 14200, fcf: 800, burnRate: 350 },
  { month: 'Aug', cash: 14800, fcf: 850, burnRate: 340 },
  { month: 'Sep', cash: 15400, fcf: 900, burnRate: 330 },
  { month: 'Oct', cash: 16000, fcf: 950, burnRate: 325 },
  { month: 'Nov', cash: 16600, fcf: 900, burnRate: 330 },
  { month: 'Dec', cash: 17200, fcf: 1000, burnRate: 320 },
  { month: 'Jan', cash: 17800, fcf: 1050, burnRate: 315 },
  { month: 'Feb', cash: 18500, fcf: 1100, burnRate: 310 },
];

const fmtFull = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(v);

const fmtCompact = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${v < 0 ? '-' : ''}$${(abs / 1_000_000).toFixed(1)}MM`;
  if (abs >= 1_000) return `${v < 0 ? '-' : ''}$${(abs / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
};

const fmtPct = (v: number) => {
  if (!isFinite(v)) return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
};

// ─── Types ─────────────────────────────────────────────────────
interface BSRow {
  account: string;
  depth: number;
  current: number;
  comparison: number;
  isHeader: boolean;
  isTotal?: boolean;
  children?: BSRow[];
}

function bsItemsToRows(items: BSLineItem[], compMap: Map<string, number>): BSRow[] {
  return items.map(item => {
    const childRows = item.children ? bsItemsToRows(item.children, compMap) : undefined;
    return {
      account: item.name,
      depth: item.depth,
      current: item.amount,
      comparison: compMap.get(item.name) ?? 0,
      isHeader: item.isHeader || item.isTotal,
      isTotal: item.isTotal,
      children: childRows && childRows.length > 0 ? childRows : undefined,
    };
  });
}

function bsReportToTree(bs: ParsedBS, compMap: Map<string, number>): BSRow[] {
  const rows: BSRow[] = [];
  for (const section of bs.sections) {
    const isSummaryOnly = !section.items.length || (section.items.length === 1 && section.items[0].isTotal);
    if (isSummaryOnly) {
      rows.push({
        account: section.label,
        depth: 0,
        current: section.amount,
        comparison: compMap.get(section.label) ?? 0,
        isHeader: true,
        isTotal: true,
      });
    } else {
      const label = section.label.replace(/^Total /, '');
      const children = bsItemsToRows(section.items, compMap);
      rows.push({
        account: label,
        depth: 0,
        current: section.amount,
        comparison: compMap.get(label) ?? compMap.get(section.label) ?? 0,
        isHeader: true,
        children,
      });
    }
  }
  return rows;
}

function buildBSComparisonMap(bs: ParsedBS | null): Map<string, number> {
  const map = new Map<string, number>();
  if (!bs) return map;
  function walkItems(items: BSLineItem[]) {
    for (const item of items) {
      map.set(item.name, item.amount);
      if (item.children) walkItems(item.children);
    }
  }
  for (const section of bs.sections) {
    map.set(section.label, section.amount);
    map.set(section.label.replace(/^Total /, ''), section.amount);
    walkItems(section.items);
  }
  return map;
}

const COMPARISON_LABELS: Record<string, string> = {
  prior_year: 'Prior Year',
  prior_period: 'Prior Period',
  budget: 'Budget',
};

// ─── Component ─────────────────────────────────────────────────
interface BalanceCashFlowProps {
  view: 'balance' | 'cashflow';
  dateRange?: string;
  comparisonMode?: 'budget' | 'prior_year' | 'prior_period';
}

export function BalanceCashFlow({ view, dateRange, comparisonMode = 'prior_period' }: BalanceCashFlowProps) {
  if (view === 'balance') {
    return <LiveBalanceSheet dateRange={dateRange} comparisonMode={comparisonMode} />;
  }

  // Cash Flow view (kept as-is for now)
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Cash Flow Bridge</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={CASH_FLOW}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" angle={-20} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${(v/1000).toFixed(0)}M`} domain={[0, 20000]} />
                <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: number) => [`$${v}K`, undefined]} />
                <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                  {CASH_FLOW.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Cash Position & Free Cash Flow</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={CASH_TREND}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${(v/1000).toFixed(0)}M`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${v}K`} />
                <RechartsTooltip contentStyle={tooltipStyle} />
                <Bar yAxisId="right" dataKey="fcf" fill="hsl(var(--chart-2))" opacity={0.6} barSize={20} radius={[3, 3, 0, 0]} name="FCF" />
                <Line yAxisId="left" type="monotone" dataKey="cash" stroke="hsl(var(--primary))" strokeWidth={1} dot={{ r: 3 }} name="Cash" />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Live Balance Sheet ────────────────────────────────────────
function LiveBalanceSheet({ dateRange, comparisonMode }: { dateRange?: string; comparisonMode: 'budget' | 'prior_year' | 'prior_period' }) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selectedEntity, setSelectedEntity] = useState<string>('all');

  const { data: entities = [] } = useQBEntities();
  const { data: bsReports, isLoading, syncForDateRange, isSyncing } = useQBBalanceSheet(selectedEntity || 'all', dateRange);

  // Comparison dates
  const compDates = useMemo(() => getComparisonDateRange(dateRange, comparisonMode), [dateRange, comparisonMode]);
  const compDateRange = useMemo(() => {
    if (!compDates) return undefined;
    return `custom_${compDates.start_date}_${compDates.end_date}`;
  }, [compDates]);

  const { data: compReports, isLoading: compLoading, syncForDateRange: syncCompRange, isSyncing: compSyncing } = useQBBalanceSheet(
    selectedEntity || 'all',
    comparisonMode !== 'budget' ? compDateRange : undefined
  );

  // Auto-sync current
  const lastSyncedRange = useRef<string | undefined>();
  useEffect(() => {
    if (!isLoading && bsReports === null && dateRange && dateRange !== lastSyncedRange.current && !isSyncing) {
      lastSyncedRange.current = dateRange;
      syncForDateRange().catch(console.error);
    }
  }, [isLoading, bsReports, dateRange, isSyncing, syncForDateRange]);

  // Auto-sync comparison
  const lastSyncedComp = useRef<string | undefined>();
  useEffect(() => {
    if (!compLoading && compReports === null && compDateRange && compDateRange !== lastSyncedComp.current && !compSyncing) {
      lastSyncedComp.current = compDateRange;
      syncCompRange().catch(console.error);
    }
  }, [compLoading, compReports, compDateRange, compSyncing, syncCompRange]);

  const activeBS = useMemo(() => {
    if (!bsReports || bsReports.length === 0) return null;
    return bsReports[0];
  }, [bsReports]);

  const comparisonBS = useMemo(() => {
    if (!compReports || compReports.length === 0) return null;
    return compReports[0];
  }, [compReports]);

  const compMap = useMemo(() => buildBSComparisonMap(comparisonBS), [comparisonBS]);
  const bsTree = useMemo(() => {
    if (!activeBS) return [];
    return bsReportToTree(activeBS, compMap);
  }, [activeBS, compMap]);

  const hasComparison = comparisonMode !== 'budget' && comparisonBS !== null;

  // Auto-expand top-level
  const defaultExpanded = useMemo(() => {
    return new Set(bsTree.filter(r => r.children && r.children.length > 0).map(r => r.account));
  }, [bsTree]);
  const effectiveExpanded = expandedRows.size > 0 ? expandedRows : defaultExpanded;

  const toggleRow = (account: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev.size > 0 ? prev : defaultExpanded);
      next.has(account) ? next.delete(account) : next.add(account);
      return next;
    });
  };

  const expandAll = () => {
    const allKeys = new Set<string>();
    const collect = (rows: BSRow[]) => {
      for (const row of rows) {
        if (row.children?.length) { allKeys.add(row.account); collect(row.children); }
      }
    };
    collect(bsTree);
    setExpandedRows(allKeys);
  };

  const collapseAll = () => setExpandedRows(new Set(['__none__']));

  const compLabel = COMPARISON_LABELS[comparisonMode] || comparisonMode;
  const anyLoading = isLoading || isSyncing;

  const renderRow = (row: BSRow, depth: number = 0): JSX.Element[] => {
    const hasChildren = row.children && row.children.length > 0;
    const isExpanded = effectiveExpanded.has(row.account);
    const isTotalRow = row.isTotal;
    const variance = row.current - row.comparison;
    const variancePct = row.comparison !== 0 ? (variance / Math.abs(row.comparison)) * 100 : 0;
    const showValues = !(row.isHeader && !isTotalRow && row.current === 0);

    const rows: JSX.Element[] = [];
    rows.push(
      <TableRow
        key={`${depth}-${row.account}`}
        className={cn(
          "cursor-pointer hover:bg-muted/50 transition-colors",
          row.isHeader && !isTotalRow && "bg-muted/30 font-semibold",
          isTotalRow && "bg-muted/40 font-semibold border-t border-border/50",
        )}
        onClick={() => hasChildren && toggleRow(row.account)}
      >
        <TableCell className="py-1.5">
          <div className="flex items-center gap-1" style={{ paddingLeft: `${depth * 16}px` }}>
            {hasChildren ? (
              isExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
            ) : (
              <span className="w-3 shrink-0" />
            )}
            <span className={cn(
              "text-xs",
              row.isHeader && !isTotalRow ? "font-semibold" : "",
              isTotalRow ? "font-semibold border-b border-foreground/20" : "",
              depth > 1 && !isTotalRow ? "text-muted-foreground" : "",
            )}>
              {row.account}
            </span>
          </div>
        </TableCell>

        <TableCell className={cn(
          "text-xs text-right font-mono py-1.5 tabular-nums",
          row.isHeader || isTotalRow ? "font-semibold" : "",
          row.current < 0 ? "text-destructive" : "",
        )}>
          {showValues ? fmtFull(row.current) : ''}
        </TableCell>

        {hasComparison && (
          <TableCell className={cn(
            "text-xs text-right font-mono py-1.5 tabular-nums text-muted-foreground",
            row.isHeader || isTotalRow ? "font-semibold" : "",
          )}>
            {showValues && row.comparison !== 0 ? fmtFull(row.comparison) : showValues ? '—' : ''}
          </TableCell>
        )}

        {hasComparison && (
          <TableCell className={cn(
            "text-xs text-right font-mono py-1.5 tabular-nums",
            row.isHeader || isTotalRow ? "font-semibold" : "",
            showValues && row.comparison !== 0 ? (variance > 0 ? "text-emerald-600 dark:text-emerald-400" : variance < 0 ? "text-destructive" : "") : "",
          )}>
            {showValues && row.comparison !== 0 ? `${variance > 0 ? '+' : ''}${fmtCompact(variance)}` : ''}
          </TableCell>
        )}

        {hasComparison && (
          <TableCell className={cn(
            "text-xs text-right font-mono py-1.5 tabular-nums",
            row.isHeader || isTotalRow ? "font-semibold" : "",
            showValues && row.comparison !== 0 ? (variancePct > 0 ? "text-emerald-600 dark:text-emerald-400" : variancePct < 0 ? "text-destructive" : "") : "",
          )}>
            {showValues && row.comparison !== 0 ? fmtPct(variancePct) : ''}
          </TableCell>
        )}
      </TableRow>
    );

    if (hasChildren && isExpanded) {
      row.children!.forEach(child => { rows.push(...renderRow(child, depth + 1)); });
    }
    return rows;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm">Balance Sheet</CardTitle>
            {activeBS && (
              <Badge variant="outline" className="text-[9px]">
                {activeBS.header.ReportBasis} · As of {activeBS.periodEnd}
              </Badge>
            )}
            {hasComparison && comparisonBS && (
              <Badge variant="outline" className="text-[9px] bg-muted/50">
                vs {comparisonBS.periodEnd}
              </Badge>
            )}
            <Badge variant="secondary" className="text-[9px] gap-1">
              <FileText className="h-2.5 w-2.5" /> QuickBooks Live
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedEntity} onValueChange={(v) => { setSelectedEntity(v); setExpandedRows(new Set()); }}>
              <SelectTrigger className="h-7 w-[200px] text-[10px]" onClick={(e) => e.stopPropagation()}>
                <Building2 className="h-3 w-3 mr-1 shrink-0" />
                <SelectValue placeholder="Entity" />
              </SelectTrigger>
              <SelectContent onClick={(e) => e.stopPropagation()}>
                <SelectItem value="all">All Entities</SelectItem>
                {entities.map(entity => (
                  <SelectItem key={entity.realmId} value={entity.realmId}>
                    {entity.companyName || entity.realmId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
              <Download className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {anyLoading && (
          <div className="space-y-2">
            {isSyncing && <p className="text-xs text-muted-foreground animate-pulse">Fetching Balance Sheet…</p>}
            {compSyncing && <p className="text-xs text-muted-foreground animate-pulse">Fetching comparison period…</p>}
            {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
          </div>
        )}

        {!anyLoading && bsTree.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="h-8 w-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium">No Balance Sheet Data Available</p>
            <p className="text-xs text-muted-foreground mt-1">
              Sync your QuickBooks data with "Balance Sheet" report enabled.
            </p>
          </div>
        )}

        {!anyLoading && bsTree.length > 0 && (
          <>
            <div className="flex justify-end gap-2 mb-1">
              <button onClick={expandAll} className="text-[10px] text-primary hover:underline">Expand All</button>
              <button onClick={collapseAll} className="text-[10px] text-muted-foreground hover:underline">Collapse</button>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Account</TableHead>
                    <TableHead className="text-[10px] text-right">Current</TableHead>
                    {hasComparison && <TableHead className="text-[10px] text-right">{compLabel}</TableHead>}
                    {hasComparison && <TableHead className="text-[10px] text-right">Δ ($)</TableHead>}
                    {hasComparison && <TableHead className="text-[10px] text-right">Δ (%)</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bsTree.map(row => renderRow(row)).flat()}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
