import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Loader2,
  X,
  RefreshCw,
  AlertTriangle,
  Bookmark,
  ChevronDown,
  Briefcase,
  User as UserIcon,
  Building2,
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
import { SuggestedFollowupsCard } from './SuggestedFollowupsCard';
import { useEmailFollowupSuggestions } from '@/hooks/useEmailFollowupSuggestions';
import { DataRoomUploadSuggestionCard } from './DataRoomUploadSuggestionCard';
import { DealContextCard } from './DealContextCard';
import { UnmatchedEmailContextCard } from './UnmatchedEmailContextCard';
import { RecognitionSuggestedLinkPill } from './RecognitionSuggestedLinkPill';
import { EmailUnifiedAiAction } from './EmailUnifiedAiAction';
import { SaveToDealCard } from './SaveToDealCard';
import { LenderDataAnswerCard } from './LenderDataAnswerCard';
import { OutstandingItemMatchCard } from './OutstandingItemMatchCard';
import { MeetingSchedulerCard } from './MeetingSchedulerCard';
import { StageMeetingTitleChip } from './StageMeetingTitleChip';
import { AvailabilityCheckCard } from './AvailabilityCheckCard';
import { OpenAvailabilityCard } from './OpenAvailabilityCard';
import { EmailQuickActionsToolbar } from './EmailQuickActionsToolbar';
import { CadenceInsightCard } from './CadenceInsightCard';
import {
  COMPOSE_BODY_EVENT,
  type ComposeBodyDetail,
  detectSchedulingIntent,
  inboundProposedTimes,
  detectOpenAvailabilityRequest,
} from './scheduleIntent';
import { CalendarClock } from 'lucide-react';

/**
 * Feature gate: hide the "Ask naitive AI" entry point inside the Email
 * AI Assist sidebar. The underlying EmailUnifiedAiAction component, its
 * routing edge function, and the floating Ask naitive AI panel remain
 * fully functional everywhere else — flip this flag to `true` to restore
 * the inline entry point in the email sidebar.
 */
const SHOW_EMAIL_ASK_NAITIVE_AI = false;

/**
 * Cheap classifier for "this inbound is a calendar invite or an automated
 * notification" — used to suppress the auto-surfaced AvailabilityCheckCard
 * (we never want to ask James to "confirm a time" for a Google Calendar
 * invite, an OOO bounce, or a noreply newsletter). Intentionally
 * conservative; false negatives just mean the parser may run on
 * marketing mail and self-hide via `hideWhenEmpty`.
 */
function isCalendarOrAutomatedNoise(thread: { latestEmail: any; subject?: string | null }): boolean {
  const m = thread.latestEmail || {};
  const from = String(m.from_email || '').toLowerCase();
  const subject = String(thread.subject || m.subject || '').toLowerCase();
  const body = String(m.body_text || m.body_preview || m.snippet || '').toLowerCase();
  // Common automated / no-reply senders
  if (/(no[-_.]?reply|noreply|donotreply|mailer-daemon|postmaster|notifications?@|calendar-(server|noreply)|invitation@|reply\+.*@reply\.github\.com)/i.test(from)) return true;
  // Google / Outlook / iCal invite patterns
  if (/calendar\.google\.com|outlook\.live\.com\/calendar|invite\.ics|begin:vcalendar/i.test(body)) return true;
  if (/^(invitation|updated invitation|canceled event|accepted|declined|tentative): /i.test(subject)) return true;
  if (Array.isArray(m.attachments) && m.attachments.some((a: any) => /\.ics$/i.test(String(a?.filename || a)))) return true;
  return false;
}
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
 *   • 30s timeout with a graceful fallback message.
 *   • Workflow Intelligence and draft generation run in parallel.
 */

interface DraftOption {
  index: number;
  body: string;
  toneLabel: string;          // "Concise" | "Balanced"
  toneKey: ToneKey;           // canonical key
  /** Set when this tone's generation failed. Renders Retry on the card. */
  error?: boolean;
}

