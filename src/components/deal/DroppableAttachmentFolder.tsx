import { useDroppable } from '@dnd-kit/core';
import { ReactNode, useState, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';

interface DroppableAttachmentFolderProps {
  id: string;
  children: ReactNode;
  isExpanded: boolean;
  onFileDrop?: (category: string, files: File[]) => void;
}

export function DroppableAttachmentFolder({ 
  id, 
  children, 
  isExpanded,
  onFileDrop,
}: DroppableAttachmentFolderProps) {
  const { isOver, setNodeRef } = useDroppable({
    id,
    data: {
      type: 'category',
      category: id,
    },
  });

  const [isNativeDragOver, setIsNativeDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    setIsNativeDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsNativeDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsNativeDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0 && onFileDrop) {
      onFileDrop(id, files);
    }
  }, [id, onFileDrop]);

  const highlighted = isOver || isNativeDragOver;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-lg transition-all duration-300 ease-out',
        highlighted && 'ring-2 ring-primary ring-offset-2 ring-offset-background bg-primary/5 scale-[1.02]'
      )}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}
      {highlighted && !isExpanded && (
        <div className="mt-1 p-2 text-center text-xs text-primary bg-primary/10 rounded-lg animate-fade-in">
          Drop to {isNativeDragOver ? 'upload here' : 'move here'}
        </div>
      )}
    </div>
  );
}
