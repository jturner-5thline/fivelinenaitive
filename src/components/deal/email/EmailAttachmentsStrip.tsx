import { useEffect, useMemo, useState } from 'react';
import {
  Paperclip,
  Download,
  FileText,
  FileImage,
  FileSpreadsheet,
  FileArchive,
  File as FileIconLucide,
  Loader2,
  ChevronDown,
  ExternalLink,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { EmailAttachment, EmailThread, MockEmail } from './mockEmailData';
import { downloadAttachment, fetchFullEmailMessage, openAttachmentInNewTab } from './useFullEmailMessage';

/**
 * EmailAttachmentsStrip
 * ──────────────────────
 * A compact, thread-aggregated attachments strip rendered at the very top of
 * an opened email thread/message — directly below the subject/header area
 * and above the body. One source of truth for both:
 *   • the main Email widget detail view (EmailListAndDetail.tsx), and
 *   • the Daily Briefing in-tab email detail pane (DailyBriefingModal.tsx).
 *
 * Behaviour:
 *   • Aggregates non-inline attachments across every message in the thread.
 *   • For messages flagged `has_attachments` but not yet hydrated, lazily
 *     fetches the full message via the `gmail-messages` edge function so the
 *     strip is complete without requiring the user to expand each message.
 *   • Sorts newest-first by the source message timestamp.
 *   • If the same filename appears multiple times, the latest is shown first
 *     and older copies are tagged "Older v2", "Older v3", etc.
 *   • Each card opens/downloads the file in one click, with the source
 *     sender + timestamp surfaced in a tooltip.
 */

export interface EmailAttachmentsStripProps {
  thread: Pick<EmailThread, 'emails'>;
  className?: string;
  /**
   * `block` (default): full-width labeled card rendered above the body.
   * `inline`: compact, no header/border — drops chips directly into another
   * horizontal row (e.g. the email detail action / command bar). Excess
   * attachments collapse into a "+N more" popover so the action row stays
   * legible even on narrow widths.
   */
  variant?: 'block' | 'inline';
  /** Inline-only: how many chips to render before collapsing to "+N more". */
  maxInline?: number;
  /**
   * Force the row to stay mounted even if provider attachment metadata has not
   * materialized yet. Used by detail panes that already know the selected
   * message/thread likely contains files.
   */
  forceVisible?: boolean;
  /** Extra loading signal from the host pane (e.g. thread hydration in Daily Briefing). */
  loadingOverride?: boolean;
  /**
   * Explicit fallback copy from the host pane when the thread references an
   * attachment but the provider returned no attachment metadata.
   */
  fallbackReason?: string | null;
}

interface AggregatedAttachment {
  attachment: EmailAttachment;
  /** The message this attachment came from. */
  source: MockEmail;
  /** Latest=1, then 2, 3 … for older same-name copies. */
  versionRank: number;
  /** True for any rank > 1 (i.e. an older copy of a same-named file). */
  isOlder: boolean;
}

interface ResolvedAttachmentDebug {
  messageId: string;
  hasAttachments: boolean;
  filenames: string[];
  attachmentIds: string[];
}

const ATTACHMENT_REFERENCE_PATTERNS = [
  /\bplease\s+find\s+attached\b/i,
  /\bsee\s+(?:the\s+)?(?:attached|attachment)\b/i,
  /\battached\s+is\b/i,
  /\battached\s+are\b/i,
  /\b(?:file|files|document|documents|proposal|term\s*sheet|outline|deck|model|pdf|xlsx?)\s+attached\b/i,
  /\battachment(?:s)?\b/i,
  /\benclosed\b/i,
];

function formatBytes(bytes: number | undefined): string {
  if (!bytes || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function iconForType(contentType: string | undefined, filename: string) {
  const t = (contentType || '').toLowerCase();
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (t.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return FileImage;
  if (t.includes('pdf') || ext === 'pdf') return FileText;
  if (t.includes('sheet') || t.includes('excel') || ['xlsx', 'xls', 'csv'].includes(ext)) return FileSpreadsheet;
  if (t.includes('zip') || t.includes('compressed') || ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return FileArchive;
  if (t.includes('word') || ['doc', 'docx', 'txt', 'rtf'].includes(ext)) return FileText;
  return FileIconLucide;
}

function fileLabel(filename: string, contentType: string | undefined): string {
  const ext = (filename.split('.').pop() || '').toUpperCase();
  if (ext && ext.length <= 5 && filename.includes('.')) return ext;
  if (contentType?.includes('pdf')) return 'PDF';
  if (contentType?.startsWith('image/')) return 'IMAGE';
  return 'FILE';
}

function flattenText(value: string | undefined): string {
  if (!value) return '';
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function detectAttachmentFallbackReason(emails: Pick<MockEmail, 'subject' | 'snippet' | 'body_preview' | 'body_text' | 'body_html'>[]): string | null {
  const mentionsAttachment = emails.some((email) => {
    const haystack = [
      email.subject,
      email.snippet,
      email.body_preview,
      email.body_text,
      flattenText(email.body_html),
    ].join(' ');
    return ATTACHMENT_REFERENCE_PATTERNS.some((pattern) => pattern.test(haystack));
  });

  if (!mentionsAttachment) return null;
  return 'This thread references an attachment, but file details are still loading or unavailable.';
}

/**
 * Lazily resolve attachments for any thread message that has
 * `has_attachments` but no hydrated `attachments[]` yet. Fires one fetch per
 * unhydrated message, deduped by message id, and merges results into the
 * returned map keyed by message id.
 */
function useResolvedThreadAttachments(emails: MockEmail[]): {
  attachmentsByMessage: Record<string, EmailAttachment[]>;
  loading: boolean;
  unresolvedCount: number;
  debug: ResolvedAttachmentDebug[];
} {
  const [extra, setExtra] = useState<Record<string, EmailAttachment[]>>({});
  const [loading, setLoading] = useState(false);

  // Stable key: ids of messages that need a fetch. We do not trust only
  // `has_attachments` because provider list rows can miss nested MIME-part
  // attachments even when the body clearly references an attached file.
  const needFetchIds = useMemo(() => {
    const ids: string[] = [];
    for (const e of emails) {
      if (!e.id || e.id.startsWith('mock-')) continue;
      const known = e.attachments && e.attachments.length > 0;
      if (!known && extra[e.id] === undefined) {
        ids.push(e.id);
      }
    }
    return ids;
  }, [emails, extra]);

  useEffect(() => {
    if (needFetchIds.length === 0) return;
    let cancelled = false;
    setLoading(true);
    Promise.all(
      needFetchIds.map(async (messageId) => {
        try {
          const m = await fetchFullEmailMessage(messageId);
          const atts: EmailAttachment[] = Array.isArray(m.attachments) ? m.attachments : [];
          return [messageId, atts] as const;
        } catch {
          return [messageId, [] as EmailAttachment[]] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setExtra((prev) => {
        const next = { ...prev };
        for (const [id, atts] of entries) next[id] = atts;
        return next;
      });
      setLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [needFetchIds]);

  const attachmentsByMessage = useMemo(() => {
    const map: Record<string, EmailAttachment[]> = {};
    for (const e of emails) {
      const fromProp = e.attachments && e.attachments.length > 0 ? e.attachments : null;
      const fromFetch = extra[e.id];
      map[e.id] = fromProp ?? fromFetch ?? [];
    }
    return map;
  }, [emails, extra]);

  const debug = useMemo<ResolvedAttachmentDebug[]>(() => (
    emails.map((email) => {
      const attachments = attachmentsByMessage[email.id] || [];
      return {
        messageId: email.id,
        hasAttachments: email.has_attachments,
        filenames: attachments.filter((att) => !att.is_inline).map((att) => att.filename || 'attachment'),
        attachmentIds: attachments.filter((att) => !att.is_inline).map((att) => att.id || ''),
      };
    })
  ), [attachmentsByMessage, emails]);

  return { attachmentsByMessage, loading, unresolvedCount: needFetchIds.length, debug };
}

export function EmailAttachmentsStrip({
  thread,
  className,
  variant = 'block',
  maxInline = 2,
  forceVisible = false,
  loadingOverride = false,
  fallbackReason,
}: EmailAttachmentsStripProps) {
  const emails = thread.emails;
  const { attachmentsByMessage, loading, unresolvedCount, debug } = useResolvedThreadAttachments(emails);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [openingKey, setOpeningKey] = useState<string | null>(null);

  // Build the aggregated, newest-first list with version ranking by filename.
  const aggregated = useMemo<AggregatedAttachment[]>(() => {
    // Sort emails newest-first regardless of caller order.
    const sortedEmails = [...emails].sort(
      (a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime(),
    );
    const out: AggregatedAttachment[] = [];
    for (const email of sortedEmails) {
      const list = attachmentsByMessage[email.id] || [];
      for (const att of list) {
        if (att.is_inline) continue;
        out.push({ attachment: att, source: email, versionRank: 1, isOlder: false });
      }
    }
    // Rank duplicates by filename (case-insensitive). Latest already first.
    const seen: Record<string, number> = {};
    for (const item of out) {
      const key = (item.attachment.filename || 'untitled').toLowerCase();
      seen[key] = (seen[key] ?? 0) + 1;
      item.versionRank = seen[key];
      item.isOlder = item.versionRank > 1;
    }
    return out;
  }, [emails, attachmentsByMessage]);

  // Render nothing only when the thread gives us zero signal that attachments
  // exist. Otherwise keep the row visible with loading/fallback messaging.
  const anyMessageClaimsAttachments = emails.some((e) => e.has_attachments);
  const inferredFallbackReason = fallbackReason ?? detectAttachmentFallbackReason(emails);
  const shouldShowFallback = forceVisible || anyMessageClaimsAttachments || !!inferredFallbackReason;
  const hasPendingHydration = loading || loadingOverride || unresolvedCount > 0 || emails.some((e) => !e.id?.startsWith('mock-') && !attachmentsByMessage[e.id]);
  if (aggregated.length === 0 && !hasPendingHydration && !shouldShowFallback) return null;

  const handleOpen = async (item: AggregatedAttachment) => {
    const att = item.attachment;
    if (!att.id) {
      toast.error('Attachment unavailable');
      return;
    }
    const key = `${item.source.id}:${att.id}`;
    setDownloadingKey(key);
    try {
      // `downloadAttachment` triggers a browser download. For supported
      // viewable types the browser will preview them in a new tab when the
      // server responds with the right content-type — for everything else
      // this is the universal one-click open path used elsewhere in the app.
      await downloadAttachment(item.source.id, att);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to open attachment');
    } finally {
      setDownloadingKey(null);
    }
  };

  const handlePreview = async (item: AggregatedAttachment) => {
    const att = item.attachment;
    if (!att.id) {
      toast.error('Attachment unavailable');
      return;
    }
    const key = `${item.source.id}:${att.id}`;
    setOpeningKey(key);
    try {
      await openAttachmentInNewTab(item.source.id, att);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to open attachment');
    } finally {
      setOpeningKey(null);
    }
  };

  // Reusable chip renderer — used by both the block list and the inline /
  // "+N more" popover so behaviour stays identical across surfaces.
  const renderChip = (item: AggregatedAttachment, opts?: { compact?: boolean }) => {
    const att = item.attachment;
    const filename = att.filename || 'Untitled attachment';
    const Icon = iconForType(att.content_type, filename);
    const label = fileLabel(filename, att.content_type);
    const sizeLabel = formatBytes(att.size);
    const key = `${item.source.id}:${att.id || filename}`;
    const isDownloading = downloadingKey === key;
    const sender = item.source.from_name || item.source.from_email || 'Unknown';
    const ts = item.source.received_at
      ? format(new Date(item.source.received_at), "MMM d, yyyy 'at' h:mm a")
      : '';
    const compact = !!opts?.compact;

    return (
      <Tooltip key={key} delayDuration={200}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => handleOpen(item)}
            disabled={isDownloading || !att.id}
            className={cn(
              'group inline-flex items-center min-w-0',
              compact
                ? 'gap-1.5 max-w-[180px] pl-1 pr-1.5 py-0.5 rounded-md text-left'
                : 'gap-2 max-w-[260px] pl-1.5 pr-2 py-1 rounded-md text-left',
              'border border-white/10 bg-white/[0.04] backdrop-blur-md',
              'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] shadow-sm shadow-black/20',
              'hover:bg-white/[0.07] hover:border-white/15 transition-colors',
              'disabled:opacity-60 disabled:cursor-not-allowed',
              item.isOlder && 'opacity-80',
            )}
            aria-label={`Open ${filename} from ${sender}`}
          >
            <span
              className={cn(
                'flex items-center justify-center rounded bg-muted/40 border border-border/40 shrink-0',
                compact ? 'h-5 w-5' : 'h-7 w-7',
              )}
            >
              <Icon className={cn('text-foreground/70', compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
            </span>
            <span className="flex flex-col min-w-0">
              <span
                className={cn(
                  'font-medium text-foreground truncate leading-tight',
                  compact ? 'text-[11px]' : 'text-[12px]',
                )}
              >
                {filename}
              </span>
              {!compact && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-1 leading-tight">
                  <span>{label}</span>
                  {sizeLabel && (
                    <>
                      <span>·</span>
                      <span>{sizeLabel}</span>
                    </>
                  )}
                  {item.isOlder && (
                    <>
                      <span>·</span>
                      <span className="text-amber-400/80">Older v{item.versionRank}</span>
                    </>
                  )}
                </span>
              )}
            </span>
            <span className="shrink-0 text-muted-foreground/70 group-hover:text-primary ml-1">
              {isDownloading ? (
                <Loader2 className={cn('animate-spin', compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
              ) : (
                <Download className={cn(compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
              )}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-[11px] max-w-[280px]">
          <div className="font-medium">{filename}</div>
          <div className="text-muted-foreground mt-0.5">
            From <span className="text-foreground/80">{sender}</span>
            {ts && <span> · {ts}</span>}
            {sizeLabel && <span> · {sizeLabel}</span>}
          </div>
          {item.isOlder && (
            <div className="text-amber-300/90 mt-0.5">
              Older version (v{item.versionRank}) of this filename
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    );
  };

  // Rich row used inside the "+N more" overflow popover. Shows the full,
  // wrapping filename with explicit type, size, sender, and timestamp metadata
  // plus separate one-click Open (preview in new tab) and Download actions
  // for every attachment.
  const renderOverflowRow = (item: AggregatedAttachment) => {
    const att = item.attachment;
    const filename = att.filename || 'Untitled attachment';
    const Icon = iconForType(att.content_type, filename);
    const label = fileLabel(filename, att.content_type);
    const sizeLabel = formatBytes(att.size);
    const key = `${item.source.id}:${att.id || filename}`;
    const isDownloading = downloadingKey === key;
    const isOpening = openingKey === key;
    const sender = item.source.from_name || item.source.from_email || 'Unknown';
    const ts = item.source.received_at
      ? format(new Date(item.source.received_at), "MMM d, yyyy 'at' h:mm a")
      : '';
    const disabled = !att.id;

    return (
      <div
        key={key}
        className={cn(
          'group flex items-start gap-2.5 rounded-md border border-border/50 bg-background/40',
          'p-2 hover:bg-background/70 hover:border-primary/30 transition-colors',
          item.isOlder && 'opacity-90',
        )}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted/40 border border-border/40">
          <Icon className="h-4 w-4 text-foreground/70" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-medium text-foreground break-all leading-snug">
            {filename}
          </div>
          <div className="mt-0.5 text-[10.5px] text-muted-foreground flex flex-wrap items-center gap-x-1 gap-y-0.5 leading-tight">
            <span className="font-medium text-foreground/70">{label}</span>
            {sizeLabel && (<><span>·</span><span>{sizeLabel}</span></>)}
            <span>·</span>
            <span className="truncate max-w-[160px]">From {sender}</span>
            {ts && (<><span>·</span><span>{ts}</span></>)}
            {item.isOlder && (
              <>
                <span>·</span>
                <span className="text-amber-400/80">Older v{item.versionRank}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => handlePreview(item)}
                disabled={disabled || isOpening || isDownloading}
                className={cn(
                  'inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/50 bg-background/40',
                  'hover:bg-background/70 hover:border-primary/40 text-foreground/70 hover:text-primary',
                  'transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                )}
                aria-label={`Open ${filename} in new tab`}
              >
                {isOpening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-[11px]">Open in new tab</TooltipContent>
          </Tooltip>
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => handleOpen(item)}
                disabled={disabled || isOpening || isDownloading}
                className={cn(
                  'inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/50 bg-background/40',
                  'hover:bg-background/70 hover:border-primary/40 text-foreground/70 hover:text-primary',
                  'transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                )}
                aria-label={`Download ${filename}`}
              >
                {isDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-[11px]">Download</TooltipContent>
          </Tooltip>
        </div>
      </div>
    );
  };

  // ── Inline variant ──────────────────────────────────────────────
  // Renders compact chips directly into a host action/command row.
  // Shows up to `maxInline` chips inline, then a "+N more" popover.
  if (variant === 'inline') {
    if (aggregated.length === 0 && (hasPendingHydration || shouldShowFallback)) {
      return (
        <div className={cn('inline-flex items-center gap-1.5 min-w-0', className)}>
          <Paperclip className="h-3 w-3 text-muted-foreground/70 shrink-0" />
          {hasPendingHydration ? (
            <div className="inline-flex items-center gap-1.5">
              <span className="h-6 w-[112px] rounded-md border border-border/40 bg-background/35 animate-pulse" />
              <span className="h-6 w-[88px] rounded-md border border-border/40 bg-background/25 animate-pulse hidden md:inline-flex" />
            </div>
          ) : (
            <div className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-dashed border-border/60 bg-background/30 px-2 py-1 text-[11px] text-muted-foreground">
              <span className="truncate">{inferredFallbackReason || 'Attachment referenced — file details unavailable.'}</span>
            </div>
          )}
        </div>
      );
    }
    if (aggregated.length === 0) return null;

    const visible = aggregated.slice(0, maxInline);
    const overflow = aggregated.slice(maxInline);

    return (
      <div className={cn('inline-flex items-center gap-1.5 min-w-0', className)}>
        <Paperclip className="h-3 w-3 text-muted-foreground/70 shrink-0" />
        {visible.map((item) => renderChip(item, { compact: true }))}
        {overflow.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  'inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-medium',
                  'border border-border/50 bg-background/40 hover:bg-background/70',
                  'hover:border-primary/40 transition-colors text-foreground/80',
                )}
                aria-label={`Show ${overflow.length} more attachments`}
              >
                +{overflow.length} more
                <ChevronDown className="h-3 w-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              side="bottom"
              className="p-2 w-[380px] max-h-[60vh] overflow-y-auto"
            >
              <div className="text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
                <Paperclip className="h-3 w-3" />
                <span>{aggregated.length} files</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {aggregated.map((item) => renderOverflowRow(item))}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    );
  }

  // ── Block variant (default) ─────────────────────────────────────
  return (
    <div
      className={cn(
        'px-2 py-1.5',
        className,
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex items-center gap-1 shrink-0 text-muted-foreground/80">
          <Paperclip className="h-3 w-3 shrink-0" />
          <span className="text-[11px] font-medium tabular-nums leading-none">
            {aggregated.length > 0 ? aggregated.length : hasPendingHydration ? '…' : '0'}
          </span>
          {(loading || loadingOverride) && (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/60" />
          )}
        </div>

        {aggregated.length === 0 ? (
          hasPendingHydration ? (
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
              <span className="h-7 w-[176px] rounded-md border border-border/40 bg-background/35 animate-pulse" />
              <span className="h-7 w-[148px] rounded-md border border-border/40 bg-background/25 animate-pulse" />
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
              <div className="inline-flex min-w-0 items-center px-2 py-1.5 text-[11px] text-muted-foreground">
                <span className="truncate">{inferredFallbackReason || 'File details unavailable.'}</span>
              </div>
            </div>
          )
        ) : (
          <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
            {aggregated.map((item) => renderChip(item, { compact: true }))}
          </div>
        )}
      </div>
    </div>
  );
}