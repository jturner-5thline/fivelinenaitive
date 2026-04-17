import { useState } from 'react';
import { Paperclip, Download, FileText, FileImage, FileSpreadsheet, FileArchive, File as FileIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { EmailAttachment } from './mockEmailData';
import { downloadAttachment } from './useFullEmailMessage';

interface Props {
  messageId: string;
  attachments: EmailAttachment[];
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function iconForType(contentType: string, filename: string) {
  const t = (contentType || '').toLowerCase();
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (t.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return FileImage;
  if (t.includes('pdf') || ext === 'pdf') return FileText;
  if (t.includes('sheet') || t.includes('excel') || ['xlsx', 'xls', 'csv'].includes(ext)) return FileSpreadsheet;
  if (t.includes('zip') || t.includes('compressed') || ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return FileArchive;
  if (t.includes('word') || ['doc', 'docx', 'txt', 'rtf'].includes(ext)) return FileText;
  return FileIcon;
}

function fileLabel(filename: string, contentType: string): string {
  const ext = (filename.split('.').pop() || '').toUpperCase();
  if (ext && ext.length <= 5 && filename.includes('.')) return ext;
  if (contentType?.includes('pdf')) return 'PDF';
  if (contentType?.startsWith('image/')) return 'IMAGE';
  return 'FILE';
}

export function EmailAttachmentList({ messageId, attachments }: Props) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const visible = attachments.filter((a) => !a.is_inline && a.filename);
  if (visible.length === 0) return null;

  const handleDownload = async (att: EmailAttachment) => {
    if (!att.id) {
      toast.error('Attachment unavailable');
      return;
    }
    setDownloadingId(att.id);
    try {
      await downloadAttachment(messageId, att);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to download attachment');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="mt-5">
      <div className="flex items-center gap-1.5 mb-2 text-[11px] font-semibold text-[hsl(var(--email-text-secondary))] uppercase tracking-wide">
        <Paperclip className="h-3 w-3" />
        <span>{visible.length} {visible.length === 1 ? 'Attachment' : 'Attachments'}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {visible.map((att, i) => {
          const Icon = iconForType(att.content_type, att.filename);
          const label = fileLabel(att.filename, att.content_type);
          const sizeLabel = formatBytes(att.size);
          const isDownloading = downloadingId === att.id;
          const key = att.id || `${att.filename}-${i}`;
          return (
            <button
              key={key}
              type="button"
              onClick={() => handleDownload(att)}
              disabled={isDownloading || !att.id}
              className={cn(
                'group flex items-center gap-3 p-2.5 rounded-md border border-[hsl(var(--email-border))] bg-card/60 hover:bg-card hover:border-[hsl(var(--outlook-blue)/0.4)] transition-all text-left min-w-0',
                'disabled:opacity-60 disabled:cursor-not-allowed',
              )}
            >
              <div className="flex items-center justify-center h-9 w-9 rounded bg-muted/50 shrink-0">
                <Icon className="h-4 w-4 text-[hsl(var(--email-text-secondary))]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-[hsl(var(--email-text-primary))] truncate">{att.filename}</div>
                <div className="text-[11px] text-[hsl(var(--email-text-muted))] flex items-center gap-1.5">
                  <span>{label}</span>
                  {sizeLabel && <><span>·</span><span>{sizeLabel}</span></>}
                </div>
              </div>
              <div className="shrink-0 text-[hsl(var(--email-text-muted))] group-hover:text-[hsl(var(--outlook-blue))]">
                {isDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
