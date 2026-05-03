import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, Minus, Building2, ChevronRight, ChevronDown, FileText } from 'lucide-react';
import { useQBProfitAndLoss, type PLLineItem, type PLSection, type ParsedPL } from '@/hooks/useQBProfitAndLoss';
import { useQBEntities } from '@/hooks/useQBWidgetData';
import { cn } from '@/lib/utils';

const formatCurrency = (value: number) => {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${value < 0 ? '-' : ''}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${value < 0 ? '-' : ''}$${(abs / 1_000).toFixed(1)}k`;
  return `$${value.toFixed(2)}`;
};

const formatFullCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value);

// ─── Summary stat card ─────────────────────────────────────────
function StatCard({ label, value, variant }: { label: string; value: number; variant?: 'positive' | 'negative' | 'neutral' }) {
  const colorClass = variant === 'positive'
    ? 'text-emerald-600 dark:text-emerald-400'
    : variant === 'negative'
      ? 'text-red-600 dark:text-red-400'
      : 'text-foreground';
  const Icon = variant === 'positive' ? TrendingUp : variant === 'negative' ? TrendingDown : Minus;

  return (
    <Card className="glass-module">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
        <div className="flex items-center gap-1.5 mt-1">
          <Icon className={cn('h-3.5 w-3.5', colorClass)} />
          <p className={cn('text-lg font-bold tabular-nums', colorClass)}>{formatCurrency(value)}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Recursive line-item row ───────────────────────────────────
function LineItemRow({ item, expanded, onToggle }: { item: PLLineItem; expanded: Set<string>; onToggle: (key: string) => void }) {
  const key = `${item.depth}-${item.name}`;
  const hasChildren = item.children && item.children.length > 0;
  const isOpen = expanded.has(key);

  return (
    <>
      <tr
        className={cn(
          'group transition-colors',
          item.isTotal ? 'bg-muted/40 font-semibold border-t border-border/50' : 'hover:bg-muted/20',
          item.isHeader && !item.isTotal && 'font-semibold',
        )}
      >
        <td
          className="py-1.5 pr-2 text-sm cursor-pointer select-none"
          style={{ paddingLeft: `${item.depth * 20 + 12}px` }}
          onClick={() => hasChildren && onToggle(key)}
        >
          <span className="flex items-center gap-1">
            {hasChildren && (
              isOpen
                ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}
            <span className={cn(item.isTotal && 'border-b border-foreground/20')}>{item.name}</span>
          </span>
        </td>
        <td className={cn(
          'py-1.5 px-3 text-sm text-right tabular-nums font-mono',
          item.amount < 0 ? 'text-red-600 dark:text-red-400' : '',
          item.isTotal && 'font-semibold',
          item.isHeader && !item.isTotal && 'text-muted-foreground',
        )}>
          {item.isHeader && !item.isTotal ? '' : formatFullCurrency(item.amount)}
        </td>
      </tr>
      {hasChildren && isOpen && item.children!.map((child, i) => (
        <LineItemRow key={`${child.name}-${i}`} item={child} expanded={expanded} onToggle={onToggle} />
      ))}
    </>
  );
}

// ─── Section block ─────────────────────────────────────────────
function SectionBlock({ section, expanded, onToggle }: { section: PLSection; expanded: Set<string>; onToggle: (key: string) => void }) {
  const groupColors: Record<string, string> = {
    Income: 'border-l-emerald-500',
    COGS: 'border-l-amber-500',
    GrossProfit: 'border-l-blue-500',
    Expenses: 'border-l-red-500',
    NetOperatingIncome: 'border-l-violet-500',
    NetIncome: 'border-l-primary',
  };

  const isSummaryOnly = ['GrossProfit', 'NetOperatingIncome', 'NetIncome'].includes(section.group);

  if (isSummaryOnly) {
    return (
      <div className={cn('border-l-4 rounded-lg bg-muted/30 p-3 flex items-center justify-between', groupColors[section.group] || 'border-l-muted')}>
        <span className="font-bold text-sm">{section.label}</span>
        <span className={cn(
          'font-bold text-base tabular-nums font-mono',
          section.amount >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
        )}>
          {formatFullCurrency(section.amount)}
        </span>
      </div>
    );
  }

  return (
    <Card className={cn('border-l-4 overflow-hidden', groupColors[section.group] || 'border-l-muted')}>
      <CardContent className="p-0">
        <table className="w-full">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider py-2 px-3">
                {section.group === 'COGS' ? 'Cost of Goods Sold' : section.label.replace(/^Total /, '')}
              </th>
              <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider py-2 px-3 w-[140px]">Amount</th>
            </tr>
          </thead>
          <tbody>
            {section.items.map((item, i) => (
              <LineItemRow key={`${item.name}-${i}`} item={item} expanded={expanded} onToggle={onToggle} />
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

// ─── Single P&L report view ────────────────────────────────────
function PLReportView({ pl }: { pl: ParsedPL }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const onToggle = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const expandAll = () => {
    const allKeys = new Set<string>();
    const collectKeys = (items: PLLineItem[], depth: number) => {
      for (const item of items) {
        if (item.children?.length) {
          allKeys.add(`${item.depth}-${item.name}`);
          collectKeys(item.children, depth + 1);
        }
      }
    };
    for (const section of pl.sections) {
      collectKeys(section.items, 0);
    }
    setExpanded(allKeys);
  };

  const collapseAll = () => setExpanded(new Set());

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {pl.header.ReportBasis} Basis · {pl.periodStart} to {pl.periodEnd}
          </span>
        </div>
        <div className="flex gap-2">
          <button onClick={expandAll} className="text-xs text-primary hover:underline">Expand All</button>
          <button onClick={collapseAll} className="text-xs text-muted-foreground hover:underline">Collapse All</button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total Income" value={pl.totalIncome} variant="positive" />
        <StatCard label="Cost of Goods Sold" value={pl.totalCOGS} variant="negative" />
        <StatCard label="Gross Profit" value={pl.grossProfit} variant={pl.grossProfit >= 0 ? 'positive' : 'negative'} />
        <StatCard label="Expenses" value={pl.totalExpenses} variant="negative" />
        <StatCard label="Net Operating Income" value={pl.netOperatingIncome} variant={pl.netOperatingIncome >= 0 ? 'positive' : 'negative'} />
        <StatCard label="Net Income" value={pl.netIncome} variant={pl.netIncome >= 0 ? 'positive' : 'negative'} />
      </div>

      {/* Sections */}
      <div className="space-y-3">
        {pl.sections.map((section, i) => (
          <SectionBlock key={`${section.group}-${i}`} section={section} expanded={expanded} onToggle={onToggle} />
        ))}
      </div>
    </div>
  );
}

// ─── Main dashboard ────────────────────────────────────────────
export function IncomeBoardDashboard() {
  const { data: entities = [], isLoading: entitiesLoading } = useQBEntities();
  const [selectedEntity, setSelectedEntity] = useState<string>('all');
  const { data: plReports, isLoading: plLoading } = useQBProfitAndLoss(selectedEntity || 'all');

  const isLoading = entitiesLoading || plLoading;

  // Find entity name for display
  const entityName = useMemo(() => {
    if (selectedEntity === 'all') return 'All Entities';
    return entities.find(e => e.realmId === selectedEntity)?.companyName || selectedEntity;
  }, [selectedEntity, entities]);

  return (
    <div className="space-y-6">
      {/* Header with entity selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Income Statement (P&L)</h2>
          <p className="text-sm text-muted-foreground">QuickBooks Profit & Loss · Synced data</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedEntity} onValueChange={setSelectedEntity}>
              <SelectTrigger className="w-[260px] h-9">
                <SelectValue placeholder="Select entity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Entities (Consolidated)</SelectItem>
                {entities.map(entity => (
                  <SelectItem key={entity.realmId} value={entity.realmId}>
                    {entity.companyName || entity.realmId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
        </div>
      )}

      {/* No data */}
      {!isLoading && (!plReports || plReports.length === 0) && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold">No P&L Report Available</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              {selectedEntity === 'all'
                ? 'No Profit & Loss reports have been synced yet. Sync your QuickBooks data with "Financial Reports" enabled to see your income statement here.'
                : `No P&L report found for ${entityName}. Make sure to sync this entity with "Profit & Loss" report enabled.`
              }
            </p>
          </CardContent>
        </Card>
      )}

      {/* Report data */}
      {!isLoading && plReports && plReports.length > 0 && (
        selectedEntity === 'all' && plReports.length > 1 ? (
          <div className="space-y-8">
            {plReports.map((pl) => {
              const name = entities.find(e => e.realmId === pl.realmId)?.companyName || pl.realmId;
              return (
                <div key={pl.realmId}>
                  <div className="flex items-center gap-2 mb-3">
                    <Building2 className="h-4 w-4 text-primary" />
                    <h3 className="text-base font-semibold">{name}</h3>
                    <Badge variant="outline" className="text-xs">{pl.header.ReportBasis}</Badge>
                  </div>
                  <PLReportView pl={pl} />
                </div>
              );
            })}
          </div>
        ) : (
          <PLReportView pl={plReports[0]} />
        )
      )}
    </div>
  );
}
