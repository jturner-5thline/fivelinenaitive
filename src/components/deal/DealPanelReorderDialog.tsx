import { useState, useEffect } from 'react';
import { GripVertical, RotateCcw, Search, MessageSquare, Clock, AlertCircle, FileText, CheckSquare } from 'lucide-react';
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
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DealPanelId } from '@/hooks/useDealPanelOrder';

interface DealPanelReorderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  panelOrder: DealPanelId[];
  onReorder: (fromIndex: number, toIndex: number) => void;
  onReset: () => void;
}

const PANEL_CONFIG: Record<DealPanelId, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  'ai-research': { label: 'AI Research', icon: Search },
  'ai-assistant': { label: 'AI Deal Assistant', icon: MessageSquare },
  'ai-activity-summary': { label: 'AI Activity Summary', icon: Clock },
  'ai-suggestions': { label: 'AI Smart Suggestions', icon: AlertCircle },
  'deal-information': { label: 'Deal Information', icon: FileText },
  'outstanding-items': { label: 'Outstanding Items', icon: CheckSquare },
};

interface SortablePanelItemProps {
  id: DealPanelId;
  index: number;
}

function SortablePanelItem({ id, index }: SortablePanelItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const config = PANEL_CONFIG[id];
  const Icon = config.icon;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-3 p-3 bg-card border border-border rounded-lg',
        isDragging && 'opacity-50 shadow-lg z-50'
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground"
      >
        <GripVertical className="h-5 w-5" />
      </button>
      <span className="text-muted-foreground text-sm font-medium w-6">{index + 1}</span>
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="font-medium">{config.label}</span>
    </div>
  );
}

export function DealPanelReorderDialog({
  open,
  onOpenChange,
  panelOrder,
  onReorder,
  onReset,
}: DealPanelReorderDialogProps) {
  const [localOrder, setLocalOrder] = useState(panelOrder);

  useEffect(() => {
    setLocalOrder(panelOrder);
  }, [panelOrder, open]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = localOrder.indexOf(active.id as DealPanelId);
      const newIndex = localOrder.indexOf(over.id as DealPanelId);
      setLocalOrder(arrayMove(localOrder, oldIndex, newIndex));
    }
  };

  const handleSave = () => {
    // Apply reorders from original to final order
    const originalOrder = [...panelOrder];
    localOrder.forEach((panelId, newIndex) => {
      const currentIndex = originalOrder.indexOf(panelId);
      if (currentIndex !== newIndex) {
        onReorder(currentIndex, newIndex);
        // Update originalOrder to reflect the change
        const [moved] = originalOrder.splice(currentIndex, 1);
        originalOrder.splice(newIndex, 0, moved);
      }
    });
    onOpenChange(false);
  };

  const handleReset = () => {
    onReset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reorder Panels</DialogTitle>
          <DialogDescription>
            Drag and drop to reorder the panels in the Deal Information tab.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={localOrder} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {localOrder.map((id, index) => (
                  <SortablePanelItem key={id} id={id} index={index} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={handleReset} className="gap-2">
            <RotateCcw className="h-4 w-4" />
            Reset to Default
          </Button>
          <div className="flex gap-2 ml-auto">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              Save Order
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
