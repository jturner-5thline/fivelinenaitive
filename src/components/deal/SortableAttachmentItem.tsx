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
  Presentation
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DealAttachment } from '@/hooks/useDealAttachments';

const getFileIcon = (fileName: string) => {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  
  // PDFs
  if (extension === 'pdf') {
    return <FileText className="h-4 w-4 text-red-500 shrink-0" />;
  }
  
  // Word documents
  if (['doc', 'docx', 'odt', 'rtf'].includes(extension)) {
    return <FileText className="h-4 w-4 text-blue-500 shrink-0" />;
  }
  
  // Spreadsheets
  if (['xls', 'xlsx', 'csv', 'ods'].includes(extension)) {
    return <FileSpreadsheet className="h-4 w-4 text-green-500 shrink-0" />;
  }
  
  // Presentations
  if (['ppt', 'pptx', 'odp'].includes(extension)) {
    return <Presentation className="h-4 w-4 text-orange-500 shrink-0" />;
  }
  
  // Images
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'heic'].includes(extension)) {
    return <FileImage className="h-4 w-4 text-purple-500 shrink-0" />;
  }
  
  // Videos
  if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv'].includes(extension)) {
    return <FileVideo className="h-4 w-4 text-pink-500 shrink-0" />;
  }
  
  // Audio
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'].includes(extension)) {
    return <FileAudio className="h-4 w-4 text-cyan-500 shrink-0" />;
  }
  
  // Archives
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) {
    return <FileArchive className="h-4 w-4 text-yellow-600 shrink-0" />;
  }
  
  // Code files
  if (['js', 'ts', 'jsx', 'tsx', 'html', 'css', 'json', 'xml', 'py', 'java', 'cpp', 'c', 'go', 'rs'].includes(extension)) {
    return <FileCode className="h-4 w-4 text-emerald-500 shrink-0" />;
  }
  
  // Default
  return <File className="h-4 w-4 text-muted-foreground shrink-0" />;
};

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
          {getFileIcon(attachment.name)}
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
