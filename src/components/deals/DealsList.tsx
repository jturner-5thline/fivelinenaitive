import { useState, useMemo, useCallback, useEffect } from 'react';
import { Deal, DealStatus, STATUS_CONFIG, STAGE_CONFIG, ENGAGEMENT_TYPE_CONFIG } from '@/types/deal';
import { DealCard } from './DealCard';
import { useDealNotificationCounts } from '@/hooks/useDealNotificationCounts';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { DealListRow } from './DealListRow';
import { DealListCardRow, DEAL_LIST_GRID } from './DealListCardRow';
import { FileX, ChevronDown, ChevronRight, GripVertical, ArrowUp, ArrowDown, ArrowUpDown, X } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { HintTooltip } from '@/components/ui/hint-tooltip';
import { useFirstTimeHints } from '@/hooks/useFirstTimeHints';
import { useFlexEngagementScores } from '@/hooks/useFlexEngagementScores';
import { SortField, SortDirection, DealFilters } from '@/hooks/useDeals';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useDealListColumnOrder, COLUMN_LABELS, DealListColumnId } from '@/hooks/useDealListColumnOrder';
import { DealsHeaderFilterPopover } from './DealsHeaderFilterPopover';
import { cn } from '@/lib/utils';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Checkbox } from '@/components/ui/checkbox';
import { DealsBulkActionBar } from './DealsBulkActionBar';

interface DealsListProps {
  deals: Deal[];
  onStatusChange: (dealId: string, newStatus: DealStatus | null) => void;
  onStageChange?: (dealId: string, newStage: string) => void;
  onMarkReviewed?: (dealId: string) => void;
  onToggleFlag?: (dealId: string, isFlagged: boolean, flagNotes?: string) => Promise<void>;
  groupBy?: string | null;
  sortField?: SortField;
  sortDirection?: SortDirection;
  viewMode?: 'grid' | 'list';
  expandAllSignal?: number;
  collapseAllSignal?: number;
  /** Optional controlled set of collapsed group keys (so the page can persist them in a saved view). */
  collapsedGroups?: string[];
  onCollapsedGroupsChange?: (next: string[]) => void;
  /** Per-column header sort + filter (list view only). */
  onToggleSort?: (field: SortField) => void;
  filters?: DealFilters;
  onFiltersChange?: (next: Partial<DealFilters>) => void;
  /** When true, the right-side detail panel is open: collapse the list to
   *  only Deal Name (company) + Deal Amount (value) and hide the Actions
   *  column so the remaining row reads cleanly beside the panel. */
  detailPanelOpen?: boolean;
}

/** Map a column id to the SortField it should drive (or null if not sortable). */
const COLUMN_SORT_FIELD: Partial<Record<DealListColumnId, SortField>> = {
  company: 'company',
  value: 'value',
  status: 'status',
  stage: 'stage',
  manager: 'manager',
  type: 'engagementType',
  totalFee: 'totalFee',
  totalHours: 'totalHours',
  revenuePerHour: 'revenuePerHour',
  lateMilestones: 'lateMilestones',
  updated: 'updatedAt',
};

