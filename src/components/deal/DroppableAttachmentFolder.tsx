import { useDroppable } from '@dnd-kit/core';
import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface DroppableAttachmentFolderProps {
  id: string;
  children: ReactNode;
  isExpanded: boolean;
}

export function DroppableAttachmentFolder({ 
  id, 
  children, 
  isExpanded 
}: DroppableAttachmentFolderProps) {
  const { isOver, setNodeRef } = useDroppable({
    id,
    data: {
      type: 'category',
      category: id,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-lg transition-all duration-200',
        isOver && 'ring-2 ring-primary ring-offset-2 ring-offset-background bg-primary/5'
      )}
    >
      {children}
      {isOver && !isExpanded && (
        <div className="mt-1 p-2 text-center text-xs text-primary bg-primary/10 rounded-lg">
          Drop to move here
        </div>
      )}
    </div>
  );
}
