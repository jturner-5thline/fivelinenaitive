import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { 
  File, 
  Download, 
  Trash2, 
  GripVertical,
  FileText,
  FileSpreadsheet,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileCode,
  Presentation,
  Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DealAttachment } from '@/hooks/useDealAttachments';
import { cn } from '@/lib/utils';

const getFileIcon = (fileName: string) => {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  
  if (extension === 'pdf') {
    return <FileText className="h-8 w-8 text-red-500" />;
  }
  if (['doc', 'docx', 'odt', 'rtf'].includes(extension)) {
    return <FileText className="h-8 w-8 text-blue-500" />;
  }
  if (['xls', 'xlsx', 'csv', 'ods'].includes(extension)) {
    return <FileSpreadsheet className="h-8 w-8 text-green-500" />;
  }
  if (['ppt', 'pptx', 'odp'].includes(extension)) {
    return <Presentation className="h-8 w-8 text-orange-500" />;
  }
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'heic'].includes(extension)) {
    return <FileImage className="h-8 w-8 text-purple-500" />;
  }
  if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv'].includes(extension)) {
    return <FileVideo className="h-8 w-8 text-pink-500" />;
  }
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'].includes(extension)) {
    return <FileAudio className="h-8 w-8 text-cyan-500" />;
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) {
    return <FileArchive className="h-8 w-8 text-yellow-600" />;
  }
  if (['js', 'ts', 'jsx', 'tsx', 'html', 'css', 'json', 'xml', 'py', 'java', 'cpp', 'c', 'go', 'rs'].includes(extension)) {
    return <FileCode className="h-8 w-8 text-emerald-500" />;
  }
  return <File className="h-8 w-8 text-muted-foreground" />;
};

interface SortableAttachmentTileProps {
  attachment: DealAttachment;
  formatFileSize: (bytes: number) => string;
  onDelete: (attachment: DealAttachment) => void;
  onView: (attachment: DealAttachment) => void;
  onDownload: (attachment: DealAttachment) => void;
  isSelected?: boolean;
  onToggleSelect?: (attachmentId: string) => void;
  selectionMode?: boolean;
}

export function SortableAttachmentTile({
  attachment,
  formatFileSize,
  onDelete,
  onView,
  onDownload,
  isSelected = false,
  onToggleSelect,
  selectionMode = false,
}: SortableAttachmentTileProps) {
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
    transition: transition || 'transform 250ms ease, opacity 200ms ease',
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };

  const handleTileClick = (e: React.MouseEvent) => {
    if (selectionMode && onToggleSelect) {
      e.preventDefault();
      e.stopPropagation();
      onToggleSelect(attachment.id);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={handleTileClick}
      className={cn(
        "relative flex flex-col items-center p-3 bg-background rounded-lg group hover:bg-muted/30 transition-all duration-200 border animate-fade-in",
        isDragging && 'shadow-lg ring-2 ring-primary/20 scale-105',
        isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border/50',
        selectionMode && 'cursor-pointer'
      )}
    >
      {/* Selection checkbox */}
      {(selectionMode || isSelected) && (
        <div 
          className="absolute top-1 left-1 z-10"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect?.(attachment.id);
          }}
        >
          <div className={cn(
            "h-5 w-5 rounded border-2 flex items-center justify-center transition-colors",
            isSelected 
              ? "bg-primary border-primary text-primary-foreground" 
              : "bg-background border-muted-foreground/50 hover:border-primary"
          )}>
            {isSelected && <Check className="h-3 w-3" />}
          </div>
        </div>
      )}

      {/* Drag handle - only show when not in selection mode */}
      {!selectionMode && (
        <button
          {...attributes}
          {...listeners}
          className="absolute top-1 left-1 cursor-grab active:cursor-grabbing touch-none p-1 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <GripVertical className="h-3 w-3" />
        </button>
      )}

      {/* Action buttons */}
      {!selectionMode && (
        <div className="absolute top-1 right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onDownload(attachment);
            }}
          >
            <Download className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(attachment);
            }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* File icon */}
      <a
        href={selectionMode ? undefined : attachment.url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "flex flex-col items-center w-full",
          selectionMode ? 'cursor-pointer' : 'cursor-pointer'
        )}
        onClick={(e) => {
          if (selectionMode) {
            e.preventDefault();
            return;
          }
          e.stopPropagation();
          onView(attachment);
        }}
      >
        <div className="mb-2 p-3 rounded-lg bg-muted/50">
          {getFileIcon(attachment.name)}
        </div>
        <p className={cn(
          "text-xs font-medium text-center truncate w-full",
          !selectionMode && "hover:underline"
        )} title={attachment.name}>
          {attachment.name}
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {formatFileSize(attachment.size_bytes)}
        </p>
      </a>
    </div>
  );
}
