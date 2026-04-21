import { useState } from 'react';
import { Loader2, Check, X, Quote, AlertCircle, Briefcase, User, Building2, Zap, Link2, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { WorkflowAnalysis, WorkflowConfidence } from '@/hooks/useThreadWorkflowAnalysis';
import { useLenderStages } from '@/contexts/LenderStagesContext';

interface Props {
  analysis: WorkflowAnalysis;
  loading?: boolean;
  committing: boolean;
  hasLinkedDeal: boolean;
  onConfirm: (overrides?: {
    reasonNote?: string;
    confirmedStatus?: string;
    /** Comma-joined label string (back-compat, written into deal_lenders.pass_reason). */
    confirmedDetail?: string;
    /** Multi-select: array of pass-reason LABELS (from useLenderStages().passReasons). */
    confirmedDetailLabels?: string[];
  }) => void;
  onDismiss: () => void;
  onMaybeLater: () => void;
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

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'passed', label: 'Passed' },
  { value: 'not_a_fit', label: 'Not a Fit' },
  { value: 'interested', label: 'Interested' },
  { value: 'in_diligence', label: 'In Diligence' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'declined', label: 'Declined' },
];
const STATUS_LABEL: Record<string, string> = STATUS_OPTIONS.reduce((acc, o) => {
  acc[o.value] = o.label;
  return acc;
}, {} as Record<string, string>);

/** Statuses that close out a lender — show the disposition detail dropdown. */
const CLOSING_STATUSES = new Set(['passed', 'not_a_fit', 'declined']);

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

