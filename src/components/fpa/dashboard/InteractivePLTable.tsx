import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ChevronDown, ChevronRight, Maximize2, AlertTriangle, Sparkles, Building2, FileText
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PLCommentThread, type FPAComment } from '../collaboration/PLCommentThread';
import { InlineAnnotation, type Annotation } from '../collaboration/InlineAnnotation';
import { PLRowQuickActions } from '../PLRowQuickActions';
import { VarianceLegend } from '../VarianceLegend';
import { useQBProfitAndLoss, type PLLineItem as QBPLLineItem, type ParsedPL } from '@/hooks/useQBProfitAndLoss';
import { useQBEntities } from '@/hooks/useQBWidgetData';

// ─── Legacy PLRow type for comparison columns ──────────────────
interface PLRow {
  account: string;
  level: number;
  actuals: number;
  budget: number;
  forecast: number;
  priorYear: number;
  isHeader: boolean;
  isTotal?: boolean;
  children?: PLRow[];
}

// ─── Convert QB P&L items to PLRow tree ────────────────────────
function qbItemsToPLRows(items: QBPLLineItem[]): PLRow[] {
  return items.map(item => {
    const childRows = item.children ? qbItemsToPLRows(item.children) : undefined;
    return {
      account: item.name,
      level: item.depth,
      actuals: item.amount,
      budget: 0,
      forecast: 0,
      priorYear: 0,
      isHeader: item.isHeader || item.isTotal,
      isTotal: item.isTotal,
      children: childRows && childRows.length > 0 ? childRows : undefined,
    };
  });
}

function qbReportToPLTree(pl: ParsedPL): PLRow[] {
  const rows: PLRow[] = [];
  for (const section of pl.sections) {
    const isSummaryOnly = ['GrossProfit', 'NetOperatingIncome', 'NetIncome'].includes(section.group);
    if (isSummaryOnly) {
      rows.push({
        account: section.label,
        level: 0,
        actuals: section.amount,
        budget: 0, forecast: 0, priorYear: 0,
        isHeader: true,
        isTotal: true,
      });
    } else {
      const children = qbItemsToPLRows(section.items);
      rows.push({
        account: section.group === 'COGS' ? 'Cost of Goods Sold' : section.label.replace(/^Total /, ''),
        level: 0,
        actuals: section.amount,
        budget: 0, forecast: 0, priorYear: 0,
        isHeader: true,
        children,
      });
    }
  }
  return rows;
}

const fmt = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${v < 0 ? '-' : ''}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1000) return `${v < 0 ? '-' : ''}$${(abs / 1000).toFixed(1)}K`;
  return `$${abs.toFixed(0)}`;
};

const fmtFull = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(v);

interface InteractivePLTableProps {
  comparisonMode: 'budget' | 'forecast' | 'prior_year';
  dateRange?: string;
}

export function InteractivePLTable({ comparisonMode, dateRange }: InteractivePLTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string>('all');

  const { data: entities = [] } = useQBEntities();
  const { data: plReports, isLoading, syncForDateRange, isSyncing } = useQBProfitAndLoss(selectedEntity || 'all', dateRange);

  // Auto-sync when date range changes and no matching data exists
  const lastSyncedRange = useRef<string | undefined>();
  useEffect(() => {
    if (!isLoading && plReports === null && dateRange && dateRange !== lastSyncedRange.current && !isSyncing) {
      lastSyncedRange.current = dateRange;
      syncForDateRange().catch(console.error);
    }
  }, [isLoading, plReports, dateRange, isSyncing, syncForDateRange]);

  const activePL = useMemo(() => {
    if (!plReports || plReports.length === 0) return null;
    if (selectedEntity !== 'all') return plReports[0];
    // For "all", use first available report
    return plReports[0];
  }, [plReports, selectedEntity]);

  const plTree = useMemo(() => {
    if (!activePL) return [];
    return qbReportToPLTree(activePL);
  }, [activePL]);

  // Auto-expand top-level sections
  const defaultExpanded = useMemo(() => {
    return new Set(plTree.filter(r => r.children && r.children.length > 0).map(r => r.account));
  }, [plTree]);

  // Use defaultExpanded only when plTree changes
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

  const collapseAll = () => setExpandedRows(new Set(['__none__'])); // Force empty

  const renderRow = (row: PLRow, depth: number = 0): JSX.Element[] => {
    const hasChildren = row.children && row.children.length > 0;
    const isExpanded = effectiveExpanded.has(row.account);
    const isTotalRow = row.isTotal;

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
        <TableCell className={cn(
          "text-xs text-right font-mono py-1.5 tabular-nums",
          row.isHeader || isTotalRow ? "font-semibold" : "",
          row.actuals < 0 ? "text-red-600 dark:text-red-400" : "",
        )}>
          {row.isHeader && !isTotalRow && row.actuals === 0 ? '' : fmtFull(row.actuals)}
        </TableCell>
      </TableRow>
    );

    if (hasChildren && isExpanded) {
      row.children!.forEach(child => {
        rows.push(...renderRow(child, depth + 1));
      });
    }

    return rows;
  };

  const entityName = useMemo(() => {
    if (selectedEntity === 'all') return 'All Entities';
    return entities.find(e => e.realmId === selectedEntity)?.companyName || selectedEntity;
  }, [selectedEntity, entities]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm">Income Statement</CardTitle>
            {activePL && (
              <Badge variant="outline" className="text-[9px]">
                {activePL.header.ReportBasis} · {activePL.periodStart} to {activePL.periodEnd}
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
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {(isLoading || isSyncing) && (
          <div className="space-y-2">
            {isSyncing && (
              <p className="text-xs text-muted-foreground animate-pulse">Fetching P&L for selected date range…</p>
            )}
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        )}

        {!isLoading && !isSyncing && plTree.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="h-8 w-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium">No P&L Data Available</p>
            <p className="text-xs text-muted-foreground mt-1">
              Sync your QuickBooks data with "Profit & Loss" report enabled.
            </p>
          </div>
        )}

        {!isLoading && !isSyncing && plTree.length > 0 && (
          <>
            <div className="flex justify-end gap-2 mb-1">
              <button onClick={expandAll} className="text-[10px] text-primary hover:underline">Expand All</button>
              <button onClick={collapseAll} className="text-[10px] text-muted-foreground hover:underline">Collapse</button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Account</TableHead>
                  <TableHead className="text-[10px] text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plTree.map(row => renderRow(row)).flat()}
              </TableBody>
            </Table>
            <VarianceLegend compact className="mt-3" />
          </>
        )}
      </CardContent>
    </Card>
  );
}
