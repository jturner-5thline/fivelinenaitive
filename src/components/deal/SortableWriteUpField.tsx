import { ReactNode } from 'react';
import { GripVertical } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { WriteUpFieldId, WRITEUP_FIELD_CONFIG } from '@/hooks/useWriteUpFieldOrder';

interface SortableWriteUpFieldProps {
  id: WriteUpFieldId;
  children: ReactNode;
  isDragEnabled?: boolean;
}

export function SortableWriteUpField({ id, children, isDragEnabled = false }: SortableWriteUpFieldProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !isDragEnabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  if (!isDragEnabled) {
    return <>{children}</>;
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative group',
        isDragging && 'opacity-50 z-50'
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="absolute -left-8 top-1/2 -translate-y-1/2 p-1 cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      {children}
    </div>
  );
}
