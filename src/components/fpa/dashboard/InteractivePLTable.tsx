import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ChevronDown, ChevronRight, Maximize2, Building2, FileText, TrendingUp, TrendingDown, Minus
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PLCommentThread, type FPAComment } from '../collaboration/PLCommentThread';
import { InlineAnnotation, type Annotation } from '../collaboration/InlineAnnotation';
import { PLRowQuickActions } from '../PLRowQuickActions';
import { VarianceLegend } from '../VarianceLegend';
import { useQBProfitAndLoss, getComparisonDateRange, getGrainPeriodDates, getGrainComparisonDates, getGrainPeriodLabel, dateRangeToDates, type PLLineItem as QBPLLineItem, type ParsedPL, type TimeGrain } from '@/hooks/useQBProfitAndLoss';
import { useQBEntities } from '@/hooks/useQBWidgetData';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

// ─── PLRow type ────────────────────────────────────────────────
interface PLRow {
  account: string;
  level: number;
  actuals: number;
  comparison: number;
  isHeader: boolean;
  isTotal?: boolean;
  children?: PLRow[];
}

// ─── Convert QB P&L items to PLRow tree ────────────────────────
function qbItemsToPLRows(items: QBPLLineItem[], compMap: Map<string, number>): PLRow[] {
  return items.map(item => {
    const childRows = item.children ? qbItemsToPLRows(item.children, compMap) : undefined;
    return {
      account: item.name,
      level: item.depth,
      actuals: item.amount,
      comparison: compMap.get(item.name) ?? 0,
      isHeader: item.isHeader || item.isTotal,
      isTotal: item.isTotal,
      children: childRows && childRows.length > 0 ? childRows : undefined,
    };
  });
}

function qbReportToPLTree(pl: ParsedPL, compMap: Map<string, number>): PLRow[] {
  const rows: PLRow[] = [];
  for (const section of pl.sections) {
    const isSummaryOnly = ['GrossProfit', 'NetOperatingIncome', 'NetIncome'].includes(section.group);
    if (isSummaryOnly) {
      rows.push({
        account: section.label,
        level: 0,
        actuals: section.amount,
        comparison: compMap.get(section.label) ?? 0,
        isHeader: true,
        isTotal: true,
      });
    } else {
      const label = section.group === 'COGS' ? 'Cost of Goods Sold' : section.label.replace(/^Total /, '');
      const children = qbItemsToPLRows(section.items, compMap);
      rows.push({
        account: label,
        level: 0,
        actuals: section.amount,
        comparison: compMap.get(label) ?? 0,
        isHeader: true,
        children,
      });
    }
  }
  return rows;
}

// Build a flat map of account name → amount from a ParsedPL for comparison lookup
function buildComparisonMap(pl: ParsedPL | null): Map<string, number> {
  const map = new Map<string, number>();
  if (!pl) return map;

  function walkItems(items: QBPLLineItem[]) {
    for (const item of items) {
      map.set(item.name, item.amount);
      if (item.children) walkItems(item.children);
    }
  }

  for (const section of pl.sections) {
    const label = section.group === 'COGS' ? 'Cost of Goods Sold' : section.label.replace(/^Total /, '');
    map.set(section.label, section.amount);
    map.set(label, section.amount);
    walkItems(section.items);
  }
  return map;
}

const fmtFull = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(v);

const fmtPct = (v: number) => {
  if (!isFinite(v)) return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
};

interface InteractivePLTableProps {
  comparisonMode: 'budget' | 'prior_year' | 'prior_period';
  dateRange?: string;
}

const COMPARISON_LABELS: Record<string, string> = {
  prior_year: 'Prior Year',
  prior_period: 'Prior Period',
  budget: 'Budget',
};

