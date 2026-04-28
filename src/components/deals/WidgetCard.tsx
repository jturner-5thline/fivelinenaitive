import { Pencil, Trash2, GripVertical } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Widget, WidgetMetric } from '@/contexts/WidgetsContext';

interface WidgetCardProps {
  widget: Widget;
  value: string | number;
  isEditMode: boolean;
  isClickable?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onClick?: () => void;
}

export function WidgetCard({ widget, value, isEditMode, isClickable, onEdit, onDelete, onClick }: WidgetCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id, disabled: !isEditMode });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleClick = () => {
    if (!isEditMode && isClickable && onClick) {
      onClick();
    }
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`deal-glass group transition-all duration-200 ${isDragging ? 'z-50 opacity-50' : ''} ${isClickable && !isEditMode ? 'cursor-pointer hover:-translate-y-0.5' : ''}`}
      onClick={handleClick}
    >
      {isEditMode && (
        <div className="absolute -top-2 -left-2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <Button
            variant="secondary"
            size="icon"
            className="h-5 w-5 rounded-full shadow-sm cursor-grab active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-3 w-3" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="h-5 w-5 rounded-full shadow-sm"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
          >
            <Pencil className="h-2.5 w-2.5" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="h-5 w-5 rounded-full shadow-sm hover:bg-destructive hover:text-destructive-foreground"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
          >
            <Trash2 className="h-2.5 w-2.5" />
          </Button>
        </div>
      )}
      <CardContent className="flex flex-col justify-center gap-1 px-3 py-3">
        <p
          className="text-[11px] font-medium uppercase tracking-wide truncate leading-tight"
          style={{ color: 'rgba(160, 200, 255, 0.55)' }}
          title={widget.label}
        >
          {widget.label}
        </p>
        <p
          className="text-xl font-semibold tabular-nums truncate leading-tight"
          style={{ color: '#dde8f8' }}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
