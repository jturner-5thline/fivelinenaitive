import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  useDroppable,
} from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Deal, DealStatus } from '@/types/deal';
import { DealCard } from './DealCard';
import { useDealStages } from '@/contexts/DealStagesContext';
import { useFlexEngagementScores } from '@/hooks/useFlexEngagementScores';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { FileX } from 'lucide-react';

interface DealsPipelineViewProps {
  deals: Deal[];
  onStatusChange: (dealId: string, newStatus: DealStatus) => void;
  onStageChange?: (dealId: string, newStage: string) => void;
  onMarkReviewed?: (dealId: string) => void;
  onToggleFlag?: (dealId: string, isFlagged: boolean, flagNotes?: string) => Promise<void>;
}

interface DraggableDealCardProps {
  deal: Deal;
  onStatusChange: (dealId: string, newStatus: DealStatus) => void;
  onMarkReviewed?: (dealId: string) => void;
  onToggleFlag?: (dealId: string, isFlagged: boolean, flagNotes?: string) => Promise<void>;
  flexEngagement?: any;
  isDragging?: boolean;
}

function DraggableDealCard({ deal, onStatusChange, onMarkReviewed, onToggleFlag, flexEngagement, isDragging }: DraggableDealCardProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: deal.id,
    data: { deal },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="touch-none"
    >
      <DealCard
        deal={deal}
        onStatusChange={onStatusChange}
        onMarkReviewed={onMarkReviewed}
        onToggleFlag={onToggleFlag}
        flexEngagement={flexEngagement}
        compact
      />
    </div>
  );
}

interface DroppableStageColumnProps {
  stageId: string;
  stageLabel: string;
  stageColor: string;
  deals: Deal[];
  onStatusChange: (dealId: string, newStatus: DealStatus) => void;
  onMarkReviewed?: (dealId: string) => void;
  onToggleFlag?: (dealId: string, isFlagged: boolean, flagNotes?: string) => Promise<void>;
  flexEngagementScores?: Map<string, any>;
  activeDealId: string | null;
  isOver: boolean;
}

function DroppableStageColumn({
  stageId,
  stageLabel,
  stageColor,
  deals,
  onStatusChange,
  onMarkReviewed,
  onToggleFlag,
  flexEngagementScores,
  activeDealId,
  isOver,
}: DroppableStageColumnProps) {
  const { setNodeRef } = useDroppable({
    id: stageId,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-shrink-0 w-[300px] bg-muted/30 rounded-lg border transition-colors",
        isOver && "ring-2 ring-primary bg-primary/5"
      )}
    >
      {/* Stage Header */}
      <div className="p-3 border-b bg-muted/50 rounded-t-lg">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "h-2.5 w-2.5 rounded-full flex-shrink-0",
              stageColor
            )}
          />
          <h3 className="font-medium text-sm truncate">{stageLabel}</h3>
          <span className="ml-auto text-xs text-muted-foreground bg-background px-1.5 py-0.5 rounded">
            {deals.length}
          </span>
        </div>
      </div>

      {/* Stage Deals */}
      <ScrollArea className="h-[calc(100vh-380px)] min-h-[400px]">
        <div className="p-2 space-y-2">
          {deals.length === 0 ? (
            <div className={cn(
              "text-center py-8 text-sm text-muted-foreground rounded-lg border-2 border-dashed transition-colors",
              isOver ? "border-primary bg-primary/5" : "border-transparent"
            )}>
              {isOver ? "Drop here" : "No deals"}
            </div>
          ) : (
            deals.map((deal) => (
              <DraggableDealCard
                key={deal.id}
                deal={deal}
                onStatusChange={onStatusChange}
                onMarkReviewed={onMarkReviewed}
                onToggleFlag={onToggleFlag}
                flexEngagement={flexEngagementScores?.get(deal.id)}
                isDragging={activeDealId === deal.id}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export function DealsPipelineView({ deals, onStatusChange, onStageChange, onMarkReviewed, onToggleFlag }: DealsPipelineViewProps) {
  const { stages } = useDealStages();
  const dealIds = useMemo(() => deals.map(d => d.id), [deals]);
  const { data: flexEngagementScores } = useFlexEngagementScores(dealIds);
  
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  );

  // Group deals by stage
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

    return grouped;
  }, [deals, stages]);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setActiveDealId(active.id as string);
    setActiveDeal(active.data.current?.deal || null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    setOverId(over?.id as string || null);
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
        <h3 className="text-lg font-medium bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)]">No deals found</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Try adjusting your filters or create a new deal to get started.
        </p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <ScrollArea className="w-full">
        <div className="flex gap-4 pb-4 min-w-max">
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
                onMarkReviewed={onMarkReviewed}
                onToggleFlag={onToggleFlag}
                flexEngagementScores={flexEngagementScores}
                activeDealId={activeDealId}
                isOver={overId === stage.id}
              />
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

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
}
