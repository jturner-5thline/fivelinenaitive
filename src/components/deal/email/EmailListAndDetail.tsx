import { useState, useEffect, useCallback, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { SmartEmailPanel } from './SmartEmailPanel';
import { ThreadLabelsBar } from './ThreadLabelsBar';
import { AiAssistInlinePanel } from './AiAssistInlinePanel';
import { LinkToDealPopover } from './LinkToDealPopover';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { formatDistanceToNow, format } from 'date-fns';
import {
  Star,
  Paperclip,
  Link2,
  Unlink,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Reply,
  Forward,
  AlertCircle,
  CheckCircle2,
  MinusCircle,
  MessageSquare,
  Archive,
  Clock,
  FileText,
  ChevronsUpDown,
  MoreHorizontal,
  Bold,
  Italic,
  Link as LinkIcon,
  Loader2,
  AlignLeft,
} from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { MockEmail, EmailThread, getAvatarColor, groupEmailsByThread } from './mockEmailData';
import { InlineReplyComposer, type ReplyDraft } from './InlineReplyComposer';
import { PopOutComposer } from './PopOutComposer';
import { useEmailDraft, useUnsavedDraftGuard } from '@/hooks/useEmailDraft';
import { EmailContextMenu } from './EmailContextMenu';
import { supabase } from '@/integrations/supabase/client';
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

// ─── Avatar with brand logo / gradient fallback ─────────────
// Predefined muted palette for consistent avatar colors
const AVATAR_PALETTE = [
  { bg: 'hsl(220, 40%, 30%)', text: 'hsl(220, 60%, 80%)' },
  { bg: 'hsl(260, 35%, 30%)', text: 'hsl(260, 55%, 80%)' },
  { bg: 'hsl(340, 35%, 30%)', text: 'hsl(340, 55%, 80%)' },
  { bg: 'hsl(160, 35%, 28%)', text: 'hsl(160, 55%, 78%)' },
  { bg: 'hsl(30, 40%, 30%)',  text: 'hsl(30, 60%, 80%)' },
  { bg: 'hsl(190, 35%, 28%)', text: 'hsl(190, 55%, 78%)' },
  { bg: 'hsl(280, 30%, 30%)', text: 'hsl(280, 50%, 80%)' },
  { bg: 'hsl(10, 35%, 30%)',  text: 'hsl(10, 55%, 78%)' },
];

function hashStringToIndex(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % AVATAR_PALETTE.length;
}

function EmailAvatar({ name, email }: { name: string; email?: string; size?: 'sm' | 'md' }) {
  const palette = AVATAR_PALETTE[hashStringToIndex(email || name)];

  return (
    <div
      className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
      style={{ background: palette.bg, color: palette.text }}
    >
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
  isChecked?: boolean;
  onCheckChange?: (checked: boolean) => void;
  onMarkRead?: (email: MockEmail) => void;
  onMarkUnread?: (email: MockEmail) => void;
  onArchive?: (email: MockEmail) => void;
  onDelete?: (email: MockEmail) => void;
}

function ThreadListItem({ thread, isSelected, onSelect, onToggleLink, onToggleStar, isChecked, onCheckChange, onMarkRead, onMarkUnread, onArchive, onDelete }: ThreadListItemProps) {
  const [hovered, setHovered] = useState(false);
  const latest = thread.latestEmail;
  const displayName = latest.folder === 'sent' ? `To: ${latest.to_name || latest.to_email}` : latest.from_name;
  const threadCount = thread.emails.length;
  const isUnread = thread.hasUnread;
  const isUrgent = thread.needsResponse;
  const showCheckbox = hovered || isChecked;

  const rowContent = (
    <div
      className={cn(
        'group relative cursor-pointer transition-all duration-150 mx-0 mr-2 mb-1.5 border-l-[3px] overflow-hidden',
        // Selected state (clicked to read)
        isSelected
          ? 'bg-primary/[0.06] border-l-primary rounded-r-lg shadow-[inset_0_0_12px_-4px_hsl(var(--primary)/0.2)]'
          : 'rounded-lg',
        // Checked state (checkbox selected for bulk)
        isChecked && !isSelected && 'bg-primary/[0.04]',
        // Unread: slightly brighter background
        !isSelected && !isChecked && isUnread && 'bg-muted/[0.08]',
        // Unread left border (when not selected)
        !isSelected && isUnread && 'border-l-primary',
        // Read: no border accent
        !isSelected && !isUnread && !isUrgent && 'border-l-transparent',
        // Urgency: needs response border when not unread
        !isSelected && isUrgent && !isUnread && 'border-l-amber-500',
        // Urgency row tint
        isUrgent && !isSelected && !isChecked && 'bg-destructive/[0.06]',
        // Default + hover
        !isSelected && !isUrgent && !isChecked && 'hover:bg-[rgba(255,255,255,0.04)]',
        isUrgent && !isSelected && !isChecked && 'hover:bg-destructive/[0.08]',
      )}
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-start gap-3 px-3 py-4 min-w-0 overflow-hidden">
        {/* Checkbox + unread dot area */}
        <div className="relative flex items-center justify-center shrink-0" style={{ width: 32, height: 32 }}>
          {showCheckbox ? (
            <div
              className="absolute inset-0 flex items-center justify-center z-10"
              onClick={(e) => { e.stopPropagation(); onCheckChange?.(!isChecked); }}
            >
              <Checkbox
                checked={isChecked}
                onCheckedChange={(checked) => onCheckChange?.(!!checked)}
                className="h-4 w-4"
              />
            </div>
          ) : (
            <>
              {/* Unread dot */}
              {isUnread && (
                <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-[6px] h-[6px] rounded-full bg-primary z-10" />
              )}
              <EmailAvatar
                name={latest.folder === 'sent' ? (latest.to_name || 'U') : latest.from_name}
                email={latest.folder === 'sent' ? latest.to_email : latest.from_email}
              />
            </>
          )}
        </div>
        
        <div className="min-w-0 flex-1 overflow-hidden">
          {/* Row 1: Sender + timestamp */}
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className={cn(
                'text-sm truncate',
                isUnread ? 'font-bold text-foreground' : 'font-normal text-foreground/70'
              )}>
                {displayName}
              </span>
              {threadCount > 1 && (
                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full font-medium shrink-0">
                  {threadCount}
                </span>
              )}
            </div>
            {/* Timestamp - hidden on hover to make room for actions */}
            <span className={cn(
              'text-[11px] text-muted-foreground shrink-0 transition-opacity duration-150',
              hovered ? 'opacity-0' : 'opacity-100'
            )}>
              {formatDistanceToNow(new Date(latest.received_at), { addSuffix: false })}
            </span>
          </div>

          {/* Row 2: Badges */}
          <div className="flex items-center gap-1.5 mb-0.5 overflow-hidden">
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
            {isUrgent && (
              <Badge variant="outline" className="text-[10px] h-[18px] px-1.5 gap-0.5 bg-amber-500/10 text-amber-400 border-amber-500/20">
                ⏰ Response Due
              </Badge>
            )}
          </div>
          
          {/* Row 3: Subject */}
          <p className={cn(
            'text-[13px] truncate',
            isUnread ? 'text-foreground font-semibold' : 'text-foreground/60 font-normal'
          )}>
            {thread.subject}
          </p>
          
          {/* Row 4: Snippet - single line, higher contrast */}
          <p className={cn(
            'text-xs truncate mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis',
            isUnread ? 'text-muted-foreground/80' : 'text-muted-foreground/50'
          )}>
            {latest.snippet}
          </p>
          
          {/* Row 5: Meta badges */}
          <div className="flex items-center gap-1.5 mt-2">
            {thread.isLinked && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="secondary" className="text-[10px] h-[18px] px-1.5 gap-0.5">
                    <Link2 className="h-2.5 w-2.5" /> Deal linked
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">This thread is associated with a deal in your pipeline</TooltipContent>
              </Tooltip>
            )}
            {thread.hasAttachments && (
              <Paperclip className="h-3 w-3 text-muted-foreground" />
            )}
          </div>
        </div>
      </div>

      {/* Hover quick actions - slide in over timestamp area */}
      {hovered && (
        <div className="absolute right-2 top-3 flex items-center gap-0.5 bg-background/95 backdrop-blur-sm border rounded-md shadow-md px-1 py-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={(e) => { e.stopPropagation(); onArchive?.(latest); }} className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted transition-colors">
                <Archive className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Archive</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={(e) => { e.stopPropagation(); toast.info('Snooze coming soon'); }} className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted transition-colors">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Snooze</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={(e) => { e.stopPropagation(); onToggleStar(latest); }} className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted transition-colors">
                <Star className={cn('h-3.5 w-3.5', thread.isStarred ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground')} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Star</TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  );

  return (
    <EmailContextMenu
      isRead={!isUnread}
      isStarred={thread.isStarred}
      onMarkRead={() => onMarkRead?.(latest)}
      onMarkUnread={() => onMarkUnread?.(latest)}
      onToggleStar={() => onToggleStar(latest)}
      onArchive={() => onArchive?.(latest)}
      onDelete={() => onDelete?.(latest)}
    >
      {rowContent}
    </EmailContextMenu>
  );
}

// ─── Email List Skeleton ─────────────────────────────────────
function EmailListSkeleton() {
  return (
    <div className="pt-2 pb-2 space-y-1.5 px-2">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 px-3 py-4 rounded-lg">
          <div className="h-8 w-8 rounded-full bg-muted/30 animate-pulse shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center justify-between">
              <div className="h-3.5 w-28 bg-muted/30 rounded animate-pulse" />
              <div className="h-3 w-12 bg-muted/20 rounded animate-pulse" />
            </div>
            <div className="h-3.5 w-3/4 bg-muted/25 rounded animate-pulse" />
            <div className="h-3 w-full bg-muted/15 rounded animate-pulse" />
          </div>
        </div>
      ))}
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
  isLoading?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  onMarkRead?: (email: MockEmail) => void;
  onMarkUnread?: (email: MockEmail) => void;
  onArchive?: (email: MockEmail) => void;
  onDelete?: (email: MockEmail) => void;
}

export function EmailList({ emails, selectedThread, onSelectThread, onToggleLink, onToggleStar, isLoading, selectedIds, onSelectionChange, onMarkRead, onMarkUnread, onArchive, onDelete }: EmailListProps) {
  if (isLoading) {
    return <EmailListSkeleton />;
  }

  const threads = groupEmailsByThread(emails);

  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-16 text-center">
        <MessageSquare className="h-8 w-8 text-muted-foreground/30 mb-2" />
        <p className="text-sm text-muted-foreground">No emails in this folder</p>
      </div>
    );
  }

  const handleCheckChange = (threadId: string, checked: boolean) => {
    if (!onSelectionChange || !selectedIds) return;
    const next = new Set(selectedIds);
    if (checked) next.add(threadId);
    else next.delete(threadId);
    onSelectionChange(next);
  };

   return (
    <ScrollArea className="h-full w-full">
      <div className="pt-2 pb-2 overflow-hidden">
        {threads.map((thread) => (
          <ThreadListItem
            key={thread.threadId}
            thread={thread}
            isSelected={selectedThread?.threadId === thread.threadId}
            onSelect={() => onSelectThread(thread)}
            onToggleLink={onToggleLink}
            onToggleStar={onToggleStar}
            isChecked={selectedIds?.has(thread.threadId)}
            onCheckChange={(checked) => handleCheckChange(thread.threadId, checked)}
            onMarkRead={onMarkRead}
            onMarkUnread={onMarkUnread}
            onArchive={onArchive}
            onDelete={onDelete}
          />
        ))}
      </div>
    </ScrollArea>
  );
}

// ─── Quoted content detection ────────────────────────────────
const QUOTED_PATTERNS = [
  /^On .+ wrote:$/m,
  /^-{3,}\s*Original Message\s*-{3,}$/m,
  /^>{1,}\s/m,
  /^From:\s/m,
];

function splitQuotedContent(body: string): { main: string; quoted: string | null } {
  for (const pattern of QUOTED_PATTERNS) {
    const match = body.search(pattern);
    if (match > 0) {
      return { main: body.slice(0, match).trimEnd(), quoted: body.slice(match) };
    }
  }
  return { main: body, quoted: null };
}

// ─── Thread Message Card ─────────────────────────────────────
function ThreadMessage({ email, isLatest, defaultExpanded, onExpandChange }: { 
  email: MockEmail; 
  isLatest: boolean; 
  defaultExpanded: boolean;
  onExpandChange?: (expanded: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showQuoted, setShowQuoted] = useState(false);
  const messageRef = useRef<HTMLDivElement>(null);
  const displayName = email.from_name === 'You' ? 'You' : email.from_name;
  const { main: bodyMain, quoted: bodyQuoted } = splitQuotedContent(email.body_preview || '');

  const toggleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    onExpandChange?.(next);
    if (next && messageRef.current) {
      setTimeout(() => messageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
    }
  };

  return (
    <div ref={messageRef} className={cn(
      'rounded-lg border transition-all duration-150 mx-4 mb-3',
      expanded
        ? 'bg-card/60 border-border/50 shadow-sm'
        : 'bg-card/30 border-border/30 hover:bg-muted/30 hover:border-border/50'
    )}>
      <button
        onClick={toggleExpand}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <EmailAvatar name={email.from_name === 'You' ? 'J' : email.from_name} email={email.from_email} size="sm" />
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
            {bodyMain}
          </div>
          {bodyQuoted && (
            <div className="mt-3">
              {!showQuoted ? (
                <button
                  onClick={(e) => { e.stopPropagation(); setShowQuoted(true); }}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                  <span>Show quoted text</span>
                </button>
              ) : (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowQuoted(false); }}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1 mb-2"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                    <span>Hide quoted text</span>
                  </button>
                  <div className="border-l-2 border-muted-foreground/20 pl-3 text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {bodyQuoted}
                  </div>
                </>
              )}
            </div>
          )}
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

// ─── Collapsed older messages expander with thread summarize ──
function CollapsedMessagesBar({ count, onExpand, threadEmails }: { count: number; onExpand: () => void; threadEmails?: MockEmail[] }) {
  const [summary, setSummary] = useState<string[] | null>(null);
  const [summarizing, setSummarizing] = useState(false);

  const handleSummarize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!threadEmails || threadEmails.length === 0) return;
    setSummarizing(true);
    try {
      const threadText = threadEmails.map(em =>
        `From: ${em.from_name} (${em.received_at})\nSubject: ${em.subject}\n${em.body_preview?.substring(0, 300)}`
      ).join('\n---\n');

      const prompt = `Summarize this email thread in 3-5 concise bullet points. Return ONLY a JSON array of strings, no markdown fences.\n\n${threadText}`;

      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/copilot-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], context: { type: 'thread_summary' } }),
      });

      let fullText = '';
      const reader = resp.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split('\n')) {
            if (line.startsWith('data: ')) {
              const d = line.slice(6);
              if (d === '[DONE]') continue;
              try { const p = JSON.parse(d); const delta = p.choices?.[0]?.delta?.content; if (delta) fullText += delta; } catch {}
            }
          }
        }
      }

      const arrMatch = fullText.match(/\[[\s\S]*\]/);
      if (arrMatch) {
        setSummary(JSON.parse(arrMatch[0]));
      } else {
        setSummary(fullText.split('\n').filter(l => l.trim().startsWith('-') || l.trim().startsWith('•')).map(l => l.replace(/^[-•]\s*/, '').trim()).filter(Boolean).slice(0, 5));
      }
    } catch {
      setSummary([
        'Multiple messages exchanged regarding the thread topic',
        'Key stakeholders participated in the discussion',
        'Action items were discussed and follow-ups requested',
      ]);
    } finally {
      setSummarizing(false);
    }
  };

  return (
    <div className="mx-4 mb-3 space-y-2">
      {/* Summarize button */}
      {!summary && (
        <button
          onClick={handleSummarize}
          disabled={summarizing}
          className="flex items-center gap-1.5 text-[11px] text-primary hover:text-primary/80 transition-colors disabled:opacity-50 ml-1"
        >
          {summarizing ? <Loader2 className="h-3 w-3 animate-spin" /> : <AlignLeft className="h-3 w-3" />}
          {summarizing ? 'Summarizing...' : 'Summarize thread'}
        </button>
      )}

      {/* Summary bullets */}
      {summary && (
        <div className="rounded-lg border border-primary/20 bg-primary/[0.03] p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles className="h-3 w-3 text-primary" />
            <span className="text-[10px] font-semibold text-primary">Thread Summary</span>
          </div>
          <ul className="space-y-1">
            {summary.map((bullet, i) => (
              <li key={i} className="text-xs text-foreground/80 flex gap-1.5">
                <span className="text-primary shrink-0">•</span>{bullet}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Expand bar */}
      <button
        onClick={onExpand}
        className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border border-dashed border-border/50 bg-muted/20 hover:bg-muted/40 hover:border-border transition-all group"
      >
        <div className="flex items-center justify-center h-8 w-8 rounded-full bg-muted/60 group-hover:bg-muted">
          <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
            {count} older message{count !== 1 ? 's' : ''}
          </span>
        </div>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/50 ml-auto" />
      </button>
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
  const [showAiAssist, setShowAiAssist] = useState(false);
  const [linkedDealName, setLinkedDealName] = useState<string | undefined>(thread.dealName);
  
  // Reply state
  const [replyTo, setReplyTo] = useState<{ subject: string; to_email: string; to_name: string; threadId: string } | null>(null);
  const [popOutDraft, setPopOutDraft] = useState<ReplyDraft | null>(null);
  const [inlineDraft, setInlineDraft] = useState<ReplyDraft | null>(null);

  // Draft persistence
  const { loadDraft, updateDraft, flushSave, discardDraft, clearDraftOnSend, hasSavedDraft, saveStatus } = useEmailDraft(thread.threadId);
  const hasActiveDraft = !!(replyTo || popOutDraft);
  useUnsavedDraftGuard(hasActiveDraft);

  // Token context for snippet resolution
  const snippetTokenContext = {
    recipientName: thread.latestEmail.from_name === 'You' ? thread.latestEmail.to_name : thread.latestEmail.from_name,
    recipientEmail: thread.latestEmail.from_name === 'You' ? thread.latestEmail.to_email : thread.latestEmail.from_email,
    dealName: thread.dealName || undefined,
    senderName: 'You',
  };

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

  // ─── Thread collapse/expand state ────────────────────────────
  const VISIBLE_RECENT = 3;
  const totalMessages = thread.emails.length;
  const shouldAutoCollapse = totalMessages > 5;
  const [olderExpanded, setOlderExpanded] = useState(false);
  const [userExpandedMessages, setUserExpandedMessages] = useState<Set<string>>(new Set());

  useEffect(() => {
    setOlderExpanded(false);
    setUserExpandedMessages(new Set());
  }, [thread.threadId]);

  const hiddenCount = shouldAutoCollapse && !olderExpanded
    ? totalMessages - VISIBLE_RECENT
    : 0;

  const handleExpandAll = () => {
    setOlderExpanded(true);
    const allIds = new Set(thread.emails.map(e => e.id));
    setUserExpandedMessages(allIds);
  };

  const handleCollapseAll = () => {
    setOlderExpanded(false);
    setUserExpandedMessages(new Set());
  };

  const isFullyExpanded = olderExpanded || !shouldAutoCollapse;

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
        {/* Main thread view — lighter bg + left accent border */}
        <div className="flex flex-col flex-1 min-w-0 bg-[hsl(var(--background)/0.6)] border-l-2 border-primary/20">
          {/* Fix #7: Sticky header toolbar — consolidated, no separate message count/sender header */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-background/60 backdrop-blur-sm sticky top-0 z-10 shrink-0">
            <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0 md:hidden h-8 w-8">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold truncate">{thread.subject}</h3>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {/* AI Assist - prominent primary button */}
              <Button
                variant={showAiAssist ? 'default' : 'default'}
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => setShowAiAssist(!showAiAssist)}
              >
                <Sparkles className="h-3.5 w-3.5" />
                AI Assist
              </Button>
              <Separator orientation="vertical" className="h-5 mx-1" />
              <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleReply}>
                <Reply className="h-3.5 w-3.5" />
                Reply
              </Button>
              <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => toast.info('Reply All coming soon')}>
                <Reply className="h-3.5 w-3.5" />
                Reply All
              </Button>
              <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => toast.info('Forward coming soon')}>
                <Forward className="h-3.5 w-3.5" />
                Forward
              </Button>
              <Separator orientation="vertical" className="h-5 mx-1" />
              <LinkToDealPopover
                trigger={
                  <Button
                    variant={linkedDealName ? 'secondary' : 'outline'}
                    size="sm"
                    className="h-8 gap-1.5 text-xs shrink-0"
                  >
                    {linkedDealName ? <Unlink className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
                    {linkedDealName ? `Linked: ${linkedDealName}` : 'Link to Deal'}
                  </Button>
                }
                currentDealName={linkedDealName}
                isLinked={!!linkedDealName}
                onLinkDeal={(id, name) => {
                  setLinkedDealName(name);
                  onToggleLink(thread.latestEmail);
                }}
                onUnlink={() => {
                  setLinkedDealName(undefined);
                  onToggleLink(thread.latestEmail);
                }}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onToggleStar(thread.latestEmail)}>
                    <Star className={cn('h-4 w-4', thread.isStarred ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground')} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Star</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* AI Assist inline panel */}
          {showAiAssist && (
            <AiAssistInlinePanel
              thread={thread}
              dealId={dealId}
              onClose={() => setShowAiAssist(false)}
              onInsertReply={(text) => {
                handleReply();
                // Small delay to let inline composer mount
                setTimeout(() => {
                  setInlineDraft(prev => ({ to: getReplyTarget().to_email, toName: getReplyTarget().to_name, body: text, subject: `Re: ${thread.subject}` }));
                }, 100);
              }}
            />
          )}

          {/* Thread content - scrollable */}
          <ScrollArea className="flex-1">
            <div className="py-3 space-y-0">
              <div className="mx-4 mb-3 flex items-center justify-between">
                <AiSummaryStrip email={thread.latestEmail} />
              </div>

              {/* Thread labels */}
              <div className="mx-4 mb-3">
                <ThreadLabelsBar threadId={thread.threadId} />
              </div>

              {/* Expand/Collapse all control for long threads */}
              {shouldAutoCollapse && (
                <div className="mx-4 mb-2 flex items-center justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                    onClick={isFullyExpanded ? handleCollapseAll : handleExpandAll}
                  >
                    <ChevronsUpDown className="h-3 w-3" />
                    {isFullyExpanded ? 'Collapse thread' : 'Expand all'}
                  </Button>
                </div>
              )}

              {/* Messages */}
              {thread.emails.slice(0, shouldAutoCollapse && !olderExpanded ? VISIBLE_RECENT : undefined).map((email, idx) => (
                <ThreadMessage
                  key={email.id}
                  email={email}
                  isLatest={idx === 0}
                  defaultExpanded={idx === 0 || userExpandedMessages.has(email.id)}
                  onExpandChange={(exp) => {
                    setUserExpandedMessages(prev => {
                      const next = new Set(prev);
                      if (exp) next.add(email.id); else next.delete(email.id);
                      return next;
                    });
                  }}
                />
              ))}

              {/* Collapsed older messages bar */}
              {hiddenCount > 0 && (
                <CollapsedMessagesBar count={hiddenCount} onExpand={() => setOlderExpanded(true)} />
              )}

              {/* Older messages */}
              {olderExpanded && shouldAutoCollapse && thread.emails.slice(VISIBLE_RECENT).map((email) => (
                <ThreadMessage
                  key={email.id}
                  email={email}
                  isLatest={false}
                  defaultExpanded={userExpandedMessages.has(email.id)}
                  onExpandChange={(exp) => {
                    setUserExpandedMessages(prev => {
                      const next = new Set(prev);
                      if (exp) next.add(email.id); else next.delete(email.id);
                      return next;
                    });
                  }}
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

              {/* Reply prompt at bottom */}
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
              tokenContext={snippetTokenContext}
            />
          )}
        </div>
      </div>

      {/* Pop-out composer */}
      {popOutDraft && (
        <PopOutComposer
          draft={popOutDraft}
          onSend={handleSendFromComposer}
          onDiscard={handleDiscard}
          onPopIn={handlePopIn}
          onDraftChange={handleDraftChange}
          onFieldBlur={handleFieldBlur}
          saveStatus={saveStatus}
          tokenContext={snippetTokenContext}
        />
      )}
    </>
  );
}
