import { useState, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, X, Check, Edit3, RefreshCw, AlertTriangle, Briefcase, ChevronDown, ChevronUp } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { EmailThread } from './mockEmailData';

export interface DraftOptions {
  detected_intent: string;
  draft_type: string;
  confidence: 'high' | 'medium' | 'low';
  requires_more_context: boolean;
  missing_context_items: string[];
  used_deal_context: boolean;
  used_calendar_context: boolean;
  option_1_subject: string;
  option_1_body: string;
  option_1_tone_label: string;
  option_1_rationale: string;
  option_2_subject: string;
  option_2_body: string;
  option_2_tone_label: string;
  option_2_rationale: string;
  recommended_option: 1 | 2;
  recommended_option_reason: string;
  suggested_follow_up_actions: string[];
  cited_context_sources: string[];
}

type DraftType = 'reply' | 'first_touch' | 'follow_up' | 'reminder' | 'resend';

/**
 * One-click draft modes surfaced in the dashboard inbox detail toolbar.
 * Each maps to a baked-in instruction block appended to customInstructions
 * before generation, so the underlying smart-email-ai endpoint stays generic.
 */
export type DraftMode = 'answer_question' | 'invite_call' | 'request_info';

const DRAFT_MODE_INSTRUCTIONS: Record<DraftMode, string> = {
  answer_question:
    "MODE: ANSWER THE SENDER'S QUESTION using verified naitive deal data. " +
    "Identify the sender's specific question or request and respond directly. " +
    "Cite only deal facts present in the supplied context (deal name, stage, deal size, lender status, outstanding items, recent activity, analyst notes). " +
    "If a needed fact is not present, say so briefly and indicate when you'll follow up — do not invent figures, dates, or statuses.",
  invite_call:
    "MODE: INVITE THE SENDER TO A CALL. " +
    "Acknowledge their last message in one sentence, propose a brief call to discuss, and offer two specific timing windows (e.g. 'tomorrow afternoon ET' and 'Thursday morning ET') without committing to specific calendar slots. " +
    "Keep it under ~80 words. End with a soft CTA asking which window works.",
  request_info:
    "MODE: REQUEST MORE INFORMATION FROM THE SENDER. " +
    "Open with a one-line acknowledgement, then list 2–4 specific items you need from them, derived where possible from the deal's outstanding items. " +
    "Frame the request as needed to move the deal forward. Be concise and professional; do not over-explain.",
};

const DRAFT_MODE_LABELS: Record<DraftMode, string> = {
  answer_question: 'Answer with deal data',
  invite_call: 'Invite to call',
  request_info: 'Request more info',
};

interface Props {
  thread: EmailThread;
  dealId?: string;
  onClose: () => void;
  onApprove: (subject: string, body: string) => void;
  initialDraftType?: DraftType;
  /** Preselects a one-click mode and auto-runs generation on mount. */
  initialMode?: DraftMode;
}

const DRAFT_TYPE_LABELS: Record<DraftType, string> = {
  reply: 'Reply',
  first_touch: 'First Touch',
  follow_up: 'Follow-up',
  reminder: 'Reminder',
  resend: 'Resend',
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  low: 'bg-red-500/10 text-red-400 border-red-500/20',
};

const SOURCE_LABELS: Record<string, string> = {
  deal_metadata: 'Deal Info',
  deal_writeup: 'Writeup',
  deal_lenders: 'Lenders',
  milestones: 'Milestones',
  recent_activity: 'Activity',
  deal_notes: 'Notes',
  email_thread_only: 'Email Only',
  // Injected fact keys (set by smart-email-ai when the model actually used them in the body)
  lender_name: 'Funding Source Name',
  lender_stage: 'Lender Stage',
  outstanding_items: 'Outstanding Items',
  deal_stage: 'Deal Stage',
  analyst_note: 'Analyst Note',
  key_terms: 'Key Terms',
  outstanding_items_data: 'Outstanding Items',
  status_notes: 'Status Notes',
  deal_state_snapshot: 'Live State',
};

