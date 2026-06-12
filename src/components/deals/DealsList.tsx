import { useState, useMemo, useCallback, useEffect } from 'react';
import { Deal, DealStatus, STATUS_CONFIG, STAGE_CONFIG, ENGAGEMENT_TYPE_CONFIG } from '@/types/deal';
import { DealCard } from './DealCard';
import { useDealNotificationCounts } from '@/hooks/useDealNotificationCounts';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { DealListRow } from './DealListRow';
import { FileX, ChevronDown, ChevronRight, GripVertical } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { HintTooltip } from '@/components/ui/hint-tooltip';
import { useFirstTimeHints } from '@/hooks/useFirstTimeHints';
import { useFlexEngagementScores } from '@/hooks/useFlexEngagementScores';
import { SortField, SortDirection } from '@/hooks/useDeals';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useDealListColumnOrder, COLUMN_LABELS, DealListColumnId } from '@/hooks/useDealListColumnOrder';
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
}

function SortableTableHead({ id }: { id: DealListColumnId }) {
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
    cursor: 'grab',
  };

  return (
    <TableHead ref={setNodeRef} style={style} {...attributes} {...listeners} className="text-foreground text-center">
      <div className="flex items-center gap-1 whitespace-nowrap">
        <GripVertical className="h-3 w-3 text-muted-foreground/50" />
        <span>{COLUMN_LABELS[id]}</span>
      </div>
    </TableHead>
  );
}

const STATUS_ORDER: DealStatus[] = ['on-track', 'at-risk', 'off-track', 'on-hold', 'archived'];

export function DealsList({ deals, onStatusChange, onStageChange, onMarkReviewed, onToggleFlag, groupBy = 'status', sortField, sortDirection, viewMode = 'grid', expandAllSignal, collapseAllSignal }: DealsListProps) {
  const { isHintVisible, dismissHint } = useFirstTimeHints();
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

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
    return (
      <div>
        <div className="overflow-visible px-0 py-1">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <Table className="border-separate border-spacing-y-1.5">
              <TableHeader>
                <TableRow className="bg-card rounded-md [&>th:first-child]:rounded-l-md [&>th:last-child]:rounded-r-md hover:bg-card">
                  <TableHead className="w-[40px] px-2">
                    <Checkbox
                      checked={sortedDeals.length > 0 && selectedDealIds.size === sortedDeals.length}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <SortableContext items={activeColumns} strategy={horizontalListSortingStrategy}>
                    {activeColumns.map((colId) => (
                      <SortableTableHead key={colId} id={colId} />
                    ))}
                  </SortableContext>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedDeals.map((deal) => (
                  <DealListRow
                    key={deal.id}
                    deal={deal}
                    onStatusChange={onStatusChange}
                    onStageChange={onStageChange}
                    onMarkReviewed={onMarkReviewed}
                    onToggleFlag={onToggleFlag}
                    flexEngagement={flexEngagementScores?.get(deal.id)}
                    columnOrder={activeColumns}
                    notificationCount={flexNotificationCounts[deal.id] || 0}
                    isSelected={selectedDealIds.has(deal.id)}
                    onToggleSelect={toggleSelectDeal}
                  />
                ))}
              </TableBody>
            </Table>
          </DndContext>
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 py-3 pr-2 overflow-visible">
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
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 py-3 pr-2 overflow-visible">
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