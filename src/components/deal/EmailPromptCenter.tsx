import { useEffect, useRef, useState } from 'react';
import { Mail, Send, X, Eye, Clock, CheckCircle, AlertCircle, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useDealEmailPrompts,
  useDismissEmailPrompt,
  useMarkEmailSent,
  type DealEmailPrompt,
} from '@/hooks/useDealEmailPrompts';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import DOMPurify from 'dompurify';
import { applyDemoLenderSalutation } from '@/lib/demoLenderSalutation';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DraftAndSendDialog } from '@/components/deal/DraftAndSendDialog';

interface EmailPromptCenterProps {
  dealId: string;
  dealName?: string;
  contactEmail?: string | null;
}

export function EmailPromptCenterButton({ dealId, dealName, contactEmail }: EmailPromptCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const { pendingCount, data: prompts } = useDealEmailPrompts(dealId);

  // Per-tab session dedup: track which pending prompt ids we've already
  // dispatched an auto-open event for, so revisiting the deal page doesn't
  // re-fire for the same prompt within the same session. The
  // WorkflowEmailModalListener has its own per-tab dedup as well.
  const autoOpenedRef = useRef<Set<string>>(new Set());

  // Trigger A: when the deal page mounts (or pending prompts arrive after
  // a stage change committed in the background), auto-open the modal for
  // the oldest pending prompt that hasn't been shown yet this session.
  useEffect(() => {
    if (!dealId || !prompts || prompts.length === 0) return;
    const oldestPending = [...prompts]
      .filter((p) => p.status === 'pending')
      .sort((a, b) => new Date(a.triggered_at).getTime() - new Date(b.triggered_at).getTime())[0];
    if (!oldestPending) return;
    if (autoOpenedRef.current.has(oldestPending.id)) return;
    autoOpenedRef.current.add(oldestPending.id);
    console.log('[email-prompt-center] auto-opening pending workflow prompt', {
      dealId,
      promptId: oldestPending.id,
      workflow: oldestPending.workflow_name,
    });
    window.dispatchEvent(
      new CustomEvent('workflow-email-prompt', {
        detail: { promptId: oldestPending.id, dealId },
      }),
    );
  }, [dealId, prompts]);

  // Badge click: when there is at least one pending prompt, open the
  // editable Workflow Email modal for the oldest one. Otherwise fall back
  // to the prompt-center list (history / sent / dismissed view).
  // Click now opens the same client email composer used by the deals list
  // view, pre-filled with the deal's client contact email.
  const handleClick = () => setIsEmailDialogOpen(true);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            aria-label="Email Prompt Center"
            className="relative overflow-visible h-8 w-8 border-[hsl(220,70%,55%,0.5)] bg-[hsl(220,40%,12%,0.35)] text-[hsl(220,70%,72%)] backdrop-blur-xl shadow-[inset_0_1px_1px_hsl(220,80%,75%,0.15),0_2px_12px_hsl(220,60%,35%,0.2)] hover:border-[hsl(220,70%,60%,0.7)] hover:bg-[hsl(220,40%,15%,0.45)] hover:shadow-[inset_0_1px_1px_hsl(220,80%,80%,0.25),0_4px_20px_hsl(220,60%,40%,0.3)] before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(135deg,hsl(220,80%,80%,0.12)_0%,transparent_50%,hsl(220,70%,55%,0.06)_100%)]"
            onClick={handleClick}
            onContextMenu={(e) => {
              // Right-click → always open the prompt-center list, even when
              // there are pending prompts.
              e.preventDefault();
              setIsOpen(true);
            }}
          >
        <Mail className="h-4 w-4" />
        {pendingCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 h-[18px] min-w-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center ring-2 ring-background z-10 pointer-events-none">
            {pendingCount}
          </span>
        )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Email client</TooltipContent>
      </Tooltip>

      {isEmailDialogOpen && (
        <DraftAndSendDialog
          open={isEmailDialogOpen}
          onOpenChange={setIsEmailDialogOpen}
          contextLabel="Client email"
          initial={{
            to: contactEmail ? [contactEmail] : [],
            subject: `${dealName || 'Deal'} — update`,
            body: '',
            dealId,
          }}
        />
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] p-0 gap-0 overflow-hidden border-[hsl(220,50%,30%,0.5)] bg-[hsl(222,30%,8%,0.95)] backdrop-blur-2xl shadow-[0_25px_60px_-12px_hsl(220,80%,10%,0.7)]">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/30">
            <DialogTitle className="flex items-center gap-2 text-base">
              <div className="h-7 w-7 rounded-lg bg-primary/15 flex items-center justify-center">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              </div>
              Email Prompt Center
              {dealName && <span className="text-muted-foreground font-normal text-sm">· {dealName}</span>}
            </DialogTitle>
          </DialogHeader>
          <EmailPromptList dealId={dealId} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function EmailPromptList({ dealId }: { dealId: string }) {
  const { data: prompts, isLoading } = useDealEmailPrompts(dealId);
  const [filter, setFilter] = useState<'all' | 'pending' | 'sent' | 'dismissed'>('pending');

  const filtered = (prompts || []).filter(p => filter === 'all' || p.status === filter);

  const counts = {
    pending: (prompts || []).filter(p => p.status === 'pending').length,
    sent: (prompts || []).filter(p => p.status === 'sent').length,
    dismissed: (prompts || []).filter(p => p.status === 'dismissed').length,
  };

  return (
    <div className="flex flex-col">
      {/* Filter tabs */}
      <div className="flex items-center gap-1 px-5 py-2.5 border-b border-border/20">
        {(['pending', 'sent', 'dismissed', 'all'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
              filter === f
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
            )}
          >
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            {f !== 'all' && counts[f] > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-4 min-w-4 px-1 text-[9px]">
                {counts[f]}
              </Badge>
            )}
          </button>
        ))}
      </div>

      <ScrollArea className="max-h-[55vh]">
        <div className="p-4 space-y-3">
          {isLoading ? (
            <div className="text-center py-8 text-sm text-muted-foreground">Loading prompts…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8">
              <Mail className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {filter === 'pending' ? 'No pending email prompts' : 'No prompts found'}
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Prompts appear here when workflow events are triggered
              </p>
            </div>
          ) : (
            filtered.map(prompt => (
              <PromptCard key={prompt.id} prompt={prompt} />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function PromptCard({ prompt }: { prompt: DealEmailPrompt }) {
  const [expanded, setExpanded] = useState(false);
  // Demo-only: rewrite "Dear …" salutations to a deterministic fake
  // lender contact name so the demo workspace never shows a bracketed
  // placeholder or lender-company-name greeting.
  const lenderSeed =
    (prompt.metadata as any)?.lender_name ||
    (Array.isArray(prompt.recipients_json) ? (prompt.recipients_json as any[])[0]?.name : '') ||
    '';
  const displayBody = applyDemoLenderSalutation(
    prompt.merged_body_html,
    lenderSeed,
    prompt.company_id,
  );
  const [editedBody, setEditedBody] = useState(displayBody);
  const [isEditing, setIsEditing] = useState(false);
  const dismiss = useDismissEmailPrompt();
  const markSent = useMarkEmailSent();

  const statusConfig = {
    pending: { icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10', label: 'Pending Review' },
    sent: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/10', label: 'Sent' },
    dismissed: { icon: X, color: 'text-muted-foreground', bg: 'bg-muted/20', label: 'Dismissed' },
  };

  const status = statusConfig[prompt.status];
  const StatusIcon = status.icon;

  const sanitizedHtml = DOMPurify.sanitize(displayBody, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'span', 'div', 'blockquote'],
    ALLOWED_ATTR: ['href', 'target', 'style', 'class'],
  });

  return (
    <div className={cn(
      "rounded-xl border transition-all",
      prompt.status === 'pending'
        ? "border-primary/30 bg-[hsl(220,30%,12%,0.6)]"
        : "border-border/20 bg-muted/5"
    )}>
      {/* Header */}
      <div
        className="flex items-start gap-3 px-4 py-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5", status.bg)}>
          <StatusIcon className={cn("h-3.5 w-3.5", status.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{prompt.workflow_name}</span>
            <Badge variant="outline" className="text-[9px] px-1.5 h-4 flex-shrink-0">
              Email #{prompt.email_template_number}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{prompt.trigger_reason}</p>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            {formatDistanceToNow(new Date(prompt.triggered_at), { addSuffix: true })}
          </p>
        </div>
        <div className="flex-shrink-0">
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/15 pt-3">
          {/* Trigger explanation */}
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/10 border border-border/10">
            <AlertCircle className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Why this appeared</p>
              <p className="text-xs text-foreground/80 mt-0.5">{prompt.trigger_reason}</p>
            </div>
          </div>

          {/* Recipients */}
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Recipients</p>
            <div className="flex flex-wrap gap-1">
              {(prompt.recipients_json as any[]).map((r, i) => (
                <Badge key={i} variant="secondary" className="text-[10px]">
                  {r.name} {r.email ? `<${r.email}>` : ''}
                </Badge>
              ))}
              {(prompt.recipients_json as any[]).length === 0 && (
                <span className="text-xs text-muted-foreground italic">No recipients resolved</span>
              )}
            </div>
          </div>

          {/* Subject */}
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Subject</p>
            <p className="text-sm font-medium">{prompt.merged_subject}</p>
          </div>

          {/* Body */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Email Body</p>
              {prompt.status === 'pending' && (
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className="text-[10px] text-primary hover:underline"
                >
                  {isEditing ? 'Preview' : 'Edit'}
                </button>
              )}
            </div>
            {isEditing ? (
              <Textarea
                value={editedBody}
                onChange={e => setEditedBody(e.target.value)}
                className="text-xs min-h-[120px] resize-y bg-background/50"
              />
            ) : (
              <div
                className="text-xs text-muted-foreground leading-relaxed max-h-[200px] overflow-y-auto p-3 rounded-lg bg-background/30 border border-border/10 prose prose-sm prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
              />
            )}
          </div>

          {/* Actions */}
          {prompt.status === 'pending' && (
            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                className="gap-1.5 text-xs h-8"
                onClick={() => markSent.mutate({ promptId: prompt.id, dealId: prompt.deal_id })}
                disabled={markSent.isPending}
              >
                <Send className="h-3 w-3" />
                Approve & Send
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs h-8"
                onClick={() => setExpanded(true)}
              >
                <Eye className="h-3 w-3" />
                Review
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs h-8 text-muted-foreground ml-auto"
                onClick={() => dismiss.mutate({ promptId: prompt.id, dealId: prompt.deal_id })}
                disabled={dismiss.isPending}
              >
                <X className="h-3 w-3" />
                Dismiss
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
