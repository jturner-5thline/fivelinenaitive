import { useState } from 'react';
import { Loader2, Check, X, Quote, AlertCircle, Briefcase, User, Building2, Zap, Link2 } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { WorkflowAnalysis, WorkflowConfidence } from '@/hooks/useThreadWorkflowAnalysis';
import { PASS_REASON_LABELS, type LenderPassReasonCategory } from '@/hooks/useLenderDisqualifications';

interface Props {
  analysis: WorkflowAnalysis;
  loading?: boolean;
  committing: boolean;
  hasLinkedDeal: boolean;
  onConfirm: (overrides?: { reasonNote?: string; confirmedStatus?: string; confirmedDetail?: string }) => void;
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

const DETAIL_OPTIONS = (Object.keys(PASS_REASON_LABELS) as LenderPassReasonCategory[]).map((k) => ({
  value: k,
  label: PASS_REASON_LABELS[k],
}));

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
  const rec = analysis.recommended_update;
  const hasUpdate = rec.kind !== 'none' && !!rec.title;
  const needsDealLink = !hasLinkedDeal && !!analysis.likely_deal.id && rec.kind !== 'none';
  const aiSuggestedStatus = normalizeSuggested(rec.new_stage);
  const aiSuggestedDetail = (rec.suggested_detail || '').toLowerCase();

  const [reason, setReason] = useState(rec.reason_note || '');
  const [confirmedStatus, setConfirmedStatus] = useState<string>(aiSuggestedStatus);
  const [confirmedDetail, setConfirmedDetail] = useState<string>(aiSuggestedDetail);
  const [renderedKey, setRenderedKey] = useState<string | null>(null);

  const analysisKey = `${analysis.signal.type}::${rec.lender_id || rec.master_lender_id || rec.lender_name}::${rec.new_stage}::${rec.suggested_detail || ''}`;
  if (renderedKey !== analysisKey) {
    setRenderedKey(analysisKey);
    setConfirmedStatus(aiSuggestedStatus);
    setConfirmedDetail(aiSuggestedDetail);
    setReason(rec.reason_note || '');
    if (hasUpdate && rec.kind === 'lender_status') {
      logAnalytics('ai_suggested_update_rendered', {
        deal_id: rec.deal_id || analysis.likely_deal.id,
        lender_id: rec.lender_id || null,
        master_lender_id: rec.master_lender_id || null,
        lender_name: rec.lender_name,
        ai_suggested_status: aiSuggestedStatus,
        ai_suggested_detail: aiSuggestedDetail || null,
        signal_type: analysis.signal.type,
        confidence: rec.confidence,
        ambiguity_flags: rec.ambiguity_flags || [],
      });
    }
  }

  const userOverrodeStatus = confirmedStatus !== aiSuggestedStatus;
  const userOverrodeDetail = confirmedDetail !== aiSuggestedDetail;
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
  const dealResolved = !!(rec.deal_id || analysis.likely_deal.id);
  const canConfirm = !committing && !needsDealLink && lenderResolvable && dealResolved;

  const handleStatusChange = (next: string) => {
    setConfirmedStatus(next);
    logAnalytics('ai_suggested_update_modified', {
      field: 'status',
      original_suggested_status: aiSuggestedStatus,
      final_confirmed_status: next,
    });
  };
  const handleDetailChange = (next: string) => {
    setConfirmedDetail(next);
    logAnalytics('ai_suggested_update_modified', {
      field: 'detail',
      original_suggested_detail: aiSuggestedDetail,
      final_confirmed_detail: next,
    });
  };

  const handleConfirm = () => {
    onConfirm({
      reasonNote: reason || rec.reason_note || '',
      confirmedStatus,
      confirmedDetail: showDetailField ? confirmedDetail : '',
    });
  };

  return (
    <div className="rounded-md border border-primary/20 bg-primary/[0.04] p-3 space-y-3">
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

      {/* Detected signal */}
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

      {/* Recommended update */}
      {hasUpdate && (
        <div className="space-y-2 pt-1 border-t border-primary/10">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Suggested update
          </div>
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

          {/* Disposition detail — same taxonomy as the lenders-page modal. */}
          {showDetailField && (
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Detail / reason category
              </label>
              <Select value={confirmedDetail || 'other'} onValueChange={handleDetailChange}>
                <SelectTrigger className="h-8 text-[11px]">
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  {DETAIL_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-[11px]">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {userOverrodeDetail && aiSuggestedDetail && (
                <div className="text-[10px] leading-tight pt-0.5">
                  <span className="text-muted-foreground">AI suggested: </span>
                  <span className="text-foreground/70">
                    {PASS_REASON_LABELS[aiSuggestedDetail as LenderPassReasonCategory] || aiSuggestedDetail}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Note — always editable. */}
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

          {/* Smart linking notice — replaces the dead-end warning. */}
          {willAutoLink && !needsDealLink && (
            <div className="flex items-start gap-1.5 text-[10px] text-primary/80 bg-primary/[0.05] rounded p-2">
              <Link2 className="h-3 w-3 mt-0.5 shrink-0" />
              <span>
                {rec.lender_name || 'This lender'} isn't on this deal yet — confirming will
                auto-link them and apply the update in one step.
              </span>
            </div>
          )}

          {/* Genuine ambiguity fallback (no firm name AND no confident match). */}
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
      )}

      {!hasUpdate && analysis.signal.type === 'no_signal' && (
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
  );
}
