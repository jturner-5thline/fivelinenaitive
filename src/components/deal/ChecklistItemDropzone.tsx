import { useState, useCallback, ReactNode } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChecklistItemDropzoneProps {
  children: ReactNode;
  onFileDrop: (files: File[]) => void;
  disabled?: boolean;
  className?: string;
}

export function ChecklistItemDropzone({ 
  children, 
  onFileDrop, 
  disabled = false,
  className 
}: ChecklistItemDropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragOver(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set to false if we're actually leaving the element
    const rect = e.currentTarget.getBoundingClientRect();
    const { clientX, clientY } = e;
    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (disabled) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      onFileDrop(files);
    }
  }, [disabled, onFileDrop]);

  return (
    <div
      className={cn(
        "relative transition-all duration-200",
        isDragOver && !disabled && "ring-2 ring-primary ring-offset-2 bg-primary/5",
        className
      )}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}
      {isDragOver && !disabled && (
        <div className="absolute inset-0 flex items-center justify-center bg-primary/10 rounded-lg pointer-events-none z-10">
          <div className="flex items-center gap-2 text-primary font-medium text-sm bg-background/90 px-3 py-1.5 rounded-md shadow-sm">
            <Upload className="h-4 w-4" />
            Drop to upload & check off
          </div>
        </div>
      )}
    </div>
  );
}
