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
  Sparkles,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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

/** Heuristic content-type tagging for the banner summary row. */
function inferDocTags(files: EmailAttachment[]): string[] {
  const tagSet = new Set<string>();
  for (const f of files) {
    const n = (f.filename || '').toLowerCase();
    if (/financial|fin\b|fs\b/.test(n)) tagSet.add('Financials');
    if (/balance.?sheet|bs\b/.test(n)) tagSet.add('Balance Sheet');
    if (/cash.?flow|cf\b/.test(n)) tagSet.add('Cash Flow');
    if (/p&?l|pnl|income/.test(n)) tagSet.add('P&L');
    if (/model|projection|forecast/.test(n)) tagSet.add('Model');
    if (/cap.?table/.test(n)) tagSet.add('Cap Table');
    if (/deck|pitch|presentation/.test(n)) tagSet.add('Deck');
    if (/contract|agreement|lease|nda|loi|term.?sheet/.test(n)) tagSet.add('Agreement');
    if (/invoice|receipt|statement/.test(n)) tagSet.add('Invoice');
    if (/tax|return|w-?9|1099/.test(n)) tagSet.add('Tax');
    if (/bank/.test(n)) tagSet.add('Bank Statement');
    if (/ar.?aging|ap.?aging|aging/.test(n)) tagSet.add('AR/AP Aging');
  }
  return Array.from(tagSet).slice(0, 4);
}