export function InteractivePLTable({ comparisonMode, dateRange }: InteractivePLTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string>('all');
  const [timeGrain, setTimeGrain] = useState<TimeGrain>('quarterly');

  const { data: entities = [] } = useQBEntities();

  // Compute current and comparison period dates based on grain
  const grainDates = useMemo(() => getGrainPeriodDates(timeGrain), [timeGrain]);
  const grainCompDates = useMemo(() => getGrainComparisonDates(timeGrain, comparisonMode), [timeGrain, comparisonMode]);

  const currentDateRange = useMemo(() => `custom_${grainDates.start_date}_${grainDates.end_date}`, [grainDates]);
  const compDateRange = useMemo(() => {
    if (!grainCompDates) return undefined;
    return `custom_${grainCompDates.start_date}_${grainCompDates.end_date}`;
  }, [grainCompDates]);

  // Human-readable labels
  const currentLabel = useMemo(() => getGrainPeriodLabel(grainDates, timeGrain), [grainDates, timeGrain]);
  const compLabel = useMemo(() => {
    if (!grainCompDates) return COMPARISON_LABELS[comparisonMode] || comparisonMode;
    return getGrainPeriodLabel(grainCompDates, timeGrain);
  }, [grainCompDates, timeGrain, comparisonMode]);

  const { data: plReports, isLoading, syncForDateRange, isSyncing } = useQBProfitAndLoss(selectedEntity || 'all', currentDateRange);

  const { data: compReports, isLoading: compLoading, syncForDateRange: syncCompRange, isSyncing: compSyncing } = useQBProfitAndLoss(
    selectedEntity || 'all',
    comparisonMode !== 'budget' ? compDateRange : undefined
  );

  // Auto-sync when date range changes and no matching data exists
  const lastSyncedRange = useRef<string | undefined>();
  useEffect(() => {
    if (!isLoading && plReports === null && currentDateRange && currentDateRange !== lastSyncedRange.current && !isSyncing) {
      lastSyncedRange.current = currentDateRange;
      syncForDateRange().catch(console.error);
    }
  }, [isLoading, plReports, currentDateRange, isSyncing, syncForDateRange]);

  // Auto-sync comparison data
  const lastSyncedCompRange = useRef<string | undefined>();
  useEffect(() => {
    if (!compLoading && compReports === null && compDateRange && compDateRange !== lastSyncedCompRange.current && !compSyncing) {
      lastSyncedCompRange.current = compDateRange;
      syncCompRange().catch(console.error);
    }
  }, [compLoading, compReports, compDateRange, compSyncing, syncCompRange]);

  const activePL = useMemo(() => {
    if (!plReports || plReports.length === 0) return null;
    return plReports[0];
  }, [plReports]);

  const comparisonPL = useMemo(() => {
    if (!compReports || compReports.length === 0) return null;
    return compReports[0];
  }, [compReports]);

  const compMap = useMemo(() => buildComparisonMap(comparisonPL), [comparisonPL]);

  const plTree = useMemo(() => {
    if (!activePL) return [];
    return qbReportToPLTree(activePL, compMap);
  }, [activePL, compMap]);

  const hasComparison = comparisonMode !== 'budget' && comparisonPL !== null;

  // Auto-expand top-level sections
  const defaultExpanded = useMemo(() => {
    return new Set(plTree.filter(r => r.children && r.children.length > 0).map(r => r.account));
  }, [plTree]);

  const effectiveExpanded = expandedRows.size > 0 ? expandedRows : defaultExpanded;

  // Collaboration state
  const [comments, setComments] = useState<Record<string, FPAComment[]>>({});
  const [annotations, setAnnotations] = useState<Record<string, Annotation[]>>({});

  const handleAddComment = useCallback((targetKey: string, content: string, mentions: string[]) => {
    setComments(prev => ({
      ...prev,
      [targetKey]: [...(prev[targetKey] || []), {
        id: Date.now().toString(), user_name: 'You', user_initials: 'ME',
        content, mentions, is_resolved: false, created_at: 'Just now',
      }],
    }));
  }, []);

  const handleResolveComment = useCallback((commentId: string) => {
    setComments(prev => {
      const updated = { ...prev };
      for (const key of Object.keys(updated)) {
        updated[key] = updated[key].map(c => c.id === commentId ? { ...c, is_resolved: true } : c);
      }
      return updated;
    });
  }, []);

  const handleAddAnnotation = useCallback((targetKey: string, content: string, color: string) => {
    setAnnotations(prev => ({
      ...prev,
      [targetKey]: [...(prev[targetKey] || []), {
        id: Date.now().toString(), content, color: color as Annotation['color'],
        is_pinned: false, user_initials: 'ME', created_at: 'Just now',
      }],
    }));
  }, []);

  const handleDeleteAnnotation = useCallback((id: string) => {
    setAnnotations(prev => {
      const updated = { ...prev };
      for (const key of Object.keys(updated)) {
        updated[key] = updated[key].filter(a => a.id !== id);
      }
      return updated;
    });
  }, []);

  const handleTogglePinAnnotation = useCallback((id: string) => {
    setAnnotations(prev => {
      const updated = { ...prev };
      for (const key of Object.keys(updated)) {
        updated[key] = updated[key].map(a => a.id === id ? { ...a, is_pinned: !a.is_pinned } : a);
      }
      return updated;
    });
  }, []);

  const toggleRow = (account: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev.size > 0 ? prev : defaultExpanded);
      next.has(account) ? next.delete(account) : next.add(account);
      return next;
    });
  };

  const expandAll = () => {
    const allKeys = new Set<string>();
    const collect = (rows: PLRow[]) => {
      for (const row of rows) {
        if (row.children?.length) {
          allKeys.add(row.account);
          collect(row.children);
        }
      }
    };
    collect(plTree);
    setExpandedRows(allKeys);
  };

  const collapseAll = () => setExpandedRows(new Set(['__none__']));

  const renderRow = (row: PLRow, depth: number = 0): JSX.Element[] => {
    const hasChildren = row.children && row.children.length > 0;
    const isExpanded = effectiveExpanded.has(row.account);
    const isTotalRow = row.isTotal;

    const variance = row.actuals - row.comparison;
    const variancePct = row.comparison !== 0 ? (variance / Math.abs(row.comparison)) * 100 : 0;
    const showValues = !(row.isHeader && !isTotalRow && row.actuals === 0);

    const rows: JSX.Element[] = [];

    rows.push(
      <TableRow
        key={`${depth}-${row.account}`}
        className={cn(
          "cursor-pointer hover:bg-muted/50 transition-colors group",
          row.isHeader && !isTotalRow && "bg-muted/30 font-semibold",
          isTotalRow && "bg-muted/40 font-semibold border-t border-border/50",
        )}
        onClick={() => hasChildren && toggleRow(row.account)}
        onMouseEnter={() => setHoveredRow(row.account)}
        onMouseLeave={() => setHoveredRow(null)}
      >
        {/* Account name */}
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
            <div className="flex items-center gap-0.5 ml-auto shrink-0" onClick={e => e.stopPropagation()}>
              {!row.isHeader && !isTotalRow && (
                <PLRowQuickActions
                  rowAccount={row.account}
                  visible={hoveredRow === row.account}
                  onComment={() => {}}
                  onFlag={() => {}}
                  onDrillDown={() => {}}
                  onBookmark={() => {}}
                />
              )}
              <PLCommentThread
                targetKey={row.account}
                targetLabel={row.account}
                comments={comments[row.account] || []}
                onAddComment={handleAddComment}
                onResolve={handleResolveComment}
              />
              <InlineAnnotation
                targetKey={row.account}
                targetLabel={row.account}
                annotations={annotations[row.account] || []}
                onAdd={handleAddAnnotation}
                onDelete={handleDeleteAnnotation}
                onTogglePin={handleTogglePinAnnotation}
              />
            </div>
          </div>
        </TableCell>

        {/* Actuals */}
        <TableCell className={cn(
          "text-xs text-right font-mono py-1.5 tabular-nums",
          row.isHeader || isTotalRow ? "font-semibold" : "",
          row.actuals < 0 ? "text-destructive" : "",
        )}>
          {showValues ? fmtFull(row.actuals) : ''}
        </TableCell>

        {/* Comparison */}
        {hasComparison && (
          <TableCell className={cn(
            "text-xs text-right font-mono py-1.5 tabular-nums text-muted-foreground",
            row.isHeader || isTotalRow ? "font-semibold" : "",
          )}>
            {showValues && row.comparison !== 0 ? fmtFull(row.comparison) : showValues ? '—' : ''}
          </TableCell>
        )}

        {/* Variance $ */}
        {hasComparison && (
          <TableCell className={cn(
            "text-xs text-right font-mono py-1.5 tabular-nums",
            row.isHeader || isTotalRow ? "font-semibold" : "",
            showValues && row.comparison !== 0 ? (variance > 0 ? "text-emerald-600 dark:text-emerald-400" : variance < 0 ? "text-destructive" : "") : "",
          )}>
            {showValues && row.comparison !== 0 ? fmtFull(variance) : ''}
          </TableCell>
        )}

        {/* Variance % */}
        {hasComparison && (
          <TableCell className={cn(
            "text-xs text-right font-mono py-1.5 tabular-nums",
            row.isHeader || isTotalRow ? "font-semibold" : "",
          )}>
            {showValues && row.comparison !== 0 ? (
              <span className={cn(
                "inline-flex items-center gap-0.5",
                variance > 0 ? "text-emerald-600 dark:text-emerald-400" : variance < 0 ? "text-destructive" : "text-muted-foreground",
              )}>
                {variance > 0 ? <TrendingUp className="h-3 w-3" /> : variance < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                {fmtPct(variancePct)}
              </span>
            ) : ''}
          </TableCell>
        )}
      </TableRow>
    );

    if (hasChildren && isExpanded) {
      row.children!.forEach(child => {
        rows.push(...renderRow(child, depth + 1));
      });
    }

    return rows;
  };

  const anyLoading = isLoading || isSyncing;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm">Income Statement</CardTitle>
            {activePL && (
              <Badge variant="outline" className="text-[9px]">
                {activePL.header.ReportBasis} · {currentLabel}
              </Badge>
            )}
            {hasComparison && comparisonPL && (
              <Badge variant="outline" className="text-[9px] bg-muted/50">
                vs {compLabel}
              </Badge>
            )}
            <Badge variant="secondary" className="text-[9px] gap-1">
              <FileText className="h-2.5 w-2.5" /> QuickBooks Live
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <div onClick={(e) => e.stopPropagation()}>
              <ToggleGroup
                type="single"
                value={timeGrain}
                onValueChange={(v) => { if (v) { setTimeGrain(v as TimeGrain); setExpandedRows(new Set()); } }}
                className="bg-muted/50 rounded-md p-0.5"
              >
                <ToggleGroupItem value="monthly" className="px-2 py-0.5 text-[10px] h-6">Monthly</ToggleGroupItem>
                <ToggleGroupItem value="quarterly" className="px-2 py-0.5 text-[10px] h-6">Quarterly</ToggleGroupItem>
                <ToggleGroupItem value="annual" className="px-2 py-0.5 text-[10px] h-6">Annual</ToggleGroupItem>
              </ToggleGroup>
            </div>
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
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {anyLoading && (
          <div className="space-y-2">
            {isSyncing && (
              <p className="text-xs text-muted-foreground animate-pulse">Fetching P&L for selected date range…</p>
            )}
            {compSyncing && (
              <p className="text-xs text-muted-foreground animate-pulse">Fetching comparison period…</p>
            )}
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        )}

        {!anyLoading && plTree.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="h-8 w-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium">No P&L Data Available</p>
            <p className="text-xs text-muted-foreground mt-1">
              Sync your QuickBooks data with "Profit & Loss" report enabled.
            </p>
          </div>
        )}

        {!anyLoading && plTree.length > 0 && (
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
                    <TableHead className="text-[10px] text-right">{currentLabel}</TableHead>
                    {hasComparison && <TableHead className="text-[10px] text-right">{compLabel}</TableHead>}
                    {hasComparison && <TableHead className="text-[10px] text-right">Var ($)</TableHead>}
                    {hasComparison && <TableHead className="text-[10px] text-right">Var (%)</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plTree.map(row => renderRow(row)).flat()}
                </TableBody>
              </Table>
            </div>
            <VarianceLegend compact className="mt-3" />
          </>
        )}
      </CardContent>
    </Card>
  );
}