type ToneKey = 'concise' | 'balanced';
// Variant order is intentionally Recommended → Shorter so the strongest AI
// response is always the default landing state in the unified Draft reply
// module. Backend tone keys (concise/balanced) are unchanged.
export const TONE_ORDER: ToneKey[] = ['balanced', 'concise'];
export const TONE_LABELS: Record<ToneKey, string> = {
  balanced: 'Recommended',
  concise: 'Shorter',
};
export type AiAssistToneKey = ToneKey;

/**
 * Quick-steer chips rendered inside the Draft reply card. Each chip applies a
 * one-shot intent instruction to the next regeneration via the edge function's
 * `customInstructions` field. Order is meaning-grouped: intent (what to say)
 * first, then length, then tone.
 */
export interface DraftIntentOption {
  key: string;
  label: string;
  instruction: string;
}
export const DRAFT_INTENT_OPTIONS: DraftIntentOption[] = [
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
  /**
   * Streams AI-generated suggested replies into the inline composer.
   * Called whenever the underlying generate_draft_options results update.
   * If not provided, the legacy single-body insert path is used.
   */
  onInsertSuggestions?: (
    suggestions: Array<{ id: string; toneKey: ToneKey; label: string; body: string; loading?: boolean }>,
  ) => void;
  /** Opens the inline reply composer in place (without prefilling a body). */
  onOpenInlineReply?: () => void;
  /** Persists a deal link from the unmatched-email context card. */
  onLinkDeal?: (dealId: string, dealName: string) => void | Promise<void>;
}

