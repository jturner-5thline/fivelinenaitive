import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { File, Download, Trash2, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DealAttachment } from '@/hooks/useDealAttachments';

interface SortableAttachmentItemProps {
  attachment: DealAttachment;
  formatFileSize: (bytes: number) => string;
  onDelete: (attachment: DealAttachment) => void;
  onView: (attachment: DealAttachment) => void;
  onDownload: (attachment: DealAttachment) => void;
}

export function SortableAttachmentItem({
  attachment,
  formatFileSize,
  onDelete,
  onView,
  onDownload,
}: SortableAttachmentItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: attachment.id,
    data: {
      type: 'attachment',
      attachment,
      category: attachment.category,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between p-2 pl-2 bg-background rounded-lg group hover:bg-muted/30 transition-colors border border-border/50 ${
        isDragging ? 'shadow-lg ring-2 ring-primary/20' : ''
      }`}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing touch-none p-1 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <a
          href={attachment.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            onView(attachment);
          }}
        >
          <File className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate hover:underline">{attachment.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatFileSize(attachment.size_bytes)} • {new Date(attachment.created_at).toLocaleDateString()}
            </p>
          </div>
        </a>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
          onClick={() => onDownload(attachment)}
        >
          <Download className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(attachment)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
