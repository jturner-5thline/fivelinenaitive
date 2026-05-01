import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Loader2,
  X,
  Check,
  RefreshCw,
  AlertTriangle,
  ArrowRight,
  Bookmark,
  ChevronDown,
  Briefcase,
  User as UserIcon,
  Building2,
  Database,
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
import { useEnqueueAiAction } from '@/hooks/useAiActionQueue';
import { SendToDataRoomDialog } from './SendToDataRoomDialog';
import { useFullEmailMessage } from './useFullEmailMessage';
import { useEmailToDataRoom, type DataRoomDestinationSuggestion } from '@/hooks/useEmailToDataRoom';
import { SuggestedDealUpdatesSection } from './SuggestedDealUpdatesSection';
import { DataRoomUploadSuggestionCard } from './DataRoomUploadSuggestionCard';
import { DealContextCard } from './DealContextCard';
import { UnmatchedEmailContextCard } from './UnmatchedEmailContextCard';
import { EmailUnifiedAiAction } from './EmailUnifiedAiAction';
import { SaveToDealCard } from './SaveToDealCard';
import { LenderDataAnswerCard } from './LenderDataAnswerCard';
import { OutstandingItemMatchCard } from './OutstandingItemMatchCard';
import { MeetingSchedulerCard } from './MeetingSchedulerCard';
import { EmailQuickActionsToolbar } from './EmailQuickActionsToolbar';
import { CadenceInsightCard } from './CadenceInsightCard';
import type { DealContextSummary } from '@/hooks/useDealContextSummary';
import { toast } from 'sonner';
import type { DealAttachmentCategory } from '@/hooks/useDealAttachments';

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
  body: string;
  toneLabel: string;          // "Concise" | "Balanced"
  toneKey: ToneKey;           // canonical key
}

type ToneKey = 'concise' | 'balanced';
// Variant order is intentionally Recommended → Shorter so the strongest AI
// response is always the default landing state in the unified Draft reply
// module. Backend tone keys (concise/balanced) are unchanged.
const TONE_ORDER: ToneKey[] = ['balanced', 'concise'];
const TONE_LABELS: Record<ToneKey, string> = {
  balanced: 'Recommended',
  concise: 'Shorter',
};

/**
 * Quick-steer chips rendered inside the Draft reply card. Each chip applies a
 * one-shot intent instruction to the next regeneration via the edge function's
 * `customInstructions` field. Order is meaning-grouped: intent (what to say)
 * first, then length, then tone.
 */
interface DraftIntentOption {
  key: string;
  label: string;
  instruction: string;
}
const DRAFT_INTENT_OPTIONS: DraftIntentOption[] = [
  {
    key: 'ask_more_info',
    label: 'Ask for more information',
    instruction:
      'Rewrite the draft as a polite request for additional information. Ask for the specific clarifications or documents that would be most useful given the thread context. Keep it brief and warm.',
  },
  {
    key: 'confirm_details',
    label: 'Confirm details',
    instruction:
      'Rewrite the draft to acknowledge and confirm the key details discussed in the latest message (dates, figures, names, next steps). Avoid introducing new asks.',
  },
  {
    key: 'request_meeting',
    label: 'Request a meeting',
    instruction:
      'Rewrite the draft to propose a short call or meeting. Suggest a couple of time windows in the recipient\'s likely timezone and offer to share a calendar link. Do NOT invent specific availability if calendar context is not provided — instead, ask the recipient to propose times.',
  },
  {
    key: 'decline_politely',
    label: 'Decline politely',
    instruction:
      'Rewrite the draft as a polite, professional decline or pass. Be warm but clear; thank the recipient, give a short, non-committal reason, and leave the door open for the future where appropriate.',
  },
  {
    key: 'shorter',
    label: 'Make it shorter',
    instruction:
      'Rewrite the draft to be noticeably shorter — under 60 words, 2-3 sentences max. Keep all critical specifics but cut every unnecessary word.',
  },
  {
    key: 'longer',
    label: 'Make it longer',
    instruction:
      'Rewrite the draft to be more thorough — add the most useful concrete context, specifics, and next steps. Aim for 6-8 sentences without becoming verbose or repetitive.',
  },
  {
    key: 'more_formal',
    label: 'More formal',
    instruction:
      'Rewrite the draft in a more formal, polished register suitable for senior counterparties. Replace casual phrases with measured professional language while keeping it warm.',
  },
  {
    key: 'more_casual',
    label: 'More casual',
    instruction:
      'Rewrite the draft in a more casual, conversational register — like a quick note to a trusted colleague. Stay professional but loosen the tone.',
  },
];

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
  onInsertDraft: (body: string) => void;
  /** Persists a deal link from the unmatched-email context card. */
  onLinkDeal?: (dealId: string, dealName: string) => void | Promise<void>;
}