export function AiAssistSidebar({ thread, dealId, dealName, onClose, onInsertDraft, onInsertSuggestions, onOpenInlineReply, onLinkDeal }: Props) {
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
  // When set, the next available draft body for this tone will be dispatched
  // to open the Outlook-style pop-out composer pre-filled with the AI draft.
  const popOutPendingTone = useRef<ToneKey | null>(null);
  // When true, the "Request a meeting" chip swaps the chip-row UI for the
  // full meeting scheduler workspace (calendar read → slot pick → invite).
  // This UPGRADES the existing chip without adding a new button anywhere.
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  // Schedule-intent prompt card state. Driven by the COMPOSE_BODY_EVENT
  // fired (debounced 500ms) from InlineReplyComposer / PopOutComposer.
  // Dismissals are per-thread + per-compose-session: once the user X's
  // the card for this thread, we don't re-surface it again until the
  // sidebar remounts (new thread opened).
  const [scheduleHintActive, setScheduleHintActive] = useState(false);
  const scheduleHintDismissedThreads = useRef<Set<string>>(new Set());
  // Per-thread dismissals for the auto-surfaced open-availability card
  // (Scenario 3). Once James X's it for a thread, we keep it down.
  const [openAvailDismissed, setOpenAvailDismissed] = useState<Set<string>>(new Set());
  // Collapsible section state for the redesigned layout. Draft reply is the
  // biggest space-hog so it stays collapsed by default; Suggested Tasks
  // collapses by default whenever a Suggested Update is also visible to
  // reduce double-stack noise. Deal details (the rich DealContextCard body)
  // is collapsed by default so the chip row above stays the primary
  // at-a-glance summary.
  const [draftOpen, setDraftOpen] = useState(false);
  const [dealDetailsOpen, setDealDetailsOpen] = useState(false);
  // True while the Outlook-style PopOutComposer is mounted in the parent.
  // We listen to popout open/close events so this sidebar can hide its
  // duplicate Draft Reply workspace and avoid two competing draft surfaces.
  const [popOutOpen, setPopOutOpen] = useState(false);
  useEffect(() => {
    const onOpen = () => setPopOutOpen(true);
    const onClose = () => setPopOutOpen(false);
    window.addEventListener('naitive:ai-assist:popout-opened', onOpen);
    window.addEventListener('naitive:ai-assist:popout-closed', onClose);
    return () => {
      window.removeEventListener('naitive:ai-assist:popout-opened', onOpen);
      window.removeEventListener('naitive:ai-assist:popout-closed', onClose);
    };
  }, []);

  // Listen for compose-body changes from either composer surface. When
  // scheduling intent is detected — and the inbound thread isn't itself
  // a proposal of times (Scenario 2) — surface the prompt card. Skips
  // entirely if the user dismissed the card for this thread.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ComposeBodyDetail>).detail;
      if (!detail || detail.threadId !== thread.threadId) return;
      if (scheduleHintDismissedThreads.current.has(detail.threadId)) return;
      if (schedulerOpen) return; // scheduler already up — no prompt needed
      const inboundTexts = (thread.emails || [])
        .filter((m: any) => (m?.from_email || '').toLowerCase() !== 'jturner@5thline.co')
        .map((m: any) => (m?.body_preview || m?.snippet || ''));
      if (inboundProposedTimes(inboundTexts)) {
        setScheduleHintActive(false);
        return;
      }
      setScheduleHintActive(detectSchedulingIntent(detail.body));
    };
    window.addEventListener(COMPOSE_BODY_EVENT, handler as EventListener);
    return () => window.removeEventListener(COMPOSE_BODY_EVENT, handler as EventListener);
  }, [thread.threadId, thread.emails, schedulerOpen]);
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

  // Dedicated proactive follow-up extractor. Gated on workflow analysis
  // completion so the cards only render after "Analyzing thread…" finishes.
  const {
    suggestions: followupSuggestions,
    loading: followupLoading,
  } = useEmailFollowupSuggestions({
    threadData: passThreadData,
    dealId: dealId || workflowAnalysis?.likely_deal?.id || null,
    dealName: dealName || workflowAnalysis?.likely_deal?.name || null,
    enabled: !!workflowAnalysis && !workflowLoading,
  });

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
    // Resolve the matched lender's stage on this deal (if any) so the AI can
    // reference where this specific lender sits in our process.
    const matchedLenderName = workflowAnalysis?.likely_lender_firm?.name || null;
    const matchedLenderStage = matchedLenderName
      ? dealContextSummary.lenderStagesByName[matchedLenderName.trim().toLowerCase()] || null
      : null;
    return {
      deal_name: dealContextSummary.dealName || undefined,
      status: dealContextSummary.status,
      stage: dealContextSummary.stage,
      days_in_stage: dealContextSummary.daysInStage,
      // Headline financials sourced from Deal Space — let the AI cite real
      // numbers instead of leaving placeholders when the funding source asks about
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
      use_of_proceeds: dealContextSummary.useOfProceeds || null,
      active_lenders: dealContextSummary.lenderCounts.active,
      total_lenders: dealContextSummary.lenderCounts.total,
      matched_lender: matchedLenderName,
      matched_lender_stage: matchedLenderStage,
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
        assignee: it.assignee || null,
      })),
      last_status_note: dealContextSummary.lastStatusNote
        ? {
            note: dealContextSummary.lastStatusNote.note,
            author: dealContextSummary.lastStatusNote.author,
            at: dealContextSummary.lastStatusNote.createdAt,
          }
        : null,
    };
  }, [dealContextSummary, workflowAnalysis?.likely_lender_firm?.name]);

  /**
   * Generate a single tone (Concise or Balanced). Fast model by default;
   * heavier model when `regenerate` is true. 30s hard timeout.
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
        // Hard 30s timeout w/ graceful fallback message.
        const timeoutMs = 30000;
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), timeoutMs);

        const dealContextHint = buildDealContextHint();
        const invokeBody = {
          action: 'generate_draft_options' as const,
          dealId,
          threadData: buildThreadData(),
          draftType: 'reply' as const,
          singleTone: tone,
          fastModel: !opts?.regenerate,
          dealContextHint,
          customInstructions: opts?.customInstructions,
        };
        // DEBUG: surface exactly what Deal Space context (if any) is being
        // forwarded to the smart-email-ai edge function for draft generation.
        console.log('[AiAssist] draft_reply context payload', {
          tone,
          dealId,
          hasDealContextHint: !!dealContextHint,
          dealContextHint,
          dealContextSummary,
          fullInvokeBody: invokeBody,
        });
        const invokePromise = supabase.functions.invoke('smart-email-ai', {
          body: invokeBody,
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

        let body = r.option_1_body as string | undefined;
        if (!body) throw new Error('No draft returned');
        // Defensive scrub: the prompt forbids it, but if a model ever leaks
        // a "Generated using <Deal> deal data" / "based on Deal Space" style
        // disclaimer into the body, strip those lines so they never appear
        // in the user's outgoing email. The label only belongs in the UI.
        body = body
          .split('\n')
          .filter((ln) => !/^(?:\s*[\[(]?\s*)?(?:generated using|based on (?:the )?deal space|using deal[- ]space data|using\s+[\w'’&.\- ]+?\s+deal data)\b/i.test(ln))
          .join('\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim();

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
        // A successful tone clears any stale "all-tones-failed" banner.
        setError(null);

        const elapsed = Date.now() - startAt;
        console.log(`[AiAssist] draft complete tone=${tone} latency=${elapsed}ms tokens(out)≈${(body.length / 4) | 0}`);
      } catch (err: any) {
        const isTimeout = /timed out/i.test(err?.message || '');
        console.error(`[AiAssist] draft error tone=${tone}:`, err?.message || err);
        // Record a per-tone error sentinel so the inline composer's
        // SuggestedReplyCards can render a per-card Retry instead of
        // staying stuck in a loading state. The global banner only fires
        // when EVERY tone has failed (see check below) — a single-tone
        // failure must not block the inline draft path.
        setResult((prev) => {
          const errOpt: DraftOption = {
            index: 1,
            toneKey: tone,
            toneLabel: TONE_LABELS[tone],
            body: '',
            error: true,
          };
          const nextOptions = { ...(prev?.options || {}), [tone]: errOpt };
          const allErrored = TONE_ORDER.every((t) => nextOptions[t]?.error);
          if (allErrored) {
            setError(isTimeout
              ? 'Taking longer than expected. Tap Retry to try a different model.'
              : (err?.message || 'Failed to generate draft.'));
          }
          return {
            detected_intent: prev?.detected_intent,
            confidence: prev?.confidence,
            used_deal_context: prev?.used_deal_context,
            recommended_tone: prev?.recommended_tone || 'balanced',
            cited_context_sources: prev?.cited_context_sources || [],
            options: nextOptions,
          };
        });
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

  // ── Pop-out composer remote control ───────────────────────────────────
  // The PopOutComposer mirrors the same AI controls (tone tabs + intent
  // chips + regenerate). We let it remote-drive this sidebar's state so all
  // generation logic, caching, and edge-function plumbing stays in ONE
  // place. The popout sends events; we apply them and stream the resulting
  // body back via `naitive:ai-assist:popout-draft-update`.
  useEffect(() => {
    const onSelectTone = (e: Event) => {
      const detail = (e as CustomEvent<{ tone: ToneKey }>).detail;
      if (!detail?.tone) return;
      handleSelectTone(detail.tone);
    };
    const onRegenerate = () => regenerateSelected();
    const onApplyIntent = (e: Event) => {
      const detail = (e as CustomEvent<{ key: string }>).detail;
      const opt = DRAFT_INTENT_OPTIONS.find((o) => o.key === detail?.key);
      if (opt) void applyIntent(opt);
    };
    const onRetryTone = (e: Event) => {
      const detail = (e as CustomEvent<{ tone: ToneKey }>).detail;
      if (!detail?.tone) return;
      // Clear the per-tone error sentinel so the card flips back to a
      // loading state while the retry is in flight.
      setResult((prev) => {
        if (!prev?.options?.[detail.tone]?.error) return prev;
        const { [detail.tone]: _drop, ...rest } = prev.options;
        return { ...prev, options: rest };
      });
      setError(null);
      void generateTone(detail.tone, { regenerate: true });
    };
    window.addEventListener('naitive:ai-assist:popout-select-tone', onSelectTone as EventListener);
    window.addEventListener('naitive:ai-assist:popout-regenerate', onRegenerate);
    window.addEventListener('naitive:ai-assist:popout-apply-intent', onApplyIntent as EventListener);
    window.addEventListener('naitive:ai-assist:retry-tone', onRetryTone as EventListener);
    return () => {
      window.removeEventListener('naitive:ai-assist:popout-select-tone', onSelectTone as EventListener);
      window.removeEventListener('naitive:ai-assist:popout-regenerate', onRegenerate);
      window.removeEventListener('naitive:ai-assist:popout-apply-intent', onApplyIntent as EventListener);
      window.removeEventListener('naitive:ai-assist:retry-tone', onRetryTone as EventListener);
    };
  }, [handleSelectTone, regenerateSelected, applyIntent, generateTone]);

  // Stream draft body + loading state to the popout whenever they change.
  useEffect(() => {
    try {
      window.dispatchEvent(new CustomEvent('naitive:ai-assist:popout-draft-update', {
        detail: {
          body: selectedOption?.body ?? '',
          tone: selected,
          loading: isSelectedLoading,
          activeIntentKey,
        },
      }));
    } catch {}
  }, [selectedOption, selected, isSelectedLoading, activeIntentKey]);

  // ── Stream suggested-reply cards into the inline composer ─────────────
  // The Draft Reply quick action opens the inline composer (not a pop-up)
  // and the cards below are populated from the same generate_draft_options
  // engine. We re-emit on every tone resolution so the cards swap from
  // "Generating…" to the resolved body as soon as either tone returns.
  useEffect(() => {
    if (!onInsertSuggestions) return;
    const suggestions = TONE_ORDER.map((tone) => {
      const opt = result?.options[tone];
      return {
        id: `tone-${tone}`,
        toneKey: tone,
        label: TONE_LABELS[tone],
        body: opt?.body ?? '',
        loading: !opt?.body && !opt?.error && !!loadingTones[tone],
        error: !!opt?.error && !opt?.body,
      };
    });
    onInsertSuggestions(suggestions);
    // Clear any legacy popout-pending marker so a stale ref never opens
    // the pop-out composer after the inline switch.
    popOutPendingTone.current = null;
  }, [result, loadingTones, onInsertSuggestions]);

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
      // Transparent — inherits the unified popup-shell surface. Separation
      // from the message column is handled by a thin left border on the
      // parent wrapper in EmailListAndDetail.
      className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-transparent min-[1100px]:w-[300px] min-[1100px]:min-w-[300px] min-[1100px]:max-w-[420px] min-[1280px]:w-[340px] min-[1536px]:w-[380px]"
      style={{ contain: 'layout paint style' }}
      aria-label="AI Assist"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] shrink-0">
        <Sparkles className="h-4 w-4 text-primary" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 leading-tight">
            <span className="text-sm font-semibold text-foreground">AI Assist</span>
            <span className="inline-flex items-center rounded-full bg-warning px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-wide text-white leading-none">
              Beta
            </span>
          </div>
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
      <AIAssistOverlayProvider>
      <ScrollArea
        className="flex-1 min-h-0 min-w-0 w-full overflow-hidden [&>[data-radix-scroll-area-viewport]>div]:!block [&>[data-radix-scroll-area-viewport]>div]:!min-w-0 [&>[data-radix-scroll-area-viewport]>div]:!w-full [&>[data-radix-scroll-area-viewport]>div]:!max-w-full"
        // overscroll-contain stops scroll chaining into the dialog/dashboard
        // (which would trigger parent layout); contain isolates layout/paint.
        style={{ overscrollBehavior: 'contain', contain: 'layout paint style' }}
      >
        <div className="min-w-0 max-w-full w-full p-4 space-y-4">
          {/* AI Action — primary input lives at the very top of the panel
              so it's the first thing the user sees. Context chips, quick
              actions, and suggested updates render below.
              Gated behind SHOW_EMAIL_ASK_NAITIVE_AI so the Email module
              hides the "Ask naitive AI" entry point without removing the
              component, its routing logic, or the floating panel surface
              used elsewhere in the app. */}
          {SHOW_EMAIL_ASK_NAITIVE_AI && (
            <>
              <EmailUnifiedAiAction
                thread={thread}
                dealId={dealId}
                dealName={dealName}
                fallbackDealId={workflowAnalysis?.likely_deal?.id || null}
                fallbackDealName={workflowAnalysis?.likely_deal?.name || null}
              />
              {workflowLoading && !workflowAnalysis && (
                <div className="flex items-center gap-1.5 -mt-1" aria-hidden>
                  <Skeleton className="h-4 w-24 rounded-full bg-primary/10" />
                  <Skeleton className="h-4 w-28 rounded-full bg-sky-500/10" />
                  <Skeleton className="h-4 w-20 rounded-full bg-emerald-500/10" />
                </div>
              )}
            </>
          )}

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
            const rawLenderChip = workflowAnalysis?.likely_lender_firm?.name;
            // Suppress 5th Line as a funding source — it's our own firm, not a funding source.
            const normalizedLender = (rawLenderChip || '')
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, ' ')
              .trim();
            const isInternalFirm =
              normalizedLender === '5th line' ||
              normalizedLender === '5th line capital' ||
              normalizedLender === 'fifth line' ||
              normalizedLender === 'fifth line capital' ||
              normalizedLender.startsWith('5th line ') ||
              normalizedLender.startsWith('fifth line ');
            const lenderChip = isInternalFirm ? null : rawLenderChip;
            if (!dealChip && !contactChip && !lenderChip) return null;
            return (
              <div
                className="flex flex-nowrap items-center gap-1.5 -mt-1 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {dealChip && (
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-primary max-w-[180px] transition-colors hover:border-white/20">
                    <Briefcase className="h-2.5 w-2.5 shrink-0" />
                    <span className="truncate">Deal: {dealChip}</span>
                  </span>
                )}
                {contactChip && (
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-sky-300 max-w-[180px] transition-colors hover:border-white/20">
                    <UserIcon className="h-2.5 w-2.5 shrink-0" />
                    <span className="truncate">Contact: {contactChip}</span>
                  </span>
                )}
                {lenderChip && (
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-emerald-300 max-w-[180px] transition-colors hover:border-white/20">
                    <Building2 className="h-2.5 w-2.5 shrink-0" />
                    <span className="truncate">Lender: {lenderChip}</span>
                  </span>
                )}
              </div>
            );
          })()}

          {/* Quick Actions toolbar — pinned directly below the entity chip
              row. Always visible without scrolling; consolidates the panel's
              5 primary actions (Save to Data Room, Update Funding Source Status,
              Draft Reply, Create Task, Schedule Meeting) into a single
              horizontally scrollable pill row. Each pill (except Draft
              Reply, which expands the dedicated Draft Reply module below)
              expands an inline card directly under the toolbar. */}
          <EmailQuickActionsToolbar
            thread={thread}
            dealId={dealId}
            contactId={null}
            dealName={dealName}
            likelyLenderName={workflowAnalysis?.likely_lender_firm?.name || null}
            attachments={drAttachments}
            latestMessageId={latestId}
            fallbackDealId={workflowAnalysis?.likely_deal?.id || null}
            fallbackDealName={workflowAnalysis?.likely_deal?.name || null}
            onOpenDraft={() => {
              // Draft Reply routes through the SAME inline composer used by
              // the per-thread "Reply" button — no separate pop-up modal.
              // We open the inline composer in place and queue both tones
              // so the user gets 2 suggested-reply radio cards (Recommended
              // + Shorter). The cards re-use the existing
              // `generate_draft_options` engine — no prompt fork.
              setDraftOpen(true);
              if (onOpenInlineReply) {
                onOpenInlineReply();
              } else {
                try {
                  window.dispatchEvent(new CustomEvent('naitive:ai-assist:open-inline-draft', {
                    detail: { threadId: thread.threadId },
                  }));
                } catch {}
              }
              // Ensure both tones are generated so the radio cards populate.
              TONE_ORDER.forEach((tone) => {
                if (!result?.options[tone] && !loadingTones[tone]) {
                  void generateTone(tone);
                }
              });
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

          {/* Availability Check moved into the Schedule Meeting flow. It now
              renders at the top of MeetingSchedulerCard, which is launched
              from the Schedule Meeting quick action. */}

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
          {!dealId && !workflowAnalysis?.likely_deal?.id && (
            <>
              <RecognitionSuggestedLinkPill
                threadId={thread.threadId}
                onLinkDeal={async (id, name) => {
                  if (onLinkDeal) await onLinkDeal(id, name);
                }}
              />
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
            </>
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

          {/* Auto-surface availability check — when an inbound email
              proposes specific meeting times, parse them, cross-reference
              James's calendar, and show selectable slot chips with
              Available/Conflict status + one-click reply suggestions.
              Skipped on outbound-only threads, calendar invites, and
              automated notifications. The card self-hides via
              `hideWhenEmpty` if the LLM parser ultimately finds no
              concrete slots. We also suppress it while the full
              MeetingSchedulerCard is open so we don't double-render the
              same component. */}
          {(() => {
            const latest = thread.latestEmail;
            const fromMe = (latest?.from_email || '').toLowerCase() === 'jturner@5thline.co';
            if (fromMe) return null;
            if (schedulerOpen) return null;
            if (isCalendarOrAutomatedNoise(thread)) return null;
            const inboundTexts = [
              latest?.body_text,
              latest?.body_preview,
              latest?.snippet,
            ];
            if (!inboundProposedTimes(inboundTexts)) return null;
            return (
              <AvailabilityCheckCard
                thread={thread}
                onInsertDraft={onInsertDraft}
                hideWhenEmpty
              />
            );
          })()}

          {/* Auto-surface open-ended availability prompt (Scenario 3) —
              the inbound asks "are you free this week?" / "let me know
              what works" without proposing specific times. We propose
              open slots from James's calendar and draft a casual reply.
              Mutually exclusive with AvailabilityCheckCard above via
              inboundProposedTimes() gating inside detectOpenAvailability. */}
          {(() => {
            const latest = thread.latestEmail;
            const fromMe = (latest?.from_email || '').toLowerCase() === 'jturner@5thline.co';
            if (fromMe) return null;
            if (schedulerOpen) return null;
            if (isCalendarOrAutomatedNoise(thread)) return null;
            if (openAvailDismissed.has(thread.threadId)) return null;
            const inboundTexts = [
              latest?.body_text,
              latest?.body_preview,
              latest?.snippet,
              thread.subject,
            ];
            const request = detectOpenAvailabilityRequest(inboundTexts);
            if (!request) return null;
            return (
              <OpenAvailabilityCard
                request={request}
                onInsertDraft={onInsertDraft}
                onDismiss={() => {
                  setOpenAvailDismissed((prev) => {
                    const next = new Set(prev);
                    next.add(thread.threadId);
                    return next;
                  });
                }}
              />
            );
          })()}

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
            // While the workflow analysis is still in-flight and we have
            // nothing to render yet, surface a lightweight skeleton card
            // so the sidebar feels alive instead of empty.
            if (workflowLoading && !workflowAnalysis && updateCount === 0) {
              return (
                <div
                  className="rounded-md border border-primary/20 bg-primary/[0.04] p-2.5 space-y-2"
                  aria-hidden
                >
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-3.5 w-3.5 rounded-sm bg-primary/20" />
                    <Skeleton className="h-3 w-32 bg-primary/15" />
                    <Skeleton className="ml-auto h-4 w-6 rounded-full bg-primary/15" />
                  </div>
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-11/12" />
                  <Skeleton className="h-3 w-9/12" />
                  <div className="flex items-center gap-1.5 pt-1">
                    <Skeleton className="h-6 w-20 rounded-md" />
                    <Skeleton className="h-6 w-16 rounded-md" />
                  </div>
                </div>
              );
            }
            if (!showSection) return null;
            return (
              <div className="space-y-3">
                {/* Section header removed — the count badge now lives inside
                    the WorkflowIntelligenceCard header to avoid a duplicate
                    "Suggested Update" label outside the card border. */}

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
                    headerCount={updateCount}
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
                  lenderName={
                    workflowAnalysis?.likely_lender_firm?.name || undefined
                  }
                />

                {/* Proactive AI follow-up suggestions extracted from the
                    thread. Renders only after analysis completes. Approve
                    creates a task linked to the deal (and Asana when
                    enabled); Edit expands the standard inline form;
                    Dismiss is per-thread + per-suggestion (sessionStorage). */}
                <SuggestedFollowupsCard
                  suggestions={
                    followupSuggestions.length > 0
                      ? followupSuggestions
                      : (workflowAnalysis?.suggested_tasks || [])
                  }
                  loading={workflowLoading || followupLoading}
                  hasAnalyzed={!!workflowAnalysis}
                  dealId={dealId || workflowAnalysis?.likely_deal?.id || null}
                  dealName={dealName || workflowAnalysis?.likely_deal?.name || null}
                  threadId={thread.threadId}
                  subject={thread.subject || null}
                  senderEmail={thread.latestEmail?.from_email || null}
                  senderName={thread.latestEmail?.from_name || null}
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
          {scheduleHintActive && !schedulerOpen && (
            <div className="mx-3 mb-2 rounded-md border border-primary/30 bg-primary/[0.06] p-3 flex items-start gap-2.5">
              <CalendarClock className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium text-foreground leading-snug">
                  Looks like you're trying to schedule — want me to pull your available times?
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    size="sm"
                    className="h-7 text-[11px] px-2.5"
                    onClick={() => {
                      setSchedulerOpen(true);
                      setScheduleHintActive(false);
                    }}
                  >
                    Generate Times
                  </Button>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                aria-label="Dismiss"
                onClick={() => {
                  scheduleHintDismissedThreads.current.add(thread.threadId);
                  setScheduleHintActive(false);
                }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
          {schedulerOpen && (
            <MeetingSchedulerCard
              recipientEmail={thread.latestEmail?.from_email}
              recipientName={thread.latestEmail?.from_name || undefined}
              threadSubject={thread.subject}
              dealName={dealName}
              dealId={dealId}
              thread={thread}
              onInsert={(text) => onInsertDraft(text)}
              onClose={() => setSchedulerOpen(false)}
            />
          )}
          {/* Fix #3 — surface a stage-change nudge when the linked deal
              moved stages in the last week. Lets the user copy the new
              canonical meeting title (or jump into the scheduler). */}
          {dealId && (
            <StageMeetingTitleChip
              dealId={dealId}
              onOpenScheduler={() => setSchedulerOpen(true)}
            />
          )}

          {/* Inline Draft Reply workspace removed — the Draft Reply pop-out
              modal is now the single source of truth for AI draft generation,
              variant selection, intent refinement, regenerate, and insert.
              The sidebar keeps only context, quick actions, and suggested
              update cards. */}

        </div>
      </ScrollArea>
      </AIAssistOverlayProvider>

      {/* Footer actions */}
      <div className="border-t border-white/[0.06] px-3 py-3 flex items-center gap-2 shrink-0 min-w-0 w-full">
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
              <Bookmark className="h-3 w-3" /> Save Email to Deal
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
