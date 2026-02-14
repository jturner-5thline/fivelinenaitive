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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useSmartEmail, SmartEmailAction } from '@/hooks/useSmartEmail';
import { EmailThread, MockEmail } from './mockEmailData';

interface SmartEmailPanelProps {
  thread: EmailThread;
  dealId: string;
  onCreateNote?: (title: string, content: string) => void;
}

export function SmartEmailPanel({ thread, dealId, onCreateNote }: SmartEmailPanelProps) {
  const { execute, loading, results, clearResult } = useSmartEmail({ dealId });
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    actions: true,
    draft: false,
    summary: false,
    signals: false,
    extracted: false,
    followup: false,
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

  const handleCopyDraft = () => {
    if (results.draft_reply) {
      navigator.clipboard.writeText(results.draft_reply);
      toast.success('Draft copied to clipboard');
    }
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
  const summaryResult = results.summarize_thread;
  const extractResult = results.extract_data;
  const signalResult = results.detect_signals;
  const followUpResult = results.follow_up_check;

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
                icon={FileText}
                label="Summarize"
                loading={loading.summarize_thread}
                onClick={handleSummarize}
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
                  <Button variant="secondary" size="sm" className="h-7 text-[11px] gap-1" onClick={handleCopyDraft}>
                    <Copy className="h-3 w-3" /> Copy
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={handleDraftReply}>
                    <Sparkles className="h-3 w-3" /> Regenerate
                  </Button>
                </div>
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
}: {
  icon: any;
  label: string;
  loading?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-auto py-2 px-2 flex flex-col items-center gap-1 text-[10px] font-medium hover:bg-primary/5 hover:border-primary/30 transition-all"
      onClick={onClick}
      disabled={loading}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
      ) : (
        <Icon className="h-4 w-4 text-primary" />
      )}
      {label}
    </Button>
  );
}