export function AiAssistSidebar({ thread, dealId, dealName, onClose, onInsertDraft, onLinkDeal }: Props) {
  const enqueueAiAction = useEnqueueAiAction();
  // `loadingTones` tracks per-tone in-flight requests (so the panel can render
  // skeletons selectively). The shell never blocks on either.
  const [loadingTones, setLoadingTones] = useState<Record<ToneKey, boolean>>({ concise: false, balanced: false });
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DraftResult | null>(null);
  const [selected, setSelected] = useState<ToneKey>('balanced');
  const [drDismissed, setDrDismissed] = useState(false);
  const [drDialogOpen, setDrDialogOpen] = useState(false);
  const [drSuggestion, setDrSuggestion] = useState<DataRoomDestinationSuggestion | null>(null);
  // Tracks the intent chip that's currently driving an in-flight refine, so
  // we can show a loading indicator on the active chip without blocking the
  // rest of the panel.
  const [activeIntentKey, setActiveIntentKey] = useState<string | null>(null);
  // When true, the "Request a meeting" chip swaps the chip-row UI for the
  // full meeting scheduler workspace (calendar read → slot pick → invite).
  // This UPGRADES the existing chip without adding a new button anywhere.
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  // Collapsible section state for the redesigned layout. Draft reply is the
  // biggest space-hog so it stays collapsed by default; Suggested Tasks
  // collapses by default whenever a Suggested Update is also visible to
  // reduce double-stack noise. Deal details (the rich DealContextCard body)
  // is collapsed by default so the chip row above stays the primary
  // at-a-glance summary.
  const [draftOpen, setDraftOpen] = useState(false);
  const [dealDetailsOpen, setDealDetailsOpen] = useState(false);
  // Snapshot of the slim deal-context summary surfaced in the sidebar header
  // card. Forwarded to the edge function so the draft tone reflects whether
  // the deal is At Risk, Off Track, On Hold, etc.
  const [dealContextSummary, setDealContextSummary] = useState<DealContextSummary | null>(null);

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
  // Strictly use attachments from the specific message being viewed (the
  // latest message in this thread). Once the per-message fetch resolves,
  // trust it as the only source of truth — never inherit attachments from
  // sibling messages via the thread-level prop, which can leak older
  // attachments into a reply that has none of its own.
  const drAttachments = latestFull
    ? (latestFull.attachments || [])
    : (thread.latestEmail.attachments || []);
  const drUploadable = drAttachments.filter(a => !a.is_inline && !!a.id);
  const { suggest: drSuggest, suggesting: drSuggesting, commitUpload: drCommitUpload, uploading: drUploading } = useEmailToDataRoom();
  const showDrCard = !drDismissed && drUploadable.length > 0;

  // Resolved deal for the attachment-fallback "Suggested Update" card. Use
  // the explicitly linked deal first, then fall back to the AI's
  // likely-match. The card renders only when we have BOTH a deal id AND
  // uploadable attachments, mirroring the rule the user requested.
  const fallbackDealId = dealId || workflowAnalysis?.likely_deal?.id || '';
  const fallbackDealName =
    dealName || workflowAnalysis?.likely_deal?.name || '';
  const showAttachmentFallback =
    drUploadable.length > 0 && !!fallbackDealId && !!fallbackDealName;

  /**
   * Commit upload directly from the inline "Add to Data Room" CTA — no
   * dialog. Mirrors the path the SendToDataRoomDialog uses, but with the
   * card's section + selected files.
   */
  const handleAttachmentFallbackConfirm = useCallback(
    async (
      section: DealAttachmentCategory,
      selectedAttachmentIds: string[],
    ) => {
      if (!fallbackDealId) {
        toast.error('No deal resolved for this thread');
        return;
      }
      const selected = drUploadable.filter((a) =>
        selectedAttachmentIds.includes(a.id || `${a.filename}-${a.size}`),
      );
      if (selected.length === 0) {
        toast.warning('No files selected');
        return;
      }
      const result = await drCommitUpload({
        dealId: fallbackDealId,
        messageId: latestId,
        sourceEmail: {
          messageId: latestId,
          threadId: thread.threadId,
          subject: thread.subject,
          senderName: thread.latestEmail.from_name,
          senderEmail: thread.latestEmail.from_email,
        },
        plan: selected.map((a) => ({
          attachment: a,
          desiredName: a.filename || 'attachment',
          category: section,
          include: true,
        })),
      });
      if (result && result.uploaded > 0) {
        toast.success(
          `Added ${result.uploaded} file${result.uploaded === 1 ? '' : 's'} to ${fallbackDealName} Data Room`,
          {
            action: {
              label: 'View Data Room',
              onClick: () => {
                window.location.href = `/deals/${fallbackDealId}`;
              },
            },
          },
        );
        // Hide the proactive card too — the work is done.
        setDrDismissed(true);
      }
    },
    [
      fallbackDealId,
      fallbackDealName,
      drCommitUpload,
      drUploadable,
      latestId,
      thread.threadId,
      thread.subject,
      thread.latestEmail.from_name,
      thread.latestEmail.from_email,
    ],
  );

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
    // Bumped to v2: drafts are now body-only (no subject / rationale fields).
    return `naitive.aiAssist.draft.v2.${thread.threadId}::${latestId}`;
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
   * Build a compact, prompt-friendly hint about the deal's current operating
   * state so the AI tunes urgency. Only sent when we actually have summary
   * data for the linked deal — otherwise the edge function falls back to its
   * full deal context build.
   */
  const buildDealContextHint = useCallback(() => {
    if (!dealContextSummary) return undefined;
    const f = dealContextSummary.financials;
    const fmt = (n: number | null) =>
      n == null ? null : n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${Math.round(n / 1_000)}k` : `$${Math.round(n)}`;
    return {
      deal_name: dealContextSummary.dealName || undefined,
      status: dealContextSummary.status,
      stage: dealContextSummary.stage,
      days_in_stage: dealContextSummary.daysInStage,
      // Headline financials sourced from Deal Space — let the AI cite real
      // numbers instead of leaving placeholders when the lender asks about
      // size, ARR, or margins.
      financials: {
        deal_size: f.dealSize,
        deal_size_display: fmt(f.dealSize),
        arr: f.arr,
        arr_display: fmt(f.arr),
        mrr: f.mrr,
        mrr_display: fmt(f.mrr),
        ttm_revenue: f.ttmRevenue,
        ttm_revenue_display: fmt(f.ttmRevenue),
        ebitda: f.ebitda,
        ebitda_display: fmt(f.ebitda),
      },
      active_lenders: dealContextSummary.lenderCounts.active,
      total_lenders: dealContextSummary.lenderCounts.total,
      open_outstanding_items: dealContextSummary.outstanding.openCount,
      most_overdue_item: dealContextSummary.outstanding.mostOverdue
        ? {
            description: dealContextSummary.outstanding.mostOverdue.description,
            days_overdue: dealContextSummary.outstanding.mostOverdue.daysOverdue,
          }
        : null,
      // Up to 5 open items so the AI can match against email topic
      // keywords (e.g. lender asks about "cap table" → AI sees the
      // matching outstanding item and can promise a concrete ETA).
      open_items: dealContextSummary.outstanding.openItems.map((it) => ({
        description: it.description,
        due_date: it.dueDate,
        days_overdue: it.daysOverdue,
      })),
      last_status_note: dealContextSummary.lastStatusNote
        ? {
            note: dealContextSummary.lastStatusNote.note,
            author: dealContextSummary.lastStatusNote.author,
            at: dealContextSummary.lastStatusNote.createdAt,
          }
        : null,
    };
  }, [dealContextSummary]);

  /**
   * Generate a single tone (Concise or Balanced). Fast model by default;
   * heavier model when `regenerate` is true. 8s hard timeout.
   */
  const generateTone = useCallback(async (
    tone: ToneKey,
    opts?: { regenerate?: boolean; customInstructions?: string }
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
            dealContextHint: buildDealContextHint(),
            customInstructions: opts?.customInstructions,
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

        const body = r.option_1_body;
        if (!body) throw new Error('No draft returned');

        const newOpt: DraftOption = {
          index: 1,
          toneKey: tone,
          toneLabel: TONE_LABELS[tone],
          body,
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
  }, [dealId, buildThreadData, buildDealContextHint, writeCache]);

  /** Regenerate the currently selected tone with the heavier model. */
  const regenerateSelected = useCallback(() => {
    void generateTone(selected, { regenerate: true });
  }, [generateTone, selected]);

  /**
   * Apply a one-shot intent steer to the selected variant. Triggers a fresh
   * generation with the heavier model + the chip's instruction text appended
   * as USER INSTRUCTIONS in the prompt. The chip shows a spinner until the
   * regeneration resolves.
   */
  const applyIntent = useCallback(
    async (option: DraftIntentOption) => {
      // ── Special-case: "Request a meeting" upgrades to the full scheduling
      //    workspace instead of regenerating the draft text. The chip is the
      //    same chip the user already knows; the behavior is upgraded.
      if (option.key === 'request_meeting') {
        setSchedulerOpen(true);
        return;
      }
      // Block re-entry while another intent or regen is mid-flight on the
      // selected tone — keeps state predictable.
      if (loadingTones[selected]) return;
      setActiveIntentKey(option.key);
      try {
        await generateTone(selected, {
          regenerate: true,
          customInstructions: option.instruction,
        });
      } finally {
        setActiveIntentKey(null);
      }
    },
    [generateTone, selected, loadingTones],
  );

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

  /**
   * Render the draft body as plain text for the preview pane. The body may
   * contain an HTML signature (e.g. "<p><strong>James H. Turner V…</strong></p>")
   * because the user's stored signature is rich-text. We strip tags and
   * decode common entities for display only — the raw body (with HTML
   * preserved) is what gets inserted into the composer so the outgoing
   * email renders the signature properly.
   */
  const selectedPreviewText = useMemo(() => {
    const raw = selectedOption?.body ?? '';
    if (!raw) return '';
    // Skip work if the body has no tags / entities at all.
    if (!/[<&]/.test(raw)) return raw;
    return raw
      // Block-level breaks → newline so the signature stays multi-line.
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\/\s*(p|div|li|tr|h[1-6])\s*>/gi, '\n')
      .replace(/<\s*(p|div|li|tr|h[1-6])(\s[^>]*)?>/gi, '')
      // Strip remaining tags.
      .replace(/<[^>]+>/g, '')
      // Decode common HTML entities.
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      // Trim trailing spaces on each line, collapse 3+ blank lines to 2.
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }, [selectedOption]);

  const handleInsert = () => {
    if (!selectedOption) return;
    // Drafts are body-only — the reply lives in the existing thread, so the
    // composer keeps its current subject. We just inject the body text.
    onInsertDraft(selectedOption.body ?? '');
  };

  // ── Bridge: EmailComposerCard "Draft from AI Assist" button ────────────
  // The composer dispatches `naitive:ai-assist:request-draft`; we respond
  // with `naitive:ai-assist:draft-ready` carrying the currently-selected
  // tone's body. Decoupled so the composer doesn't need a sidebar ref.
  useEffect(() => {
    const onRequest = () => {
      const body = selectedOption?.body;
      if (!body) return;
      try {
        window.dispatchEvent(
          new CustomEvent('naitive:ai-assist:draft-ready', { detail: { body, source: 'ai-assist-sidebar' } })
        );
      } catch {}
    };
    window.addEventListener('naitive:ai-assist:request-draft', onRequest);
    return () => window.removeEventListener('naitive:ai-assist:request-draft', onRequest);
  }, [selectedOption]);

  // Expose a tiny debug snapshot so the top-level ErrorBoundary can include
  // AiAssist state in its fallback when something downstream crashes.
  useEffect(() => {
    const w = window as unknown as { __aiAssistDebug?: Record<string, unknown> };
    w.__aiAssistDebug = {
      threadId: thread.threadId,
      selected,
      tones: TONE_ORDER,
      optionsAvailable: result ? Object.keys(result.options ?? {}) : [],
      loading: loadingTones,
      hasError: !!error,
    };
    return () => {
      try { delete w.__aiAssistDebug; } catch { /* noop */ }
    };
  }, [thread.threadId, selected, result, loadingTones, error]);

  return (
    <aside
      // backdrop-blur removed: it forced the entire sidebar to re-rasterize on
      // every scroll/repaint of underlying content, causing the dominant scroll
      // jank in this pop-up. The opaque-ish bg-card surface reads identically
      // over the dialog backdrop.
      className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-card/40 min-[1100px]:w-[300px] min-[1100px]:min-w-[300px] min-[1100px]:max-w-[420px] min-[1280px]:w-[340px] min-[1536px]:w-[380px]"
      style={{ contain: 'layout paint style' }}
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
      <ScrollArea
        className="flex-1 min-h-0 min-w-0 w-full overflow-hidden [&>[data-radix-scroll-area-viewport]>div]:!block [&>[data-radix-scroll-area-viewport]>div]:!min-w-0 [&>[data-radix-scroll-area-viewport]>div]:!w-full [&>[data-radix-scroll-area-viewport]>div]:!max-w-full"
        // overscroll-contain stops scroll chaining into the dialog/dashboard
        // (which would trigger parent layout); contain isolates layout/paint.
        style={{ overscrollBehavior: 'contain', contain: 'layout paint style' }}
      >
        <div className="min-w-0 max-w-full w-full p-4 space-y-4">
          {/* Deal context chip row — single-line at-a-glance summary of the
              entities the AI resolved for this thread. Replaces the earlier
              multi-row paragraph layout so the eye lands on the key actors
              (deal, contact, lender) immediately. Each chip is colored by
              role and truncates gracefully on narrow widths. The full
              DealContextCard is still rendered below — collapsed by default
              — for the rare case the user wants stage age, status notes,
              and overdue items. */}
          {(() => {
            const dealChip = dealName || workflowAnalysis?.likely_deal?.name;
            const contactChip = workflowAnalysis?.likely_contact?.name
              || thread.latestEmail.from_name;
            const lenderChip = workflowAnalysis?.likely_lender_firm?.name;
            if (!dealChip && !contactChip && !lenderChip) return null;
            return (
              <div className="flex flex-wrap items-center gap-1.5 -mt-1">
                {dealChip && (
                  <span className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                    <Briefcase className="h-2.5 w-2.5 shrink-0" />
                    <span className="truncate">Deal: {dealChip}</span>
                  </span>
                )}
                {contactChip && (
                  <span className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-300">
                    <UserIcon className="h-2.5 w-2.5 shrink-0" />
                    <span className="truncate">Contact: {contactChip}</span>
                  </span>
                )}
                {lenderChip && (
                  <span className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300">
                    <Building2 className="h-2.5 w-2.5 shrink-0" />
                    <span className="truncate">Lender: {lenderChip}</span>
                  </span>
                )}
              </div>
            );
          })()}

          {/* Quick Actions toolbar — pinned directly below the entity chip
              row. Always visible without scrolling; consolidates the panel's
              5 primary actions (Save to Data Room, Update Lender Status,
              Draft Reply, Create Task, Schedule Meeting) into a single
              horizontally scrollable pill row. Each pill (except Draft
              Reply, which expands the dedicated Draft Reply module below)
              expands an inline card directly under the toolbar. */}
          <EmailQuickActionsToolbar
            thread={thread}
            dealId={dealId}
            dealName={dealName}
            likelyLenderName={workflowAnalysis?.likely_lender_firm?.name || null}
            attachments={drAttachments}
            latestMessageId={latestId}
            fallbackDealId={workflowAnalysis?.likely_deal?.id || null}
            fallbackDealName={workflowAnalysis?.likely_deal?.name || null}
            onOpenDraft={() => {
              setDraftOpen(true);
              if (!result?.options[selected] && !loadingTones[selected]) {
                void generateTone(selected);
              }
            }}
            onInsertDraft={onInsertDraft}
          />

          {/* Cadence-based follow-up nudge — surfaces only when the sender
              has an established cadence profile (built via Settings →
              Email → Learn My Cadence) and the user is on/off rhythm.
              The "Draft a follow-up" CTA reuses the same draft pipeline
              as the Quick Actions Draft Reply button. */}
          <CadenceInsightCard
            contactEmail={thread.latestEmail.from_email}
            contactName={thread.latestEmail.from_name}
            onDraftFollowUp={() => {
              setDraftOpen(true);
              if (!result?.options[selected] && !loadingTones[selected]) {
                void generateTone(selected);
              }
            }}
          />

          {/* Deal Context — collapsed by default; the chip row above is the
              primary at-a-glance summary. Still renders so the deal-context
              hint is forwarded to the AI draft generator. */}
          {dealDetailsOpen ? (
            <DealContextCard
              dealId={dealId}
              dealName={dealName}
              onSummaryChange={setDealContextSummary}
              defaultExpanded={true}
            />
          ) : (
            // Hidden mount so the summary still loads / forwards even while
            // the visual card is collapsed.
            <div className="hidden">
              <DealContextCard
                dealId={dealId}
                dealName={dealName}
                onSummaryChange={setDealContextSummary}
                defaultExpanded={false}
              />
            </div>
          )}
          {dealId && (
            <button
              type="button"
              onClick={() => setDealDetailsOpen((v) => !v)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors -mt-2"
            >
              <ChevronDown
                className={cn('h-3 w-3 transition-transform', !dealDetailsOpen && '-rotate-90')}
              />
              {dealDetailsOpen ? 'Hide deal details' : 'Show deal details'}
            </button>
          )}

          {/* Unmatched-email context: contact card / body-mention deal
              suggestion / Link Deal fallback. Only renders when no deal is
              linked to the thread. */}
          {!dealId && (
            <UnmatchedEmailContextCard
              email={{
                from_email: thread.latestEmail.from_email,
                from_name: thread.latestEmail.from_name,
                subject: thread.subject,
                body_preview: thread.latestEmail.body_preview,
                body_text: thread.latestEmail.body_text,
                folder: thread.latestEmail.folder,
              }}
              onLinkDeal={async (id, name) => {
                if (onLinkDeal) await onLinkDeal(id, name);
              }}
              suggestedTasks={workflowAnalysis?.suggested_tasks || []}
              threadId={thread.threadId}
            />
          )}

          {/* The Ask-AI textbox lives in the sticky footer below the scroll
              area so it's always one click away — no scrolling required.
              Thread Summary lives in the thread header (under the
              "N messages" count) as a compact glass popover, not inline
              in the AI Assist sidebar. */}
          {/* Lender data Q&A — when a deal is matched and the inbound email
              contains data-style questions (ARR, debt, EBITDA, collateral,
              etc.), surface a card that answers each question from the
              matched deal's Deal Space (RAG over docs / financials / write-up
              / outstanding items) with explicit source citations. */}
          {dealId && (
            <LenderDataAnswerCard
              emailBodyText={
                latestFull?.body_text
                || thread.latestEmail.body_text
                || thread.latestEmail.body_preview
                || ''
              }
              dealId={dealId}
              dealName={dealName}
              onInsertIntoReply={onInsertDraft}
            />
          )}

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

          {/* Suggested Updates section — wraps the workflow card, lender
              pass card, data-room suggestion, outstanding-item match, and
              SuggestedDealUpdatesSection under a single section header with
              a count badge. Each card already provides its own border and
              padding so we don't double-stack containers — the header just
              gives the section a clear identity and breathing room. */}
          {(() => {
            const updateCount =
              (showWorkflowCard && workflowAnalysis ? 1 : 0)
              + (showPassCard && passDetection ? 1 : 0)
              + (showDrCard ? 1 : 0);
            // We render the OutstandingItemMatchCard and
            // SuggestedDealUpdatesSection below the badge regardless — they
            // self-hide when empty, and they don't carry an easy-to-count
            // signal here, so the badge only reflects the cards we can
            // count cheaply at the top.
            const showSection =
              updateCount > 0 || dealId; // section header still helps anchor outstanding-items / suggestions when present
            if (!showSection) return null;
            return (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Suggested Updates
                  </span>
                  {updateCount > 0 && (
                    <span className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                      {updateCount}
                    </span>
                  )}
                </div>

                {/* Workflow Intelligence (Claude) — primary, confirm-first
                    workflow assistant. Renders above pass detection so the
                    user sees the structured deal/lender/signal extraction
                    first, with explicit suggested updates. */}
                {showWorkflowCard && workflowAnalysis && (
                  <WorkflowIntelligenceCard
                    analysis={workflowAnalysis}
                    loading={workflowLoading}
                    committing={workflowCommitting}
                    hasLinkedDeal={!!dealId}
                    isThreadLinkedToDeal={workflowThreadLinked}
                    isLenderOnDeal={workflowLenderOnDeal}
                    threadId={thread.threadId}
                    hideSuggestedTasks
                    onConfirm={(o) => confirmWorkflow(o)}
                    onDismiss={dismissWorkflow}
                    onMaybeLater={dismissWorkflow}
                    attachmentFallback={
                      showAttachmentFallback ? (
                        <DataRoomUploadSuggestionCard
                          dealName={fallbackDealName}
                          attachments={drUploadable}
                          committing={drUploading}
                          onConfirm={(section, ids) =>
                            handleAttachmentFallbackConfirm(section, ids)
                          }
                          onChangeSection={() => setDrDialogOpen(true)}
                        />
                      ) : undefined
                    }
                  />
                )}

                {/* Lender pass detection card (specialized confirm-first
                    flow that already writes back lender stage). */}
                {showPassCard && passDetection && (
                  <LenderPassSidebarCard
                    detection={passDetection}
                    committing={passCommitting}
                    autoCommit={passAutoCommit}
                    onSetAutoCommit={setPassAutoCommit}
                    onConfirm={(reason) => confirmPass(reason)}
                    onDismiss={dismissPass}
                    onAddToQueue={async (reason) => {
                      await enqueueAiAction({
                        action_type: 'update_lender_status',
                        title: `Mark ${passDetection.lender_name} as Passed`,
                        description: reason || passDetection.reason_summary || null,
                        deal_id: dealId || null,
                        deal_name: dealName || null,
                        payload: {
                          deal_lender_id: passDetection.deal_lender_id,
                          new_status: 'passed',
                          tracking_status: 'passed',
                          reason: reason || passDetection.reason_summary || null,
                          lender_name: passDetection.lender_name,
                        },
                        source: {
                          thread_id: thread.threadId,
                          subject: thread.subject || null,
                          quote: passDetection.source_quote || null,
                          confidence: passDetection.confidence,
                        },
                      });
                      dismissPass();
                    }}
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
              onAddToQueue={async () => {
                await enqueueAiAction({
                  action_type: 'save_to_data_room',
                  title: `Save ${drUploadable.length} attachment${drUploadable.length === 1 ? '' : 's'} to data room`,
                  description: thread.subject || null,
                  deal_id: dealId || null,
                  deal_name: dealName || null,
                  payload: {
                    attachment_count: drUploadable.length,
                    subject: thread.subject || null,
                    suggested_destination: drSuggestion?.suggested_deal_name || null,
                  },
                  source: { thread_id: thread.threadId, subject: thread.subject || null },
                });
                setDrDismissed(true);
              }}
            />
                )}

                {/* Outstanding-item auto-detection. Self-hides when empty. */}
                <OutstandingItemMatchCard
                  dealId={dealId}
                  dealName={dealName}
                  thread={thread}
                  attachments={drAttachments}
                />

                {/* Pending suggested deal updates (contact emails, deal-picker
                    prompts). Self-hides when empty. */}
                <SuggestedDealUpdatesSection
                  dealId={dealId}
                  dealName={dealName}
                  threadId={thread.threadId}
                />
              </div>
            );
          })()}

          {/* Schedule Meeting + Create Task moved into the Quick Actions
              toolbar above. We still render the scheduler card inline here
              when the "Request a meeting" intent chip in the Draft Reply
              card triggers it (legacy entry point) — keeps that flow
              working without re-introducing the standalone button. */}
          {schedulerOpen && (
            <MeetingSchedulerCard
              recipientEmail={thread.latestEmail?.from_email}
              recipientName={thread.latestEmail?.from_name || undefined}
              threadSubject={thread.subject}
              dealName={dealName}
              onInsert={(text) => onInsertDraft(text)}
              onClose={() => setSchedulerOpen(false)}
            />
          )}

          {/* Unified Draft reply module — single card containing the section
              header, variant selector, one shared draft preview, and (in the
              footer below) the action row. Replaces the legacy "Draft AI
              Reply" pill row + "Draft Options" card duo with a single
              drafting workspace. */}
          {!error && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setDraftOpen((v) => !v)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md border border-white/[0.06] bg-card/40 hover:bg-card/60 transition-colors group"
                aria-expanded={draftOpen}
              >
                <Sparkles className="h-3 w-3 text-primary shrink-0" />
                <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground group-hover:text-foreground transition-colors">
                  Draft Reply
                </span>
                {isSelectedLoading && (
                  <Loader2 className="h-2.5 w-2.5 animate-spin text-primary/60" />
                )}
                <div className="flex-1" />
                {/* Deal-context indicator — surfaces when the draft was
                    generated using Deal Space data so the user knows the AI
                    referenced real financials/outstanding items. */}
                {(result?.used_deal_context
                  || (result?.cited_context_sources || []).some((s) =>
                    s === 'deal_state_snapshot' || s === 'deal_space_financials' || s === 'deal_metadata')
                ) && dealContextSummary?.dealName && (
                  <span
                    className="hidden sm:inline-flex items-center gap-1 mr-1 px-1.5 py-0.5 rounded text-[10px] text-primary/80 bg-primary/[0.06] border border-primary/15"
                    title={`Generated using ${dealContextSummary.dealName} deal data.`}
                  >
                    <Database className="h-2.5 w-2.5" />
                    <span className="truncate max-w-[140px]">
                      Generated using <span className="font-medium">{dealContextSummary.dealName}</span> deal data
                    </span>
                  </span>
                )}
                <ChevronDown
                  className={cn('h-3 w-3 text-muted-foreground transition-transform', !draftOpen && '-rotate-90')}
                />
              </button>
              {draftOpen && (
              <div className="rounded-md border border-primary/20 bg-primary/[0.04] p-3 space-y-2.5 overflow-hidden max-w-full min-w-0 w-full">
              {/* Header — title + optional helper. No counter, no chevrons:
                  the variant pill row below is the single switching surface. */}

              {/* Variant selector — compact segmented pill row. Active state
                  is visually clear but not heavy. Only one option active at
                  a time; switching swaps the preview content in place. */}
              <div
                role="tablist"
                aria-label="Draft variants"
                className="inline-flex items-center gap-0.5 rounded-md border border-white/[0.06] bg-card/40 p-0.5 max-w-full"
              >
                {TONE_ORDER.map((tone) => {
                  const isActive = selected === tone;
                  const isRecommended = tone === 'balanced';
                  return (
                    <button
                      key={tone}
                      role="tab"
                      aria-selected={isActive}
                      type="button"
                      onClick={() => handleSelectTone(tone)}
                      className={cn(
                        'h-6 px-2.5 rounded text-[11px] font-medium transition-colors inline-flex items-center gap-1',
                        isActive
                          ? 'bg-primary/15 text-primary'
                          : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]',
                      )}
                    >
                      {TONE_LABELS[tone]}
                      {isRecommended && (
                        <span
                          className={cn('text-[10px] leading-none', isActive ? 'text-primary' : 'text-muted-foreground/60')}
                          aria-hidden
                        >
                          ★
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Quick-steer intent chips — one-shot refinements that
                  regenerate the currently selected variant with an added
                  USER INSTRUCTIONS line. Wired to the same edge function as
                  Regenerate so behavior, model, and context handling are
                  identical. Single horizontally scrollable row — chips never
                  wrap or compress; the row scrolls via trackpad / shift+wheel
                  / drag. Subtle edge fade masks hint at additional chips when
                  the row overflows the sidebar width. Glassy translucent
                  treatment matches the rest of the platform's chip system. */}
              <div
                className="flex flex-nowrap items-center gap-2 overflow-x-auto overflow-y-hidden -mx-0.5 px-0.5 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                style={{
                  WebkitMaskImage:
                    'linear-gradient(to right, transparent 0, black 12px, black calc(100% - 12px), transparent 100%)',
                  maskImage:
                    'linear-gradient(to right, transparent 0, black 12px, black calc(100% - 12px), transparent 100%)',
                }}
                role="group"
                aria-label="Refine draft"
              >
                {DRAFT_INTENT_OPTIONS.map((option) => {
                  const isActive = activeIntentKey === option.key;
                  const disabled = isSelectedLoading && !isActive;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => applyIntent(option)}
                      disabled={disabled}
                      title={option.label}
                      className={cn(
                        'inline-flex items-center gap-1 h-6 px-2.5 rounded-full shrink-0 whitespace-nowrap',
                        'text-[11px] font-medium leading-none',
                        'border border-white/10 bg-white/5 backdrop-blur-sm',
                        'text-foreground/80 transition-colors',
                        'shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.06)]',
                        'hover:bg-white/[0.09] hover:text-foreground hover:border-white/15',
                        'disabled:opacity-40 disabled:cursor-not-allowed',
                        isActive && 'bg-primary/15 border-primary/30 text-primary',
                      )}
                    >
                      {isActive && (
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      )}
                      <span>{option.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Meeting scheduler is now rendered at panel-level above
                  (under the "Schedule Meeting" button) so it's reachable
                  even when the Draft Reply section is collapsed. The
                  "Request a meeting" intent chip below still toggles the
                  same panel-level scheduler via setSchedulerOpen(true). */}

              {/* Shared draft preview — dominant element. Layout never jumps;
                  only the body text content swaps when the user switches
                  variants. */}
              {selectedOption ? (
                <div className="min-w-0 max-w-full w-full">
                  <div
                    className="max-w-full break-words text-[12px] leading-relaxed text-foreground/85"
                    style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'normal', minHeight: 96 }}
                  >
                    {selectedPreviewText}
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5" style={{ minHeight: 96 }}>
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
              )}
              </div>
              )}
            </div>
          )}

        </div>
      </ScrollArea>

      {/* Sticky AI action input — always one click away, no scrolling. */}
      <div className="border-t border-white/[0.06] px-3 pt-3 shrink-0 bg-card/60 min-w-0 w-full">
        <EmailUnifiedAiAction
          thread={thread}
          dealId={dealId}
          dealName={dealName}
          fallbackDealId={workflowAnalysis?.likely_deal?.id || null}
          fallbackDealName={workflowAnalysis?.likely_deal?.name || null}
        />
      </div>

      {/* Footer actions */}
      <div className="border-t border-white/[0.06] px-3 py-3 flex items-center gap-2 shrink-0 bg-card/60 min-w-0 w-full">
        {draftOpen && selectedOption && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-[11px] gap-1 px-2 shrink-0"
            onClick={regenerateSelected}
            disabled={isSelectedLoading}
          >
            <RefreshCw className={cn('h-3 w-3', isSelectedLoading && 'animate-spin')} /> Regenerate
          </Button>
        )}
        <div className="flex-1 min-w-0" />
        {/* Save to Deal — popover wrapping the SaveToDealCard so users can
            route attachments, body, or highlighted text to Data Room or Deal
            Notes without leaving the email. Sits alongside Insert into Reply. */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-[11px] gap-1.5 shrink-0"
            >
              <Bookmark className="h-3 w-3" /> Save to deal
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            side="top"
            sideOffset={8}
            className="w-[320px] p-0 border-white/[0.08] bg-card/95 backdrop-blur"
          >
            <SaveToDealCard
              thread={thread}
              attachments={drAttachments}
              messageId={latestId}
              matchedDealId={dealId}
              matchedDealName={dealName}
              fallbackDealId={workflowAnalysis?.likely_deal?.id || null}
              fallbackDealName={workflowAnalysis?.likely_deal?.name || null}
            />
          </PopoverContent>
        </Popover>
        {draftOpen && selectedOption && (
          <Button
            size="sm"
            className="h-8 text-[11px] gap-1.5 shrink-0 bg-[hsl(var(--outlook-blue))] hover:bg-[hsl(var(--outlook-blue))]/90"
            onClick={handleInsert}
          >
            <Check className="h-3 w-3" /> Insert into reply
            <ArrowRight className="h-3 w-3" />
          </Button>
        )}
      </div>

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
