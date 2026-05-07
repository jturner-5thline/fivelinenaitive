import { useState, type ReactNode } from 'react';
import { Loader2, Check, X, Quote, AlertCircle, Briefcase, User, Building2, Zap, Link2, Plus, Inbox as InboxIcon, Info } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { WorkflowAnalysis, WorkflowConfidence } from '@/hooks/useThreadWorkflowAnalysis';
import { useLenderStages } from '@/contexts/LenderStagesContext';
import { SuggestedTaskCards } from './SuggestedTaskCards';
import { useEnqueueAiAction } from '@/hooks/useAiActionQueue';

interface Props {
  analysis: WorkflowAnalysis;
  loading?: boolean;
  committing: boolean;
  hasLinkedDeal: boolean;
  /** Source thread id used to attach the email reference to created tasks. */
  threadId?: string | null;
  /**
   * Source-of-truth association flags resolved from the database by
   * useThreadWorkflowAnalysis. When `null`, resolution hasn't completed
   * yet — treat as "unknown" and suppress speculative warnings.
   */
  isThreadLinkedToDeal?: boolean | null;
  isLenderOnDeal?: boolean | null;
  onConfirm: (overrides?: {
    reasonNote?: string;
    confirmedStatus?: string;
    /**
     * Tracking-status group of the chosen Lender Stage (e.g. 'passed',
     * 'active', 'on-deck', 'on-hold'). Sourced from the stage's
     * `group` field in Settings → Lender Stages.
     */
    confirmedTrackingStatus?: string;
    /** Comma-joined label string (back-compat, written into deal_lenders.pass_reason). */
    confirmedDetail?: string;
    /** Multi-select: array of pass-reason LABELS (from useLenderStages().passReasons). */
    confirmedDetailLabels?: string[];
  }) => void;
  onDismiss: () => void;
  onMaybeLater: () => void;
  /**
   * Optional actionable card rendered in place of the
   * "No workflow update suggested for this thread." empty state.
   * Used to surface the data-room-upload suggestion when the thread
   * carries attachments and is linked to (or likely-matched to) a deal.
   */
  attachmentFallback?: ReactNode;
  /**
   * When true, suppress the embedded SuggestedTaskCards block. The
   * redesigned AI Assist sidebar renders task suggestions in its own
   * collapsible "Suggested Tasks" section so the workflow card stays
   * focused on the lender/deal status update.
   */
  hideSuggestedTasks?: boolean;
  /**
   * Optional count badge rendered in the card header (right side).
   * Used by AI Assist to surface the total number of suggested updates
   * inside this single card header instead of an outer section label.
   */
  headerCount?: number;
}

const CONFIDENCE_TONE: Record<WorkflowConfidence, string> = {
  high: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  medium: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  low: 'bg-muted text-muted-foreground border-border',
};

const SIGNAL_TONE: Record<string, string> = {
  terms_issued: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  positive_interest: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  meeting_request: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
  info_request: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
  diligence_question: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
  lender_pass: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  not_a_fit: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  access_issue: 'bg-red-500/10 text-red-400 border-red-500/30',
  internal_note: 'bg-muted text-muted-foreground border-border',
  no_signal: 'bg-muted text-muted-foreground border-border',
};

/**
 * Stage groups that close out a lender — show the disposition detail
 * (pass-reason) dropdown for these. Tied to the configurable Lender
 * Stages in Settings: any stage whose `group === 'passed'` is treated
 * as a closing stage. We deliberately key off the GROUP (not the
 * stage id) so user-renamed/added stages still classify correctly.
 */
const CLOSING_STAGE_GROUPS = new Set(['passed']);

/**
 * Best-effort fallback for legacy AI-emitted status tokens (e.g. the
 * old enum keys `passed`, `interested`, `in_diligence`, `follow_up`,
 * `not_a_fit`, `declined`) → resolve to the matching configured Lender
 * Stage id. Used only to PRE-SELECT a sensible default in the dropdown.
 */
