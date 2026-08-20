import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useDealNotificationCounts } from '@/hooks/useDealNotificationCounts';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  useDroppable,
} from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import { Deal, DealStatus } from '@/types/deal';
import { DealCard } from './DealCard';

import { usePipelineSortMode } from '@/hooks/usePipelineSortMode';
import { useDealStages } from '@/contexts/DealStagesContext';
import { usePipelineContext } from '@/contexts/PipelineContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useFlexEngagementScores } from '@/hooks/useFlexEngagementScores';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { FileX, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';

interface DealsPipelineViewProps {
  deals: Deal[];
  onStatusChange: (dealId: string, newStatus: DealStatus | null) => void;
  onStageChange?: (dealId: string, newStage: string) => void;
  onMarkReviewed?: (dealId: string) => void;
  onToggleFlag?: (dealId: string, isFlagged: boolean, flagNotes?: string) => Promise<void>;
}

interface DraggableDealCardProps {
  deal: Deal;
  onStatusChange: (dealId: string, newStatus: DealStatus | null) => void;
  onStageChange?: (dealId: string, newStage: string) => void;
  onMarkReviewed?: (dealId: string) => void;
  onToggleFlag?: (dealId: string, isFlagged: boolean, flagNotes?: string) => Promise<void>;
  flexEngagement?: any;
  flexNotificationCount?: number;
  isDragging?: boolean;
}

function DraggableDealCardImpl({ deal, onStatusChange, onStageChange, onMarkReviewed, onToggleFlag, flexEngagement, flexNotificationCount, isDragging }: DraggableDealCardProps) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: deal.id,
    data: { deal },
  });

  // When dragging, hide the source card (DragOverlay renders the moving copy).
  // Avoid applying a transform here — translating the source AND the overlay
  // causes a flickering ghost and forces layout/paint on every pointer move.
  const style: React.CSSProperties = isDragging
    ? { opacity: 0, pointerEvents: 'none' }
    : {};

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="touch-none w-full min-w-0"
    >
      <DealCard
        deal={deal}
        onStatusChange={onStatusChange}
        onStageChange={onStageChange}
        onMarkReviewed={onMarkReviewed}
        onToggleFlag={onToggleFlag}
        flexEngagement={flexEngagement}
        flexNotificationCount={flexNotificationCount}
        compact
      />
    </div>
  );
}

const DraggableDealCard = memo(DraggableDealCardImpl);

interface DroppableStageColumnProps {
  stageId: string;
  stageLabel: string;
  stageColor: string;
  deals: Deal[];
  onStatusChange: (dealId: string, newStatus: DealStatus | null) => void;
  onStageChange?: (dealId: string, newStage: string) => void;
  onMarkReviewed?: (dealId: string) => void;
  onToggleFlag?: (dealId: string, isFlagged: boolean, flagNotes?: string) => Promise<void>;
  flexEngagementScores?: Map<string, any>;
  flexNotificationCounts?: Record<string, number>;
  activeDealId: string | null;
  isOver: boolean;
  isDraggingAny?: boolean;
  fullscreen?: boolean;
}

function DroppableStageColumnImpl({
  stageId,
  stageLabel,
  stageColor,
  deals,
  onStatusChange,
  onStageChange,
  onMarkReviewed,
  onToggleFlag,
  flexEngagementScores,
  flexNotificationCounts,
  activeDealId,
  isOver,
  isDraggingAny,
  fullscreen,
}: DroppableStageColumnProps) {
  const { setNodeRef } = useDroppable({
    id: stageId,
  });
  const { formatCurrencyValue } = usePreferences();
  const stageTotal = deals.reduce(
    (sum, d) => sum + (d.dealClass === 'finserv' ? (d.mrr ?? 0) : (d.value ?? 0)),
    0,
  );

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-shrink-0 w-[300px] rounded-[8px] border border-white/[0.10] bg-[#0b1226]/70 transition-colors duration-150",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_1px_2px_rgba(0,0,0,0.25)]",

        isDraggingAny && !isOver && "opacity-60",
        isOver && "ring-2 ring-primary border-primary bg-primary/5 shadow-lg shadow-primary/10 scale-[1.01]"
      )}
    >
      {/* Stage Header */}
      <div
        className={cn("p-3 border-b rounded-t-[8px] transition-colors", isOver && "bg-primary/10")}
        style={
          isOver
            ? undefined
            : {
                background:
                  'linear-gradient(180deg, rgba(150, 195, 245, 0.070) 0%, rgba(150, 195, 245, 0.062) 100%)',
                borderBottomColor: 'rgba(150, 195, 245, 0.26)',
              }
        }
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              "h-2.5 w-2.5 rounded-full flex-shrink-0",
              stageColor
            )}
          />
          <h3 className="font-medium text-sm truncate min-w-0">{stageLabel}</h3>
          <span className="ml-auto flex items-center gap-1 shrink-0">
            <span className="text-xs font-medium tabular-nums text-foreground/80 whitespace-nowrap">
              {formatCurrencyValue(stageTotal)}
            </span>
            <span className="text-xs text-muted-foreground bg-background px-1.5 py-0.5 rounded">
              {deals.length}
            </span>
          </span>
        </div>
      </div>

      {/* Stage Deals — virtualized so a column with 1,000+ cards only mounts
          the rows currently in view. This is the single biggest perf win on
          the deals board: opening the Pipeline dropdown no longer competes
          with mounting 1,200+ DealCards on the main thread. */}
      <VirtualizedStageDeals
        deals={deals}
        isOver={isOver}
        isDraggingAny={!!isDraggingAny}
        fullscreen={!!fullscreen}
        onStatusChange={onStatusChange}
        onStageChange={onStageChange}
        onMarkReviewed={onMarkReviewed}
        onToggleFlag={onToggleFlag}
        flexEngagementScores={flexEngagementScores}
        flexNotificationCounts={flexNotificationCounts}
        activeDealId={activeDealId}
      />
    </div>
  );
}

