import { useState, useMemo } from 'react';
import { GripVertical, Clock, MessageSquare, Search, RefreshCw } from 'lucide-react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, useDraggable, useDroppable, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { DealLender } from '@/types/deal';
import { STAGE_GROUPS, StageGroup, PassReasonOption } from '@/contexts/LenderStagesContext';
import { cn } from '@/lib/utils';
import { differenceInMinutes, differenceInHours, differenceInDays, differenceInWeeks } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SaveIndicator } from '@/components/ui/save-indicator';

interface LendersKanbanProps {
  lenders: DealLender[];
  configuredStages: { id: string; label: string; group: StageGroup }[];
  passReasons: PassReasonOption[];
  onUpdateLenderGroup: (lenderId: string, newGroup: StageGroup, passReason?: string) => void;
  /** Optional: function to check if a lender is being saved */
  isSaving?: (id: string) => boolean;
  /** Optional: set of lender IDs that failed to save */
  failedSaves?: Set<string>;
  /** Optional: retry handler for failed saves */
  onRetry?: (lenderId: string) => void;
}

// Helper to get relative time string
const getRelativeTime = (updatedAt?: string) => {
  if (!updatedAt) return '';
  
  const date = new Date(updatedAt);
  const now = new Date();
  
  const minutes = differenceInMinutes(now, date);
  const hours = differenceInHours(now, date);
  const days = differenceInDays(now, date);
  const weeks = differenceInWeeks(now, date);
  
  if (minutes < 60) {
    return `${minutes}m ago`;
  } else if (hours < 24) {
    return `${hours}h ago`;
  } else if (days < 7) {
    return `${days}d ago`;
  } else {
    return `${weeks}w ago`;
  }
};

// Draggable Lender Tile
function DraggableLenderTile({ 
  lender, 
  configuredStages, 
  isSaving, 
  hasFailed, 
  onRetry 
}: { 
  lender: DealLender; 
  configuredStages: { id: string; label: string; group: StageGroup }[]; 
  isSaving?: boolean;
  hasFailed?: boolean;
  onRetry?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lender.id,
    data: { lender },
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  const stageLabel = configuredStages.find(s => s.id === lender.stage)?.label || lender.stage;
  const timeAgo = getRelativeTime(lender.updatedAt);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "bg-card border border-border rounded-lg p-3 shadow-sm cursor-grab active:cursor-grabbing relative",
        isDragging && "opacity-50 shadow-lg",
        hasFailed && "border-destructive/50 bg-destructive/5"
      )}
      {...listeners}
      {...attributes}
    >
      {/* Save status indicator */}
      <div className="absolute right-2 top-2 flex items-center gap-1">
        {isSaving && <SaveIndicator isSaving={true} size="sm" />}
        {hasFailed && !isSaving && onRetry && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRetry();
            }}
            className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 transition-colors"
            title="Retry save"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        )}
      </div>

      <div className="flex items-start gap-2">
        <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0 pr-6">
          <p className="text-sm font-medium mb-1 truncate">{lender.name}</p>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="bg-secondary px-1.5 py-0.5 rounded text-[10px]">
              {stageLabel}
            </span>
            {timeAgo && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {timeAgo}
              </span>
            )}
          </div>
          {lender.notes && (
            <div className="flex items-start gap-1 mt-2 text-xs text-muted-foreground">
              <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
              <span className="line-clamp-2">{lender.notes}</span>
            </div>
          )}
          {lender.passReason && (
            <div className="mt-2 flex flex-wrap gap-1">
              {lender.passReason.split(', ').map((reason, idx) => (
                <span key={idx} className="text-xs text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">
                  {reason}
                </span>
              ))}
            </div>
          )}
          {hasFailed && (
            <p className="text-xs text-destructive mt-2">Save failed — tap retry</p>
          )}
        </div>
      </div>
    </div>
  );
}

