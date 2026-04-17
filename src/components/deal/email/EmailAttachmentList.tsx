import { useMemo, useState } from 'react';
import {
  Paperclip,
  Download,
  FileText,
  FileImage,
  FileSpreadsheet,
  FileArchive,
  File as FileIcon,
  Loader2,
  FolderPlus,
  MoreHorizontal,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { EmailAttachment } from './mockEmailData';
import { downloadAttachment } from './useFullEmailMessage';
import { SendToDataRoomDialog } from './SendToDataRoomDialog';
import type { SourceEmailMeta } from '@/hooks/useEmailToDataRoom';

interface Props {
  messageId: string;
  attachments: EmailAttachment[];
  /** Optional source-email context — when provided, the prominent
   *  "Add to Data Room" CTA + per-row actions become available. */
  sourceEmail?: SourceEmailMeta;
  threadData?: any;
  /** Linked deal context, used to label the CTA and preselect the destination. */
  linkedDealId?: string;
  linkedDealName?: string;
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

export function EmailAttachmentList({
  messageId,
  attachments,
  sourceEmail,
  threadData,
  linkedDealId,
  linkedDealName,
}: Props) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [preselectedIds, setPreselectedIds] = useState<string[] | undefined>(undefined);
  const [successInfo, setSuccessInfo] = useState<{ count: number; dealName: string } | null>(null);

  // Show every non-inline attachment, even if some metadata is missing —
  // we still want users to see *something* rather than a blank tile.
  const visible = useMemo(() => attachments.filter((a) => !a.is_inline), [attachments]);
  const uploadable = useMemo(() => visible.filter((a) => !!a.id), [visible]);
  const canSendToDataRoom = !!sourceEmail && uploadable.length > 0;

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

  const toggleSelect = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const allSelected = uploadable.length > 0 && selected.size === uploadable.length;
  const someSelected = selected.size > 0 && !allSelected;

  const openForAll = () => {
    setPreselectedIds(undefined); // include all by default
    setDialogOpen(true);
  };

  const openForSelected = () => {
    if (selected.size === 0) return;
    setPreselectedIds(Array.from(selected));
    setDialogOpen(true);
  };

  const openForOne = (att: EmailAttachment) => {
    if (!att.id) return;
    setPreselectedIds([att.id]);
    setDialogOpen(true);
  };

  const ctaLabel = (() => {
    if (selected.size > 0 && selected.size < uploadable.length) {
      return `Add ${selected.size} selected to ${linkedDealName ? `${linkedDealName} Data Room` : 'Data Room'}`;
    }
    if (linkedDealName) {
      return `Add all attachments to ${linkedDealName} Data Room`;
    }
    return `Add all attachments to Data Room`;
  })();

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[hsl(var(--email-text-secondary))] uppercase tracking-wide">
          <Paperclip className="h-3 w-3" />
          <span>{visible.length} {visible.length === 1 ? 'Attachment' : 'Attachments'}</span>
        </div>
        {canSendToDataRoom && uploadable.length > 1 && (
          <button
            type="button"
            onClick={() => {
              if (allSelected) setSelected(new Set());
              else setSelected(new Set(uploadable.map((a) => a.id!)));
            }}
            className="text-[11px] text-[hsl(var(--outlook-blue))] hover:underline"
          >
            {allSelected ? 'Clear selection' : 'Select all'}
          </button>
        )}
      </div>

      {/* Prominent bulk CTA — primary affordance */}
      {canSendToDataRoom && !successInfo && (
        <button
          type="button"
          onClick={selected.size > 0 ? openForSelected : openForAll}
          className={cn(
            'group w-full flex items-center gap-2.5 px-3.5 py-2.5 mb-2 rounded-md',
            'border border-[hsl(var(--outlook-blue)/0.4)] bg-[hsl(var(--outlook-blue)/0.08)]',
            'hover:bg-[hsl(var(--outlook-blue)/0.14)] hover:border-[hsl(var(--outlook-blue)/0.6)]',
            'transition-colors text-left',
          )}
        >
          <div className="flex items-center justify-center h-7 w-7 rounded bg-[hsl(var(--outlook-blue)/0.18)] shrink-0">
            <FolderPlus className="h-3.5 w-3.5 text-[hsl(var(--outlook-blue))]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-[hsl(var(--outlook-blue))] truncate">
              {ctaLabel}
            </div>
            <div className="text-[10.5px] text-[hsl(var(--email-text-muted))] truncate">
              {linkedDealName
                ? 'Files will land in the Internal folder. AI suggests the best subfolder.'
                : 'AI will suggest the best deal — you can override before uploading.'}
            </div>
          </div>
          <span className="text-[10px] font-medium text-[hsl(var(--outlook-blue))] shrink-0 px-2 py-1 rounded bg-[hsl(var(--outlook-blue)/0.12)] group-hover:bg-[hsl(var(--outlook-blue)/0.2)] transition-colors">
            {selected.size > 0 ? `${selected.size} file${selected.size === 1 ? '' : 's'}` : `${uploadable.length} file${uploadable.length === 1 ? '' : 's'}`}
          </span>
        </button>
      )}

      {/* Inline success state */}
      {successInfo && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 mb-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span className="text-[12.5px] font-medium">
            {successInfo.count} attachment{successInfo.count === 1 ? '' : 's'} added to {successInfo.dealName} Data Room.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {visible.map((att, i) => {
          const filename = att.filename || 'Untitled attachment';
          const Icon = iconForType(att.content_type, filename);
          const label = fileLabel(filename, att.content_type);
          const sizeLabel = formatBytes(att.size);
          const isDownloading = downloadingId === att.id;
          const key = att.id || `${filename}-${i}`;
          const isSelectable = canSendToDataRoom && !!att.id;
          const isChecked = !!att.id && selected.has(att.id);

          return (
            <div
              key={key}
              className={cn(
                'group flex items-center gap-2 p-2.5 rounded-md text-left min-w-0',
                'border border-[hsl(var(--email-border))]',
                'bg-[hsl(var(--email-toolbar-bg))] hover:bg-[hsl(var(--email-reading-bg))]',
                'hover:border-[hsl(var(--outlook-blue)/0.5)] transition-colors',
                isChecked && 'border-[hsl(var(--outlook-blue)/0.6)] bg-[hsl(var(--outlook-blue)/0.06)]',
              )}
            >
              {isSelectable && (
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={(v) => att.id && toggleSelect(att.id, !!v)}
                  className="shrink-0"
                  aria-label={`Select ${filename}`}
                />
              )}
              <button
                type="button"
                onClick={() => handleDownload(att)}
                disabled={isDownloading || !att.id}
                className="flex items-center gap-2.5 flex-1 min-w-0 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div className="flex items-center justify-center h-9 w-9 rounded bg-[hsl(var(--email-list-bg))] border border-[hsl(var(--email-border))] shrink-0">
                  <Icon className="h-4 w-4 text-[hsl(var(--email-text-secondary))]" />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="text-[13px] font-medium text-[hsl(var(--email-text-primary))] truncate">{filename}</div>
                  <div className="text-[11px] text-[hsl(var(--email-text-muted))] flex items-center gap-1.5">
                    <span>{label}</span>
                    {sizeLabel && <><span>·</span><span>{sizeLabel}</span></>}
                  </div>
                </div>
                <div className="shrink-0 text-[hsl(var(--email-text-muted))] group-hover:text-[hsl(var(--outlook-blue))]">
                  {isDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                </div>
              </button>

              {isSelectable && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted/50 text-[hsl(var(--email-text-muted))] hover:text-foreground transition-colors shrink-0"
                      aria-label="More actions"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => openForOne(att)}>
                      <FolderPlus className="h-3.5 w-3.5 mr-2" />
                      Add to Data Room
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDownload(att)}>
                      <Download className="h-3.5 w-3.5 mr-2" />
                      Download
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          );
        })}
      </div>

      {dialogOpen && sourceEmail && (
        <SendToDataRoomDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          attachments={visible}
          messageId={messageId}
          threadData={threadData}
          sourceEmail={sourceEmail}
          initialDealId={linkedDealId}
          initialDealName={linkedDealName}
          preselectedAttachmentIds={preselectedIds}
          onUploaded={({ dealName, uploaded }) => {
            setSuccessInfo({ count: uploaded, dealName });
            setSelected(new Set());
          }}
        />
      )}
    </div>
  );
}
