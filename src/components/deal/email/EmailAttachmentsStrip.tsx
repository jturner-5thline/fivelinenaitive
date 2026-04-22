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
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { EmailAttachment, EmailThread, MockEmail } from './mockEmailData';
import { downloadAttachment } from './useFullEmailMessage';

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

/**
 * Lazily resolve attachments for any thread message that has
 * `has_attachments` but no hydrated `attachments[]` yet. Fires one fetch per
 * unhydrated message, deduped by message id, and merges results into the
 * returned map keyed by message id.
 */
function useResolvedThreadAttachments(emails: MockEmail[]): {
  attachmentsByMessage: Record<string, EmailAttachment[]>;
  loading: boolean;
} {
  const [extra, setExtra] = useState<Record<string, EmailAttachment[]>>({});
  const [loading, setLoading] = useState(false);

  // Stable key: ids of messages that need a fetch (has_attachments, no
  // hydrated attachments yet, real provider id — not mock).
  const needFetchIds = useMemo(() => {
    const ids: string[] = [];
    for (const e of emails) {
      if (!e.id || e.id.startsWith('mock-')) continue;
      const known = e.attachments && e.attachments.length > 0;
      if (e.has_attachments && !known && extra[e.id] === undefined) {
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
          const { data, error } = await supabase.functions.invoke('gmail-messages', {
            body: { action: 'get', message_id: messageId },
          });
          if (error) return [messageId, [] as EmailAttachment[]] as const;
          const m = data?.message;
          const atts: EmailAttachment[] = Array.isArray(m?.attachments) ? m.attachments : [];
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

  return { attachmentsByMessage, loading };
}

export function EmailAttachmentsStrip({ thread, className }: EmailAttachmentsStripProps) {
  const emails = thread.emails;
  const { attachmentsByMessage, loading } = useResolvedThreadAttachments(emails);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

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

  // Render nothing if no attachments anywhere in the thread (and nothing to load).
  const anyMessageClaimsAttachments = emails.some((e) => e.has_attachments);
  if (aggregated.length === 0 && !loading && !anyMessageClaimsAttachments) return null;
  if (aggregated.length === 0 && !loading) return null;

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

  return (
    <div
      className={cn(
        'rounded-lg border border-border/40 bg-white/[0.02]',
        'px-3 py-2.5',
        className,
      )}
    >
      <div className="flex items-center gap-1.5 mb-2 text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wide">
        <Paperclip className="h-3 w-3" />
        <span>
          Attachments
          {aggregated.length > 0 && (
            <span className="ml-1 text-muted-foreground/60 normal-case font-normal tracking-normal">
              · {aggregated.length}
            </span>
          )}
        </span>
        {loading && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/60 ml-1" />
        )}
      </div>

      {aggregated.length === 0 ? (
        <div className="text-[11px] text-muted-foreground py-1">
          Loading attachments…
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {aggregated.map((item) => {
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

            return (
              <Tooltip key={key} delayDuration={200}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => handleOpen(item)}
                    disabled={isDownloading || !att.id}
                    className={cn(
                      'group inline-flex items-center gap-2 max-w-[260px] min-w-0',
                      'pl-1.5 pr-2 py-1 rounded-md text-left',
                      'border border-border/50 bg-background/40 hover:bg-background/70',
                      'hover:border-primary/40 transition-colors',
                      'disabled:opacity-60 disabled:cursor-not-allowed',
                      item.isOlder && 'opacity-80',
                    )}
                    aria-label={`Open ${filename} from ${sender}`}
                  >
                    <span className="flex items-center justify-center h-7 w-7 rounded bg-muted/40 border border-border/40 shrink-0">
                      <Icon className="h-3.5 w-3.5 text-foreground/70" />
                    </span>
                    <span className="flex flex-col min-w-0">
                      <span className="text-[12px] font-medium text-foreground truncate leading-tight">
                        {filename}
                      </span>
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
                    </span>
                    <span className="shrink-0 text-muted-foreground/70 group-hover:text-primary ml-1">
                      {isDownloading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[11px] max-w-[280px]">
                  <div className="font-medium">{filename}</div>
                  <div className="text-muted-foreground mt-0.5">
                    From <span className="text-foreground/80">{sender}</span>
                    {ts && <span> · {ts}</span>}
                  </div>
                  {item.isOlder && (
                    <div className="text-amber-300/90 mt-0.5">
                      Older version (v{item.versionRank}) of this filename
                    </div>
                  )}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      )}
    </div>
  );
}