function normalizeSuggested(stage: string | undefined): string {
  if (!stage) return 'follow_up';
  const s = stage.toLowerCase();
  if (STATUS_LABEL[s]) return s;
  if (s === 'terms_issued') return 'in_diligence';
  if (s === 'info_requested' || s === 'engaged') return 'follow_up';
  return 'follow_up';
}

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
  onConfirm,
  onDismiss,
  onMaybeLater,
}: Props) {
  // Source of truth for pass-reason options — same list shown in the
  // deal-detail Lenders tab "Confirm Pass" dialog so the two stay in sync.
  const { passReasons: passReasonOptions } = useLenderStages();

  const rec = analysis.recommended_update;
  const hasUpdate = rec.kind !== 'none' && !!rec.title;
  // The AI recommendation carries its own resolved deal id. As long as we
  // have a deal id from EITHER the persisted thread link OR the AI
  // recommendation OR the high-confidence likely_deal, we can confirm —
  // confirmRecommendation() in the hook already falls back through the
  // same chain (rec.deal_id || dealId || analysis.likely_deal.id) when
  // applying the update, so a separate manual link step is unnecessary.
  const resolvedDealId = rec.deal_id || analysis.likely_deal.id || '';
  const willAutoLinkThread = !hasLinkedDeal && !!resolvedDealId && rec.kind !== 'none';
  const aiSuggestedStatus = normalizeSuggested(rec.new_stage);
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
  const [confirmedStatus, setConfirmedStatus] = useState<string>(aiSuggestedStatus);
  // Selected pass-reason LABELS — multi-select, capped at 3 to match the
  // deal-detail dialog UX.
  const [selectedReasonLabels, setSelectedReasonLabels] = useState<string[]>(aiSuggestedLabels);
  const [reasonPickerOpen, setReasonPickerOpen] = useState(false);
  const [renderedKey, setRenderedKey] = useState<string | null>(null);
  // Two-panel slider: 'suggested' (primary, default) <-> 'intelligence' (entities + signal context).
  const [activePanel, setActivePanel] = useState<'suggested' | 'intelligence'>('suggested');

  const analysisKey = `${analysis.signal.type}::${rec.lender_id || rec.master_lender_id || rec.lender_name}::${rec.new_stage}::${rec.suggested_detail || ''}::${passReasonOptions.length}`;
  if (renderedKey !== analysisKey) {
    setRenderedKey(analysisKey);
    setConfirmedStatus(aiSuggestedStatus);
    setSelectedReasonLabels(aiSuggestedLabels);
    setReason(rec.reason_note || '');
    if (hasUpdate && rec.kind === 'lender_status') {
      logAnalytics('ai_suggested_update_rendered', {
        deal_id: rec.deal_id || analysis.likely_deal.id,
        lender_id: rec.lender_id || null,
        master_lender_id: rec.master_lender_id || null,
        lender_name: rec.lender_name,
        ai_suggested_status: aiSuggestedStatus,
        ai_suggested_detail: aiSuggestedDetailToken || null,
        ai_suggested_labels: aiSuggestedLabels,
        signal_type: analysis.signal.type,
        confidence: rec.confidence,
        ambiguity_flags: rec.ambiguity_flags || [],
      });
    }
  }

  const userOverrodeStatus = confirmedStatus !== aiSuggestedStatus;
  const userOverrodeDetail =
    selectedReasonLabels.join('||') !== aiSuggestedLabels.join('||');
  const userOverrodeSuggestion = userOverrodeStatus || userOverrodeDetail;
  const isLenderStatus = rec.kind === 'lender_status';
  const showDetailField = isLenderStatus && CLOSING_STATUSES.has(confirmedStatus);

  // Smart linking: lender is "resolvable" when it's already on the deal OR
  // we have a master_lender_id OR a confident firm name we can auto-create.
  const lenderResolvable = !isLenderStatus
    || !!rec.lender_id
    || !!rec.master_lender_id
    || (!!rec.lender_name && (rec.confidence === 'high' || rec.confidence === 'medium'));
  const willAutoLink = isLenderStatus && !rec.lender_id && lenderResolvable;
  const dealResolved = !!resolvedDealId;
  // Confirm is allowed whenever we have a resolved deal + resolvable lender.
  // Missing thread→deal link is no longer a hard block; the backend uses
  // the resolved deal id directly.
  const canConfirm = !committing && lenderResolvable && dealResolved;

  // Temporary diagnostic logging — surfaces the exact gating state so we
  // can verify the SoLo Funds / Advantage Capital flow.
  // eslint-disable-next-line no-console
  console.debug('[WorkflowIntelligenceCard] confirm gating', {
    resolvedDealId,
    aiRecommendedDealId: rec.deal_id || null,
    likelyDealId: analysis.likely_deal.id || null,
    hasLinkedDeal,
    willAutoLinkThread,
    resolvedLenderId: rec.lender_id || null,
    masterLenderId: rec.master_lender_id || null,
    lenderName: rec.lender_name || null,
    lenderResolvable,
    willAutoLink,
    confirmedStatus,
    selectedReasonLabels,
    committing,
    canConfirm,
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
      field: 'status',
      original_suggested_status: aiSuggestedStatus,
      final_confirmed_status: next,
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
      confirmedDetail: joinedDetail,
      confirmedDetailLabels: showDetailField ? selectedReasonLabels : [],
    });
  };

  return (
    <div className="rounded-md border border-primary/20 bg-primary/[0.04] p-3 space-y-3 overflow-hidden max-w-full">
      {/* Header — title swaps with the active panel; arrow controls slide between the two. */}
      <div className="flex items-center gap-2">
        {activePanel === 'intelligence' && (
          <button
            type="button"
            onClick={() => setActivePanel('suggested')}
            className="h-5 w-5 -ml-1 rounded hover:bg-primary/10 flex items-center justify-center text-primary/80"
            aria-label="Back to suggested update"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        )}
        <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-primary/90">
          {activePanel === 'suggested' ? 'Suggested Update' : 'Workflow Intelligence'}
        </span>
        {loading && <Loader2 className="h-3 w-3 animate-spin text-primary/60" />}
        <div className="ml-auto flex items-center gap-1">
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground/70">
            {activePanel === 'suggested' ? '1 / 2' : '2 / 2'}
          </span>
          {activePanel === 'suggested' ? (
            <button
              type="button"
              onClick={() => setActivePanel('intelligence')}
              className="h-5 w-5 rounded hover:bg-primary/10 flex items-center justify-center text-primary/80"
              aria-label="View workflow intelligence"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setActivePanel('suggested')}
              className="h-5 w-5 rounded hover:bg-primary/10 flex items-center justify-center text-primary/80"
              aria-label="Back to suggested update"
            >
              <ChevronRight className="h-3.5 w-3.5 rotate-180" />
            </button>
          )}
        </div>
      </div>

      {/* Sliding viewport — two panels share width; transform controls which is visible. */}
      <div className="relative overflow-hidden max-w-full">
        <div
          className="flex w-[200%] transition-transform duration-300 ease-out"
          style={{ transform: activePanel === 'suggested' ? 'translateX(0%)' : 'translateX(-50%)' }}
        >
          {/* PANEL 1 — Suggested Update (primary) */}
          <div className="w-1/2 shrink-0 pr-2 space-y-3">
            {hasUpdate ? (
              <div className="space-y-2">
                <p className="text-[12px] text-foreground font-medium leading-snug">{rec.title}</p>

                {isLenderStatus && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Status
                    </label>
                    <Select value={confirmedStatus} onValueChange={handleStatusChange}>
                      <SelectTrigger className="h-8 text-[11px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value} className="text-[11px]">
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {userOverrodeStatus && (
                      <div className="text-[10px] leading-tight pt-0.5">
                        <span className="text-muted-foreground">AI suggested: </span>
                        <span className="text-foreground/70">{STATUS_LABEL[aiSuggestedStatus]}</span>
                        <span className="text-muted-foreground"> · You are confirming: </span>
                        <span className="text-primary font-medium">{STATUS_LABEL[confirmedStatus]}</span>
                      </div>
                    )}
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

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Note
                  </label>
                  <Input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="h-8 text-[11px]"
                    placeholder="Reason / context for this update"
                  />
                </div>

                {willAutoLinkThread && (
                  <div className="flex items-start gap-1.5 text-[10px] text-primary/80 bg-primary/[0.05] rounded p-2">
                    <Link2 className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>
                      This thread isn't linked to {analysis.likely_deal.name} yet — confirming will
                      apply the update on that deal directly.
                    </span>
                  </div>
                )}

                {willAutoLink && (
                  <div className="flex items-start gap-1.5 text-[10px] text-primary/80 bg-primary/[0.05] rounded p-2">
                    <Link2 className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>
                      {rec.lender_name || 'This lender'} isn't on this deal yet — confirming will
                      auto-link them and apply the update in one step.
                    </span>
                  </div>
                )}

                {isLenderStatus && !lenderResolvable && (
                  <div className="flex items-start gap-1.5 text-[10px] text-amber-300/90 bg-amber-500/[0.04] rounded p-2">
                    <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>Lender match is uncertain. Add the lender to the deal manually, then retry.</span>
                  </div>
                )}

                <div className="flex items-center gap-1.5 pt-1">
                  <Button
                    size="sm"
                    className="h-7 px-2 text-[11px] gap-1 flex-1"
                    disabled={!canConfirm}
                    onClick={handleConfirm}
                  >
                    {committing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    Confirm
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px] text-muted-foreground"
                    onClick={onMaybeLater}
                  >
                    Maybe later
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground"
                    onClick={onDismiss}
                    title="Dismiss"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground italic">
                No workflow update suggested for this thread.
              </p>
            )}

            {analysis.secondary_action.kind !== 'none' && analysis.secondary_action.title && (
              <p className="text-[10px] text-muted-foreground/80 pt-1 border-t border-primary/10">
                Also consider: <span className="text-foreground/70">{analysis.secondary_action.title}</span>
              </p>
            )}
          </div>

          {/* PANEL 2 — Workflow Intelligence (entities + detected signal) */}
          <div className="w-1/2 shrink-0 pl-2 space-y-3">
            <div className="space-y-1.5 text-[11px]">
        <div className="flex items-start gap-1.5">
          <Briefcase className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground shrink-0">Deal:</span>
          <span className="text-foreground/90 font-medium truncate">
            {analysis.likely_deal.name || <em className="text-muted-foreground">unknown</em>}
          </span>
          {analysis.likely_deal.confidence && analysis.likely_deal.name && (
            <Badge variant="outline" className={cn('ml-auto text-[9px] h-3.5 px-1 border', CONFIDENCE_TONE[analysis.likely_deal.confidence])}>
              {analysis.likely_deal.confidence}
            </Badge>
          )}
        </div>
        <div className="flex items-start gap-1.5">
          <User className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground shrink-0">Contact:</span>
          <span className="text-foreground/90 truncate">
            {analysis.likely_contact.name || <em className="text-muted-foreground">unknown</em>}
          </span>
        </div>
        <div className="flex items-start gap-1.5">
          <Building2 className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground shrink-0">Lender:</span>
          <span className="text-foreground/90 truncate">
            {analysis.likely_lender_firm.name || <em className="text-muted-foreground">unknown</em>}
          </span>
          {analysis.likely_lender_firm.confidence && analysis.likely_lender_firm.name && (
            <Badge variant="outline" className={cn('ml-auto text-[9px] h-3.5 px-1 border', CONFIDENCE_TONE[analysis.likely_lender_firm.confidence])}>
              {analysis.likely_lender_firm.confidence}
            </Badge>
          )}
        </div>
      </div>

            {analysis.signal.type !== 'no_signal' && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Zap className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Detected signal
                  </span>
                  <Badge variant="outline" className={cn('ml-auto text-[9px] h-4 px-1.5 border', SIGNAL_TONE[analysis.signal.type] || CONFIDENCE_TONE.low)}>
                    {analysis.signal.label || analysis.signal.type}
                  </Badge>
                </div>
                {analysis.signal.supporting_quote && (
                  <blockquote className="text-[11px] text-muted-foreground italic border-l-2 border-primary/30 pl-2 leading-relaxed">
                    <Quote className="h-2.5 w-2.5 inline mr-1 text-primary/40" />
                    {analysis.signal.supporting_quote}
                  </blockquote>
                )}
                {analysis.signal.nuance && (
                  <p className="text-[10px] text-amber-300/90 leading-relaxed">
                    <AlertCircle className="h-2.5 w-2.5 inline mr-1" />
                    {analysis.signal.nuance}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
