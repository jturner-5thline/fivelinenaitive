import { useState, useEffect } from 'react';
import { GripVertical, RotateCcw, AlertTriangle, Zap, ListTodo, Lightbulb, Target, Activity } from 'lucide-react';
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
import { NotificationSectionId } from '@/hooks/useNotificationSectionOrder';

interface NotificationSectionReorderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sectionOrder: NotificationSectionId[];
  onSave: (newOrder: NotificationSectionId[]) => void;
  onReset: () => void;
}

const SECTION_CONFIG: Record<NotificationSectionId, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  'alerts': { label: 'Alerts', icon: AlertTriangle },
  'flex': { label: 'FLEx Engagement', icon: Zap },
  'tasks': { label: 'Tasks & Reminders', icon: ListTodo },
  'milestones': { label: 'Milestones', icon: Target },
  'suggestions': { label: 'Recommended Actions', icon: Lightbulb },
  'activity': { label: 'Recent Activity', icon: Activity },
};

interface SortableSectionItemProps {
  id: NotificationSectionId;
  index: number;
}

function SortableSectionItem({ id, index }: SortableSectionItemProps) {
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

  const config = SECTION_CONFIG[id];
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
      <span className="font-medium text-sm">{config.label}</span>
    </div>
  );
}

export function NotificationSectionReorderDialog({
  open,
  onOpenChange,
  sectionOrder,
  onSave,
  onReset,
}: NotificationSectionReorderDialogProps) {
  const [localOrder, setLocalOrder] = useState(sectionOrder);

  useEffect(() => {
    setLocalOrder(sectionOrder);
  }, [sectionOrder, open]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = localOrder.indexOf(active.id as NotificationSectionId);
      const newIndex = localOrder.indexOf(over.id as NotificationSectionId);
      setLocalOrder(arrayMove(localOrder, oldIndex, newIndex));
    }
  };

  const handleSave = () => {
    onSave(localOrder);
    onOpenChange(false);
  };

  const handleReset = () => {
    onReset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Customize Layout</DialogTitle>
          <DialogDescription>
            Drag and drop to reorder notification sections.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 overflow-y-auto flex-1">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={localOrder} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {localOrder.map((id, index) => (
                  <SortableSectionItem key={id} id={id} index={index} />
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
