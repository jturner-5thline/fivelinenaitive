import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { Target } from 'lucide-react';

interface DropZoneProps {
  id: string;
  label: string;
  accepts: string;
  children?: React.ReactNode;
  isEmpty?: boolean;
}

export function DropZone({ id, label, accepts, children, isEmpty = true }: DropZoneProps) {
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-lg border-2 border-dashed transition-all min-h-[48px] flex items-center justify-center px-3 py-2',
        isOver ? 'border-primary bg-primary/5' : 'border-border',
        isEmpty && 'text-muted-foreground'
      )}
    >
      {isEmpty ? (
        <div className="flex items-center gap-2 text-xs">
          <Target className="h-3.5 w-3.5" />
          <span>Drop {accepts} field here</span>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
