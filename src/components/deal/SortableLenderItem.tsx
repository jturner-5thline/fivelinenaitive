import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { DealLender } from '@/types/deal';

interface SortableLenderItemProps {
  lender: DealLender;
  children: React.ReactNode;
}

export function SortableLenderItem({ lender, children }: SortableLenderItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lender.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      <div
        {...attributes}
        {...listeners}
        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-6 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      {children}
    </div>
  );
}
