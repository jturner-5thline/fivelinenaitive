import { DragOverlay } from '@dnd-kit/core';
import { File, ArrowRight } from 'lucide-react';
import { DealAttachment, DEAL_ATTACHMENT_CATEGORIES } from '@/hooks/useDealAttachments';

interface AttachmentDragOverlayProps {
  activeAttachment: DealAttachment | null;
  targetCategory: string | null;
  formatFileSize: (bytes: number) => string;
}

export function AttachmentDragOverlay({ 
  activeAttachment, 
  targetCategory,
  formatFileSize 
}: AttachmentDragOverlayProps) {
  if (!activeAttachment) return null;

  const currentCategoryLabel = DEAL_ATTACHMENT_CATEGORIES.find(
    c => c.value === activeAttachment.category
  )?.label;
  
  const targetCategoryLabel = targetCategory 
    ? DEAL_ATTACHMENT_CATEGORIES.find(c => c.value === targetCategory)?.label
    : null;

  const isMoving = targetCategory && targetCategory !== activeAttachment.category;

  return (
    <DragOverlay dropAnimation={null}>
      <div className="flex flex-col gap-2 pointer-events-none">
        {/* File card */}
        <div className="flex items-center gap-3 p-3 bg-background rounded-lg border-2 border-primary shadow-xl min-w-[250px] max-w-[350px]">
          <File className="h-5 w-5 text-primary shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{activeAttachment.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatFileSize(activeAttachment.size_bytes)}
            </p>
          </div>
        </div>
        
        {/* Move indicator */}
        {isMoving && targetCategoryLabel && (
          <div className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium shadow-lg animate-in fade-in slide-in-from-top-1 duration-150">
            <span className="text-primary-foreground/70">{currentCategoryLabel}</span>
            <ArrowRight className="h-4 w-4" />
            <span>{targetCategoryLabel}</span>
          </div>
        )}
      </div>
    </DragOverlay>
  );
}
