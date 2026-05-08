import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  X, User, Clock, CheckCircle2, XCircle, Bot, UserCheck,
  Sparkles, ArrowRight, AlertCircle, TrendingUp, Zap, Mail
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { cn } from '@/lib/utils';
import { EnrichedEmail } from '@/hooks/useEmailIntelligence';

// --- Types ---
type ApprovalState = 'pending' | 'approved' | 'rejected';
type ExecutorType = 'ai' | 'human';

interface SuggestedAction {
  id: string;
  title: string;
  description: string;
  executorType: ExecutorType;
  approvalState: ApprovalState;
}

// --- Helpers ---
function generateFallbackActions(email: EnrichedEmail): SuggestedAction[] {
  const actions: SuggestedAction[] = [];
  const analysis = email.analysis;

  if (analysis?.suggested_action) {
    actions.push({
      id: 'ai-suggested',
      title: 'AI Suggested Action',
      description: analysis.suggested_action,
      executorType: 'ai',
      approvalState: 'pending',
    });
  }

  if (analysis?.follow_up_needed) {
    actions.push({
      id: 'follow-up',
      title: 'Schedule Follow-up',
      description: `Send a follow-up${analysis.follow_up_by ? ` by ${analysis.follow_up_by}` : ' this week'}.`,
      executorType: 'human',
      approvalState: 'pending',
    });
  }

  if (analysis?.deal_id) {
    actions.push({
      id: 'log-activity',
      title: 'Log to Deal Timeline',
      description: `Add this email as an activity on ${analysis.deal_name || 'the matched deal'}.`,
      executorType: 'ai',
      approvalState: 'pending',
    });
  }

  if (actions.length === 0) {
    actions.push({
      id: 'reply',
      title: 'Draft a Reply',
      description: 'Compose a reply based on the email context.',
      executorType: 'human',
      approvalState: 'pending',
    });
  }

  return actions;
}

function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

const CATEGORY_COLORS: Record<string, string> = {
  deal_update: 'bg-primary/10 text-primary border-primary/20',
  lender_communication: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  follow_up_needed: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  terms_discussion: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  due_diligence: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  scheduling: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  internal: 'bg-muted text-muted-foreground border-muted',
  newsletter: 'bg-muted text-muted-foreground border-muted',
  other: 'bg-muted text-muted-foreground border-muted',
};

const CATEGORY_LABELS: Record<string, string> = {
  deal_update: 'Deal Update',
  lender_communication: 'Lender',
  follow_up_needed: 'Follow-up',
  terms_discussion: 'Terms',
  due_diligence: 'Diligence',
  scheduling: 'Scheduling',
  internal: 'Internal',
  newsletter: 'Newsletter',
  other: 'Other',
};

const SENTIMENT_META: Record<string, { icon: typeof Mail; label: string; className: string }> = {
  positive: { icon: TrendingUp, label: 'Positive', className: 'text-emerald-400' },
  negative: { icon: AlertCircle, label: 'Negative', className: 'text-destructive' },
  urgent: { icon: Zap, label: 'Urgent', className: 'text-amber-400' },
  neutral: { icon: Mail, label: 'Neutral', className: 'text-muted-foreground' },
};

// --- Sub-components ---

