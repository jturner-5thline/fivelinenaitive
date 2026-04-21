import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Loader2,
  X,
  Check,
  RefreshCw,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { EmailThread } from './mockEmailData';
import { useLenderPassDetection } from '@/hooks/useLenderPassDetection';
import { useThreadWorkflowAnalysis } from '@/hooks/useThreadWorkflowAnalysis';
import { LenderPassSidebarCard } from './LenderPassSidebarCard';
import { WorkflowIntelligenceCard } from './WorkflowIntelligenceCard';
import { DataRoomSuggestionCard } from './DataRoomSuggestionCard';
import { SendToDataRoomDialog } from './SendToDataRoomDialog';
import { useFullEmailMessage } from './useFullEmailMessage';
import { useEmailToDataRoom, type DataRoomDestinationSuggestion } from '@/hooks/useEmailToDataRoom';
import { SuggestedDealUpdatesSection } from './SuggestedDealUpdatesSection';

/**
 * AiAssistSidebar
 * ----------------
 * Right-side sidebar that lives inside the email popup border. Generates 2
 * draft reply options (Concise / Balanced) using the `smart-email-ai`
 * edge function with full deal context (deal metadata, writeup, lenders,
 * milestones, recent activity, notes).
 *
 * Speed model:
 *   • Renders the shell + skeletons immediately (sub-200ms perceived load).
 *   • Generates only the *Balanced* draft on open (single-tone, fast model).
 *   • Generates *Concise* lazily the first time the user clicks that tab.
 *   • Caches per-thread/per-tone in sessionStorage so re-opening the same
 *     thread is instant and tone switches use the cached version.
 *   • 8s timeout with a graceful fallback message.
 *   • Workflow Intelligence and draft generation run in parallel.
 */

interface DraftOption {
  index: number;
  subject: string;
  body: string;
  toneLabel: string;          // "Concise" | "Balanced"
  toneKey: ToneKey;           // canonical key
  rationale: string;
}

type ToneKey = 'concise' | 'balanced';
const TONE_ORDER: ToneKey[] = ['concise', 'balanced'];
const TONE_LABELS: Record<ToneKey, string> = {
  concise: 'Concise',
  balanced: 'Balanced',
};

interface DraftResult {
  detected_intent?: string;
  confidence?: 'high' | 'medium' | 'low';
  used_deal_context?: boolean;
  recommended_tone?: ToneKey;
  cited_context_sources?: string[];
  options: Partial<Record<ToneKey, DraftOption>>;
}

interface Props {
  thread: EmailThread;
  dealId?: string;
  dealName?: string;
  onClose: () => void;
  onInsertDraft: (subject: string, body: string) => void;
}