function resolveAiStageId(
  aiToken: string | undefined,
  stageOptions: Array<{ id: string; label: string; group: string }>,
): string {
  if (stageOptions.length === 0) return '';
  const t = (aiToken || '').toLowerCase().trim();
  if (!t) return stageOptions[0].id;
  // Direct id or label match first.
  const direct = stageOptions.find((s) => s.id.toLowerCase() === t || s.label.toLowerCase() === t);
  if (direct) return direct.id;
  // Common AI tokens → group/keyword matches.
  const tokenToHints: Record<string, string[]> = {
    passed: ['pass'],
    not_a_fit: ['pass'],
    declined: ['pass'],
    interested: ['engaged', 'interest', 'on deck'],
    in_diligence: ['diligence', 'drl', 'review'],
    follow_up: ['follow', 'engaged'],
    terms_issued: ['term', 'draft'],
    info_requested: ['drl', 'review'],
    engaged: ['engaged', 'interest'],
  };
  const hints = tokenToHints[t] || [t];
  const hintMatch = stageOptions.find((s) =>
    hints.some((h) => s.id.toLowerCase().includes(h) || s.label.toLowerCase().includes(h)),
  );
  if (hintMatch) return hintMatch.id;
  // Final fallback: first active-group stage, else the first stage.
  const activeFallback = stageOptions.find((s) => s.group === 'active' || s.group === 'on-deck');
  return (activeFallback || stageOptions[0]).id;
}

/**
 * Convert "AI suggested" detail tokens (the old hardcoded enum keys returned
 * by Claude) into a human label so we can pre-select against the
 * company-configured pass-reason list. Best-effort only — if no match is
 * found we just show nothing and the user picks reasons themselves.
 */
const AI_DETAIL_TOKEN_TO_LABEL_HINT: Record<string, string[]> = {
  deal_size_mismatch: ['deal size', 'size'],
  industry_exclusion: ['industry', 'sector'],
  geographic_restriction: ['geograph', 'location', 'region'],
  risk_profile_concerns: ['risk', 'credit', 'leverage', 'burn'],
  timing_issues: ['timing', 'capacity'],
  relationship_issues: ['relationship'],
  terms_mismatch: ['terms', 'pricing', 'structure'],
  other: [],
};

// Stage resolution lives in resolveAiStageId() above — it operates on
// the user-configured Lender Stages from Settings (single source of
// truth), not the legacy hardcoded enum.

function logAnalytics(event: string, payload: Record<string, unknown>) {
  try {
    (window as any).dataLayer = (window as any).dataLayer || [];
    (window as any).dataLayer.push({ event, ...payload });
    window.dispatchEvent(new CustomEvent(event, { detail: payload }));
    console.debug('[WorkflowIntelligenceCard]', event, payload);
  } catch { /* ignore */ }
}

