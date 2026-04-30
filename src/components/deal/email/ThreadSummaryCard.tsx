import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ChevronDown, FileText, AlertTriangle, CheckCircle2, Clock, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import type { EmailThread } from './mockEmailData';

interface ThreadSummary {
  summary: string;
  key_decisions: string[];
  open_items: string[];
}

interface Props {
  thread: EmailThread;
  dealId?: string;
  /**
   * Visual variant of the trigger.
   * - `card` (default): legacy expandable card (kept for back-compat).
   * - `inline-button`: compact pill-style trigger that opens a glass popover.
   *   Used in the thread header under the "N messages" count.
   */
  variant?: 'card' | 'inline-button';
  /** Optional className for the trigger element (inline-button variant). */
  className?: string;
}

/**
 * ThreadSummaryCard
 * -----------------
 * Auto-generated, collapsed-by-default summary card shown at the top of the
 * AI Assist sidebar for multi-message threads. Renders a 2-3 sentence
 * summary, key decisions, and open items. Cached per-thread in
 * sessionStorage so re-opening is instant.
 *
 * Hidden entirely for single-message threads.
 */
export function ThreadSummaryCard({ thread, dealId, variant = 'card', className }: Props) {
  const messageCount = thread.emails?.length ?? 0;
  const isMultiMessage = messageCount > 1;

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<ThreadSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef<Promise<void> | null>(null);

  const cacheKey = useMemo(() => {
    const latestId =
      thread.latestEmail?.id ||
      ((thread.latestEmail as any)?.gmail_message_id as string | undefined) ||
      '';
    return `naitive.threadSummary.${thread.threadId}::${latestId}`;
  }, [thread.threadId, thread.latestEmail?.id]);

  const readCache = useCallback((): ThreadSummary | null => {
    try {
      const raw = sessionStorage.getItem(cacheKey);
      return raw ? (JSON.parse(raw) as ThreadSummary) : null;
    } catch {
      return null;
    }
  }, [cacheKey]);

  const writeCache = useCallback(
    (next: ThreadSummary) => {
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [cacheKey],
  );

  const generate = useCallback(async () => {
    if (inflight.current) return inflight.current;
    setError(null);
    setLoading(true);
    const work = (async () => {
      try {
        const threadData = {
          subject: thread.subject,
          threadId: thread.threadId,
          emails: thread.emails.slice(0, 8).map((e) => ({
            from_name: e.from_name,
            from_email: e.from_email,
            to_name: e.to_name,
            to_email: e.to_email,
            subject: e.subject,
            body_preview: (e.body_preview || '').substring(0, 1500),
            received_at: e.received_at,
            snippet: e.snippet,
          })),
          latestEmail: thread.latestEmail,
        };
        const { data, error: fnError } = await supabase.functions.invoke('smart-email-ai', {
          body: {
            action: 'summarize_thread',
            dealId,
            threadData,
          },
        });
        if (fnError) throw fnError;
        if (data?.error) throw new Error(data.error);
        const r = data?.result;
        if (!r || r.raw) throw new Error('Invalid summary response');
        const next: ThreadSummary = {
          summary: r.summary || '',
          key_decisions: Array.isArray(r.key_decisions) ? r.key_decisions : [],
          open_items: Array.isArray(r.open_items) ? r.open_items : [],
        };
        setSummary(next);
        writeCache(next);
      } catch (err: any) {
        console.error('[ThreadSummary] error:', err?.message || err);
        setError(err?.message || 'Failed to summarize thread');
      } finally {
        setLoading(false);
        inflight.current = null;
      }
    })();
    inflight.current = work;
    return work;
  }, [thread, dealId, writeCache]);

  // Auto-fetch on mount / thread change for multi-message threads.
  useEffect(() => {
    if (!isMultiMessage) return;
    const cached = readCache();
    if (cached) {
      setSummary(cached);
      return;
    }
    setSummary(null);
    void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.threadId, thread.latestEmail?.id, isMultiMessage]);

  if (!isMultiMessage) return null;

  const hasContent = !!summary && (
    !!summary.summary ||
    summary.key_decisions.length > 0 ||
    summary.open_items.length > 0
  );

  // Shared body rendered in both the legacy card and the popover variant.
  // Radix Popover already handles outside-click dismissal, Escape, and
  // returns focus to the trigger — so the popover variant is fully
  // accessible without bespoke handlers.
  const body = (
    <div className="space-y-3">
      {error && (
            <div className="flex items-start gap-2 text-[11px] text-destructive">
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p>{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-1.5 h-6 text-[10px] gap-1 px-2"
                  onClick={() => void generate()}
                >
                  <RefreshCw className="h-2.5 w-2.5" /> Retry
                </Button>
              </div>
            </div>
          )}

          {loading && !summary && (
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-11/12" />
              <Skeleton className="h-3 w-9/12" />
            </div>
          )}

          {summary && summary.summary && (
            <p className="text-[12px] leading-relaxed text-foreground/85 break-words" style={{ overflowWrap: 'anywhere' }}>
              {summary.summary}
            </p>
          )}

          {summary && summary.key_decisions.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 mb-1.5">
                <CheckCircle2 className="h-3 w-3 text-emerald-400/80" />
                Key decisions
              </div>
              <ul className="space-y-1">
                {summary.key_decisions.map((d, i) => (
                  <li
                    key={i}
                    className="text-[11.5px] leading-snug text-foreground/85 pl-3 relative break-words"
                    style={{ overflowWrap: 'anywhere' }}
                  >
                    <span className="absolute left-0 top-[0.45rem] h-1 w-1 rounded-full bg-emerald-400/70" />
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {summary && summary.open_items.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 mb-1.5">
                <Clock className="h-3 w-3 text-amber-400/80" />
                Open items
              </div>
              <ul className="space-y-1">
                {summary.open_items.map((d, i) => (
                  <li
                    key={i}
                    className="text-[11.5px] leading-snug text-foreground/85 pl-3 relative break-words"
                    style={{ overflowWrap: 'anywhere' }}
                  >
                    <span className="absolute left-0 top-[0.45rem] h-1 w-1 rounded-full bg-amber-400/70" />
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {summary && !summary.summary && summary.key_decisions.length === 0 && summary.open_items.length === 0 && !loading && !error && (
            <p className="text-[11px] text-muted-foreground italic">
              No summary available for this thread.
            </p>
          )}

          {summary && !loading && !error && (
            <div className="flex justify-end pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] gap-1 px-2 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  try { sessionStorage.removeItem(cacheKey); } catch { /* ignore */ }
                  setSummary(null);
                  void generate();
                }}
              >
                <RefreshCw className={cn('h-2.5 w-2.5', loading && 'animate-spin')} />
                Regenerate
              </Button>
            </div>
          )}
    </div>
  );

  // ── Popover (compact glass) variant ─────────────────────────────
  if (variant === 'inline-button') {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10.5px] font-medium leading-none',
              'border border-white/10 bg-white/[0.04] backdrop-blur-md',
              'text-foreground/80 hover:text-foreground hover:bg-white/[0.08] hover:border-white/20',
              'transition-colors shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.05)]',
              'data-[state=open]:bg-primary/15 data-[state=open]:border-primary/30 data-[state=open]:text-primary',
              className,
            )}
            aria-label="Open thread summary"
          >
            <FileText className="h-2.5 w-2.5" />
            Thread Summary
            {loading ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            ) : (
              <ChevronDown className="h-2.5 w-2.5 opacity-70" />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          className={cn(
            'w-80 max-w-[min(20rem,90vw)] p-3',
            // Glassmorphism: translucent surface + blur + soft border + tight shadow.
            'rounded-xl border border-white/10 bg-background/60 backdrop-blur-xl',
            'shadow-[0_10px_30px_-12px_hsl(0_0%_0%/0.6)] text-popover-foreground',
          )}
        >
          <div className="flex items-center gap-1.5 mb-2">
            <FileText className="h-3 w-3 text-primary" />
            <span className="text-[11px] font-semibold text-foreground">Thread Summary</span>
            <span className="ml-auto text-[10px] text-muted-foreground/70">
              {hasContent
                ? `${messageCount} msgs · ${summary!.key_decisions.length} decisions · ${summary!.open_items.length} open`
                : `${messageCount} messages`}
            </span>
          </div>
          {body}
        </PopoverContent>
      </Popover>
    );
  }

  // ── Legacy card variant (kept for back-compat) ──────────────────
  return (
    <div className="rounded-md border border-white/[0.06] bg-background/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/20 transition-colors"
        aria-expanded={open}
      >
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform',
            !open && '-rotate-90',
          )}
        />
        <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-semibold text-foreground leading-tight">
            Thread Summary
          </div>
          <div className="text-[10px] text-muted-foreground leading-tight mt-0.5 truncate">
            {loading
              ? 'Generating summary…'
              : error
                ? 'Tap to retry'
                : hasContent
                  ? `${messageCount} messages · ${summary!.key_decisions.length} decisions · ${summary!.open_items.length} open`
                  : `${messageCount} messages in thread`}
          </div>
        </div>
        {loading && <Loader2 className="h-3 w-3 animate-spin text-primary/70 shrink-0" />}
      </button>
      {open && (
        <div className="border-t border-white/[0.04] px-3 py-2.5">{body}</div>
      )}
    </div>
  );
}
