import { useState } from 'react';
import { Loader2, Check, X, Quote, AlertCircle, Briefcase, User, Building2, Zap } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { WorkflowAnalysis, WorkflowConfidence } from '@/hooks/useThreadWorkflowAnalysis';

interface Props {
  analysis: WorkflowAnalysis;
  loading?: boolean;
  committing: boolean;
  hasLinkedDeal: boolean;
  onConfirm: (overrides?: { reasonNote?: string; confirmedStatus?: string }) => void;
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

/**
 * Editable lender disposition options. The internal value is the canonical
 * status that we hand to `confirmRecommendation` — the human label is what
 * the user sees. "Passed" and "Not a Fit" are intentionally distinct.
 */
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

/** Map a model-suggested `new_stage` to one of our editable status options. */
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
    // Lightweight analytics hook — fans out to dataLayer / window event for
    // any analytics listener wired up elsewhere in the app.
    (window as any).dataLayer = (window as any).dataLayer || [];
    (window as any).dataLayer.push({ event, ...payload });
    window.dispatchEvent(new CustomEvent(event, { detail: payload }));
    // eslint-disable-next-line no-console
    console.debug('[WorkflowIntelligenceCard]', event, payload);
  } catch {
    /* ignore */
  }
}

/**
 * WorkflowIntelligenceCard
 * -------------------------
 * Confirm-first workflow assistant for the email AI sidebar. Surfaces
 * Claude-detected entities (deal, contact, lender firm), the workflow
 * signal extracted from the email, the supporting quote, and an explicit
 * recommended update with Confirm / Maybe later / Dismiss controls.
 */