export function WorkflowIntelligenceCard({
  analysis,
  loading,
  committing,
  hasLinkedDeal,
  isThreadLinkedToDeal = null,
  isLenderOnDeal = null,
  onConfirm,
  onDismiss,
  onMaybeLater,
  attachmentFallback,
  threadId = null,
  hideSuggestedTasks = false,
}: Props) {
  // Source of truth for both Lender Stages and Pass Reasons — same lists
  // configured in Settings → Lender Stages and shown on the deal-detail
  // Lenders tab. Keeping them centralized here means any rename/reorder
  // in Settings flows through to this AI Assist card automatically.
  const {
    passReasons: passReasonOptions,
    stages: lenderStageOptions,
  } = useLenderStages();
  const enqueueAiAction = useEnqueueAiAction();

  const rec = analysis.recommended_update;
  const hasUpdate = rec.kind !== 'none' && !!rec.title;
  // The AI recommendation carries its own resolved deal id. As long as we
  // have a deal id from EITHER the persisted thread link OR the AI
  // recommendation OR the high-confidence likely_deal, we can confirm —
  // confirmRecommendation() in the hook already falls back through the
  // same chain (rec.deal_id || dealId || analysis.likely_deal.id) when
  // applying the update, so a separate manual link step is unnecessary.
  const resolvedDealId = rec.deal_id || analysis.likely_deal.id || '';
  // Treat the thread as linked when EITHER the parent prop says so OR the
  // DB-backed resolver confirmed it. Only show the "not linked" banner
  // when resolution finished AND came back false.
  const threadLinked = hasLinkedDeal || isThreadLinkedToDeal === true;
  const willAutoLinkThread =
    !threadLinked && isThreadLinkedToDeal === false && !!resolvedDealId && rec.kind !== 'none';
  // Pre-select a sensible default Stage from Settings based on the AI's
  // legacy token (e.g. "interested" → first matching configured stage).
  const aiSuggestedStageId = resolveAiStageId(rec.new_stage, lenderStageOptions);
  const stageLabelById = (id: string) =>
    lenderStageOptions.find((s) => s.id === id)?.label || id;
  const aiSuggestedDetailToken = (rec.suggested_detail || '').toLowerCase();

  /**
   * Map the AI's suggested-detail token (legacy enum) to a label from the
   * company-configured pass-reason list. This is best-effort — if we can't
   * find a match, we leave the selection empty and let the user pick.
   */
  const aiSuggestedLabels = (() => {
    if (!aiSuggestedDetailToken) return [] as string[];
    const hints = AI_DETAIL_TOKEN_TO_LABEL_HINT[aiSuggestedDetailToken] || [];
    if (hints.length === 0) return [];
    const match = passReasonOptions.find((opt) =>
      hints.some((h) => opt.label.toLowerCase().includes(h)),
    );
    return match ? [match.label] : [];
  })();

  const [reason, setReason] = useState(rec.reason_note || '');
  // `confirmedStatus` is now a configured Lender Stage **id** (from
  // Settings) rather than a hardcoded enum key. Persisted directly to
  // deal_lenders.stage on confirm.
  const [confirmedStatus, setConfirmedStatus] = useState<string>(aiSuggestedStageId);
  // Selected pass-reason LABELS — multi-select, capped at 3 to match the
  // deal-detail dialog UX.
  const [selectedReasonLabels, setSelectedReasonLabels] = useState<string[]>(aiSuggestedLabels);
  const [reasonPickerOpen, setReasonPickerOpen] = useState(false);
  const [renderedKey, setRenderedKey] = useState<string | null>(null);
  // The card used to be a 2-panel slider ("Suggested Update" / "Workflow
  // Intelligence") that required navigating between them. Per design, both
  // panels now render simultaneously as a single vertical card so users can
  // see the suggested action AND its supporting context at the same time
  // without paging.

  const analysisKey = `${analysis.signal.type}::${rec.lender_id || rec.master_lender_id || rec.lender_name}::${rec.new_stage}::${rec.suggested_detail || ''}::${passReasonOptions.length}::${lenderStageOptions.length}`;
  if (renderedKey !== analysisKey) {
    setRenderedKey(analysisKey);
    setConfirmedStatus(aiSuggestedStageId);
    setSelectedReasonLabels(aiSuggestedLabels);
    setReason(rec.reason_note || '');
    if (hasUpdate && rec.kind === 'lender_status') {
      logAnalytics('ai_suggested_update_rendered', {
        deal_id: rec.deal_id || analysis.likely_deal.id,
        lender_id: rec.lender_id || null,
        master_lender_id: rec.master_lender_id || null,
        lender_name: rec.lender_name,
        ai_suggested_stage_id: aiSuggestedStageId,
        ai_suggested_detail: aiSuggestedDetailToken || null,
        ai_suggested_labels: aiSuggestedLabels,
        signal_type: analysis.signal.type,
        confidence: rec.confidence,
        ambiguity_flags: rec.ambiguity_flags || [],
      });
    }
  }

  const userOverrodeStatus = confirmedStatus !== aiSuggestedStageId;
  const userOverrodeDetail =
    selectedReasonLabels.join('||') !== aiSuggestedLabels.join('||');
  const userOverrodeSuggestion = userOverrodeStatus || userOverrodeDetail;
  const isLenderStatus = rec.kind === 'lender_status';
  const selectedStage = lenderStageOptions.find((s) => s.id === confirmedStatus);
  const showDetailField = isLenderStatus && !!selectedStage && CLOSING_STAGE_GROUPS.has(selectedStage.group);

  // Lender association: trust the DB-backed resolver first (handles cases
  // where the AI didn't return a lender_id but the row is already on the
  // deal). Falls back to AI signals while resolution is in flight.
  const lenderAlreadyOnDeal = isLenderOnDeal === true || !!rec.lender_id;
  const lenderResolvable = !isLenderStatus
    || lenderAlreadyOnDeal
    || !!rec.master_lender_id
    || (!!rec.lender_name && (rec.confidence === 'high' || rec.confidence === 'medium'));
  // Only flag auto-link when resolution finished AND the lender is
  // genuinely missing. While `isLenderOnDeal === null` (still loading),
  // suppress the banner to avoid the false positive.
  const willAutoLink =
    isLenderStatus && isLenderOnDeal === false && !rec.lender_id && lenderResolvable;
  const dealResolved = !!resolvedDealId;
  // Confirm is allowed whenever we have a resolved deal + resolvable lender.
  // Missing thread→deal link is no longer a hard block; the backend uses
  // the resolved deal id directly.
  const canConfirm = !committing && lenderResolvable && dealResolved;

  // Final list of warnings to render — derived once so debug logging and
  // render logic stay in sync.
  const warningsToShow: string[] = [];
  if (willAutoLinkThread) warningsToShow.push('thread_not_linked');
  if (willAutoLink) warningsToShow.push('lender_not_on_deal');
  if (isLenderStatus && !lenderResolvable) warningsToShow.push('lender_unresolvable');

  // Temporary diagnostic logging — surfaces the exact gating state so we
  // can verify the SoLo Funds / Advantage Capital flow.
  // eslint-disable-next-line no-console
  console.debug('[WorkflowIntelligenceCard] confirm gating', {
    resolvedDealId,
    aiRecommendedDealId: rec.deal_id || null,
    likelyDealId: analysis.likely_deal.id || null,
    hasLinkedDeal,
    isThreadLinkedToDeal,
    threadLinked,
    willAutoLinkThread,
    resolvedLenderId: rec.lender_id || null,
    isLenderOnDeal,
    lenderAlreadyOnDeal,
    masterLenderId: rec.master_lender_id || null,
    lenderName: rec.lender_name || null,
    lenderResolvable,
    willAutoLink,
    confirmedStatus,
    selectedReasonLabels,
    committing,
    canConfirm,
    warningsToShow,
    blockingReason: !dealResolved
      ? 'no resolved deal id (rec.deal_id and analysis.likely_deal.id both empty)'
      : !lenderResolvable
      ? 'lender not resolvable (no lender_id / master_lender_id / confident name)'
      : committing
      ? 'commit in progress'
      : null,
  });

  const handleStatusChange = (next: string) => {
    setConfirmedStatus(next);
    logAnalytics('ai_suggested_update_modified', {
      field: 'stage',
      original_suggested_stage_id: aiSuggestedStageId,
      final_confirmed_stage_id: next,
    });
  };
  const toggleReasonLabel = (label: string) => {
    setSelectedReasonLabels((prev) => {
      const isSelected = prev.includes(label);
      // Cap at 3 to mirror the deal-detail "Confirm Pass" dialog UX.
      if (!isSelected && prev.length >= 3) return prev;
      const next = isSelected ? prev.filter((l) => l !== label) : [...prev, label];
      logAnalytics('ai_suggested_update_modified', {
        field: 'detail',
        original_suggested_labels: aiSuggestedLabels,
        final_confirmed_labels: next,
      });
      return next;
    });
  };

  const handleConfirm = () => {
    // Match the deal-detail Lenders tab format: comma-joined label string
    // saved to deal_lenders.pass_reason. Also pass the array so downstream
    // logging / disqualification rows can preserve granularity.
    const joinedDetail = showDetailField ? selectedReasonLabels.join(', ') : '';
    onConfirm({
      reasonNote: reason || rec.reason_note || '',
      confirmedStatus,
      // Derive tracking_status from the configured stage's group so the
      // deal_lenders row stays internally consistent with Settings.
      confirmedTrackingStatus: selectedStage?.group || undefined,
      confirmedDetail: joinedDetail,
      confirmedDetailLabels: showDetailField ? selectedReasonLabels : [],
    });
  };

  return (
    <div className="space-y-2 overflow-hidden max-w-full min-w-0 w-full">
      {/* Single header — both sections render stacked below, no pagination. */}
      <div className="flex items-center gap-1.5 min-w-0">
        <Sparkles className="h-3 w-3 text-primary shrink-0" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-primary/90 min-w-0 truncate">
          Suggested Update
        </span>
        {loading && <Loader2 className="h-2.5 w-2.5 animate-spin text-primary/60" />}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Why this was suggested"
              className="ml-auto shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-primary/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 transition-colors"
            >
              <Info className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="bottom"
            align="end"
            sideOffset={6}
            className="w-72 max-w-[80vw] p-3 space-y-2.5"
          >
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
              Why this was suggested
            </div>
            <div className="space-y-1.5 text-[11px]">
              <div className="flex items-start gap-1.5 min-w-0">
                <Briefcase className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground shrink-0">Deal:</span>
                <span className="text-foreground/90 font-medium min-w-0 flex-1" style={{ overflowWrap: 'anywhere' }}>
                  {analysis.likely_deal.name || <em className="text-muted-foreground">unknown</em>}
                </span>
                {analysis.likely_deal.confidence && analysis.likely_deal.name && (
                  <Badge variant="outline" className={cn('ml-auto shrink-0 text-[9px] h-3.5 px-1 border', CONFIDENCE_TONE[analysis.likely_deal.confidence])}>
                    {analysis.likely_deal.confidence}
                  </Badge>
                )}
              </div>
              <div className="flex items-start gap-1.5 min-w-0">
                <User className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground shrink-0">Contact:</span>
                <span className="text-foreground/90 min-w-0 flex-1" style={{ overflowWrap: 'anywhere' }}>
                  {analysis.likely_contact.name || <em className="text-muted-foreground">unknown</em>}
                </span>
              </div>
              <div className="flex items-start gap-1.5 min-w-0">
                <Building2 className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground shrink-0">Lender:</span>
                <span className="text-foreground/90 min-w-0 flex-1" style={{ overflowWrap: 'anywhere' }}>
                  {analysis.likely_lender_firm.name || <em className="text-muted-foreground">unknown</em>}
                </span>
                {analysis.likely_lender_firm.confidence && analysis.likely_lender_firm.name && (
                  <Badge variant="outline" className={cn('ml-auto shrink-0 text-[9px] h-3.5 px-1 border', CONFIDENCE_TONE[analysis.likely_lender_firm.confidence])}>
                    {analysis.likely_lender_firm.confidence}
                  </Badge>
                )}
              </div>
            </div>
            {analysis.signal.type !== 'no_signal' && (
              <div className="space-y-1.5 min-w-0 pt-2 border-t border-border/40">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Zap className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate min-w-0">
                    Detected signal
                  </span>
                  <Badge variant="outline" className={cn('ml-auto shrink-0 text-[9px] h-4 px-1.5 border', SIGNAL_TONE[analysis.signal.type] || CONFIDENCE_TONE.low)}>
                    {analysis.signal.label || analysis.signal.type}
                  </Badge>
                </div>
                {analysis.signal.supporting_quote && (
                  <blockquote className="text-[11px] text-muted-foreground italic border-l-2 border-primary/30 pl-2 leading-relaxed" style={{ overflowWrap: 'anywhere' }}>
                    <Quote className="h-2.5 w-2.5 inline mr-1 text-primary/40" />
                    {analysis.signal.supporting_quote}
                  </blockquote>
                )}
                {analysis.signal.nuance && (
                  <p className="text-[10px] text-amber-300/90 leading-relaxed" style={{ overflowWrap: 'anywhere' }}>
                    <AlertCircle className="h-2.5 w-2.5 inline mr-1" />
                    {analysis.signal.nuance}
                  </p>
                )}
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>

      {/* Stacked vertical layout — Suggested Update on top, Workflow
          Intelligence (entities + detected signal) immediately below as
          supporting context. No slider, no "1 of 2", no nav. */}
      <div className="space-y-3 max-w-full min-w-0 w-full">
        {/* SECTION 1 — Suggested Update (primary) */}
        <div className="min-w-0 space-y-2">
            {hasUpdate ? (
              <div className="space-y-2">
                <p
                  className="text-[13px] text-foreground font-semibold leading-snug max-w-full"
                  style={{ overflowWrap: 'anywhere', wordBreak: 'normal', whiteSpace: 'normal' }}
                >
                  {rec.title}
                </p>

                {/* Explicit deal-name confirmation chip — guarantees the
                    user sees which deal the suggestion will write to,
                    matching the deal in the AI panel header. */}
                {(rec.deal_name || analysis.likely_deal.name) && (
                  <div className="flex items-center gap-1.5 min-w-0 text-[11px] text-muted-foreground">
                    <Briefcase className="h-3 w-3 shrink-0" />
                    <span className="shrink-0">on</span>
                    <span
                      className="text-foreground/90 font-medium truncate min-w-0"
                      title={rec.deal_name || analysis.likely_deal.name}
                    >
                      {rec.deal_name || analysis.likely_deal.name}
                    </span>
                  </div>
                )}

                {isLenderStatus && (
                  lenderStageOptions.length === 0 ? (
                    // No Lender Stages configured — surface a clear inline
                    // CTA to Settings rather than a broken empty dropdown.
                    <div className="flex items-center gap-2 min-w-0 text-[11px] text-amber-300/90">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      <span className="min-w-0">
                        No Lender Stages configured.{' '}
                        <a
                          href="/settings?tab=lender-stages"
                          className="underline underline-offset-2 hover:text-amber-200"
                        >
                          Configure in Settings
                        </a>
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 min-w-0">
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground shrink-0">
                        Stage
                      </label>
                      <Select value={confirmedStatus} onValueChange={handleStatusChange}>
                        <SelectTrigger className="h-7 text-[11px] flex-1 min-w-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {lenderStageOptions.map((opt) => (
                            <SelectItem key={opt.id} value={opt.id} className="text-[11px]">
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )
                )}
                {isLenderStatus && userOverrodeStatus && lenderStageOptions.length > 0 && (
                  <div className="text-[10px] leading-tight -mt-1 line-clamp-1">
                    <span className="text-muted-foreground">AI: </span>
                    <span className="text-foreground/70">{stageLabelById(aiSuggestedStageId)}</span>
                    <span className="text-muted-foreground"> → </span>
                    <span className="text-primary font-medium">{stageLabelById(confirmedStatus)}</span>
                  </div>
                )}

                {showDetailField && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Detail / reason category {selectedReasonLabels.length > 0 && (
                        <span className="text-muted-foreground/70 normal-case font-normal">
                          ({selectedReasonLabels.length}/3)
                        </span>
                      )}
                    </label>
                    {/* Multi-select reason picker — chips display selected labels.
                        Options come from useLenderStages().passReasons, the same
                        list rendered by the deal-detail "Confirm Pass" dialog. */}
                    <div className="flex flex-wrap items-center gap-1 p-1.5 rounded border border-input bg-background min-h-[2rem]">
                      {selectedReasonLabels.map((label) => (
                        <Badge
                          key={label}
                          variant="secondary"
                          className="h-5 pl-2 pr-1 gap-1 text-[10px] font-normal bg-primary/10 text-primary border border-primary/20 hover:bg-primary/15"
                        >
                          <span className="truncate max-w-[140px]">{label}</span>
                          <button
                            type="button"
                            onClick={() => toggleReasonLabel(label)}
                            className="rounded hover:bg-primary/20 p-0.5"
                            aria-label={`Remove ${label}`}
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </Badge>
                      ))}
                      <Popover open={reasonPickerOpen} onOpenChange={setReasonPickerOpen}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            disabled={passReasonOptions.length === 0 || selectedReasonLabels.length >= 3}
                            className={cn(
                              'h-5 px-1.5 rounded text-[10px] inline-flex items-center gap-0.5 border border-dashed',
                              'border-muted-foreground/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                              'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent',
                            )}
                          >
                            <Plus className="h-2.5 w-2.5" />
                            {selectedReasonLabels.length === 0 ? 'Add reason' : 'Add'}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-[260px] p-1 z-[60]"
                          align="start"
                          side="bottom"
                          sideOffset={4}
                          collisionPadding={16}
                        >
                          <div className="max-h-[240px] overflow-y-auto overscroll-contain">
                            {passReasonOptions.length === 0 ? (
                              <p className="text-[11px] text-muted-foreground p-2">
                                No pass reasons configured. Add them in Settings.
                              </p>
                            ) : (
                              passReasonOptions.map((opt) => {
                                const isSelected = selectedReasonLabels.includes(opt.label);
                                const isDisabled = !isSelected && selectedReasonLabels.length >= 3;
                                return (
                                  <button
                                    key={opt.id}
                                    type="button"
                                    disabled={isDisabled}
                                    onClick={() => toggleReasonLabel(opt.label)}
                                    className={cn(
                                      'w-full text-left text-[11px] px-2 py-1.5 rounded hover:bg-accent flex items-center gap-2',
                                      isSelected && 'bg-accent/60',
                                      isDisabled && 'opacity-40 cursor-not-allowed hover:bg-transparent',
                                    )}
                                  >
                                    <span className={cn(
                                      'h-3 w-3 rounded border flex items-center justify-center shrink-0',
                                      isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/40',
                                    )}>
                                      {isSelected && <Check className="h-2 w-2 text-primary-foreground" />}
                                    </span>
                                    <span className="flex-1 leading-tight">{opt.label}</span>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                    {userOverrodeDetail && aiSuggestedLabels.length > 0 && (
                      <div className="text-[10px] leading-tight pt-0.5">
                        <span className="text-muted-foreground">AI suggested: </span>
                        <span className="text-foreground/70">{aiSuggestedLabels.join(', ')}</span>
                      </div>
                    )}
                  </div>
                )}

                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="h-7 text-[11px]"
                  placeholder="Add a note (optional)"
                />

                {willAutoLinkThread && (
                  <div className="flex items-start gap-1 text-[10px] text-primary/80 min-w-0">
                    <Link2 className="h-2.5 w-2.5 shrink-0" />
                    <span className="min-w-0 break-words" style={{ overflowWrap: 'anywhere' }}>
                      Will auto-link this thread to {analysis.likely_deal.name}.
                    </span>
                  </div>
                )}

                {willAutoLink && (
                  <div className="flex items-start gap-1 text-[10px] text-primary/80 min-w-0">
                    <Link2 className="h-2.5 w-2.5 shrink-0" />
                    <span className="min-w-0 break-words" style={{ overflowWrap: 'anywhere' }}>
                      Will auto-add {rec.lender_name || 'this lender'} to the deal.
                    </span>
                  </div>
                )}

                {isLenderStatus && !lenderResolvable && (
                  <div className="flex items-start gap-1 text-[10px] text-amber-300/90 min-w-0">
                    <AlertCircle className="h-2.5 w-2.5 shrink-0" />
                    <span className="min-w-0 break-words" style={{ overflowWrap: 'anywhere' }}>
                      Lender uncertain — add manually, then retry.
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-1 min-w-0">
                  <Button
                    size="sm"
                    className="h-7 px-2 text-[11px] gap-1 flex-1 min-w-0"
                    disabled={!canConfirm}
                    onClick={handleConfirm}
                  >
                    {committing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    Confirm
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[11px] gap-1 shrink-0"
                    title="Add to Action Queue for batch review"
                    onClick={async () => {
                      const isLenderUpdate = rec.kind === 'lender_status';
                      await enqueueAiAction({
                        action_type: isLenderUpdate ? 'update_lender_status' : 'log_note',
                        title: rec.title || 'AI suggestion',
                        description: reason || rec.reason_note || null,
                        deal_id: resolvedDealId || null,
                        deal_name: analysis.likely_deal?.name || null,
                        payload: {
                          kind: rec.kind,
                          // Stage id from Settings → Lender Stages (single
                          // source of truth). Persisted to deal_lenders.stage.
                          new_stage_id: confirmedStatus,
                          new_tracking_status: selectedStage?.group || null,
                          deal_lender_id: rec.lender_id || null,
                          lender_name: rec.lender_name,
                          pass_reasons: selectedReasonLabels,
                          reason_note: reason,
                        },
                        source: { thread_id: threadId },
                      });
                      onDismiss();
                    }}
                  >
                    <InboxIcon className="h-3 w-3" /> Queue
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-1.5 text-[11px] text-muted-foreground"
                    onClick={onMaybeLater}
                  >
                    Later
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-6 p-0 text-muted-foreground"
                    onClick={onDismiss}
                    title="Dismiss"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ) : attachmentFallback ? (
              attachmentFallback
            ) : (
              <p className="text-[11px] text-muted-foreground italic">
                No action items detected in this thread.
              </p>
            )}

            {/* Suggested next-action tasks detected from the email body. Render
                as confirm-first cards inline within the Suggested Update list
                so the user sees deal-level updates and task suggestions
                together. No modal, no form. */}
            {!hideSuggestedTasks && analysis.suggested_tasks && analysis.suggested_tasks.length > 0 && (
              <div className="pt-2 border-t border-primary/10">
                <SuggestedTaskCards
                  suggestions={analysis.suggested_tasks}
                  dealId={analysis.recommended_update.deal_id || analysis.likely_deal.id || null}
                  dealName={analysis.recommended_update.deal_name || analysis.likely_deal.name || null}
                  threadId={threadId}
                />
              </div>
            )}

            {analysis.secondary_action.kind !== 'none' && analysis.secondary_action.title && (
              <p
                className="text-[10px] text-muted-foreground/80 pt-1 border-t border-primary/10 max-w-full"
                style={{ overflowWrap: 'anywhere', whiteSpace: 'normal' }}
              >
                Also consider: <span className="text-foreground/70">{analysis.secondary_action.title}</span>
              </p>
            )}
        </div>

      </div>
    </div>
  );
}