const DroppableStageColumn = memo(DroppableStageColumnImpl);

/**
 * Virtualized stage column body. Uses @tanstack/react-virtual with a native
 * scroll container so only visible cards (+ a small overscan buffer) are
 * mounted. Variable card heights are measured via `measureElement`.
 *
 * We render a native div instead of Radix ScrollArea here because the
 * virtualizer needs a real, observable scroll element — Radix's nested
 * viewport adds an extra layer that complicates ref wiring without
 * giving us a meaningful visual benefit at this density.
 */
interface VirtualizedStageDealsProps {
  deals: Deal[];
  isOver: boolean;
  isDraggingAny?: boolean;
  fullscreen: boolean;
  onStatusChange: (dealId: string, newStatus: DealStatus | null) => void;
  onStageChange?: (dealId: string, newStage: string) => void;
  onMarkReviewed?: (dealId: string) => void;
  onToggleFlag?: (dealId: string, isFlagged: boolean, flagNotes?: string) => Promise<void>;
  flexEngagementScores?: Map<string, any>;
  flexNotificationCounts?: Record<string, number>;
  activeDealId: string | null;
}

/**
 * Shared height for every stage column so all columns end on the same line
 * and leave a consistent gap above the viewport bottom on any screen size.
 * `dvh` keeps mobile browser chrome from clipping the last cards.
 */
const STAGE_COLUMN_HEIGHT =
  'h-[calc(100dvh-196px)] max-h-[calc(100dvh-196px)] min-h-[280px]';