// Droppable Kanban Column
function DroppableColumn({ 
  group, 
  lenders,
  configuredStages,
  isSaving,
  failedSaves,
  onRetry,
}: { 
  group: { id: StageGroup; label: string; color: string }; 
  lenders: DealLender[];
  configuredStages: { id: string; label: string; group: StageGroup }[];
  isSaving?: (id: string) => boolean;
  failedSaves?: Set<string>;
  onRetry?: (lenderId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: group.id,
  });

  return (
    <div className="flex flex-col min-w-[220px]">
      <div className="flex items-center gap-2 mb-3">
        <div className={cn("w-3 h-3 rounded-full", group.color)} />
        <h3 className="font-medium text-sm">{group.label}</h3>
        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
          {lenders.length}
        </span>
      </div>
      <div 
        ref={setNodeRef}
        className={cn(
          "flex-1 bg-muted/30 rounded-lg p-2 min-h-[300px] space-y-2 transition-colors",
          isOver && "bg-primary/10 ring-2 ring-primary/30"
        )}
      >
        {lenders.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            Drop lenders here
          </p>
        )}
        {lenders.map((lender) => (
          <DraggableLenderTile 
            key={lender.id} 
            lender={lender} 
            configuredStages={configuredStages}
            isSaving={isSaving?.(`lender-stage-${lender.id}`)}
            hasFailed={failedSaves?.has(lender.id)}
            onRetry={onRetry ? () => onRetry(lender.id) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

export function LendersKanban({ lenders, configuredStages, passReasons, onUpdateLenderGroup, isSaving, failedSaves, onRetry }: LendersKanbanProps) {
  const [activeLender, setActiveLender] = useState<DealLender | null>(null);
  const [passReasonDialogOpen, setPassReasonDialogOpen] = useState(false);
  const [pendingPassChange, setPendingPassChange] = useState<{ lenderId: string } | null>(null);
  const [selectedPassReasons, setSelectedPassReasons] = useState<string[]>([]);
  const [passReasonSearch, setPassReasonSearch] = useState('');

  const filteredPassReasons = useMemo(() => {
    if (!passReasonSearch.trim()) return passReasons;
    return passReasons.filter(reason => 
      reason.label.toLowerCase().includes(passReasonSearch.toLowerCase())
    );
  }, [passReasons, passReasonSearch]);
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const lender = lenders.find(l => l.id === active.id);
    if (lender) {
      setActiveLender(lender);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveLender(null);

    if (over && active.id !== over.id) {
      const targetGroup = over.id as StageGroup;
      if (STAGE_GROUPS.some(g => g.id === targetGroup)) {
        // Check if dropping to passed column
        if (targetGroup === 'passed') {
          setPendingPassChange({ lenderId: active.id as string });
          setSelectedPassReasons([]);
          setPassReasonDialogOpen(true);
        } else {
          onUpdateLenderGroup(active.id as string, targetGroup);
        }
      }
    }
  };

  const handleConfirmPass = () => {
    if (pendingPassChange && selectedPassReasons.length > 0) {
      onUpdateLenderGroup(pendingPassChange.lenderId, 'passed', selectedPassReasons.join(', '));
      setPassReasonDialogOpen(false);
      setPendingPassChange(null);
      setSelectedPassReasons([]);
    }
  };

  const handleCancelPass = () => {
    setPassReasonDialogOpen(false);
    setPendingPassChange(null);
    setSelectedPassReasons([]);
    setPassReasonSearch('');
  };

  const togglePassReason = (reasonLabel: string) => {
    setSelectedPassReasons(prev => {
      if (prev.includes(reasonLabel)) {
        return prev.filter(r => r !== reasonLabel);
      }
      if (prev.length >= 3) {
        return prev; // Don't add more than 3
      }
      return [...prev, reasonLabel];
    });
  };

  const isStageGroup = (value: unknown): value is StageGroup =>
    value === 'active' || value === 'on-deck' || value === 'passed' || value === 'on-hold';

  const getLendersByGroup = (groupId: StageGroup) => {
    return lenders.filter((lender) => {
      // Prefer persisted trackingStatus (group) if available.
      // This prevents “Passed” lenders from reverting on refresh when stage config
      // doesn’t include a dedicated “passed” stage.
      if (isStageGroup(lender.trackingStatus) && lender.trackingStatus === groupId) {
        return true;
      }

      // Fallback to deriving group from configured stage.
      const stage = configuredStages.find((s) => s.id === lender.stage);
      return stage?.group === groupId;
    });
  };

  const stageLabel = activeLender ? configuredStages.find(s => s.id === activeLender.stage)?.label || activeLender.stage : '';
  const pendingLenderName = pendingPassChange ? lenders.find(l => l.id === pendingPassChange.lenderId)?.name : '';

  return (
    <>
      <DndContext 
        sensors={sensors}
        onDragStart={handleDragStart} 
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-4 gap-4 overflow-auto py-4">
          {STAGE_GROUPS.map((group) => (
            <DroppableColumn 
              key={group.id} 
              group={group} 
              lenders={getLendersByGroup(group.id)}
              configuredStages={configuredStages}
              isSaving={isSaving}
              failedSaves={failedSaves}
              onRetry={onRetry}
            />
          ))}
        </div>
        <DragOverlay>
          {activeLender ? (
            <div className="bg-card border border-primary rounded-lg p-3 shadow-xl rotate-3">
              <div className="flex items-start gap-2">
                <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium mb-1">{activeLender.name}</p>
                  <span className="bg-secondary px-1.5 py-0.5 rounded text-[10px]">
                    {stageLabel}
                  </span>
                </div>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Pass Reason Dialog */}
      <Dialog open={passReasonDialogOpen} onOpenChange={(open) => !open && handleCancelPass()}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Select Pass Reasons for {pendingLenderName}</DialogTitle>
            <p className="text-sm text-muted-foreground">Select up to 3 reasons ({selectedPassReasons.length}/3)</p>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search pass reasons..."
                value={passReasonSearch}
                onChange={(e) => setPassReasonSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {filteredPassReasons.map((reason) => {
                const isSelected = selectedPassReasons.includes(reason.label);
                const isDisabled = !isSelected && selectedPassReasons.length >= 3;
                return (
                  <Button
                    key={reason.id}
                    variant={isSelected ? "default" : "outline"}
                    className="h-auto py-2 px-3 text-sm justify-start"
                    disabled={isDisabled}
                    onClick={() => togglePassReason(reason.label)}
                  >
                    {reason.label}
                  </Button>
                );
              })}
              {filteredPassReasons.length === 0 && (
                <p className="col-span-3 text-sm text-muted-foreground text-center py-4">
                  No pass reasons match your search
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelPass}>
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmPass}
              disabled={selectedPassReasons.length === 0}
            >
              Confirm ({selectedPassReasons.length} selected)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