function SortableFilterableHead({
  id,
  sortField,
  sortDirection,
  onToggleSort,
  filterActive,
  filters,
  setFilters,
  unfilteredDeals,
}: {
  id: DealListColumnId;
  sortField?: SortField;
  sortDirection?: SortDirection;
  onToggleSort?: (field: SortField) => void;
  filterActive: boolean;
  filters?: DealFilters;
  setFilters?: (next: Partial<DealFilters>) => void;
  unfilteredDeals: Deal[];
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const sortField_ = COLUMN_SORT_FIELD[id];
  const isActiveSort = !!sortField_ && sortField === sortField_;

  return (
    <TableHead
      ref={setNodeRef}
      style={style}
      data-deal-col={id}
      className="text-[#9697a6] text-center text-[10px] uppercase tracking-[0.14em]"
    >
      <div className="inline-flex items-center gap-1 whitespace-nowrap">
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab p-0.5 text-[#5f606e] hover:text-[#9697a6]"
          aria-label="Reorder column"
        >
          <GripVertical className="h-3 w-3" />
        </span>
        <button
          type="button"
          disabled={!sortField_ || !onToggleSort}
          onClick={() => sortField_ && onToggleSort?.(sortField_)}
          className={cn(
            'inline-flex items-center gap-0.5 px-1 py-0.5 rounded transition-colors',
            sortField_ && onToggleSort
              ? 'hover:bg-white/[0.04] cursor-pointer'
              : 'cursor-default',
            isActiveSort && 'text-[#f4f4f7]',
          )}
        >
          <span>{COLUMN_LABELS[id]}</span>
          {sortField_ && (
            isActiveSort ? (
              sortDirection === 'asc' ? (
                <ArrowUp className="h-3 w-3" />
              ) : (
                <ArrowDown className="h-3 w-3" />
              )
            ) : (
              <ArrowUpDown className="h-3 w-3 opacity-30" />
            )
          )}
        </button>
        {filters && setFilters && (
          <DealsHeaderFilterPopover
            column={id}
            deals={unfilteredDeals}
            filters={filters}
            setFilters={setFilters}
            active={filterActive}
          />
        )}
      </div>
    </TableHead>
  );
}

const STATUS_ORDER: DealStatus[] = ['on-track', 'at-risk', 'off-track', 'on-hold', 'archived'];

/** Which DealFilters keys belong to which column's funnel. Used to
 *  highlight active funnels and to render per-column removable chips. */
const COLUMN_FILTER_KEYS: Partial<Record<DealListColumnId, (keyof DealFilters)[]>> = {
  company: ['companyContains'],
  value: ['valueMin', 'valueMax'],
  status: ['status'],
  stage: ['stage'],
  manager: ['manager'],
  type: ['engagementType'],
  dealType: ['dealType'],
  totalFee: ['totalFeeMin', 'totalFeeMax'],
  totalHours: ['totalHoursMin', 'totalHoursMax'],
  revenuePerHour: ['revenuePerHourMin', 'revenuePerHourMax'],
  lateMilestones: ['hasLateMilestonesOnly'],
  updated: ['updatedWithinDays'],
};

function isFilterValueActive(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return true;
  return false;
}

function isColumnFilterActive(col: DealListColumnId, filters?: DealFilters): boolean {
  if (!filters) return false;
  const keys = COLUMN_FILTER_KEYS[col];
  if (!keys) return false;
  return keys.some((k) => isFilterValueActive(filters[k]));
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return '';
  return n.toLocaleString();
}

function rangeLabel(prefix: string, min?: number | null, max?: number | null): string {
  if (min != null && max != null) return `${prefix}: ${fmtNum(min)}–${fmtNum(max)}`;
  if (min != null) return `${prefix} ≥ ${fmtNum(min)}`;
  if (max != null) return `${prefix} ≤ ${fmtNum(max)}`;
  return prefix;
}

function buildActiveFilterChips(filters: DealFilters): { key: string; label: string; clear: Partial<DealFilters> }[] {
  const chips: { key: string; label: string; clear: Partial<DealFilters> }[] = [];
  if (isFilterValueActive(filters.companyContains)) {
    chips.push({ key: 'companyContains', label: `Company: "${filters.companyContains}"`, clear: { companyContains: '' } });
  }
  if (filters.valueMin != null || filters.valueMax != null) {
    chips.push({ key: 'value', label: rangeLabel('Value', filters.valueMin, filters.valueMax), clear: { valueMin: null, valueMax: null } });
  }
  if (filters.totalFeeMin != null || filters.totalFeeMax != null) {
    chips.push({ key: 'totalFee', label: rangeLabel('Fee', filters.totalFeeMin, filters.totalFeeMax), clear: { totalFeeMin: null, totalFeeMax: null } });
  }
  if (filters.totalHoursMin != null || filters.totalHoursMax != null) {
    chips.push({ key: 'totalHours', label: rangeLabel('Hours', filters.totalHoursMin, filters.totalHoursMax), clear: { totalHoursMin: null, totalHoursMax: null } });
  }
  if (filters.revenuePerHourMin != null || filters.revenuePerHourMax != null) {
    chips.push({ key: 'revenuePerHour', label: rangeLabel('Rev/hr', filters.revenuePerHourMin, filters.revenuePerHourMax), clear: { revenuePerHourMin: null, revenuePerHourMax: null } });
  }
  if (filters.status.length) {
    chips.push({ key: 'status', label: `Status: ${filters.status.length}`, clear: { status: [] } });
  }
  if (filters.stage.length) {
    chips.push({ key: 'stage', label: `Stage: ${filters.stage.length}`, clear: { stage: [] } });
  }
  if (filters.manager.length) {
    chips.push({ key: 'manager', label: `Manager: ${filters.manager.length}`, clear: { manager: [] } });
  }
  if (filters.engagementType.length) {
    chips.push({ key: 'engagementType', label: `Engagement: ${filters.engagementType.length}`, clear: { engagementType: [] as any } });
  }
  if (filters.dealType.length) {
    chips.push({ key: 'dealType', label: `Deal type: ${filters.dealType.length}`, clear: { dealType: [] } });
  }
  if (filters.updatedWithinDays != null) {
    chips.push({ key: 'updatedWithinDays', label: `Updated ≤ ${filters.updatedWithinDays}d`, clear: { updatedWithinDays: null } });
  }
  if (filters.hasLateMilestonesOnly) {
    chips.push({ key: 'hasLateMilestonesOnly', label: 'Has late milestones', clear: { hasLateMilestonesOnly: false } });
  }
  return chips;
}

function clearAllColumnFilters(): Partial<DealFilters> {
  return {
    companyContains: '',
    valueMin: null, valueMax: null,
    totalFeeMin: null, totalFeeMax: null,
    totalHoursMin: null, totalHoursMax: null,
    revenuePerHourMin: null, revenuePerHourMax: null,
    status: [], stage: [], manager: [], engagementType: [] as any, dealType: [],
    updatedWithinDays: null,
    hasLateMilestonesOnly: false,
  };
}

export function DealsList({ deals, onStatusChange, onStageChange, onMarkReviewed, onToggleFlag, groupBy = 'status', sortField, sortDirection, viewMode = 'grid', expandAllSignal, collapseAllSignal, collapsedGroups: collapsedGroupsProp, onCollapsedGroupsChange, onToggleSort, filters, onFiltersChange, detailPanelOpen = false }: DealsListProps) {
  const { isHintVisible, dismissHint } = useFirstTimeHints();
  const isControlled = collapsedGroupsProp !== undefined;
  const [internalCollapsed, setInternalCollapsed] = useState<Set<string>>(new Set());
  const collapsedGroups = isControlled
    ? new Set<string>(collapsedGroupsProp)
    : internalCollapsed;
  const setCollapsedGroups = (updater: Set<string> | ((prev: Set<string>) => Set<string>)) => {
    const next = typeof updater === 'function'
      ? (updater as (prev: Set<string>) => Set<string>)(collapsedGroups)
      : updater;
    if (isControlled) {
      onCollapsedGroupsChange?.(Array.from(next));
    } else {
      setInternalCollapsed(next);
    }
  };

  useEffect(() => {
    if (expandAllSignal && expandAllSignal > 0) {
      setCollapsedGroups(new Set());
    }
  }, [expandAllSignal]);

  useEffect(() => {
    if (collapseAllSignal && collapseAllSignal > 0) {
      // Collapse all by setting a marker; individual groups check membership
      setCollapsedGroups(new Set(['__ALL__']));
    }
  }, [collapseAllSignal]);
  const [selectedDealIds, setSelectedDealIds] = useState<Set<string>>(new Set());
  const { columnOrder, activeColumns, visibleColumns, updateColumnOrder, toggleColumnVisibility } = useDealListColumnOrder();
  // When the right-hand detail panel is open, collapse the table to just
  // Deal Name (company) + Deal Amount (value) so it stays clean and the
  // selected row remains fully visible in the reduced left pane.
  const renderedActiveColumns = detailPanelOpen
    ? (activeColumns.filter((c) => c === 'company' || c === 'value') as typeof activeColumns)
    : activeColumns;
  
  // Fetch FLEx engagement scores for all visible deals
  const dealIds = useMemo(() => deals.map(d => d.id), [deals]);
  const { data: flexEngagementScores } = useFlexEngagementScores(dealIds);
  const flexNotificationCounts = useDealNotificationCounts(dealIds);
  const mentionUsers = useTeamMembers();

  // Apply FLEx engagement sorting if selected (done here since we have access to engagement scores)
  const sortedDeals = useMemo(() => {
    if (sortField !== 'flexEngagement' || !flexEngagementScores) {
      return deals;
    }
    
    return [...deals].sort((a, b) => {
      const scoreA = flexEngagementScores.get(a.id)?.score ?? 0;
      const scoreB = flexEngagementScores.get(b.id)?.score ?? 0;
      const comparison = scoreA - scoreB;
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [deals, sortField, sortDirection, flexEngagementScores]);

  const toggleSelectDeal = useCallback((dealId: string) => {
    setSelectedDealIds(prev => {
      const next = new Set(prev);
      if (next.has(dealId)) next.delete(dealId);
      else next.add(dealId);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedDealIds.size === sortedDeals.length) {
      setSelectedDealIds(new Set());
    } else {
      setSelectedDealIds(new Set(sortedDeals.map(d => d.id)));
    }
  }, [selectedDealIds.size, sortedDeals]);

  const clearSelection = useCallback(() => setSelectedDealIds(new Set()), []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = columnOrder.indexOf(active.id as DealListColumnId);
    const newIndex = columnOrder.indexOf(over.id as DealListColumnId);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = [...columnOrder];
    newOrder.splice(oldIndex, 1);
    newOrder.splice(newIndex, 0, active.id as DealListColumnId);
    updateColumnOrder(newOrder);
  };

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      // Clear __ALL__ marker when individual group is toggled
      next.delete('__ALL__');
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const getGroupLabel = (key: string, value: string): string => {
    if (key === 'status') {
      if (value === '__no_status__') return 'No status';
      return STATUS_CONFIG[value as DealStatus]?.label || value;
    }
    if (key === 'stage') return STAGE_CONFIG[value]?.label || value;
    if (key === 'engagementType') return ENGAGEMENT_TYPE_CONFIG[value]?.label || value;
    return value || 'Unassigned';
  };

  if (deals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
          <FileX className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium bg-brand-gradient bg-clip-text text-transparent dark:bg-none dark:text-white">No deals found</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Try adjusting your filters or create a new deal to get started.
        </p>
      </div>
    );
  }

  // List view rendering
  if (viewMode === 'list') {
    const activeChips = filters ? buildActiveFilterChips(filters) : [];
    return (
      <div>
        {activeChips.length > 0 && onFiltersChange && (
          <div className="flex flex-wrap items-center gap-1.5 px-1 pb-2">
            {activeChips.map((c) => (
              <span
                key={c.key}
                className="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-full text-[11px]"
                style={{
                  color: '#b79bf0',
                  background: 'rgba(155,111,212,.14)',
                  border: '1px solid rgba(155,111,212,.28)',
                }}
              >
                {c.label}
                <button
                  type="button"
                  onClick={() => onFiltersChange(c.clear)}
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-white/10"
                  aria-label={`Remove filter ${c.label}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => onFiltersChange(clearAllColumnFilters())}
              className="ml-1 text-[11px] text-[#9697a6] hover:text-[#f4f4f7] underline-offset-2 hover:underline"
            >
              Clear all
            </button>
          </div>
        )}
        <div className="px-0 py-1 min-w-0 max-w-full">
          <div className="flex items-center gap-2 px-2 pb-2 text-[11px] text-[#9697a6]">
            <Checkbox
              checked={sortedDeals.length > 0 && selectedDealIds.size === sortedDeals.length}
              onCheckedChange={toggleSelectAll}
              aria-label="Select all deals"
            />
            <span>
              {selectedDealIds.size > 0
                ? `${selectedDealIds.size} selected`
                : `${sortedDeals.length} ${sortedDeals.length === 1 ? 'deal' : 'deals'}`}
            </span>
          </div>
          <div className="rounded-lg border border-border/60 overflow-hidden">
            <div className="flex items-center gap-3 border-b border-border bg-muted/20 px-2 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <span className="h-4 w-4 shrink-0" aria-hidden />
              <div className={cn(DEAL_LIST_GRID, 'flex-1 min-w-0')}>
                <span>Deal</span>
                <span className="text-right">Amount</span>
                <span className="text-center">Status</span>
                <span>Stage</span>
                <span>Updated</span>
              </div>
            </div>
            {sortedDeals.map((deal) => (
              <DealListCardRow
                key={deal.id}
                deal={deal}
                onStatusChange={onStatusChange}
                onStageChange={onStageChange}
                onMarkReviewed={onMarkReviewed}
                onToggleFlag={onToggleFlag}
                flexEngagement={flexEngagementScores?.get(deal.id)}
                notificationCount={flexNotificationCounts[deal.id] || 0}
                isSelected={selectedDealIds.has(deal.id)}
                onToggleSelect={toggleSelectDeal}
                compact={detailPanelOpen}
              />
            ))}
          </div>
        </div>
        <DealsBulkActionBar
          selectedDealIds={selectedDealIds}
          onClearSelection={clearSelection}
          onComplete={clearSelection}
        />
      </div>
    );
  }

  // If not grouping, show flat grid
  if (!groupBy) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 pt-3 pb-2 px-2 overflow-visible">
        {sortedDeals.map((deal, index) => (
          index === 0 ? (
            <HintTooltip
              key={deal.id}
              hint="Click any deal card to view details, manage lenders, and track progress."
              visible={isHintVisible('deal-card')}
              onDismiss={() => dismissHint('deal-card')}
              side="right"
              align="start"
              showDelay={3500}
            >
              <div className="h-full">
                <DealCard 
                  deal={deal} 
                  onStatusChange={onStatusChange} 
                  onStageChange={onStageChange}
                  onMarkReviewed={onMarkReviewed} 
                  onToggleFlag={onToggleFlag} 
                  flexEngagement={flexEngagementScores?.get(deal.id)}
                  flexNotificationCount={flexNotificationCounts[deal.id] || 0}
                  mentionUsers={mentionUsers}
                />
              </div>
            </HintTooltip>
          ) : (
            <DealCard 
              key={deal.id} 
              deal={deal} 
              onStatusChange={onStatusChange} 
              onStageChange={onStageChange}
              onMarkReviewed={onMarkReviewed} 
              onToggleFlag={onToggleFlag} 
              flexEngagement={flexEngagementScores?.get(deal.id)}
              flexNotificationCount={flexNotificationCounts[deal.id] || 0}
              mentionUsers={mentionUsers}
            />
          )
        ))}
      </div>
    );
  }

  // Group deals by the selected field
  const getGroupValue = (deal: Deal): string => {
    if (groupBy === 'status') return deal.status || '__no_status__';
    if (groupBy === 'stage') return deal.stage || 'Unknown';
    if (groupBy === 'engagementType') return deal.engagementType || 'Unknown';
    if (groupBy === 'manager') return deal.manager || 'Unassigned';
    if (groupBy === 'lender') return deal.lender || 'Unassigned';
    if (groupBy === 'referredBy') return deal.referredBy?.name || 'None';
    return 'Unknown';
  };

  // Build ordered groups
  const groupOrder: string[] = [];
  const groupMap = new Map<string, Deal[]>();
  sortedDeals.forEach(deal => {
    const val = getGroupValue(deal);
    if (!groupMap.has(val)) {
      groupOrder.push(val);
      groupMap.set(val, []);
    }
    groupMap.get(val)!.push(deal);
  });

  // For status, use predefined order
  const STATUS_ORDER: DealStatus[] = ['on-track', 'at-risk', 'off-track', 'on-hold', 'archived'];
  const orderedKeys = groupBy === 'status'
    ? (() => {
        const known = new Set<string>([...STATUS_ORDER, '__no_status__']);
        const ordered: string[] = [
          ...STATUS_ORDER.filter(s => groupMap.has(s)),
          ...(groupMap.has('__no_status__') ? ['__no_status__'] : []),
        ];
        // Include any unknown/legacy status values (e.g. seeded demo data
        // using raw DB enums like "active"/"closed_won") so they are not
        // silently dropped from grid view. List/pipeline views already
        // render these because they don't filter by known statuses.
        for (const key of groupOrder) {
          if (!known.has(key)) ordered.push(key);
        }
        return ordered;
      })()
    : groupOrder;

  return (
    <div className="space-y-6">
      {orderedKeys.map((groupValue, groupIdx) => {
        const groupDeals = groupMap.get(groupValue) || [];
        const isCollapsed = collapsedGroups.has(groupValue) || collapsedGroups.has('__ALL__');
        const dotColor = groupBy === 'status' ? STATUS_CONFIG[groupValue as DealStatus]?.dotColor : undefined;
        
        return (
          <Collapsible
            key={groupValue}
            open={!isCollapsed}
            onOpenChange={() => toggleGroup(groupValue)}
          >
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 px-2 py-2 h-auto hover:bg-muted/50"
              >
                <div className="flex items-center gap-2 min-w-0 shrink-0" style={{ minWidth: '180px' }}>
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  {dotColor && <span className={`h-2.5 w-2.5 rounded-full ${dotColor} shrink-0`} />}
                  <h2 className="text-lg font-semibold text-foreground truncate">
                    {getGroupLabel(groupBy, groupValue)}
                  </h2>
                  {!isCollapsed && (
                    <span className="text-sm text-muted-foreground">({groupDeals.length})</span>
                  )}
                </div>
                {isCollapsed && (() => {
                  const totalVolume = groupDeals.reduce((sum, d) => sum + (d.value || 0), 0);
                  const formattedVolume = totalVolume >= 1_000_000_000
                    ? `$${(totalVolume / 1_000_000_000).toFixed(1)}B`
                    : totalVolume >= 1_000_000
                    ? `$${(totalVolume / 1_000_000).toFixed(1)}MM`
                    : totalVolume >= 1_000
                    ? `$${(totalVolume / 1_000).toFixed(1)}K`
                    : `$${totalVolume.toLocaleString()}`;
                  return (
                    <div className="flex items-center gap-6 ml-4">
                      <div className="flex items-baseline gap-1 w-[72px] justify-end">
                        <span className="text-sm font-medium text-foreground" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {groupDeals.length}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {groupDeals.length === 1 ? 'deal' : 'deals'}
                        </span>
                      </div>
                      <div className="w-[104px] text-right">
                        <span className="text-sm font-medium text-foreground" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formattedVolume}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 pt-3 pb-2 px-2 overflow-visible">
                {groupDeals.map((deal, index) => {
                  const isFirstDealOverall = groupIdx === 0 && index === 0;
                  
                  if (isFirstDealOverall) {
                    return (
                      <HintTooltip
                        key={deal.id}
                        hint="Click any deal card to view details, manage lenders, and track progress."
                        visible={isHintVisible('deal-card')}
                        onDismiss={() => dismissHint('deal-card')}
                        side="right"
                        align="start"
                        showDelay={3500}
                      >
                        <div className="h-full">
                          <DealCard 
                            deal={deal} 
                            onStatusChange={onStatusChange} 
                            onStageChange={onStageChange}
                            onMarkReviewed={onMarkReviewed} 
                            onToggleFlag={onToggleFlag} 
                            flexEngagement={flexEngagementScores?.get(deal.id)}
                            flexNotificationCount={flexNotificationCounts[deal.id] || 0}
                            mentionUsers={mentionUsers}
                          />
                        </div>
                      </HintTooltip>
                    );
                  }
                  
                  return (
                    <DealCard 
                      key={deal.id} 
                      deal={deal} 
                      onStatusChange={onStatusChange} 
                      onStageChange={onStageChange}
                      onMarkReviewed={onMarkReviewed} 
                      onToggleFlag={onToggleFlag} 
                      flexEngagement={flexEngagementScores?.get(deal.id)}
                      flexNotificationCount={flexNotificationCounts[deal.id] || 0}
                      mentionUsers={mentionUsers}
                    />
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}