function VirtualizedStageDealsImpl({
  deals,
  isOver,
  isDraggingAny,
  fullscreen,
  onStatusChange,
  onStageChange,
  onMarkReviewed,
  onToggleFlag,
  flexEngagementScores,
  flexNotificationCounts,
  activeDealId,
}: VirtualizedStageDealsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Compact DealCard rests around 140-200px depending on badges / flags /
  // status notes. 168 is a reasonable midpoint that keeps the scrollbar
  // accurate before measureElement corrects each row.
  const virtualizer = useVirtualizer({
    count: deals.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 168,
    overscan: 6,
    measureElement: (el) => el.getBoundingClientRect().height,
    getItemKey: (index) => deals[index]?.id ?? index,
  });

  if (deals.length === 0) {
    return (
      <div
        className={cn(
          'p-3',
          STAGE_COLUMN_HEIGHT,
          fullscreen && 'h-[calc(92dvh-120px)] max-h-[calc(92dvh-120px)]',
        )}
      >
        <div
          className={cn(
            'text-center py-8 text-sm text-muted-foreground rounded-[8px] border-2 border-dashed transition-colors',
            isOver ? 'border-primary bg-primary/5' : 'border-transparent',
          )}
        >
          {isOver ? 'Drop here' : 'No deals'}
        </div>
      </div>
    );
  }

  const items = virtualizer.getVirtualItems();

  return (
    <div
      ref={scrollRef}
      className={cn(
        'overflow-y-auto overflow-x-hidden',
        STAGE_COLUMN_HEIGHT,
        fullscreen && 'h-[calc(92dvh-120px)] max-h-[calc(92dvh-120px)]',
      )}
    >
      <div
        style={{
          height: virtualizer.getTotalSize() + 12,
          position: 'relative',
          width: '100%',
        }}
        className="p-3"
      >
        {isOver && isDraggingAny ? (
          <div
            className="absolute left-3 right-3 top-3 z-10 h-1.5 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.6)] animate-pulse"
            aria-hidden
          />
        ) : null}
        {items.map((vItem) => {
          const deal = deals[vItem.index];
          if (!deal) return null;
          return (
            <div
              key={vItem.key}
              data-index={vItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${vItem.start + 12}px)`,
                paddingLeft: 12,
                paddingRight: 12,
                paddingBottom: 12,
              }}
            >
              <DraggableDealCard
                deal={deal}
                onStatusChange={onStatusChange}
                onStageChange={onStageChange}
                onMarkReviewed={onMarkReviewed}
                onToggleFlag={onToggleFlag}
                flexEngagement={flexEngagementScores?.get(deal.id)}
                flexNotificationCount={flexNotificationCounts?.[deal.id] || 0}
                isDragging={activeDealId === deal.id}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

const VirtualizedStageDeals = memo(VirtualizedStageDealsImpl);

export function DealsPipelineView({ deals, onStatusChange, onStageChange, onMarkReviewed, onToggleFlag }: DealsPipelineViewProps) {
  const { stages: globalStages } = useDealStages();
  const { activePipeline } = usePipelineContext();
  const stages = activePipeline?.stages?.length ? activePipeline.stages : globalStages;
  const dealIds = useMemo(() => deals.map(d => d.id), [deals]);
  const { data: flexEngagementScores } = useFlexEngagementScores(dealIds);
  const flexNotificationCounts = useDealNotificationCounts(dealIds);

  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // The board wrapper previously applied a mask-image edge fade updated on
  // every scroll event. Masking the whole board forced expensive repaints
  // whenever a column scrolled vertically, so it has been removed.
  const scrollWrapRef = useRef<HTMLDivElement | null>(null);
  const edgeMask = undefined;


  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor)
  );

  // Sort mode for cards inside each stage column (persisted, shared with toolbar control)
  const { sortMode } = usePipelineSortMode();

  // Group deals by stage. Default sort is created_at (stable) so updates
  // to non-stage fields don't cause visual reordering.
  const dealsByStage = useMemo(() => {
    const grouped = new Map<string, Deal[]>();

    // Initialize all stages with empty arrays
    stages.forEach(stage => {
      grouped.set(stage.id, []);
    });

    // Add deals to their respective stages
    deals.forEach(deal => {
      const stageDeals = grouped.get(deal.stage) || [];
      stageDeals.push(deal);
      grouped.set(deal.stage, stageDeals);
    });

    const dealAmount = (d: Deal) =>
      Number((d.dealClass === 'finserv' ? d.mrr : d.value) ?? 0);

    grouped.forEach((stageDeals, stageId) => {
      stageDeals.sort((a, b) => {
        switch (sortMode) {
          case 'value_desc':
            return dealAmount(b) - dealAmount(a);
          case 'value_asc':
            return dealAmount(a) - dealAmount(b);
          case 'name_asc':
            return (a.company || '').localeCompare(b.company || '');
          case 'newest':
          default:
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
      });
      grouped.set(stageId, stageDeals);
    });

    return grouped;
  }, [deals, stages, sortMode]);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setActiveDealId(active.id as string);
    setActiveDeal(active.data.current?.deal || null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    const next = (over?.id as string) || null;
    // Avoid spurious re-renders on every pointer move when the over target
    // hasn't actually changed columns.
    setOverId((prev) => (prev === next ? prev : next));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    setActiveDealId(null);
    setActiveDeal(null);
    setOverId(null);

    if (!over) return;

    const dealId = active.id as string;
    const newStageId = over.id as string;
    
    // Find the deal
    const deal = deals.find(d => d.id === dealId);
    if (!deal) return;

    // Check if stage actually changed
    if (deal.stage === newStageId) return;

    // Call the stage change handler
    if (onStageChange) {
      onStageChange(dealId, newStageId);
    }
  };

  const handleDragCancel = () => {
    setActiveDealId(null);
    setActiveDeal(null);
    setOverId(null);
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


  const pipelineContent = (fullscreen: boolean) => (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div
        ref={scrollWrapRef}
        className="relative w-full"
        style={{
          WebkitMaskImage: edgeMask,
          maskImage: edgeMask,
        }}
      >
      <ScrollArea className="w-full" viewportClassName="overflow-x-auto">
        <div className="flex gap-2 pb-0 min-w-max">
          {stages.map((stage) => {
            const stageDeals = dealsByStage.get(stage.id) || [];

            return (
              <DroppableStageColumn
                key={stage.id}
                stageId={stage.id}
                stageLabel={stage.label}
                stageColor={stage.color}
                deals={stageDeals}
                onStatusChange={onStatusChange}
                onStageChange={onStageChange}
                onMarkReviewed={onMarkReviewed}
                onToggleFlag={onToggleFlag}
                flexEngagementScores={flexEngagementScores}
                flexNotificationCounts={flexNotificationCounts}
                activeDealId={activeDealId}
                isOver={overId === stage.id}
                isDraggingAny={!!activeDealId}
                fullscreen={fullscreen}
              />
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      </div>

      <DragOverlay>
        {activeDeal ? (
          <div className="opacity-90 rotate-2 scale-105">
            <DealCard
              deal={activeDeal}
              onStatusChange={onStatusChange}
              compact
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );

  return (
    <>
      <div className="relative">
        {pipelineContent(false)}
      </div>

      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogContent
          data-pipeline-fullscreen
          className="max-w-[98vw] w-[98vw] h-[92vh] max-h-[92vh] p-4 flex flex-col"
        >
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">Pipeline View</h2>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={() => setIsFullscreen(false)}
            >
              <Minimize2 className="h-3.5 w-3.5" />
              Close
            </Button>
          </div>
          <div className="flex-1 overflow-hidden">
            {pipelineContent(true)}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