export function AiDraftReviewPanel({ thread, dealId, onClose, onApprove, initialDraftType = 'reply', initialMode }: Props) {
  const [loading, setLoading] = useState(false);
  const [draftOptions, setDraftOptions] = useState<DraftOptions | null>(null);
  const [selectedOption, setSelectedOption] = useState<1 | 2 | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedSubject, setEditedSubject] = useState('');
  const [editedBody, setEditedBody] = useState('');
  const [draftType, setDraftType] = useState<DraftType>(initialDraftType);
  const [customInstructions, setCustomInstructions] = useState(
    initialMode ? DRAFT_MODE_INSTRUCTIONS[initialMode] : ''
  );
  const [activeMode, setActiveMode] = useState<DraftMode | null>(initialMode ?? null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showContextDetails, setShowContextDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateDrafts = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelectedOption(null);
    setIsEditing(false);
    try {
      const threadData = {
        subject: thread.subject,
        emails: thread.emails.map(e => ({
          from_name: e.from_name,
          from_email: e.from_email,
          to_name: e.to_name,
          to_email: e.to_email,
          subject: e.subject,
          body_preview: e.body_preview?.substring(0, 1500),
          received_at: e.received_at,
          snippet: e.snippet,
        })),
        latestEmail: thread.latestEmail,
      };

      const { data, error: fnError } = await supabase.functions.invoke('smart-email-ai', {
        body: {
          action: 'generate_draft_options',
          dealId,
          threadData,
          draftType,
          customInstructions: customInstructions.trim() || undefined,
        },
      });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      const result = data?.result;
      if (!result || result.raw) {
        throw new Error('Invalid response format');
      }

      setDraftOptions(result);
      // Auto-select recommended
      setSelectedOption(result.recommended_option || 1);
      setEditedSubject(result.recommended_option === 2 ? result.option_2_subject : result.option_1_subject);
      setEditedBody(result.recommended_option === 2 ? result.option_2_body : result.option_1_body);
    } catch (err: any) {
      console.error('AI Draft error:', err);
      setError(err.message || 'Failed to generate drafts. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [thread, dealId, draftType, customInstructions]);

  // Auto-run generation when opened with a preselected one-click mode so the
  // user lands directly on the editable draft.
  const autoRanRef = useRef(false);
  useEffect(() => {
    if (initialMode && !autoRanRef.current && !draftOptions && !loading) {
      autoRanRef.current = true;
      void generateDrafts();
    }
  }, [initialMode, draftOptions, loading, generateDrafts]);

  const handleSelectOption = (opt: 1 | 2) => {
    if (!draftOptions) return;
    setSelectedOption(opt);
    setIsEditing(false);
    setEditedSubject(opt === 1 ? draftOptions.option_1_subject : draftOptions.option_2_subject);
    setEditedBody(opt === 1 ? draftOptions.option_1_body : draftOptions.option_2_body);
  };

  const handleApprove = () => {
    onApprove(editedSubject, editedBody);
  };

  // ─── Pre-generation view ─────────────────────────────────────
  if (!draftOptions && !loading && !error) {
    return (
      <div className="mx-4 mb-3 rounded-lg border border-primary/20 bg-primary/[0.03] overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-primary/10">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold text-primary">AI Draft Email</span>
          <div className="flex-1" />
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="h-3 w-3" />
          </Button>
        </div>
        <div className="p-4 space-y-3">
          {/* Draft type selector */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Draft Type</p>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(DRAFT_TYPE_LABELS) as DraftType[]).map(dt => (
                <button
                  key={dt}
                  onClick={() => setDraftType(dt)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors',
                    draftType === dt
                      ? 'bg-primary/10 border-primary/30 text-primary'
                      : 'border-border/40 text-muted-foreground hover:bg-muted/30'
                  )}
                >
                  {DRAFT_TYPE_LABELS[dt]}
                </button>
              ))}
            </div>
          </div>

          {/* Optional instructions */}
          <div>
            <button
              onClick={() => setShowInstructions(!showInstructions)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {showInstructions ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              Custom instructions (optional)
            </button>
            {showInstructions && (
              <Textarea
                value={customInstructions}
                onChange={e => setCustomInstructions(e.target.value)}
                placeholder="E.g. 'Mention we need the signed NDA by Friday' or 'Keep it under 3 sentences'"
                className="mt-1.5 text-xs min-h-[60px] resize-y bg-muted/20"
              />
            )}
          </div>

          {/* Deal context indicator */}
          {dealId && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Briefcase className="h-3 w-3 text-primary/60" />
              <span>Deal context will be included</span>
            </div>
          )}

          <Button
            onClick={generateDrafts}
            className="w-full h-8 text-xs gap-1.5"
            size="sm"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Generate 2 Draft Options
          </Button>
        </div>
      </div>
    );
  }

  // ─── Loading state ────────────────────────────────────────────
  if (loading) {
    return (
      <div className="mx-4 mb-3 rounded-lg border border-primary/20 bg-primary/[0.03] overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-primary/10">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold text-primary">AI Draft Email</span>
          <div className="flex-1" />
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="h-3 w-3" />
          </Button>
        </div>
        <div className="flex flex-col items-center gap-2 py-8">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-xs text-muted-foreground">Generating draft options...</span>
          <span className="text-[10px] text-muted-foreground/60">Assembling deal context and drafting</span>
        </div>
      </div>
    );
  }

  // ─── Error state ──────────────────────────────────────────────
  if (error) {
    return (
      <div className="mx-4 mb-3 rounded-lg border border-primary/20 bg-primary/[0.03] overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-primary/10">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold text-primary">AI Draft Email</span>
          <div className="flex-1" />
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="h-3 w-3" />
          </Button>
        </div>
        <div className="p-4 text-center space-y-2">
          <AlertTriangle className="h-5 w-5 text-destructive mx-auto" />
          <p className="text-xs text-destructive">{error}</p>
          <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={generateDrafts}>
            <RefreshCw className="h-3 w-3" /> Try Again
          </Button>
        </div>
      </div>
    );
  }

  if (!draftOptions) return null;

  // ─── Review view with 2 options ───────────────────────────────
  const getOptionData = (opt: 1 | 2) => ({
    subject: opt === 1 ? draftOptions.option_1_subject : draftOptions.option_2_subject,
    body: opt === 1 ? draftOptions.option_1_body : draftOptions.option_2_body,
    tone: opt === 1 ? draftOptions.option_1_tone_label : draftOptions.option_2_tone_label,
    rationale: opt === 1 ? draftOptions.option_1_rationale : draftOptions.option_2_rationale,
  });

  return (
    <div className="mx-4 mb-3 rounded-lg border border-primary/20 bg-primary/[0.03] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-primary/10">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold text-primary">AI Draft Review</span>
        <Badge variant="outline" className={cn('text-[9px] h-4 border', CONFIDENCE_COLORS[draftOptions.confidence])}>
          {draftOptions.confidence} confidence
        </Badge>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={generateDrafts}>
          <RefreshCw className="h-3 w-3" /> Regenerate
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-3 w-3" />
        </Button>
      </div>

      <ScrollArea className="max-h-[500px]">
        <div className="p-3 space-y-3">
          {/* Intent + warnings */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="text-[9px] h-4">{draftOptions.draft_type}</Badge>
            <span className="text-[10px] text-muted-foreground">{draftOptions.detected_intent}</span>
          </div>

          {draftOptions.requires_more_context && draftOptions.missing_context_items?.length > 0 && (
            <div className="flex items-start gap-2 p-2 rounded-md bg-amber-500/5 border border-amber-500/15 text-[11px]">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-medium text-amber-400">Missing context: </span>
                <span className="text-muted-foreground">{draftOptions.missing_context_items.join(', ')}</span>
              </div>
            </div>
          )}

          {/* Context sources */}
          {draftOptions.cited_context_sources?.length > 0 && (
            <div>
              <button
                onClick={() => setShowContextDetails(!showContextDetails)}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <Briefcase className="h-3 w-3" />
                Context used: {draftOptions.cited_context_sources.length} sources
                {showContextDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
              {showContextDetails && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {draftOptions.cited_context_sources.map(src => (
                    <Badge key={src} variant="outline" className="text-[9px] h-4">
                      {SOURCE_LABELS[src] || src}
                    </Badge>
                  ))}
                  {draftOptions.used_deal_context && <Badge variant="outline" className="text-[9px] h-4 border-primary/30 text-primary">Deal ✓</Badge>}
                  {draftOptions.used_calendar_context && <Badge variant="outline" className="text-[9px] h-4 border-primary/30 text-primary">Calendar ✓</Badge>}
                </div>
              )}
            </div>
          )}

          {/* Two draft options */}
          <div className="space-y-2">
            {([1, 2] as const).map(opt => {
              const d = getOptionData(opt);
              const isSelected = selectedOption === opt;
              const isRecommended = draftOptions.recommended_option === opt;

              return (
                <button
                  key={opt}
                  onClick={() => handleSelectOption(opt)}
                  className={cn(
                    'w-full text-left rounded-lg border p-3 transition-all',
                    isSelected
                      ? 'border-primary/40 bg-primary/[0.06] ring-1 ring-primary/20'
                      : 'border-border/40 bg-card/30 hover:border-primary/20 hover:bg-primary/[0.02]'
                  )}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className={cn(
                      'h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors',
                      isSelected ? 'border-primary bg-primary' : 'border-border/60'
                    )}>
                      {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    <span className="text-[11px] font-semibold text-foreground">Option {opt}</span>
                    <Badge variant="outline" className="text-[9px] h-4">{d.tone}</Badge>
                    {isRecommended && (
                      <Badge className="text-[9px] h-4 bg-primary/15 text-primary border-primary/25">
                        ★ Recommended
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] font-medium text-foreground/80 mb-1">Subject: {d.subject}</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-4" style={{ whiteSpace: 'pre-wrap' }}>{d.body}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1.5 italic">{d.rationale}</p>
                </button>
              );
            })}
          </div>

          {/* Editing */}
          {selectedOption && (
            <div className="space-y-2">
              {!isEditing ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px] gap-1"
                  onClick={() => setIsEditing(true)}
                >
                  <Edit3 className="h-3 w-3" /> Edit before sending
                </Button>
              ) : (
                <div className="space-y-2 rounded-md border border-border/40 p-2 bg-muted/10">
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground">Subject</label>
                    <input
                      value={editedSubject}
                      onChange={e => setEditedSubject(e.target.value)}
                      className="w-full mt-0.5 px-2 py-1 text-xs rounded border border-border/40 bg-background focus:outline-none focus:ring-1 focus:ring-primary/30"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground">Body</label>
                    <Textarea
                      value={editedBody}
                      onChange={e => setEditedBody(e.target.value)}
                      className="mt-0.5 text-xs min-h-[100px] resize-y"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px]"
                    onClick={() => setIsEditing(false)}
                  >
                    Done editing
                  </Button>
                </div>
              )}

              {/* Approve & send */}
              <Button
                onClick={handleApprove}
                className="w-full h-8 text-xs gap-1.5"
                size="sm"
              >
                <Check className="h-3.5 w-3.5" />
                Use This Draft
              </Button>
            </div>
          )}

          {/* Suggested follow-ups */}
          {draftOptions.suggested_follow_up_actions?.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Suggested Follow-ups</p>
              <div className="space-y-1">
                {draftOptions.suggested_follow_up_actions.map((action, i) => (
                  <p key={i} className="text-[10px] text-muted-foreground/80">• {action}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