export function EmailAttachmentList({
  messageId,
  attachments,
  sourceEmail,
  threadData,
  linkedDealId,
  linkedDealName,
}: Props) {
  const navigate = useNavigate();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [preselectedIds, setPreselectedIds] = useState<string[] | undefined>(undefined);
  const [successInfo, setSuccessInfo] = useState<{ count: number; dealName: string; dealId?: string } | null>(null);

  // Show every non-inline attachment, even if some metadata is missing.
  const visible = useMemo(() => attachments.filter((a) => !a.is_inline), [attachments]);
  const uploadable = useMemo(() => visible.filter((a) => !!a.id), [visible]);
  const canSendToDataRoom = !!sourceEmail && uploadable.length > 0;

  // Default to all uploadable files selected.
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const isIncluded = (id?: string | null) => !!id && !excluded.has(id);
  const selectedFiles = useMemo(() => uploadable.filter((a) => isIncluded(a.id)), [uploadable, excluded]);
  const selectedCount = selectedFiles.length;
  const allIncluded = selectedCount === uploadable.length;
  const docTags = useMemo(() => inferDocTags(selectedFiles), [selectedFiles]);

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

  const toggleInclude = (id: string, include: boolean) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (include) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openCommit = () => {
    // Primary CTA: include only currently-checked files; skip the review step
    // by passing preselected ids — dialog still confirms with one click.
    setPreselectedIds(selectedFiles.map((a) => a.id!).filter(Boolean));
    setDialogOpen(true);
  };

  const openReview = () => {
    // Secondary CTA: open the dialog with all uploadable files for full review.
    setPreselectedIds(uploadable.map((a) => a.id!).filter(Boolean));
    setDialogOpen(true);
  };

  const openForOne = (att: EmailAttachment) => {
    if (!att.id) return;
    setPreselectedIds([att.id]);
    setDialogOpen(true);
  };

  const dealLabel = linkedDealName || 'Deal';
  const showAiContext = !linkedDealName; // Without an explicit link, we lean on AI suggestion in the banner copy
  const matchReason = linkedDealName
    ? 'Linked to this thread via deal association.'
    : 'Matched based on thread participants, subject line, and linked deal context.';

  // Header-level "Add to Data Room" CTA — visible only when the thread is
  // tied to a Deal (explicit link OR AI likely-match via sourceEmail flow).
  // Wires into the same SendToDataRoomDialog used by the AI Assist suggestion.
  const showHeaderDataRoomCta = canSendToDataRoom && !!linkedDealName;
  const headerCtaDealLabel = linkedDealName || dealLabel;
  const HeaderDataRoomButton = showHeaderDataRoomCta ? (
    <button
      type="button"
      onClick={openReview}
      aria-label={`Add attachments to ${headerCtaDealLabel} data room`}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold',
        'bg-[hsl(var(--outlook-blue)/0.12)] text-[hsl(var(--outlook-blue))]',
        'hover:bg-[hsl(var(--outlook-blue)/0.2)] transition-colors',
        'border border-[hsl(var(--outlook-blue)/0.3)]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--outlook-blue))] focus-visible:ring-offset-1 focus-visible:ring-offset-background',
      )}
    >
      <FolderPlus className="h-3 w-3" />
      <span>Add to Data Room</span>
    </button>
  ) : null;

  // ── Success state replaces the entire banner module ──────────
  if (successInfo) {
    return (
      <div className="mt-5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3.5">
          <div className="h-9 w-9 rounded-md bg-emerald-500/15 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-4.5 w-4.5 text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-emerald-300">
              {successInfo.count} {successInfo.count === 1 ? 'file' : 'files'} added to {successInfo.dealName} Data Room
            </div>
            <div className="text-[11px] text-emerald-400/70 mt-0.5">
              Filed under the deal's Internal folder. Provenance logged on the timeline.
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (successInfo.dealId) navigate(`/deals/${successInfo.dealId}?tab=documents`);
            }}
            disabled={!successInfo.dealId}
            className={cn(
              'shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium',
              'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            View Data Room
            <ExternalLink className="h-3 w-3" />
          </button>
        </div>
        {/* Compact file list rendered below for reference */}
        <div className="border-t border-emerald-500/15 bg-background/40 px-4 py-2.5">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <div className="flex items-center gap-1 shrink-0 text-[hsl(var(--email-text-muted))]">
              <Paperclip className="h-3 w-3" />
              <span className="text-[11px] font-medium tabular-nums leading-none">
                {visible.length}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
            {visible.map((att, i) => {
              const filename = att.filename || 'Untitled attachment';
              const Icon = iconForType(att.content_type, filename);
              return (
                <div
                  key={att.id || `${filename}-${i}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[12px] text-[hsl(var(--email-text-secondary))] backdrop-blur-sm shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] shadow-sm shadow-black/20"
                >
                  <Icon className="h-3.5 w-3.5 text-[hsl(var(--email-text-muted))] shrink-0" />
                  <span className="truncate flex-1">{filename}</span>
                </div>
              );
            })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Default: when no Data Room flow is available, render the simple list ──
  if (!canSendToDataRoom) {
    return (
      <div className="mt-3 flex items-center gap-2 px-2 py-1.5">
        <div
          className="flex items-center gap-1 shrink-0 text-[hsl(var(--email-text-muted))]"
          aria-label={`${visible.length} ${visible.length === 1 ? 'file' : 'files'}`}
        >
          <Paperclip className="h-3.5 w-3.5" />
          <span className="text-[11px] font-medium tabular-nums leading-none">
            {visible.length}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          {visible.map((att, i) => {
            const filename = att.filename || 'Untitled attachment';
            const Icon = iconForType(att.content_type, filename);
            const sizeLabel = formatBytes(att.size);
            const isDownloading = downloadingId === att.id;
            return (
              <button
                key={att.id || `${filename}-${i}`}
                type="button"
                onClick={() => handleDownload(att)}
                disabled={isDownloading || !att.id}
                title={filename}
                className={cn(
                  'group inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md text-left min-w-0 max-w-full',
                  'border border-white/10 bg-white/[0.04] backdrop-blur-md',
                  'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] shadow-sm shadow-black/20',
                  'hover:bg-white/[0.07] hover:border-white/15 transition-colors',
                  'disabled:opacity-60 disabled:cursor-not-allowed',
                )}
              >
                <Icon className="h-3 w-3 shrink-0 text-[hsl(var(--email-text-muted))]" />
                <span className="text-[11.5px] font-medium text-[hsl(var(--email-text-primary))] truncate max-w-[160px]">
                  {filename}
                </span>
                {sizeLabel && (
                  <span className="text-[10px] text-[hsl(var(--email-text-muted))] shrink-0">
                    {sizeLabel}
                  </span>
                )}
                <span className="shrink-0 text-[hsl(var(--email-text-muted))] group-hover:text-[hsl(var(--outlook-blue))]">
                  {isDownloading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Download className="h-3 w-3" />
                  )}
                </span>
              </button>
            );
          })}
          {HeaderDataRoomButton}
        </div>
      </div>
    );
  }

  // ── Unified workflow banner module ───────────────────────────
  return (
    <div className="mt-5 rounded-lg border border-[hsl(var(--outlook-blue)/0.35)] bg-gradient-to-br from-[hsl(var(--outlook-blue)/0.08)] to-[hsl(var(--outlook-blue)/0.02)] overflow-hidden shadow-[0_1px_0_hsl(var(--outlook-blue)/0.1)]">
      {/* Header — title + supporting copy */}
      <div className="px-4 pt-3.5 pb-3">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-md bg-[hsl(var(--outlook-blue)/0.15)] flex items-center justify-center shrink-0">
            <FolderPlus className="h-4 w-4 text-[hsl(var(--outlook-blue))]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="text-[13.5px] font-semibold text-[hsl(var(--email-text-primary))] leading-snug">
                Ready to add these files to <span className="text-[hsl(var(--outlook-blue))]">{dealLabel}</span> Data Room
              </div>
              {HeaderDataRoomButton}
            </div>
            <p className="text-[11.5px] text-[hsl(var(--email-text-muted))] mt-0.5 leading-relaxed">
              We found {visible.length} {visible.length === 1 ? 'attachment' : 'attachments'} in this thread.
              Review, deselect any you do not want, and send them to the deal data room in one step.
            </p>
          </div>
        </div>

        {/* AI context strip */}
        <div className="mt-3 flex items-start gap-1.5 text-[11px] text-[hsl(var(--email-text-secondary))] bg-background/30 rounded-md px-2.5 py-1.5 border border-[hsl(var(--outlook-blue)/0.15)]">
          <Sparkles className="h-3 w-3 text-[hsl(var(--outlook-blue))] mt-[2px] shrink-0" />
          <div className="min-w-0 flex-1 leading-snug">
            <span className="text-[hsl(var(--email-text-primary))] font-medium">
              {showAiContext ? 'Suggested deal: ' : 'Linked deal: '}
            </span>
            <span className="text-[hsl(var(--outlook-blue))] font-medium">{dealLabel}</span>
            <span className="text-[hsl(var(--email-text-muted))]"> — {matchReason}</span>
          </div>
        </div>

        {/* Summary row */}
        <div className="mt-2.5 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="font-semibold text-[hsl(var(--email-text-primary))]">
              {selectedCount} of {uploadable.length} {uploadable.length === 1 ? 'file' : 'files'} selected
            </span>
            {docTags.length > 0 && (
              <>
                <span className="text-[hsl(var(--email-text-muted))]">·</span>
                <span className="text-[hsl(var(--email-text-muted))]">Likely matches:</span>
                <span className="text-[hsl(var(--email-text-secondary))] font-medium">
                  {docTags.join(', ')}
                </span>
              </>
            )}
          </div>
          {uploadable.length > 1 && (
            <button
              type="button"
              onClick={() => setExcluded(allIncluded ? new Set(uploadable.map((a) => a.id!)) : new Set())}
              className="text-[11px] text-[hsl(var(--outlook-blue))] hover:underline"
            >
              {allIncluded ? 'Deselect all' : 'Select all'}
            </button>
          )}
        </div>

        {/* CTA row */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={openCommit}
            disabled={selectedCount === 0}
            className={cn(
              'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[12.5px] font-semibold',
              'bg-[hsl(var(--outlook-blue))] text-white shadow-sm',
              'hover:bg-[hsl(var(--outlook-blue)/0.9)] transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            <FolderPlus className="h-3.5 w-3.5" />
            Add {selectedCount > 0 ? `${selectedCount} ` : ''}Selected to {dealLabel} Data Room
            <ArrowRight className="h-3 w-3 ml-0.5" />
          </button>
          <button
            type="button"
            onClick={openReview}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-[12px] font-medium text-[hsl(var(--email-text-secondary))] hover:text-[hsl(var(--email-text-primary))] hover:bg-background/50 transition-colors border border-[hsl(var(--email-border))]"
          >
            Review before upload
          </button>
          <button
            type="button"
            onClick={openReview}
            className="ml-auto inline-flex items-center gap-1 px-2 py-1.5 rounded text-[11px] text-[hsl(var(--email-text-muted))] hover:text-[hsl(var(--outlook-blue))] transition-colors"
          >
            Change deal
          </button>
        </div>
      </div>

      {/* Connected file list — visually part of the same module */}
      <div className="border-t border-[hsl(var(--outlook-blue)/0.2)] bg-background/30 px-4 py-3">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex items-center gap-1 shrink-0 text-[hsl(var(--email-text-muted))]">
            <Paperclip className="h-3 w-3" />
            <span className="text-[11px] font-medium tabular-nums leading-none">
              {visible.length}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          {visible.map((att, i) => {
            const filename = att.filename || 'Untitled attachment';
            const Icon = iconForType(att.content_type, filename);
            const sizeLabel = formatBytes(att.size);
            const isDownloading = downloadingId === att.id;
            const key = att.id || `${filename}-${i}`;
            const selectable = !!att.id;
            const included = isIncluded(att.id);

            return (
              <div
                key={key}
                className={cn(
                  'group inline-flex items-center gap-2 px-2 py-1.5 rounded-md text-left min-w-0 max-w-full border backdrop-blur-md transition-colors',
                  'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] shadow-sm shadow-black/20',
                  included
                    ? 'border-white/10 bg-white/[0.05] hover:bg-white/[0.08]'
                    : 'border-border/40 bg-white/[0.025] opacity-70 hover:opacity-100 hover:bg-white/[0.05]',
                )}
              >
                {selectable ? (
                  <Checkbox
                    checked={included}
                    onCheckedChange={(v) => att.id && toggleInclude(att.id, !!v)}
                    className="shrink-0"
                    aria-label={`Include ${filename}`}
                  />
                ) : (
                  <div className="w-4 shrink-0" />
                )}
                <button
                  type="button"
                  onClick={() => handleDownload(att)}
                  disabled={isDownloading || !att.id}
                  className="flex items-center gap-1.5 flex-1 min-w-0 disabled:cursor-not-allowed"
                >
                  <Icon className="h-3 w-3 shrink-0 text-[hsl(var(--email-text-muted))]" />
                  <span className="truncate text-[11.5px] font-medium text-[hsl(var(--email-text-primary))] leading-none">
                    {filename}
                  </span>
                  {sizeLabel && (
                    <span className="shrink-0 text-[10px] text-[hsl(var(--email-text-muted))] leading-none">
                      {sizeLabel}
                    </span>
                  )}
                  <div className="shrink-0 text-[hsl(var(--email-text-muted))] opacity-0 group-hover:opacity-100 transition-opacity">
                    {isDownloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                  </div>
                </button>

                {selectable && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        onClick={(e) => e.stopPropagation()}
                        className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted/50 text-[hsl(var(--email-text-muted))] hover:text-foreground transition-colors shrink-0 opacity-0 group-hover:opacity-100"
                        aria-label="More actions"
                      >
                        <MoreHorizontal className="h-3 w-3" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => openForOne(att)}>
                        <FolderPlus className="h-3.5 w-3.5 mr-2" />
                        Add only this to Data Room
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
        </div>
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
            setSuccessInfo({ count: uploaded, dealName, dealId: linkedDealId });
          }}
        />
      )}
    </div>
  );
}
