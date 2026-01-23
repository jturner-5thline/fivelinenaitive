import { useState, useEffect } from 'react';
import { GripVertical, RotateCcw } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { WriteUpFieldId, WRITEUP_FIELD_CONFIG } from '@/hooks/useWriteUpFieldOrder';

interface WriteUpFieldReorderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fieldOrder: WriteUpFieldId[];
  onReorder: (newOrder: WriteUpFieldId[]) => void;
  onReset: () => void;
}

interface SortableFieldItemProps {
  id: WriteUpFieldId;
  index: number;
}

function SortableFieldItem({ id, index }: SortableFieldItemProps) {
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

  const config = WRITEUP_FIELD_CONFIG[id];

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
      <span className="font-medium flex-1">{config.label}</span>
      {config.required && (
        <Badge variant="secondary" className="text-xs">Required</Badge>
      )}
    </div>
  );
}

export function WriteUpFieldReorderDialog({
  open,
  onOpenChange,
  fieldOrder,
  onReorder,
  onReset,
}: WriteUpFieldReorderDialogProps) {
  const [localOrder, setLocalOrder] = useState(fieldOrder);

  useEffect(() => {
    setLocalOrder(fieldOrder);
  }, [fieldOrder, open]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = localOrder.indexOf(active.id as WriteUpFieldId);
      const newIndex = localOrder.indexOf(over.id as WriteUpFieldId);
      setLocalOrder(arrayMove(localOrder, oldIndex, newIndex));
    }
  };

  const handleSave = () => {
    onReorder(localOrder);
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
          <DialogTitle>Reorder Fields</DialogTitle>
          <DialogDescription>
            Drag and drop to customize the order of form fields.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[400px] pr-4">
          <div className="py-4">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={localOrder} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {localOrder.map((id, index) => (
                    <SortableFieldItem key={id} id={id} index={index} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </ScrollArea>

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