export function AiAssistSidebar({ thread, dealId, dealName, onClose, onInsertDraft }: Props) {
  // `loadingTones` tracks per-tone in-flight requests (so the panel can render
  // skeletons selectively). The shell never blocks on either.
  const [loadingTones, setLoadingTones] = useState<Record<ToneKey, boolean>>({ concise: false, balanced: false });
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DraftResult | null>(null);
  const [selected, setSelected] = useState<ToneKey>('balanced');
  const [drDismissed, setDrDismissed] = useState(false);
  const [drDialogOpen, setDrDialogOpen] = useState(false);
  const [drSuggestion, setDrSuggestion] = useState<DataRoomDestinationSuggestion | null>(null);

  // Lender pass detection — shares state with the inline banner via the same row.
  const passThreadData = {
    subject: thread.subject,
    threadId: thread.threadId,
    emails: thread.emails,
    latestEmail: thread.latestEmail,
  };
  const {
    detection: passDetection,
    committing: passCommitting,
    autoCommit: passAutoCommit,
    setAutoCommitPref: setPassAutoCommit,
    confirmPass,
    dismissPass,
  } = useLenderPassDetection({ dealId, threadData: passThreadData, autoRun: !!dealId });
  const showPassCard = !!passDetection && (passDetection.status === 'pending' || passDetection.status === 'confirmed') && (passDetection.is_pass || passDetection.status === 'confirmed');

  // Claude-powered workflow analysis — runs on every thread open, even without a linked deal.
  const {
    analysis: workflowAnalysis,
    loading: workflowLoading,
    committing: workflowCommitting,
    isDismissed: workflowDismissed,
    dismiss: dismissWorkflow,
    confirmRecommendation: confirmWorkflow,
    isThreadLinkedToDeal: workflowThreadLinked,
    isLenderOnDeal: workflowLenderOnDeal,
  } = useThreadWorkflowAnalysis({ dealId, threadData: passThreadData, autoRun: true });
  // Hide the workflow card when the more specialized lender-pass card is already
  // surfacing the same recommendation, to avoid duplicate prompts.
  const showWorkflowCard = !!workflowAnalysis && !workflowDismissed && !showPassCard;

  // Data Room suggestion — load latest message attachments + auto-suggest destination
  const latestId = thread.latestEmail.id;
  const isMock = !latestId || latestId.startsWith('mock-');
  const { data: latestFull } = useFullEmailMessage(
    latestId,
    !isMock,
    !!(thread.latestEmail.body_html || thread.latestEmail.body_text),
  );
  const drAttachments = (latestFull?.attachments && latestFull.attachments.length > 0)
    ? latestFull.attachments
    : (thread.latestEmail.attachments || []);
  const drUploadable = drAttachments.filter(a => !a.is_inline && !!a.id);
  const { suggest: drSuggest, suggesting: drSuggesting } = useEmailToDataRoom();
  const showDrCard = !drDismissed && drUploadable.length > 0;

  useEffect(() => {
    if (!showDrCard || drSuggestion || drSuggesting) return;
    let cancelled = false;
    (async () => {
      const r = await drSuggest({
        dealId,
        sourceEmail: {
          messageId: latestId,
          threadId: thread.threadId,
          subject: thread.subject,
          senderName: thread.latestEmail.from_name,
          senderEmail: thread.latestEmail.from_email,
        },
        threadData: passThreadData,
        attachments: drAttachments,
      });
      if (!cancelled && r) setDrSuggestion(r);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDrCard, drUploadable.length, dealId, latestId]);


  // ── Per-thread cache (sessionStorage) ─────────────────────────────────
  // Key includes the latest message id so a new inbound message busts the cache.
  const cacheKey = useMemo(() => {
    const latestId =
      thread.latestEmail?.id ||
      ((thread.latestEmail as any)?.gmail_message_id as string | undefined) ||
      '';
    return `naitive.aiAssist.draft.${thread.threadId}::${latestId}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.threadId, thread.latestEmail?.id]);

  const readCache = useCallback((): DraftResult | null => {
    try {
      const raw = sessionStorage.getItem(cacheKey);
      return raw ? (JSON.parse(raw) as DraftResult) : null;
    } catch { return null; }
  }, [cacheKey]);

  const writeCache = useCallback((next: DraftResult) => {
    try { sessionStorage.setItem(cacheKey, JSON.stringify(next)); } catch { /* ignore */ }
  }, [cacheKey]);

  // Track in-flight per-tone requests so re-renders don't double-fire.
  const inflight = useRef<Record<ToneKey, Promise<void> | null>>({ concise: null, balanced: null });
  const panelOpenedAt = useRef<number>(Date.now());

  const buildThreadData = useCallback(() => ({
    subject: thread.subject,
    threadId: thread.threadId,
    // Trim to last 4 messages and 1.2k chars each — keeps prompt small.
    emails: thread.emails.slice(0, 4).map((e) => ({
      from_name: e.from_name,
      from_email: e.from_email,
      to_name: e.to_name,
      to_email: e.to_email,
      subject: e.subject,
      body_preview: (e.body_preview || '').substring(0, 1200),
      received_at: e.received_at,
      snippet: e.snippet,
    })),
    latestEmail: thread.latestEmail,
  }), [thread]);

  /**
   * Generate a single tone (Concise or Balanced). Fast model by default;
   * heavier model when `regenerate` is true. 8s hard timeout.
   */
  const generateTone = useCallback(async (
    tone: ToneKey,
    opts?: { regenerate?: boolean }
  ): Promise<void> => {
    if (inflight.current[tone]) return inflight.current[tone]!;

    setError(null);
    setLoadingTones((s) => ({ ...s, [tone]: true }));
    const startAt = Date.now();
    console.log(`[AiAssist] draft start tone=${tone} regenerate=${!!opts?.regenerate} since-open=${startAt - panelOpenedAt.current}ms`);

    const work = (async () => {
      try {
        // Hard 8s timeout w/ graceful fallback message.
        const timeoutMs = 8000;
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), timeoutMs);

        const invokePromise = supabase.functions.invoke('smart-email-ai', {
          body: {
            action: 'generate_draft_options',
            dealId,
            threadData: buildThreadData(),
            draftType: 'reply',
            singleTone: tone,
            fastModel: !opts?.regenerate,
          },
        });
        const timeoutPromise = new Promise<never>((_, reject) => {
          ac.signal.addEventListener('abort', () =>
            reject(new Error(`Draft request timed out after ${timeoutMs / 1000}s. Please try again.`)));
        });

        const { data, error: fnError } = await Promise.race([invokePromise, timeoutPromise]) as Awaited<typeof invokePromise>;
        clearTimeout(timer);

        if (fnError) throw fnError;
        if (data?.error) throw new Error(data.error);

        const r = data?.result;
        if (!r || r.raw) throw new Error('Invalid response from AI');

        const subject = r.option_1_subject;
        const body = r.option_1_body;
        if (!subject || !body) throw new Error('No draft returned');

        const newOpt: DraftOption = {
          index: 1,
          toneKey: tone,
          toneLabel: TONE_LABELS[tone],
          subject,
          body,
          rationale: r.option_1_rationale || '',
        };

        setResult((prev) => {
          const next: DraftResult = {
            detected_intent: r.detected_intent || prev?.detected_intent,
            confidence: r.confidence || prev?.confidence,
            used_deal_context: r.used_deal_context ?? prev?.used_deal_context,
            recommended_tone: prev?.recommended_tone || 'balanced',
            cited_context_sources: r.cited_context_sources || prev?.cited_context_sources || [],
            options: { ...(prev?.options || {}), [tone]: newOpt },
          };
          writeCache(next);
          return next;
        });

        const elapsed = Date.now() - startAt;
        console.log(`[AiAssist] draft complete tone=${tone} latency=${elapsed}ms tokens(out)≈${(body.length / 4) | 0}`);
      } catch (err: any) {
        const isTimeout = /timed out/i.test(err?.message || '');
        console.error(`[AiAssist] draft error tone=${tone}:`, err?.message || err);
        setError(isTimeout
          ? 'Taking longer than expected. Tap Retry to try a different model.'
          : (err?.message || 'Failed to generate draft.'));
      } finally {
        setLoadingTones((s) => ({ ...s, [tone]: false }));
        inflight.current[tone] = null;
      }
    })();
    inflight.current[tone] = work;
    return work;
  }, [dealId, buildThreadData, writeCache]);

  /** Regenerate the currently selected tone with the heavier model. */
  const regenerateSelected = useCallback(() => {
    void generateTone(selected, { regenerate: true });
  }, [generateTone, selected]);

  // ── Bootstrap: hydrate cache, then generate Balanced if missing ───────
  useEffect(() => {
    panelOpenedAt.current = Date.now();
    console.log(`[AiAssist] panel open thread=${thread.threadId}`);

    const cached = readCache();
    if (cached) {
      console.log(`[AiAssist] cache hit thread=${thread.threadId} tones=${Object.keys(cached.options || {}).join(',')}`);
      setResult(cached);
      // Pick a sensible default selection that exists in cache.
      if (cached.options.balanced) setSelected('balanced');
      else if (cached.options.concise) setSelected('concise');
      return;
    }
    setResult(null);
    setSelected('balanced');
    void generateTone('balanced');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.threadId]);

  // ── Tab switch: lazy-generate the other tone if missing ──────────────
  const handleSelectTone = useCallback((tone: ToneKey) => {
    setSelected(tone);
    if (!result?.options[tone] && !loadingTones[tone]) {
      void generateTone(tone);
    }
  }, [result, loadingTones, generateTone]);

  const selectedOption = useMemo(
    () => result?.options[selected] || result?.options.balanced || result?.options.concise,
    [result, selected]
  );
  const isSelectedLoading = loadingTones[selected];

  const handleInsert = () => {
    if (!selectedOption) return;
    const subject = selectedOption.subject.startsWith('Re:')
      ? selectedOption.subject
      : `Re: ${thread.subject}`;
    onInsertDraft(subject, selectedOption.body);
  };

  return (
    <aside
      className="flex flex-col h-full w-[380px] shrink-0 border-l border-white/[0.06] bg-card/40 backdrop-blur-sm"
      aria-label="AI Assist"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] shrink-0">
        <Sparkles className="h-4 w-4 text-primary" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground leading-tight">AI Assist</div>
          <div className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
            {dealName
              || (workflowAnalysis?.likely_deal?.name
                ? `Likely: ${workflowAnalysis.likely_deal.name}`
                : 'Analyzing thread…')}
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-4">
          {/* Error (non-blocking — shell still renders below) */}
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-center space-y-2">
              <AlertTriangle className="h-4 w-4 text-destructive mx-auto" />
              <p className="text-xs text-destructive">{error}</p>
              <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={regenerateSelected}>
                <RefreshCw className="h-3 w-3" /> Try again
              </Button>
            </div>
          )}

          {/* Workflow Intelligence (Claude) — primary, confirm-first workflow assistant.
              Renders above pass detection so the user sees the structured deal/lender/signal
              extraction first, with explicit suggested updates. Drafts come last. */}
          {showWorkflowCard && workflowAnalysis && (
            <WorkflowIntelligenceCard
              analysis={workflowAnalysis}
              loading={workflowLoading}
              committing={workflowCommitting}
              hasLinkedDeal={!!dealId}
              isThreadLinkedToDeal={workflowThreadLinked}
              isLenderOnDeal={workflowLenderOnDeal}
              onConfirm={(o) => confirmWorkflow(o)}
              onDismiss={dismissWorkflow}
              onMaybeLater={dismissWorkflow}
            />
          )}

          {/* Lender pass detection card (specialized confirm-first flow that already
              writes back lender stage). Kept for back-compat with existing detections. */}
          {showPassCard && passDetection && (
            <LenderPassSidebarCard
              detection={passDetection}
              committing={passCommitting}
              autoCommit={passAutoCommit}
              onSetAutoCommit={setPassAutoCommit}
              onConfirm={(reason) => confirmPass(reason)}
              onDismiss={dismissPass}
            />
          )}

          {/* Data Room attachment suggestion card */}
          {showDrCard && (
            <DataRoomSuggestionCard
              attachmentCount={drUploadable.length}
              dealName={drSuggestion?.suggested_deal_name || dealName}
              suggestion={drSuggestion}
              loading={drSuggesting && !drSuggestion}
              onConfirm={() => setDrDialogOpen(true)}
              onDismiss={() => setDrDismissed(true)}
            />
          )}

          {/* Suggested Deal Updates — pending confirm-first writes (e.g., contact emails detected in drafts) */}
          {dealId && (
            <SuggestedDealUpdatesSection dealId={dealId} dealName={dealName} />
          )}

          {/* Draft area — always rendered as a shell so the panel never blocks. */}
          {!error && (
            <>

              {/* Variant selector */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70 mb-2">
                  Draft options
                </p>
                <div className="flex gap-1 mb-3 p-0.5 rounded-md bg-muted/30 border border-white/[0.04]">
                  {TONE_ORDER.map((tone) => {
                    const isSel = selected === tone;
                    const isLoading = loadingTones[tone];
                    return (
                      <button
                        key={tone}
                        onClick={() => handleSelectTone(tone)}
                        className={cn(
                          'flex-1 px-2 py-1.5 rounded text-[11px] font-medium transition-all',
                          isSel
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground/80'
                        )}
                      >
                        {TONE_LABELS[tone]}
                        {result?.recommended_tone === tone && (
                          <span className="ml-1 text-primary">★</span>
                        )}
                        {isLoading && (
                          <Loader2 className="inline h-3 w-3 ml-1 animate-spin opacity-70" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Selected draft preview */}
                {selectedOption ? (
                  <div className="rounded-md border border-white/[0.06] bg-background/40 overflow-hidden">
                    <div className="px-3 py-2 border-b border-white/[0.04]">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
                        Subject
                      </div>
                      <div className="text-[12px] text-foreground/90 font-medium leading-snug mt-0.5">
                        {selectedOption.subject}
                      </div>
                    </div>
                    <div className="px-3 py-2.5">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">
                        Body
                      </div>
                      <div
                        className="text-[12px] text-foreground/85 leading-relaxed"
                        style={{ whiteSpace: 'pre-wrap' }}
                      >
                        {selectedOption.body}
                      </div>
                    </div>
                    {selectedOption.rationale && (
                      <div className="px-3 py-2 border-t border-white/[0.04] bg-muted/20">
                        <p className="text-[10px] text-muted-foreground italic leading-relaxed">
                          {selectedOption.rationale}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-md border border-white/[0.06] bg-background/40 overflow-hidden">
                    <div className="px-3 py-2 border-b border-white/[0.04] space-y-1.5">
                      <Skeleton className="h-2 w-12" />
                      <Skeleton className="h-3.5 w-2/3" />
                    </div>
                    <div className="px-3 py-2.5 space-y-1.5">
                      <Skeleton className="h-2 w-10 mb-1" />
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-11/12" />
                      <Skeleton className="h-3 w-10/12" />
                      <Skeleton className="h-3 w-9/12" />
                      {isSelectedLoading && (
                        <div className="flex items-center gap-1.5 pt-1">
                          <Loader2 className="h-3 w-3 animate-spin text-primary/70" />
                          <span className="text-[10px] text-muted-foreground/70">
                            Drafting {TONE_LABELS[selected]}…
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </ScrollArea>

      {/* Footer actions */}
      {selectedOption && (
        <div className="border-t border-white/[0.06] p-3 flex items-center gap-2 shrink-0 bg-card/60">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-[11px] gap-1 px-2"
            onClick={regenerateSelected}
            disabled={isSelectedLoading}
          >
            <RefreshCw className={cn('h-3 w-3', isSelectedLoading && 'animate-spin')} /> Regenerate
          </Button>
          <div className="flex-1" />
          <Button
            size="sm"
            className="h-8 text-[11px] gap-1.5 bg-[hsl(var(--outlook-blue))] hover:bg-[hsl(var(--outlook-blue))]/90"
            onClick={handleInsert}
          >
            <Check className="h-3 w-3" /> Insert into reply
            <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Send-to-Data-Room dialog (mounted from the proactive card) */}
      {drDialogOpen && (
        <SendToDataRoomDialog
          open={drDialogOpen}
          onClose={() => setDrDialogOpen(false)}
          attachments={drAttachments}
          messageId={latestId}
          threadData={passThreadData}
          sourceEmail={{
            messageId: latestId,
            threadId: thread.threadId,
            subject: thread.subject,
            senderName: thread.latestEmail.from_name,
            senderEmail: thread.latestEmail.from_email,
          }}
          initialDealId={dealId}
          initialDealName={dealName}
          initialSuggestion={drSuggestion}
        />
      )}
    </aside>
  );
}