function EmailDetailHeader({ email, onClose }: { email: EnrichedEmail; onClose: () => void }) {
  const analysis = email.analysis;
  const sentiment = SENTIMENT_META[analysis?.sentiment || 'neutral'] || SENTIMENT_META.neutral;
  const SIcon = sentiment.icon;

  return (
    <div className="px-6 pt-6 pb-4 border-b glass-border-soft shrink-0">
      <div className="flex items-start justify-between gap-3">
        {/* Sender info */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center text-sm font-semibold text-primary shrink-0 backdrop-blur-sm">
            {getInitials(email.from_name)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-foreground truncate">
                {email.from_name || 'Unknown Sender'}
              </span>
              <span className="text-xs text-muted-foreground truncate">
                {email.from_email}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">
                {email.received_at
                  ? `${formatDistanceToNow(new Date(email.received_at), { addSuffix: true })} · ${format(new Date(email.received_at), 'MMM d, h:mm a')}`
                  : 'Unknown time'}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Subject */}
      <h2 className="text-base font-semibold text-foreground mt-3 leading-snug">
        {email.subject || '(No subject)'}
      </h2>

      {/* Tags row */}
      <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
        {analysis?.category && analysis.category !== 'other' && (
          <Badge variant="outline" className={cn('text-[10px] h-5 px-2 glass-border-soft', CATEGORY_COLORS[analysis.category])}>
            {CATEGORY_LABELS[analysis.category] || analysis.category}
          </Badge>
        )}
        <Badge variant="outline" className={cn('text-[10px] h-5 px-2 gap-1 glass-border-soft', sentiment.className)}>
          <SIcon className="h-3 w-3" />
          {sentiment.label}
        </Badge>
        {analysis?.priority === 'high' && (
          <Badge variant="outline" className="text-[10px] h-5 px-2 text-destructive border-destructive/20">
            High Priority
          </Badge>
        )}
        {analysis?.deal_name && (
          <Badge variant="outline" className="text-[10px] h-5 px-2 text-primary border-primary/20">
            {analysis.deal_name}
          </Badge>
        )}
      </div>
    </div>
  );
}

function EmailBodyPreview({ email }: { email: EnrichedEmail }) {
  const body = email.body_text || email.snippet || 'No email content available.';

  return (
    <div className="px-6 py-4">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
        Email Content
      </div>
      <div className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap break-words font-[inherit]">
        {body}
      </div>
    </div>
  );
}

function AIAnalysisPanel({ email }: { email: EnrichedEmail }) {
  const analysis = email.analysis;
  if (!analysis?.summary && (!analysis?.signals || analysis.signals.length === 0)) return null;

  const intents = analysis?.signals?.length
    ? analysis.signals
    : analysis?.category
      ? [analysis.category.replace(/_/g, ' ')]
      : [];

  return (
    <div className="mx-6 rounded-lg border border-primary/10 bg-primary/[0.04] backdrop-blur-sm p-4">
      <div className="flex items-center gap-2 mb-2.5">
        <div className="p-1 rounded-md bg-primary/10">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
        </div>
        <span className="text-xs font-semibold text-primary uppercase tracking-wider">
          AI Analysis
        </span>
      </div>
      {analysis?.summary && (
        <p className="text-sm text-foreground/85 leading-relaxed">
          {analysis.summary}
        </p>
      )}
      {intents.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {intents.map((intent, i) => (
            <span
              key={i}
              className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/10 capitalize"
            >
              {intent}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function SuggestedActionCard({
  action,
  onApprove,
  onReject,
}: {
  action: SuggestedAction;
  onApprove: () => void;
  onReject: () => void;
}) {
  const isApproved = action.approvalState === 'approved';
  const isRejected = action.approvalState === 'rejected';
  const isPending = action.approvalState === 'pending';

  return (
    <div
      className={cn(
        'rounded-lg border p-3 transition-all duration-200 backdrop-blur-sm',
        isApproved && 'border-emerald-500/20 bg-emerald-500/[0.06]',
        isRejected && 'border-destructive/15 bg-destructive/[0.04] opacity-60',
        isPending && 'glass-border-soft bg-white/[0.02] hover:bg-white/[0.04] hover:glass-border-soft'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-foreground">{action.title}</span>
            <Badge
              variant="outline"
              className={cn(
                'text-[9px] h-4 px-1.5 gap-0.5 glass-border-soft',
                action.executorType === 'ai'
                  ? 'text-primary'
                  : 'text-muted-foreground'
              )}
            >
              {action.executorType === 'ai' ? (
                <><Bot className="h-2.5 w-2.5" /> AI Executes</>
              ) : (
                <><UserCheck className="h-2.5 w-2.5" /> Human Required</>
              )}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {action.description}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isPending ? (
            <>
              <button
                onClick={onApprove}
                className="p-1.5 rounded-md text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                title="Approve"
              >
                <CheckCircle2 className="h-4 w-4" />
              </button>
              <button
                onClick={onReject}
                className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Reject"
              >
                <XCircle className="h-4 w-4" />
              </button>
            </>
          ) : isApproved ? (
            <span className="text-[10px] font-medium text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Approved
            </span>
          ) : (
            <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
              <XCircle className="h-3.5 w-3.5" /> Rejected
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ApprovalProgressFooter({
  actions,
}: {
  actions: SuggestedAction[];
}) {
  const approved = actions.filter(a => a.approvalState === 'approved');
  const approvedAI = approved.filter(a => a.executorType === 'ai');
  const total = actions.length;
  const canExecute = approvedAI.length > 0;

  return (
    <div className="px-6 py-4 border-t glass-border-soft shrink-0 flex items-center justify-between gap-3 bg-white/[0.02]">
      <span className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{approved.length}</span> of{' '}
        <span className="font-medium text-foreground">{total}</span> approved
        {approvedAI.length > 0 && (
          <span className="text-primary ml-1">· {approvedAI.length} AI-executable</span>
        )}
      </span>
      <Button
        size="sm"
        disabled={!canExecute}
        className="h-8 text-xs gap-1.5"
      >
        Execute Approved
        <ArrowRight className="h-3 w-3" />
      </Button>
    </div>
  );
}

// --- Main Modal ---

interface EmailDetailModalProps {
  email: EnrichedEmail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EmailDetailModal({ email, open, onOpenChange }: EmailDetailModalProps) {
  const [actions, setActions] = useState<SuggestedAction[]>([]);

  // Reset actions when email changes
  useEffect(() => {
    if (email) {
      setActions(generateFallbackActions(email));
    }
  }, [email?.id]);

  if (!email) return null;

  const handleApprove = (id: string) => {
    setActions(prev => prev.map(a => a.id === id ? { ...a, approvalState: 'approved' as const } : a));
  };

  const handleReject = (id: string) => {
    setActions(prev => prev.map(a => a.id === id ? { ...a, approvalState: 'rejected' as const } : a));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[94vw] h-[92vh] max-w-none sm:max-w-none max-h-none p-0 flex flex-col overflow-hidden gap-0 glass-border-soft bg-background/95 backdrop-blur-xl shadow-2xl shadow-black/40"
      >
        <DialogTitle className="sr-only">Email</DialogTitle>
        <EmailDetailHeader email={email} onClose={() => onOpenChange(false)} />

        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-4 pb-2">
            <EmailBodyPreview email={email} />
            <AIAnalysisPanel email={email} />

            {/* Suggested Actions */}
            <div className="px-6 pb-4">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2.5">
                Suggested Next Steps
              </div>
              <div className="space-y-2">
                {actions.map(action => (
                  <SuggestedActionCard
                    key={action.id}
                    action={action}
                    onApprove={() => handleApprove(action.id)}
                    onReject={() => handleReject(action.id)}
                  />
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>

        <ApprovalProgressFooter actions={actions} />
      </DialogContent>
    </Dialog>
  );
}