export function WorkflowIntelligenceCard({
  analysis,
  loading,
  committing,
  hasLinkedDeal,
  onConfirm,
  onDismiss,
  onMaybeLater,
}: Props) {
  const rec = analysis.recommended_update;
  const hasUpdate = rec.kind !== 'none' && !!rec.title;
  const needsDealLink = !hasLinkedDeal && !!analysis.likely_deal.id && rec.kind !== 'none';
  const aiSuggestedStatus = normalizeSuggested(rec.new_stage);

  const [reason, setReason] = useState(rec.reason_note || '');
  const [confirmedStatus, setConfirmedStatus] = useState<string>(aiSuggestedStatus);
  const [renderedKey, setRenderedKey] = useState<string | null>(null);

  // Reset local state when the underlying analysis changes (e.g. new email).
  // Tracked by signal+lender+stage so we don't clobber an in-progress edit.
  const analysisKey = `${analysis.signal.type}::${rec.lender_id || rec.lender_name}::${rec.new_stage}`;
  if (renderedKey !== analysisKey) {
    setRenderedKey(analysisKey);
    setConfirmedStatus(aiSuggestedStatus);
    setReason(rec.reason_note || '');
    if (hasUpdate && rec.kind === 'lender_status') {
      logAnalytics('ai_suggested_update_rendered', {
        deal_id: rec.deal_id || analysis.likely_deal.id,
        lender_id: rec.lender_id,
        lender_name: rec.lender_name,
        ai_suggested_status: aiSuggestedStatus,
        signal_type: analysis.signal.type,
        confidence: rec.confidence,
      });
    }
  }

  const userOverrodeSuggestion = confirmedStatus !== aiSuggestedStatus;
  const isLenderStatus = rec.kind === 'lender_status';
  const lenderResolved = !isLenderStatus || !!rec.lender_id;
  const dealResolved = !!(rec.deal_id || analysis.likely_deal.id);
  const canConfirm = !committing && !needsDealLink && lenderResolved && dealResolved;

  const handleStatusChange = (next: string) => {
    setConfirmedStatus(next);
    logAnalytics('ai_suggested_update_modified', {
      deal_id: rec.deal_id,
      lender_id: rec.lender_id,
      lender_name: rec.lender_name,
      original_suggested_status: aiSuggestedStatus,
      final_confirmed_status: next,
    });
  };

  const handleConfirm = () => {
    logAnalytics('ai_suggested_update_confirmed', {
      deal_id: rec.deal_id,
      lender_id: rec.lender_id,
      lender_name: rec.lender_name,
      original_suggested_status: aiSuggestedStatus,
      final_confirmed_status: confirmedStatus,
      user_overrode_suggestion: userOverrodeSuggestion,
    });
    onConfirm({
      reasonNote: reason || rec.reason_note || '',
      confirmedStatus,
    });
  };

  return (
    <div className="rounded-md border border-primary/20 bg-primary/[0.04] p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-primary/90">
          Workflow Intelligence
        </span>
        {loading && <Loader2 className="h-3 w-3 animate-spin text-primary/60 ml-auto" />}
      </div>

      {/* Identified entities */}
      <div className="space-y-1.5 text-[11px]">
        <div className="flex items-start gap-1.5">
          <Briefcase className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground shrink-0">Deal:</span>
          <span className="text-foreground/90 font-medium truncate">
            {analysis.likely_deal.name || <em className="text-muted-foreground">unknown</em>}
          </span>
          {analysis.likely_deal.confidence && analysis.likely_deal.name && (
            <Badge
              variant="outline"
              className={cn('ml-auto text-[9px] h-3.5 px-1 border', CONFIDENCE_TONE[analysis.likely_deal.confidence])}
            >
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
            <Badge
              variant="outline"
              className={cn('ml-auto text-[9px] h-3.5 px-1 border', CONFIDENCE_TONE[analysis.likely_lender_firm.confidence])}
            >
              {analysis.likely_lender_firm.confidence}
            </Badge>
          )}
        </div>
      </div>

      {/* Detected signal */}
      {analysis.signal.type !== 'no_signal' && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Zap className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Detected signal
            </span>
            <Badge
              variant="outline"
              className={cn('ml-auto text-[9px] h-4 px-1.5 border', SIGNAL_TONE[analysis.signal.type] || CONFIDENCE_TONE.low)}
            >
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

      {/* Recommended update */}
      {hasUpdate && (
        <div className="space-y-2 pt-1 border-t border-primary/10">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Suggested update
          </div>
          <p className="text-[12px] text-foreground font-medium leading-snug">
            {rec.title}
          </p>

          {/* Editable disposition — only relevant for lender status updates. */}
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
              {userOverrodeSuggestion && (
                <div className="text-[10px] leading-tight pt-0.5">
                  <span className="text-muted-foreground">AI suggested: </span>
                  <span className="text-foreground/70">{STATUS_LABEL[aiSuggestedStatus]}</span>
                  <span className="text-muted-foreground"> · You are confirming: </span>
                  <span className="text-primary font-medium">{STATUS_LABEL[confirmedStatus]}</span>
                </div>
              )}
            </div>
          )}

          {/* Reason / note — always editable inline. */}
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

          {needsDealLink && (
            <div className="flex items-start gap-1.5 text-[10px] text-amber-300/90 bg-amber-500/[0.04] rounded p-2">
              <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>Link this thread to {analysis.likely_deal.name} first to apply this update.</span>
            </div>
          )}

          {rec.kind === 'lender_status' && !rec.lender_id && (
            <div className="flex items-start gap-1.5 text-[10px] text-amber-300/90 bg-amber-500/[0.04] rounded p-2">
              <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>{rec.lender_name || 'Lender'} is not on this deal — confirm the lender first.</span>
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
      )}

      {!hasUpdate && analysis.signal.type === 'no_signal' && (
        <p className="text-[11px] text-muted-foreground italic">
          No workflow update suggested for this thread.
        </p>
      )}

      {/* Secondary action hint */}
      {analysis.secondary_action.kind !== 'none' && analysis.secondary_action.title && (
        <p className="text-[10px] text-muted-foreground/80 pt-1 border-t border-primary/10">
          Also consider: <span className="text-foreground/70">{analysis.secondary_action.title}</span>
        </p>
      )}
    </div>
  );
}
