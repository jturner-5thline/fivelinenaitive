import { useState, useMemo } from 'react';
import { Deal, DealStatus, STATUS_CONFIG } from '@/types/deal';
import { DealCard } from './DealCard';
import { useDealNotificationCounts } from '@/hooks/useDealNotificationCounts';
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

interface DealsListProps {
  deals: Deal[];
  onStatusChange: (dealId: string, newStatus: DealStatus) => void;
  onMarkReviewed?: (dealId: string) => void;
  onToggleFlag?: (dealId: string, isFlagged: boolean, flagNotes?: string) => Promise<void>;
  groupByStatus?: boolean;
  sortField?: SortField;
  sortDirection?: SortDirection;
  viewMode?: 'grid' | 'list';
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
    <TableHead ref={setNodeRef} style={style} {...attributes} {...listeners} className="text-foreground">
      <div className="flex items-center gap-1 whitespace-nowrap">
        <GripVertical className="h-3 w-3 text-muted-foreground/50" />
        <span>{COLUMN_LABELS[id]}</span>
      </div>
    </TableHead>
  );
}

const STATUS_ORDER: DealStatus[] = ['on-track', 'at-risk', 'off-track', 'on-hold', 'archived'];

export function DealsList({ deals, onStatusChange, onMarkReviewed, onToggleFlag, groupByStatus = true, sortField, sortDirection, viewMode = 'grid' }: DealsListProps) {
  const { isHintVisible, dismissHint } = useFirstTimeHints();
  const [collapsedGroups, setCollapsedGroups] = useState<Set<DealStatus>>(new Set());
  const { columnOrder, activeColumns, visibleColumns, updateColumnOrder, toggleColumnVisibility } = useDealListColumnOrder();
  
  // Fetch FLEx engagement scores for all visible deals
  const dealIds = useMemo(() => deals.map(d => d.id), [deals]);
  const { data: flexEngagementScores } = useFlexEngagementScores(dealIds);
  const flexNotificationCounts = useDealNotificationCounts(dealIds);

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

  const toggleGroup = (status: DealStatus) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
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
        <div className="overflow-x-auto px-2 py-0.5">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <Table className="border-separate border-spacing-y-1">
              <TableHeader>
                <TableRow className="border-none hover:bg-transparent">
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
                    onMarkReviewed={onMarkReviewed}
                    onToggleFlag={onToggleFlag}
                    flexEngagement={flexEngagementScores?.get(deal.id)}
                    columnOrder={activeColumns}
                    notificationCount={flexNotificationCounts[deal.id] || 0}
                  />
                ))}
              </TableBody>
            </Table>
          </DndContext>
        </div>
      </div>
    );
  }

  // If not grouping, show flat grid
  if (!groupByStatus) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
              <div>
                <DealCard 
                  deal={deal} 
                  onStatusChange={onStatusChange} 
                  onMarkReviewed={onMarkReviewed} 
                  onToggleFlag={onToggleFlag} 
                  flexEngagement={flexEngagementScores?.get(deal.id)}
                  flexNotificationCount={flexNotificationCounts[deal.id] || 0}
                />
              </div>
            </HintTooltip>
          ) : (
            <DealCard 
              key={deal.id} 
              deal={deal} 
              onStatusChange={onStatusChange} 
              onMarkReviewed={onMarkReviewed} 
              onToggleFlag={onToggleFlag} 
              flexEngagement={flexEngagementScores?.get(deal.id)}
              flexNotificationCount={flexNotificationCounts[deal.id] || 0}
            />
          )
        ))}
      </div>
    );
  }

  // Group deals by status
  const groupedDeals = STATUS_ORDER.reduce((acc, status) => {
    const dealsForStatus = sortedDeals.filter((deal) => deal.status === status);
    if (dealsForStatus.length > 0) {
      acc.push({ status, deals: dealsForStatus });
    }
    return acc;
  }, [] as { status: DealStatus; deals: Deal[] }[]);

  return (
    <div className="space-y-6">
      {groupedDeals.map(({ status, deals: statusDeals }) => {
        const isCollapsed = collapsedGroups.has(status);
        
        return (
          <Collapsible
            key={status}
            open={!isCollapsed}
            onOpenChange={() => toggleGroup(status)}
          >
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 px-2 py-2 h-auto hover:bg-muted/50"
              >
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
                <span className={`h-2.5 w-2.5 rounded-full ${STATUS_CONFIG[status].dotColor}`} />
                <h2 className="text-lg font-semibold text-foreground">
                  {STATUS_CONFIG[status].label}
                </h2>
                <span className="text-sm text-muted-foreground">({statusDeals.length})</span>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {statusDeals.map((deal, index) => {
                  const isFirstDealOverall = groupedDeals[0].status === status && index === 0;
                  
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
                        <div>
                          <DealCard 
                            deal={deal} 
                            onStatusChange={onStatusChange} 
                            onMarkReviewed={onMarkReviewed} 
                            onToggleFlag={onToggleFlag} 
                            flexEngagement={flexEngagementScores?.get(deal.id)}
                            flexNotificationCount={flexNotificationCounts[deal.id] || 0}
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
                      onMarkReviewed={onMarkReviewed} 
                      onToggleFlag={onToggleFlag} 
                      flexEngagement={flexEngagementScores?.get(deal.id)}
                      flexNotificationCount={flexNotificationCounts[deal.id] || 0}
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
