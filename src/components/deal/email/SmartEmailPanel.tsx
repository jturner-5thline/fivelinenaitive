import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Sparkles,
  PenLine,
  FileText,
  Link2,
  Clock,
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  Copy,
  StickyNote,
  Loader2,
  ChevronDown,
  ChevronRight,
  Zap,
  TrendingUp,
  X,
  ClipboardList,
  FileSpreadsheet,
  CalendarClock,
  Send,
  Shield,
  DollarSign,
  Scale,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useSmartEmail, SmartEmailAction } from '@/hooks/useSmartEmail';
import { EmailThread, MockEmail } from './mockEmailData';

interface SmartEmailPanelProps {
  thread: EmailThread;
  dealId: string;
  onCreateNote?: (title: string, content: string) => void;
  onInsertDraft?: (draft: string) => void;
}

export function SmartEmailPanel({ thread, dealId, onCreateNote, onInsertDraft }: SmartEmailPanelProps) {
  const { execute, loading, results, clearResult } = useSmartEmail({ dealId });
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    actions: true,
    advanced: false,
    draft: false,
    auto_draft: false,
    summary: false,
    signals: false,
    extracted: false,
    followup: false,
    activity: false,
    term_sheet: false,
    follow_sequence: false,
  });

  const toggleSection = (key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleDraftReply = async () => {
    setExpandedSections(prev => ({ ...prev, draft: true }));
    await execute('draft_reply', thread.latestEmail, {
      subject: thread.subject,
      emails: thread.emails,
    });
  };

  const handleAutoDraft = async () => {
    setExpandedSections(prev => ({ ...prev, auto_draft: true }));
    await execute('auto_draft', thread.latestEmail, {
      subject: thread.subject,
      emails: thread.emails,
    });
  };

  const handleSummarize = async () => {
    setExpandedSections(prev => ({ ...prev, summary: true }));
    await execute('summarize_thread', null, {
      subject: thread.subject,
      emails: thread.emails,
    });
  };

  const handleExtractData = async () => {
    setExpandedSections(prev => ({ ...prev, extracted: true }));
    await execute('extract_data', thread.latestEmail, {
      subject: thread.subject,
    });
  };

  const handleDetectSignals = async () => {
    setExpandedSections(prev => ({ ...prev, signals: true }));
    await execute('detect_signals', thread.latestEmail, {
      subject: thread.subject,
    });
  };

  const handleFollowUp = async () => {
    setExpandedSections(prev => ({ ...prev, followup: true }));
    await execute('follow_up_check', null, {
      subject: thread.subject,
      emails: thread.emails,
      latestEmail: thread.latestEmail,
    });
  };

  const handleEmailToActivity = async () => {
    setExpandedSections(prev => ({ ...prev, activity: true }));
    const result = await execute('email_to_activity', null, {
      subject: thread.subject,
      emails: thread.emails,
    });
    if (result?.summary) {
      toast.success('Activity logged to deal timeline');
    }
  };

  const handleParseTermSheet = async () => {
    setExpandedSections(prev => ({ ...prev, term_sheet: true }));
    await execute('parse_term_sheet', thread.latestEmail, {
      subject: thread.subject,
      emails: thread.emails,
    });
  };

  const handleFollowUpSequence = async () => {
    setExpandedSections(prev => ({ ...prev, follow_sequence: true }));
    await execute('follow_up_sequence', null, {
      subject: thread.subject,
      emails: thread.emails,
      latestEmail: thread.latestEmail,
    });
  };

  const handleCopyDraft = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const handleEmailToNote = () => {
    const noteTitle = `Email: ${thread.subject}`;
    const noteContent = thread.emails
      .map(e => `**${e.from_name}** (${new Date(e.received_at).toLocaleDateString()}):\n\n${e.body_preview}`)
      .join('\n\n---\n\n');
    
    if (onCreateNote) {
      onCreateNote(noteTitle, noteContent);
    } else {
      navigator.clipboard.writeText(noteContent);
      toast.success('Email thread copied — paste into a Deal Space note');
    }
  };

  const draftResult = results.draft_reply;
  const autoDraftResult = results.auto_draft;
  const summaryResult = results.summarize_thread;
  const extractResult = results.extract_data;
  const signalResult = results.detect_signals;
  const followUpResult = results.follow_up_check;
  const activityResult = results.email_to_activity;
  const termSheetResult = results.parse_term_sheet;
  const followSequenceResult = results.follow_up_sequence;

  return (
    <div className="flex flex-col bg-popover overflow-y-auto overflow-x-hidden max-h-[70vh]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Smart Actions</span>
        <Badge variant="secondary" className="text-[10px] h-4 ml-auto">AI</Badge>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          
          {/* Quick Actions Grid */}
          <CollapsibleSection
            title="Quick Actions"
            icon={Zap}
            expanded={expandedSections.actions}
            onToggle={() => toggleSection('actions')}
          >
            <div className="grid grid-cols-2 gap-1.5">
              <SmartButton
                icon={PenLine}
                label="Draft Reply"
                loading={loading.draft_reply}
                onClick={handleDraftReply}
              />
              <SmartButton
                icon={Send}
                label="Auto-Draft"
                loading={loading.auto_draft}
                onClick={handleAutoDraft}
                highlight={thread.needsResponse}
              />
              <SmartButton
                icon={FileText}
                label="Summarize"
                loading={loading.summarize_thread}
                onClick={handleSummarize}
              />
              <SmartButton
                icon={ClipboardList}
                label="Log Activity"
                loading={loading.email_to_activity}
                onClick={handleEmailToActivity}
              />
              <SmartButton
                icon={BarChart3}
                label="Extract Data"
                loading={loading.extract_data}
                onClick={handleExtractData}
              />
              <SmartButton
                icon={TrendingUp}
                label="Detect Signals"
                loading={loading.detect_signals}
                onClick={handleDetectSignals}
              />
            </div>
          </CollapsibleSection>

          {/* Advanced Actions */}
          <CollapsibleSection
            title="Advanced"
            icon={Shield}
            expanded={expandedSections.advanced}
            onToggle={() => toggleSection('advanced')}
          >
            <div className="grid grid-cols-2 gap-1.5">
              <SmartButton
                icon={FileSpreadsheet}
                label="Parse Terms"
                loading={loading.parse_term_sheet}
                onClick={handleParseTermSheet}
              />
              <SmartButton
                icon={CalendarClock}
                label="Follow-Up Plan"
                loading={loading.follow_up_sequence}
                onClick={handleFollowUpSequence}
              />
              <SmartButton
                icon={Clock}
                label="Follow-up Check"
                loading={loading.follow_up_check}
                onClick={handleFollowUp}
              />
              <SmartButton
                icon={StickyNote}
                label="Save as Note"
                onClick={handleEmailToNote}
              />
            </div>
          </CollapsibleSection>

          {/* Auto-Draft Result */}
          {autoDraftResult && (
            <CollapsibleSection
              title="Auto-Draft Response"
              icon={Send}
              expanded={expandedSections.auto_draft}
              onToggle={() => toggleSection('auto_draft')}
              onClear={() => clearResult('auto_draft')}
            >
              <div className="rounded-lg border bg-primary/5 border-primary/20 p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles className="h-3 w-3 text-primary" />
                  <span className="text-[10px] font-medium text-primary">AI-Generated Response</span>
                </div>
                <p className="text-xs leading-relaxed whitespace-pre-wrap text-foreground/90">
                  {autoDraftResult}
                </p>
                <div className="flex gap-1.5 mt-3">
                  <Button variant="default" size="sm" className="h-7 text-[11px] gap-1" onClick={() => {
                    if (onInsertDraft) {
                      onInsertDraft(autoDraftResult);
                    } else {
                      handleCopyDraft(autoDraftResult);
                    }
                  }}>
                    <Send className="h-3 w-3" /> {onInsertDraft ? 'Use Draft' : 'Copy'}
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={handleAutoDraft}>
                    <Sparkles className="h-3 w-3" /> Regenerate
                  </Button>
                </div>
              </div>
            </CollapsibleSection>
          )}

          {/* Draft Reply Result */}
          {draftResult && (
            <CollapsibleSection
              title="AI Draft Reply"
              icon={PenLine}
              expanded={expandedSections.draft}
              onToggle={() => toggleSection('draft')}
              onClear={() => clearResult('draft_reply')}
            >
              <div className="rounded-lg border bg-card/60 p-3">
                <p className="text-xs leading-relaxed whitespace-pre-wrap text-foreground/90">
                  {draftResult}
                </p>
                <div className="flex gap-1.5 mt-3">
                  <Button variant="secondary" size="sm" className="h-7 text-[11px] gap-1" onClick={() => handleCopyDraft(draftResult)}>
                    <Copy className="h-3 w-3" /> Copy
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={handleDraftReply}>
                    <Sparkles className="h-3 w-3" /> Regenerate
                  </Button>
                </div>
              </div>
            </CollapsibleSection>
          )}

          {/* Activity Log Result */}
          {activityResult && (
            <CollapsibleSection
              title="Activity Logged"
              icon={ClipboardList}
              expanded={expandedSections.activity}
              onToggle={() => toggleSection('activity')}
              onClear={() => clearResult('email_to_activity')}
            >
              <div className="rounded-lg border bg-emerald-500/5 border-emerald-500/20 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-xs font-medium text-emerald-400">Logged to Timeline</span>
                  {activityResult.activity_type && (
                    <Badge variant="outline" className="text-[9px] h-4 border-emerald-500/20 text-emerald-400">
                      {activityResult.activity_type.replace(/_/g, ' ')}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-foreground/90 font-medium mb-2">{activityResult.summary}</p>
                {activityResult.key_details?.length > 0 && (
                  <ul className="space-y-1">
                    {activityResult.key_details.map((detail: string, i: number) => (
                      <li key={i} className="text-[11px] text-foreground/70 flex gap-1.5">
                        <span className="text-emerald-400 shrink-0">•</span>
                        {detail}
                      </li>
                    ))}
                  </ul>
                )}
                {activityResult.suggested_tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {activityResult.suggested_tags.map((tag: string, i: number) => (
                      <Badge key={i} variant="outline" className="text-[9px] h-4">{tag}</Badge>
                    ))}
                  </div>
                )}
              </div>
            </CollapsibleSection>
          )}

          {/* Term Sheet Parse Result */}
          {termSheetResult?.deal_terms && (
            <CollapsibleSection
              title="Parsed Term Sheet"
              icon={FileSpreadsheet}
              expanded={expandedSections.term_sheet}
              onToggle={() => toggleSection('term_sheet')}
              onClear={() => clearResult('parse_term_sheet')}
            >
              <div className="space-y-2">
                {/* Key Terms Table */}
                <div className="rounded-lg border bg-card/60 overflow-hidden">
                  <div className="px-2.5 py-1.5 border-b bg-muted/30">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Key Terms</span>
                  </div>
                  <table className="w-full">
                    <tbody>
                      {termSheetResult.deal_terms.facility_type && (
                        <TermRow label="Facility Type" value={termSheetResult.deal_terms.facility_type} />
                      )}
                      {termSheetResult.deal_terms.amount && (
                        <TermRow label="Amount" value={termSheetResult.deal_terms.amount} icon={DollarSign} />
                      )}
                      {termSheetResult.deal_terms.rate && (
                        <TermRow label="Rate" value={termSheetResult.deal_terms.rate} />
                      )}
                      {termSheetResult.deal_terms.spread && (
                        <TermRow label="Spread" value={termSheetResult.deal_terms.spread} />
                      )}
                      {termSheetResult.deal_terms.tenor && (
                        <TermRow label="Tenor" value={termSheetResult.deal_terms.tenor} />
                      )}
                      {termSheetResult.deal_terms.amortization && (
                        <TermRow label="Amortization" value={termSheetResult.deal_terms.amortization} />
                      )}
                      {termSheetResult.deal_terms.collateral && (
                        <TermRow label="Collateral" value={termSheetResult.deal_terms.collateral} />
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Covenants */}
                {termSheetResult.deal_terms.covenants?.length > 0 && (
                  <div className="rounded-lg border bg-card/60 p-2.5">
                    <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">COVENANTS</p>
                    <ul className="space-y-1">
                      {termSheetResult.deal_terms.covenants.map((c: string, i: number) => (
                        <li key={i} className="text-[11px] text-foreground/80 flex gap-1.5">
                          <Scale className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Fees */}
                {termSheetResult.deal_terms.fees?.length > 0 && (
                  <div className="rounded-lg border bg-card/60 overflow-hidden">
                    <div className="px-2.5 py-1.5 border-b bg-muted/30">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Fees</span>
                    </div>
                    <table className="w-full">
                      <tbody>
                        {termSheetResult.deal_terms.fees.map((f: any, i: number) => (
                          <TermRow key={i} label={f.type} value={f.amount} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Risk Flags */}
                {termSheetResult.risk_flags?.length > 0 && (
                  <div className="rounded-lg border bg-destructive/5 border-destructive/20 p-2.5">
                    <p className="text-[10px] font-semibold text-destructive mb-1.5">⚠️ RISK FLAGS</p>
                    <ul className="space-y-1">
                      {termSheetResult.risk_flags.map((flag: string, i: number) => (
                        <li key={i} className="text-[11px] text-foreground/80 flex gap-1.5">
                          <AlertTriangle className="h-3 w-3 text-destructive shrink-0 mt-0.5" />
                          {flag}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Negotiation Points */}
                {termSheetResult.negotiation_points?.length > 0 && (
                  <div className="rounded-lg border bg-amber-500/5 border-amber-500/20 p-2.5">
                    <p className="text-[10px] font-semibold text-amber-400 mb-1.5">💡 NEGOTIATION POINTS</p>
                    <ul className="space-y-1">
                      {termSheetResult.negotiation_points.map((point: string, i: number) => (
                        <li key={i} className="text-[11px] text-foreground/80 flex gap-1.5">
                          <span className="text-amber-400 shrink-0">→</span>
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Comparison Notes */}
                {termSheetResult.comparison_notes && (
                  <div className="rounded-lg border bg-primary/5 border-primary/20 p-2.5">
                    <p className="text-[10px] font-semibold text-primary mb-1">📊 MARKET COMPARISON</p>
                    <p className="text-[11px] text-foreground/80">{termSheetResult.comparison_notes}</p>
                  </div>
                )}
              </div>
            </CollapsibleSection>
          )}

          {/* Follow-Up Sequence Result */}
          {followSequenceResult && (
            <CollapsibleSection
              title="Follow-Up Plan"
              icon={CalendarClock}
              expanded={expandedSections.follow_sequence}
              onToggle={() => toggleSection('follow_sequence')}
              onClear={() => clearResult('follow_up_sequence')}
            >
              <div className="space-y-2">
                {/* Status Header */}
                <div className={cn(
                  'rounded-lg border p-2.5',
                  followSequenceResult.status === 'stale' ? 'bg-destructive/5 border-destructive/20' :
                  followSequenceResult.status === 'awaiting_response' ? 'bg-amber-500/5 border-amber-500/20' :
                  'bg-card/60'
                )}>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn(
                      'text-[9px] h-4',
                      followSequenceResult.status === 'stale' ? 'border-destructive/30 text-destructive' :
                      followSequenceResult.status === 'awaiting_response' ? 'border-amber-500/30 text-amber-400' :
                      'border-primary/30 text-primary'
                    )}>
                      {followSequenceResult.status?.replace(/_/g, ' ')}
                    </Badge>
                    {followSequenceResult.days_silent != null && (
                      <span className="text-[10px] text-muted-foreground">
                        {followSequenceResult.days_silent}d silent
                      </span>
                    )}
                  </div>
                  {followSequenceResult.context_notes && (
                    <p className="text-[11px] text-foreground/70 mt-1.5">{followSequenceResult.context_notes}</p>
                  )}
                </div>

                {/* Sequence Steps */}
                {followSequenceResult.recommended_sequence?.length > 0 && (
                  <div className="space-y-1.5">
                    {followSequenceResult.recommended_sequence.map((step: any, i: number) => (
                      <div key={i} className="rounded-lg border bg-card/60 p-2.5">
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-[10px] font-bold text-primary">{i + 1}</span>
                          </div>
                          <span className="text-[11px] font-medium">Day {step.day}</span>
                          <Badge variant="outline" className="text-[9px] h-4">{step.action}</Badge>
                          <Badge variant="outline" className={cn(
                            'text-[9px] h-4',
                            step.tone === 'urgent' ? 'border-destructive/30 text-destructive' :
                            step.tone === 'firm' ? 'border-amber-500/30 text-amber-400' :
                            'border-emerald-500/30 text-emerald-400'
                          )}>
                            {step.tone}
                          </Badge>
                        </div>
                        {step.draft && (
                          <div className="ml-7">
                            <p className="text-[11px] text-foreground/80 italic leading-relaxed">{step.draft}</p>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[10px] gap-1 mt-1 px-2"
                              onClick={() => handleCopyDraft(step.draft)}
                            >
                              <Copy className="h-2.5 w-2.5" /> Copy
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Escalation Trigger */}
                {followSequenceResult.escalation_trigger && (
                  <div className="rounded-lg border bg-destructive/5 border-destructive/20 p-2.5">
                    <p className="text-[10px] font-semibold text-destructive mb-1">Escalation Trigger</p>
                    <p className="text-[11px] text-foreground/80">{followSequenceResult.escalation_trigger}</p>
                  </div>
                )}
              </div>
            </CollapsibleSection>
          )}

          {/* Thread Summary Result */}
          {summaryResult && (
            <CollapsibleSection
              title="Thread Summary"
              icon={FileText}
              expanded={expandedSections.summary}
              onToggle={() => toggleSection('summary')}
              onClear={() => clearResult('summarize_thread')}
            >
              <div className="space-y-2">
                {summaryResult.summary && (
                  <div className="rounded-lg border bg-card/60 p-3">
                    <p className="text-[11px] font-medium text-muted-foreground mb-1">Summary</p>
                    <p className="text-xs leading-relaxed text-foreground/90">{summaryResult.summary}</p>
                  </div>
                )}
                {summaryResult.action_items?.length > 0 && (
                  <div className="rounded-lg border bg-amber-500/5 border-amber-500/20 p-3">
                    <p className="text-[11px] font-medium text-amber-400 mb-1.5">Action Items</p>
                    <ul className="space-y-1">
                      {summaryResult.action_items.map((item: string, i: number) => (
                        <li key={i} className="text-xs text-foreground/80 flex gap-1.5">
                          <span className="text-amber-400 shrink-0">•</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {summaryResult.next_steps?.length > 0 && (
                  <div className="rounded-lg border bg-primary/5 border-primary/20 p-3">
                    <p className="text-[11px] font-medium text-primary mb-1.5">Next Steps</p>
                    <ul className="space-y-1">
                      {summaryResult.next_steps.map((item: string, i: number) => (
                        <li key={i} className="text-xs text-foreground/80 flex gap-1.5">
                          <span className="text-primary shrink-0">→</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </CollapsibleSection>
          )}

          {/* Signal Detection Result */}
          {signalResult?.signals?.length > 0 && (
            <CollapsibleSection
              title="Detected Signals"
              icon={TrendingUp}
              expanded={expandedSections.signals}
              onToggle={() => toggleSection('signals')}
              onClear={() => clearResult('detect_signals')}
            >
              <div className="space-y-1.5">
                {signalResult.signals.map((signal: any, i: number) => (
                  <div
                    key={i}
                    className={cn(
                      'rounded-lg border p-2.5',
                      signal.urgency === 'high' ? 'bg-destructive/5 border-destructive/20' :
                      signal.type === 'positive_signal' ? 'bg-emerald-500/5 border-emerald-500/20' :
                      'bg-card/60 border-border/50'
                    )}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      {signal.type === 'risk_flag' ? (
                        <AlertTriangle className="h-3 w-3 text-destructive" />
                      ) : signal.type === 'positive_signal' ? (
                        <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                      ) : (
                        <Zap className="h-3 w-3 text-primary" />
                      )}
                      <Badge variant="outline" className={cn(
                        'text-[9px] h-4',
                        signal.urgency === 'high' ? 'border-destructive/30 text-destructive' :
                        signal.urgency === 'medium' ? 'border-amber-500/30 text-amber-400' :
                        'border-border text-muted-foreground'
                      )}>
                        {signal.urgency}
                      </Badge>
                      {signal.lender_name && (
                        <span className="text-[10px] text-muted-foreground truncate">{signal.lender_name}</span>
                      )}
                    </div>
                    <p className="text-xs text-foreground/80">{signal.description}</p>
                    {signal.suggested_action && (
                      <p className="text-[11px] text-primary mt-1">→ {signal.suggested_action}</p>
                    )}
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Data Extraction Result */}
          {extractResult?.terms?.length > 0 && (
            <CollapsibleSection
              title="Extracted Data"
              icon={BarChart3}
              expanded={expandedSections.extracted}
              onToggle={() => toggleSection('extracted')}
              onClear={() => clearResult('extract_data')}
            >
              <div className="rounded-lg border bg-card/60 overflow-hidden">
                <table className="w-full">
                  <tbody>
                    {extractResult.terms.map((term: any, i: number) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="text-[11px] text-muted-foreground py-1.5 px-2.5 w-[40%]">{term.label}</td>
                        <td className="text-xs text-foreground font-medium py-1.5 px-2.5">{term.value}</td>
                        <td className="py-1.5 px-2">
                          <Badge variant="outline" className={cn(
                            'text-[9px] h-4',
                            term.confidence === 'high' ? 'text-emerald-400 border-emerald-500/20' :
                            term.confidence === 'medium' ? 'text-amber-400 border-amber-500/20' :
                            'text-muted-foreground'
                          )}>
                            {term.confidence}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {extractResult.amounts?.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-[11px] font-medium text-muted-foreground">Amounts</p>
                  {extractResult.amounts.map((a: any, i: number) => (
                    <div key={i} className="flex justify-between text-xs px-2">
                      <span className="text-foreground/70">{a.description}</span>
                      <span className="font-medium">{a.amount}</span>
                    </div>
                  ))}
                </div>
              )}
            </CollapsibleSection>
          )}

          {/* Follow-Up Check Result */}
          {followUpResult && (
            <CollapsibleSection
              title="Follow-up Status"
              icon={Clock}
              expanded={expandedSections.followup}
              onToggle={() => toggleSection('followup')}
              onClear={() => clearResult('follow_up_check')}
            >
              <div className={cn(
                'rounded-lg border p-3',
                followUpResult.needs_follow_up 
                  ? followUpResult.urgency === 'high' 
                    ? 'bg-destructive/5 border-destructive/20' 
                    : 'bg-amber-500/5 border-amber-500/20'
                  : 'bg-emerald-500/5 border-emerald-500/20'
              )}>
                <div className="flex items-center gap-2 mb-2">
                  {followUpResult.needs_follow_up ? (
                    <Clock className={cn('h-4 w-4', followUpResult.urgency === 'high' ? 'text-destructive' : 'text-amber-400')} />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  )}
                  <span className="text-xs font-medium">
                    {followUpResult.needs_follow_up ? 'Follow-up Needed' : 'No Follow-up Needed'}
                  </span>
                  {followUpResult.days_since_last_reply != null && (
                    <Badge variant="outline" className="text-[9px] h-4 ml-auto">
                      {followUpResult.days_since_last_reply}d ago
                    </Badge>
                  )}
                </div>
                {followUpResult.suggested_follow_up && (
                  <div className="mt-2 rounded border bg-background/60 p-2">
                    <p className="text-[11px] text-muted-foreground mb-1">Suggested follow-up:</p>
                    <p className="text-xs text-foreground/80 italic">{followUpResult.suggested_follow_up}</p>
                  </div>
                )}
              </div>
            </CollapsibleSection>
          )}

          {/* Deal Context Badge */}
          <div className="rounded-lg border bg-muted/20 p-3 mt-2">
            <div className="flex items-center gap-2 mb-1">
              <Link2 className="h-3.5 w-3.5 text-primary" />
              <span className="text-[11px] font-medium">Deal Context Active</span>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              AI actions use full deal data including writeup, lender stages, milestones, and activity history for context-aware responses.
            </p>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── Term Row Helper ───
function TermRow({ label, value, icon: Icon }: { label: string; value: string; icon?: any }) {
  return (
    <tr className="border-b last:border-0">
      <td className="text-[11px] text-muted-foreground py-1.5 px-2.5 w-[40%]">
        <div className="flex items-center gap-1">
          {Icon && <Icon className="h-3 w-3" />}
          {label}
        </div>
      </td>
      <td className="text-xs text-foreground font-medium py-1.5 px-2.5">{value}</td>
    </tr>
  );
}

// ─── Collapsible Section ───
function CollapsibleSection({
  title,
  icon: Icon,
  expanded,
  onToggle,
  onClear,
  children,
}: {
  title: string;
  icon: any;
  expanded: boolean;
  onToggle: () => void;
  onClear?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card/30">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors rounded-t-lg"
      >
        <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-xs font-medium flex-1">{title}</span>
        {onClear && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                role="button"
                onClick={(e) => { e.stopPropagation(); onClear(); }}
                className="p-0.5 rounded hover:bg-muted transition-colors"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="left" className="text-xs">Clear</TooltipContent>
          </Tooltip>
        )}
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        )}
      </button>
      {expanded && <div className="px-3 pb-3 pt-1">{children}</div>}
    </div>
  );
}

// ─── Smart Action Button ───
function SmartButton({
  icon: Icon,
  label,
  loading,
  onClick,
  highlight,
}: {
  icon: any;
  label: string;
  loading?: boolean;
  onClick: () => void;
  highlight?: boolean;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      className={cn(
        'h-9 text-[11px] gap-1.5 justify-start px-2.5 font-normal',
        highlight && 'border-primary/30 bg-primary/5 text-primary hover:bg-primary/10'
      )}
      onClick={onClick}
      disabled={loading}
    >
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin shrink-0" />
      ) : (
        <Icon className="h-3 w-3 shrink-0" />
      )}
      {label}
    </Button>
  );
}
