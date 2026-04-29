import { useRef } from 'react';
import { Paperclip, X, FileText, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export interface AttachedFile {
  file: File;
  preview?: string;
  id: string;
}

interface Props {
  attachments: AttachedFile[];
  onAttach: (files: AttachedFile[]) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf', 'text/plain', 'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

export function FileAttachmentButton({ attachments, onAttach, onRemove, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const processFiles = (files: FileList | File[]) => {
    const newAttachments: AttachedFile[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name} is too large (max 10MB)`);
        continue;
      }
      if (!ALLOWED_TYPES.includes(file.type)) {
        toast.error(`${file.name}: unsupported file type`);
        continue;
      }
      const id = crypto.randomUUID();
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
      newAttachments.push({ file, preview, id });
    }
    if (newAttachments.length > 0) onAttach(newAttachments);
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.txt,.csv,.xlsx,.docx"
        className="hidden"
        onChange={(e) => { if (e.target.files) processFiles(e.target.files); e.target.value = ''; }}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-lg"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        title="Attach file"
      >
        <Paperclip className="h-4 w-4 text-muted-foreground" />
      </Button>

      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 mb-1 flex flex-wrap gap-1.5 p-2">
          {attachments.map((a) => (
            <div key={a.id} className={cn(
              'relative group flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs',
              'border border-border/40 bg-muted/50 backdrop-blur-sm'
            )}>
              {a.preview ? (
                <img src={a.preview} alt="" className="h-6 w-6 rounded object-cover" />
              ) : (
                <FileText className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="max-w-[100px] truncate">{a.file.name}</span>
              <button
                onClick={() => { if (a.preview) URL.revokeObjectURL(a.preview); onRemove(a.id); }}
                className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
