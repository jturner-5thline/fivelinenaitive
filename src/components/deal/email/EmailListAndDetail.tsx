import { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { SmartEmailPanel } from './SmartEmailPanel';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatDistanceToNow, format } from 'date-fns';
import {
  Star,
  Paperclip,
  Link2,
  Unlink,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Reply,
  Forward,
  AlertCircle,
  CheckCircle2,
  MinusCircle,
  MessageSquare,
  Archive,
  FileText,
} from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { MockEmail, EmailThread, getAvatarColor, groupEmailsByThread } from './mockEmailData';
import { InlineReplyComposer, type ReplyDraft } from './InlineReplyComposer';
import { PopOutComposer } from './PopOutComposer';
import { useEmailDraft, useUnsavedDraftGuard } from '@/hooks/useEmailDraft';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ─── Sentiment badge ─────────────────────────────────────────
function SentimentBadge({ sentiment }: { sentiment?: MockEmail['ai_sentiment'] }) {
  if (!sentiment) return null;
  const config = {
    positive: { icon: CheckCircle2, label: 'Positive', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    neutral: { icon: MinusCircle, label: 'Neutral', className: 'bg-muted text-muted-foreground border-border' },
    needs_attention: { icon: AlertCircle, label: 'Needs Attention', className: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  }[sentiment];
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={cn('text-[10px] h-5 gap-1 font-normal', config.className)}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

// ─── AI Summary Strip ────────────────────────────────────────
function AiSummaryStrip({ email }: { email: MockEmail }) {
  if (!email.ai_summary) return null;
  return (
    <div className="flex items-start gap-2 px-4 py-2.5 rounded-lg bg-primary/5 border border-primary/10">
      <Sparkles className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
      <div className="flex items-center gap-2 flex-wrap min-w-0">
        <p className="text-xs text-foreground/80 leading-relaxed">{email.ai_summary}</p>
        <SentimentBadge sentiment={email.ai_sentiment} />
      </div>
    </div>
  );
}

// ─── Avatar ──────────────────────────────────────────────────
function EmailAvatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const colorClass = getAvatarColor(name);
  const sizeClass = size === 'sm' ? 'h-8 w-8 text-[11px]' : 'h-10 w-10 text-xs';
  return (
    <div className={cn('rounded-full flex items-center justify-center font-semibold shrink-0', sizeClass, colorClass)}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

// ─── Thread List Item (Card style) ───────────────────────────
interface ThreadListItemProps {
  thread: EmailThread;
  isSelected: boolean;
  onSelect: () => void;
  onToggleLink: (email: MockEmail) => void;
  onToggleStar: (email: MockEmail) => void;
}

function ThreadListItem({ thread, isSelected, onSelect, onToggleLink, onToggleStar }: ThreadListItemProps) {
  const [hovered, setHovered] = useState(false);
  const latest = thread.latestEmail;
  const displayName = latest.folder === 'sent' ? `To: ${latest.to_name || latest.to_email}` : latest.from_name;
  const threadCount = thread.emails.length;

  return (
    <div
      className={cn(
        'group relative rounded-r-lg cursor-pointer transition-all duration-150 mx-0 mr-3 mb-2 border-l-[3px]',
        isSelected
          ? 'bg-primary/10 border-l-primary shadow-[inset_0_0_12px_-4px_hsl(var(--primary)/0.3)] border-t border-r border-b border-t-primary/20 border-r-primary/20 border-b-primary/20'
          : 'bg-card/40 border-l-transparent border border-border/40 hover:border-l-primary/50 hover:bg-primary/5 hover:border-border/60 rounded-lg',
        thread.hasUnread && !isSelected && 'border-l-primary',
        thread.needsResponse && !isSelected && !thread.hasUnread && 'border-l-amber-500'
      )}
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-start gap-3 p-3">
        <EmailAvatar name={latest.folder === 'sent' ? (latest.to_name || 'U') : latest.from_name} />
        
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className={cn('text-sm truncate', thread.hasUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground/90')}>
                {displayName}
              </span>
              {threadCount > 1 && (
                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full font-medium shrink-0">
                  {threadCount}
                </span>
              )}
            </div>
            <span className="text-[11px] text-muted-foreground shrink-0">
              {formatDistanceToNow(new Date(latest.received_at), { addSuffix: false })}
            </span>
          </div>

          <div className="flex items-center gap-1.5 mb-0.5">
            {thread.dealName && (
              <Badge variant="outline" className="text-[10px] h-[18px] px-1.5 gap-0.5 bg-primary/10 text-primary border-primary/20">
                💼 {thread.dealName}
              </Badge>
            )}
            {!thread.dealName && thread.category === 'prospect' && (
              <Badge variant="outline" className="text-[10px] h-[18px] px-1.5 gap-0.5 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                🎯 Prospect
              </Badge>
            )}
            {thread.needsResponse && (
              <Badge variant="outline" className="text-[10px] h-[18px] px-1.5 gap-0.5 bg-amber-500/10 text-amber-400 border-amber-500/20">
                ⏰ Response Due
              </Badge>
            )}
          </div>
          
          <p className={cn('text-[13px] truncate', thread.hasUnread ? 'text-foreground font-medium' : 'text-foreground/70')}>
            {thread.subject}
          </p>
          
          <p className="text-xs text-muted-foreground truncate mt-0.5">{latest.snippet}</p>
          
          <div className="flex items-center gap-1.5 mt-2">
            {thread.isLinked && (
              <Badge variant="secondary" className="text-[10px] h-[18px] px-1.5 gap-0.5">
                <Link2 className="h-2.5 w-2.5" /> Linked
              </Badge>
            )}
            {thread.hasAttachments && (
              <Paperclip className="h-3 w-3 text-muted-foreground" />
            )}
            {latest.labels.slice(0, 2).map(l => (
              <Badge key={l} variant="outline" className="text-[10px] h-[18px] px-1.5">{l}</Badge>
            ))}
          </div>
        </div>
      </div>

      {hovered && (
        <div className="absolute right-2 top-2 flex items-center gap-0.5 bg-background/95 backdrop-blur-sm border rounded-md shadow-md px-1 py-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={(e) => { e.stopPropagation(); onToggleStar(latest); }} className="p-1 rounded hover:bg-muted transition-colors">
                <Star className={cn('h-3.5 w-3.5', thread.isStarred ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground')} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Star</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={(e) => { e.stopPropagation(); onToggleLink(latest); }} className="p-1 rounded hover:bg-muted transition-colors">
                {thread.isLinked ? <Unlink className="h-3.5 w-3.5 text-muted-foreground" /> : <Link2 className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">{thread.isLinked ? 'Unlink' : 'Link'}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={(e) => { e.stopPropagation(); toast.info('Archive coming soon'); }} className="p-1 rounded hover:bg-muted transition-colors">
                <Archive className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Archive</TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  );
}

// ─── Email List (threaded) ───────────────────────────────────
interface EmailListProps {
  emails: MockEmail[];
  selectedThread: EmailThread | null;
  onSelectThread: (thread: EmailThread) => void;
  onToggleLink: (email: MockEmail) => void;
  onToggleStar: (email: MockEmail) => void;
}

export function EmailList({ emails, selectedThread, onSelectThread, onToggleLink, onToggleStar }: EmailListProps) {
  const threads = groupEmailsByThread(emails);

  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-16 text-center">
        <MessageSquare className="h-8 w-8 text-muted-foreground/30 mb-2" />
        <p className="text-sm text-muted-foreground">No emails in this folder</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="pt-2 pb-2">
        {threads.map((thread) => (
          <ThreadListItem
            key={thread.threadId}
            thread={thread}
            isSelected={selectedThread?.threadId === thread.threadId}
            onSelect={() => onSelectThread(thread)}
            onToggleLink={onToggleLink}
            onToggleStar={onToggleStar}
          />
        ))}
      </div>
    </ScrollArea>
  );
}

// ─── Thread Message Card ─────────────────────────────────────
function ThreadMessage({ email, isLatest, defaultExpanded }: { email: MockEmail; isLatest: boolean; defaultExpanded: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const displayName = email.from_name === 'You' ? 'You' : email.from_name;

  return (
    <div className={cn(
      'rounded-lg border transition-all duration-150 mx-4 mb-3',
      expanded
        ? 'bg-card/60 border-border/50 shadow-sm'
        : 'bg-card/30 border-border/30 hover:bg-muted/30 hover:border-border/50'
    )}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <EmailAvatar name={email.from_name === 'You' ? 'J' : email.from_name} size="sm" />
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className={cn('text-sm truncate', isLatest ? 'font-semibold' : 'font-medium text-foreground/80')}>
            {displayName}
          </span>
          {!expanded && (
            <span className="text-xs text-muted-foreground truncate">{email.snippet}</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-muted-foreground">
            {format(new Date(email.received_at), 'MMM d, h:mm a')}
          </span>
          {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pl-[60px]">
          <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
            <span>to {email.folder === 'sent' ? (email.to_name || email.to_email) : 'me'}</span>
            {email.has_attachments && <Paperclip className="h-3 w-3" />}
          </div>
          <div className="text-sm whitespace-pre-wrap leading-relaxed text-foreground/90">
            {email.body_preview}
          </div>
          {email.has_attachments && (
            <div className="mt-3 flex gap-2">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-muted/20 text-sm hover:bg-muted/40 transition-colors cursor-pointer">
                <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-foreground/80">document.pdf</span>
                <span className="text-[11px] text-muted-foreground">2.4 MB</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Email Detail (thread view with inline reply) ────────────
interface EmailDetailProps {
  thread: EmailThread;
  dealId?: string;
  onBack: () => void;
  onToggleLink: (email: MockEmail) => void;
  onToggleStar: (email: MockEmail) => void;
  onSendReply: (email: Omit<MockEmail, 'id' | 'threadId'>, threadId: string) => void;
}

export function EmailDetail({ thread, dealId, onBack, onToggleLink, onToggleStar, onSendReply }: EmailDetailProps) {
  const [showSmartPanel, setShowSmartPanel] = useState(false);
  const [smartPopoverOpen, setSmartPopoverOpen] = useState(false);
  
  // Reply state
  const [replyTo, setReplyTo] = useState<{ subject: string; to_email: string; to_name: string; threadId: string } | null>(null);
  const [popOutDraft, setPopOutDraft] = useState<ReplyDraft | null>(null);
  const [inlineDraft, setInlineDraft] = useState<ReplyDraft | null>(null);

  // Draft persistence
  const { loadDraft, updateDraft, flushSave, discardDraft, clearDraftOnSend, hasSavedDraft, saveStatus } = useEmailDraft(thread.threadId);
  const hasActiveDraft = !!(replyTo || popOutDraft);
  useUnsavedDraftGuard(hasActiveDraft);

  // On thread load, check for saved draft and show resume banner
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  useEffect(() => {
    if (!replyTo && !popOutDraft && hasSavedDraft()) {
      setShowResumeBanner(true);
    } else {
      setShowResumeBanner(false);
    }
  }, [thread.threadId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleResumeDraft = useCallback(() => {
    const saved = loadDraft();
    if (saved) {
      setInlineDraft(saved);
      setReplyTo({
        subject: thread.subject,
        to_email: saved.to,
        to_name: saved.toName,
        threadId: thread.threadId,
      });
      setShowResumeBanner(false);
    }
  }, [loadDraft, thread]);

  const getReplyTarget = useCallback(() => {
    const latest = thread.latestEmail;
    return latest.from_name === 'You'
      ? { subject: thread.subject, to_email: latest.to_email, to_name: latest.to_name, threadId: thread.threadId }
      : { subject: thread.subject, to_email: latest.from_email, to_name: latest.from_name, threadId: thread.threadId };
  }, [thread]);

  const handleReply = useCallback(() => {
    if (popOutDraft) return;
    // If there's a saved draft, resume it
    const saved = loadDraft();
    if (saved) {
      setInlineDraft(saved);
    }
    setReplyTo(getReplyTarget());
    setShowResumeBanner(false);
  }, [getReplyTarget, popOutDraft, loadDraft]);

  const handleDraftChange = useCallback((draft: ReplyDraft) => {
    updateDraft(draft);
  }, [updateDraft]);

  const handleFieldBlur = useCallback(() => {
    flushSave();
  }, [flushSave]);

  const handleSendFromComposer = useCallback((emailData: Omit<MockEmail, 'id' | 'threadId'>) => {
    onSendReply(emailData, thread.threadId);
    clearDraftOnSend();
    setReplyTo(null);
    setPopOutDraft(null);
    setInlineDraft(null);
  }, [onSendReply, thread.threadId, clearDraftOnSend]);

  const handleDiscard = useCallback(() => {
    discardDraft();
    setReplyTo(null);
    setPopOutDraft(null);
    setInlineDraft(null);
    toast.info('Draft discarded');
  }, [discardDraft]);

  const handlePopOut = useCallback((draft: ReplyDraft) => {
    setReplyTo(null);
    setInlineDraft(null);
    setPopOutDraft(draft);
  }, []);

  const handlePopIn = useCallback((draft: ReplyDraft) => {
    setPopOutDraft(null);
    setInlineDraft(draft);
    setReplyTo(getReplyTarget());
  }, [getReplyTarget]);

  // Keyboard shortcut for reply
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        handleReply();
      }
      if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toast.info('Forward coming soon'); }
      if (e.key === 'l' || e.key === 'L') { e.preventDefault(); onToggleLink(thread.latestEmail); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [thread, onToggleLink, handleReply]);

  return (
    <>
      <div className="flex h-full relative overflow-hidden">
        {/* Main thread view */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Sticky header toolbar */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-background/60 backdrop-blur-sm sticky top-0 z-10 shrink-0">
            <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0 md:hidden h-8 w-8">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold truncate">{thread.subject}</h3>
              <p className="text-[11px] text-muted-foreground">
                {thread.emails.length} message{thread.emails.length !== 1 ? 's' : ''} · {thread.participants.join(', ') || 'You'}
              </p>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <Popover open={smartPopoverOpen} onOpenChange={setSmartPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant={smartPopoverOpen ? 'secondary' : 'ghost'} size="sm" className="h-8 gap-1.5 text-xs">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Smart</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent side="bottom" align="end" className="w-[320px] p-0 max-h-[70vh] overflow-hidden">
                  <SmartEmailPanel thread={thread} dealId={dealId || 'general'} />
                </PopoverContent>
              </Popover>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleReply}>
                    <Reply className="h-3.5 w-3.5" />
                    Reply
                    <kbd className="hidden sm:inline-flex ml-1 text-[10px] bg-muted px-1 rounded text-muted-foreground">R</kbd>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Reply (R)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => toast.info('Forward coming soon')}>
                    <Forward className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Forward</span>
                    <kbd className="hidden sm:inline-flex ml-1 text-[10px] bg-muted px-1 rounded text-muted-foreground">F</kbd>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Forward (F)</TooltipContent>
              </Tooltip>
              <Separator orientation="vertical" className="h-5 mx-1" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onToggleStar(thread.latestEmail)}>
                    <Star className={cn('h-4 w-4', thread.isStarred ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground')} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Star</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={thread.isLinked ? 'secondary' : 'outline'}
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => onToggleLink(thread.latestEmail)}
                  >
                    {thread.isLinked ? <Unlink className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
                    <span className="hidden sm:inline">{thread.isLinked ? 'Unlink' : 'Link'}</span>
                    <kbd className="hidden sm:inline-flex ml-1 text-[10px] bg-muted px-1 rounded text-muted-foreground">L</kbd>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">{thread.isLinked ? 'Unlink from deal (L)' : 'Link to deal (L)'}</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Thread content - scrollable */}
          <ScrollArea className="flex-1">
            <div className="py-3 space-y-0">
              <div className="mx-4 mb-3">
                <AiSummaryStrip email={thread.latestEmail} />
              </div>

              {thread.emails.map((email, idx) => (
                <ThreadMessage
                  key={email.id}
                  email={email}
                  isLatest={idx === 0}
                  defaultExpanded={idx === 0}
                />
              ))}

              {/* Resume draft banner */}
              {showResumeBanner && !replyTo && !popOutDraft && (
                <div className="mx-4 mb-3">
                  <button
                    onClick={handleResumeDraft}
                    className="w-full flex items-center gap-2 px-4 py-3 rounded-lg border border-primary/30 bg-primary/5 text-foreground hover:bg-primary/10 transition-all"
                  >
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Resume draft</span>
                    <span className="text-xs text-muted-foreground ml-1">— You have an unsaved reply for this thread</span>
                    <kbd className="ml-auto text-[10px] bg-muted px-1.5 py-0.5 rounded">R</kbd>
                  </button>
                </div>
              )}

              {/* Reply prompt at bottom of thread when no composer is open */}
              {!replyTo && !popOutDraft && !showResumeBanner && (
                <div className="mx-4 mb-3">
                  <button
                    onClick={handleReply}
                    className="w-full flex items-center gap-2 px-4 py-3 rounded-lg border border-dashed border-border/50 text-muted-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-foreground transition-all"
                  >
                    <Reply className="h-4 w-4" />
                    <span className="text-sm">Click to reply...</span>
                    <kbd className="ml-auto text-[10px] bg-muted px-1.5 py-0.5 rounded">R</kbd>
                  </button>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Inline reply composer - anchored at bottom */}
          {replyTo && (
            <InlineReplyComposer
              replyTo={replyTo}
              onSend={handleSendFromComposer}
              onDiscard={handleDiscard}
              onPopOut={handlePopOut}
              initialDraft={inlineDraft}
              onDraftChange={handleDraftChange}
              onFieldBlur={handleFieldBlur}
              saveStatus={saveStatus}
            />
          )}
        </div>
      </div>

      {/* Pop-out composer - rendered as portal at fixed position */}
      {popOutDraft && (
        <PopOutComposer
          draft={popOutDraft}
          onSend={handleSendFromComposer}
          onDiscard={handleDiscard}
          onPopIn={handlePopIn}
          onDraftChange={handleDraftChange}
          onFieldBlur={handleFieldBlur}
          saveStatus={saveStatus}
        />
      )}
    </>
  );
}
