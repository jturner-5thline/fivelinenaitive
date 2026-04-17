import { useState, useEffect, useCallback, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { SmartEmailPanel } from './SmartEmailPanel';
import { ThreadLabelsBar } from './ThreadLabelsBar';
import { AiAssistInlinePanel } from './AiAssistInlinePanel';
import { AiAssistSidebar } from './AiAssistSidebar';
import { AiDraftReviewPanel } from './AiDraftReviewPanel';
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
  ReplyAll,
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
  Trash2,
  Flag,
  Pin,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { MockEmail, EmailThread, getAvatarColor, groupEmailsByThread } from './mockEmailData';
import { InlineReplyComposer, type ReplyDraft } from './InlineReplyComposer';
import { PopOutComposer } from './PopOutComposer';
import { useEmailDraft, useUnsavedDraftGuard } from '@/hooks/useEmailDraft';
import { EmailContextMenu } from './EmailContextMenu';
import { EmailBodyRenderer } from './EmailBodyRenderer';
import { EmailAttachmentList } from './EmailAttachmentList';
import { useFullEmailMessage } from './useFullEmailMessage';
import { LenderPassBanner } from './LenderPassBanner';
import { useLenderPassDetection } from '@/hooks/useLenderPassDetection';
import { SendToDataRoomDialog } from './SendToDataRoomDialog';
import { FolderPlus } from 'lucide-react';
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

// ─── AI Pass Detection Banner wrapper ────────────────────────
function PassDetectionBanner({ thread, dealId }: { thread: EmailThread; dealId?: string }) {
  const threadData = {
    subject: thread.subject,
    threadId: thread.threadId,
    emails: thread.emails,
    latestEmail: thread.latestEmail,
  };
  const { detection, hasPendingPass, committing, confirmPass, dismissPass } =
    useLenderPassDetection({ dealId, threadData, autoRun: !!dealId });
  if (!hasPendingPass || !detection) return null;
  return (
    <LenderPassBanner
      detection={detection}
      committing={committing}
      onConfirm={(reason) => confirmPass(reason)}
      onDismiss={dismissPass}
    />
  );
}

// ─── AI Summary Strip ────────────────────────────────────────
function AiSummaryStrip({ email }: { email: MockEmail }) {
  if (!email.ai_summary) return null;
  return (
    <div className="flex items-start gap-2 px-4 py-2.5 rounded-lg bg-[hsl(var(--outlook-blue)/0.08)] border border-[hsl(var(--outlook-blue)/0.15)]">
      <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--outlook-blue))] mt-0.5 shrink-0" />
      <div className="flex items-center gap-2 flex-wrap min-w-0">
        <p className="text-xs text-foreground/80 leading-relaxed">{email.ai_summary}</p>
        <SentimentBadge sentiment={email.ai_sentiment} />
      </div>
    </div>
  );
}

// ─── Outlook-style 2-letter square avatar ─────────────
const AVATAR_PALETTE = [
  { bg: 'hsl(213, 70%, 45%)', text: '#fff' },
  { bg: 'hsl(340, 55%, 45%)', text: '#fff' },
  { bg: 'hsl(160, 50%, 38%)', text: '#fff' },
  { bg: 'hsl(30, 55%, 45%)', text: '#fff' },
  { bg: 'hsl(260, 45%, 45%)', text: '#fff' },
  { bg: 'hsl(190, 50%, 40%)', text: '#fff' },
  { bg: 'hsl(10, 50%, 45%)', text: '#fff' },
  { bg: 'hsl(280, 40%, 45%)', text: '#fff' },
];

function hashStringToIndex(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % AVATAR_PALETTE.length;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function EmailAvatar({ name, email: emailAddr, size = 'sm' }: { name: string; email?: string; size?: 'sm' | 'md' }) {
  const palette = AVATAR_PALETTE[hashStringToIndex(emailAddr || name)];
  const dim = size === 'md' ? 'h-9 w-9 text-xs' : 'h-6 w-6 text-[10px]';

  return (
    <div
      className={cn('rounded flex items-center justify-center font-semibold shrink-0', dim)}
      style={{ background: palette.bg, color: palette.text }}
    >
      {getInitials(name)}
    </div>
  );
}

// ─── Thread List Item (Outlook compact) ──────────────────────
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
  const showCheckbox = hovered || isChecked;

  const rowContent = (
    <div
      className={cn(
        'group relative cursor-pointer transition-all duration-100 rounded-lg mx-1.5 my-0.5 overflow-hidden',
        isSelected
          ? 'bg-[hsl(var(--outlook-blue)/0.08)]'
          : '',
        !isSelected && 'hover:bg-[hsl(var(--foreground)/0.04)]',
      )}
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Selected accent bar */}
      {isSelected && (
        <div className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-[hsl(var(--outlook-blue))]" />
      )}
      <div className="flex items-start gap-2.5 px-3 py-2 min-w-0">
        {/* Checkbox or avatar area */}
        <div className="relative flex items-center justify-center shrink-0 mt-0.5" style={{ width: 24, height: 24 }}>
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
              {isUnread && (
                <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-[6px] h-[6px] rounded-full bg-[hsl(var(--outlook-blue))] z-10" />
              )}
              <EmailAvatar
                name={latest.folder === 'sent' ? (latest.to_name || 'U') : latest.from_name}
                email={latest.folder === 'sent' ? latest.to_email : latest.from_email}
              />
            </>
          )}
        </div>
        
        <div className="min-w-0 flex-1">
          {/* Row 1: Sender + date on same line */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={cn(
                'text-[13px] truncate',
                isUnread
                  ? 'font-bold text-[hsl(var(--email-text-primary))]'
                  : 'font-medium text-[hsl(var(--email-text-secondary))]'
              )}>
                {displayName}
              </span>
              {threadCount > 1 && (
                <span className="text-[10px] text-[hsl(var(--email-text-muted))] font-medium shrink-0">
                  [{threadCount}]
                </span>
              )}
            </div>
            <span className={cn(
              'text-[11px] shrink-0 transition-opacity duration-100',
              hovered ? 'opacity-0' : 'opacity-100',
              isUnread ? 'text-[hsl(var(--outlook-blue))] font-semibold' : 'text-[hsl(var(--email-text-muted))]'
            )}>
              {formatDistanceToNow(new Date(latest.received_at), { addSuffix: false })}
            </span>
          </div>

          {/* Row 2: Subject (bold if unread) */}
          <p className={cn(
            'text-[12px] truncate leading-tight',
            isUnread
              ? 'text-[hsl(var(--email-text-primary))] font-semibold'
              : 'text-[hsl(var(--email-text-secondary))] font-normal'
          )}>
            {thread.subject}
          </p>
          
          {/* Row 3: Preview text + deal pill */}
          <div className="flex items-center gap-1.5 mt-0.5">
            {thread.dealName && (
              <Badge variant="outline" className="text-[9px] h-[16px] px-1 gap-0.5 bg-[hsl(var(--outlook-blue)/0.12)] text-[hsl(var(--outlook-blue))] border-[hsl(var(--outlook-blue)/0.25)] shrink-0">
                {thread.dealName}
              </Badge>
            )}
            <p className="text-[11px] text-[hsl(var(--email-text-muted))] truncate">
              {latest.snippet}
            </p>
          </div>
        </div>
      </div>

      {/* Hover actions: flag, delete, pin */}
      {hovered && (
        <div className="absolute right-2 top-1.5 flex items-center gap-0">
          <button onClick={(e) => { e.stopPropagation(); onToggleStar(latest); }} className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted/60 transition-colors">
            <Flag className={cn('h-3 w-3', thread.isStarred ? 'fill-[hsl(var(--outlook-blue))] text-[hsl(var(--outlook-blue))]' : 'text-muted-foreground')} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete?.(latest); }} className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted/60 transition-colors">
            <Trash2 className="h-3 w-3 text-muted-foreground" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onArchive?.(latest); }} className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted/60 transition-colors">
            <Pin className="h-3 w-3 text-muted-foreground" />
          </button>
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
    <div className="space-y-0">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex items-start gap-2.5 px-3 py-2 border-l-2 border-transparent">
          <div className="h-6 w-6 rounded bg-muted/30 animate-pulse shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="h-3 w-24 bg-muted/30 rounded animate-pulse" />
              <div className="h-2.5 w-10 bg-muted/20 rounded animate-pulse" />
            </div>
            <div className="h-3 w-3/4 bg-muted/25 rounded animate-pulse" />
            <div className="h-2.5 w-full bg-muted/15 rounded animate-pulse" />
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
      <div className="space-y-0">
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
function ThreadMessage({ email, isLatest, defaultExpanded, onExpandChange, threadId, threadSubject, threadEmails, dealId, dealName }: { 
  email: MockEmail; 
  isLatest: boolean; 
  defaultExpanded: boolean;
  onExpandChange?: (expanded: boolean) => void;
  threadId: string;
  threadSubject: string;
  threadEmails: MockEmail[];
  dealId?: string;
  dealName?: string;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showQuoted, setShowQuoted] = useState(false);
  const messageRef = useRef<HTMLDivElement>(null);
  const displayName = email.from_name === 'You' ? 'You' : email.from_name;

  // Lazy-load the full body + attachments when this message is expanded.
  const alreadyHasFullBody = !!(email.body_loaded || email.body_html || (email.body_text && email.body_text.length > 0));
  const { data: fullData, loading: fullLoading } = useFullEmailMessage(
    email.id,
    expanded,
    alreadyHasFullBody,
  );

  // Resolve the best available body: prefer freshly fetched HTML, then prop HTML,
  // then fetched text, then prop text/preview snippet.
  const resolvedHtml = fullData?.body_html || email.body_html || '';
  const resolvedText = fullData?.body_text || email.body_text || email.body_preview || '';

  // For plain-text bodies, split off the quoted reply chain so we can show/hide it.
  const { main: textMain, quoted: textQuoted } = resolvedHtml
    ? { main: '', quoted: null }
    : splitQuotedContent(resolvedText);

  // Resolve attachments from either the freshly fetched message or the original prop.
  const attachments = (fullData?.attachments && fullData.attachments.length > 0)
    ? fullData.attachments
    : (email.attachments || []);
  const hasRealAttachments = attachments.length > 0;
  const showAttachmentsLoading = expanded && fullLoading && !hasRealAttachments && email.has_attachments;

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
      'border-b border-[hsl(var(--email-border))] transition-all duration-100 min-w-0',
      expanded ? 'bg-card/50' : 'hover:bg-[hsl(var(--foreground)/0.03)]'
    )}>
      <button
        onClick={toggleExpand}
        className="w-full flex items-center gap-3 px-5 py-2.5 text-left"
      >
        <EmailAvatar name={email.from_name === 'You' ? 'J' : email.from_name} email={email.from_email} size="md" />
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className={cn(
            'text-[13px] truncate',
            isLatest
              ? 'font-semibold text-[hsl(var(--email-text-primary))]'
              : 'font-medium text-[hsl(var(--email-text-secondary))]'
          )}>
            {displayName}
          </span>
          {!expanded && (
            <span className="text-xs text-[hsl(var(--email-text-muted))] truncate">{email.snippet}</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {email.has_attachments && <Paperclip className="h-3 w-3 text-[hsl(var(--email-text-muted))]" />}
          <span className="text-[11px] text-[hsl(var(--email-text-muted))]">
            {format(new Date(email.received_at), 'MMM d, h:mm a')}
          </span>
          {expanded ? <ChevronDown className="h-3 w-3 text-[hsl(var(--email-text-muted))]" /> : <ChevronRight className="h-3 w-3 text-[hsl(var(--email-text-muted))]" />}
        </div>
      </button>

      {expanded && (
        <div className="px-6 pb-5 pl-[64px] min-w-0">
          <div className="flex items-center gap-2 mb-3 text-xs text-[hsl(var(--email-text-muted))]">
            <span>to {email.folder === 'sent' ? (email.to_name || email.to_email) : 'me'}</span>
          </div>

          {fullLoading && !alreadyHasFullBody && !resolvedHtml && !resolvedText && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Loading full message…</span>
            </div>
          )}

          {/* Body — HTML preferred, plain text fallback. Inline attachments
              are passed so signature logos / embedded images can resolve their
              `cid:` references. */}
          {resolvedHtml ? (
            <EmailBodyRenderer
              html={resolvedHtml}
              messageId={email.id}
              inlineAttachments={fullData?.inline_attachments}
            />
          ) : (
            <EmailBodyRenderer text={textMain} />
          )}

          {/* Quoted text (only meaningful for plain text bodies) */}
          {!resolvedHtml && textQuoted && (
            <div className="mt-4">
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
                  <div className="border-l-2 border-[hsl(var(--outlook-blue)/0.35)] pl-4 text-[13px] text-[hsl(var(--email-text-secondary))] leading-[1.65] max-w-full" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                    {textQuoted}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Attachments */}
          {hasRealAttachments && (
            <EmailAttachmentList
              messageId={email.id}
              attachments={attachments}
              sourceEmail={{
                messageId: email.id,
                threadId,
                subject: threadSubject,
                senderName: email.from_name,
                senderEmail: email.from_email,
              }}
              threadData={{
                subject: threadSubject,
                threadId,
                emails: threadEmails,
                latestEmail: threadEmails[0] || email,
              }}
              linkedDealId={dealId}
              linkedDealName={dealName}
            />
          )}
          {showAttachmentsLoading && (
            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Loading attachments…</span>
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
    <div className="space-y-2">
      {/* Summarize button */}
      {!summary && (
        <button
          onClick={handleSummarize}
          disabled={summarizing}
          className="flex items-center gap-1.5 text-[11px] text-[hsl(var(--outlook-blue))] hover:text-[hsl(var(--outlook-blue)/0.8)] transition-colors disabled:opacity-50 px-5 py-1"
        >
          {summarizing ? <Loader2 className="h-3 w-3 animate-spin" /> : <AlignLeft className="h-3 w-3" />}
          {summarizing ? 'Summarizing...' : 'Summarize thread'}
        </button>
      )}

      {/* Summary bullets */}
      {summary && (
        <div className="mx-5 rounded border border-[hsl(var(--outlook-blue)/0.2)] bg-[hsl(var(--outlook-blue)/0.04)] p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles className="h-3 w-3 text-[hsl(var(--outlook-blue))]" />
            <span className="text-[10px] font-semibold text-[hsl(var(--outlook-blue))]">Thread Summary</span>
          </div>
          <ul className="space-y-1">
            {summary.map((bullet, i) => (
              <li key={i} className="text-xs text-foreground/80 flex gap-1.5">
                <span className="text-[hsl(var(--outlook-blue))] shrink-0">•</span>{bullet}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Expand bar */}
      <button
        onClick={onExpand}
        className="w-full flex items-center gap-3 px-5 py-2 border-y border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] transition-all group"
      >
        <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[12px] font-medium text-muted-foreground group-hover:text-foreground transition-colors">
          {count} older message{count !== 1 ? 's' : ''}
        </span>
        <ChevronDown className="h-3 w-3 text-muted-foreground/50 ml-auto" />
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
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onDelete?: (email: MockEmail) => void;
  onArchive?: (email: MockEmail) => void;
}

export function EmailDetail({ thread, dealId, onBack, onToggleLink, onToggleStar, onSendReply, isExpanded, onToggleExpand, onDelete, onArchive }: EmailDetailProps) {
  const [showSmartPanel, setShowSmartPanel] = useState(false);
  const [smartPopoverOpen, setSmartPopoverOpen] = useState(false);
  const [showAiAssist, setShowAiAssist] = useState(false);
  const [showAiDraft, setShowAiDraft] = useState(false);
  const [linkedDealName, setLinkedDealName] = useState<string | undefined>(thread.dealName);
  const [showSendToDataRoom, setShowSendToDataRoom] = useState(false);

  // Hoist the latest message's full body load so the toolbar/dialog can see
  // its attachments (the per-message MessageBlock loads its own copy too —
  // both share the Nylas cache so this is cheap).
  const latestMessageId = thread.latestEmail.id;
  const isMockLatest = !latestMessageId || latestMessageId.startsWith('mock-');
  const { data: latestFullData } = useFullEmailMessage(
    latestMessageId,
    !isMockLatest,
    !!(thread.latestEmail.body_html || thread.latestEmail.body_text),
  );
  const latestAttachments = (latestFullData?.attachments && latestFullData.attachments.length > 0)
    ? latestFullData.attachments
    : (thread.latestEmail.attachments || []);
  const hasUploadableAttachments = latestAttachments.some(a => !a.is_inline && !!a.id);
  
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

  const handleReplyAll = useCallback(() => {
    if (popOutDraft) return;
    const latest = thread.latestEmail;
    const target = getReplyTarget();
    // For Reply All, include CC from original email
    const ccEmails = latest.from_name === 'You' ? '' : (latest.to_email !== target.to_email ? latest.to_email : '');
    setReplyTo(target);
    setInlineDraft({
      to: target.to_email,
      toName: target.to_name,
      subject: thread.subject.startsWith('Re:') ? thread.subject : `Re: ${thread.subject}`,
      body: '',
      cc: ccEmails,
      bcc: '',
      attachments: [],
      threadId: thread.threadId,
    });
    setShowResumeBanner(false);
  }, [getReplyTarget, popOutDraft, thread]);

  const handleForward = useCallback(() => {
    if (popOutDraft) return;
    const latest = thread.latestEmail;
    const fwdSubject = thread.subject.startsWith('Fwd:') ? thread.subject : `Fwd: ${thread.subject}`;
    const fwdBody = `\n\n---------- Forwarded message ----------\nFrom: ${latest.from_name} <${latest.from_email}>\nDate: ${latest.received_at}\nSubject: ${thread.subject}\n\n${latest.body_preview || latest.snippet || ''}`;
    setReplyTo({ subject: fwdSubject, to_email: '', to_name: '', threadId: thread.threadId });
    setInlineDraft({
      to: '',
      toName: '',
      subject: fwdSubject,
      body: fwdBody,
      cc: '',
      bcc: '',
      attachments: [],
      threadId: thread.threadId,
    });
    setShowResumeBanner(false);
  }, [popOutDraft, thread]);

  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handleDelete = useCallback(async () => {
    if (!onDelete || actionLoading) return;
    setActionLoading('delete');
    try {
      onDelete(thread.latestEmail);
      onBack();
    } finally {
      setActionLoading(null);
    }
  }, [onDelete, thread, onBack, actionLoading]);

  const handleArchive = useCallback(async () => {
    if (!onArchive || actionLoading) return;
    setActionLoading('archive');
    try {
      onArchive(thread.latestEmail);
      onBack();
    } finally {
      setActionLoading(null);
    }
  }, [onArchive, thread, onBack, actionLoading]);

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
      if (e.key === 'f' || e.key === 'F') { e.preventDefault(); handleForward(); }
      if (e.key === 'l' || e.key === 'L') { e.preventDefault(); onToggleLink(thread.latestEmail); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [thread, onToggleLink, handleReply]);

  const latest = thread.latestEmail;
  const senderName = latest.from_name === 'You' ? latest.to_name : latest.from_name;
  const senderEmail = latest.from_name === 'You' ? latest.to_email : latest.from_email;

  return (
    <>
      <div className="flex h-full relative overflow-hidden">
        <div className="flex flex-col flex-1 min-w-0 bg-[hsl(var(--email-reading-bg))]">
          {/* Outlook-style command bar */}
          <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-[hsl(var(--email-border))] bg-card/60 backdrop-blur-sm shrink-0">
            <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0 md:hidden h-7 w-7">
              <ChevronLeft className="h-4 w-4" />
            </Button>

            {/* Command bar buttons with icons + labels */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={handleReply} className="flex flex-col items-center gap-0.5 px-3 py-1 rounded hover:bg-muted/40 transition-colors">
                  <Reply className="h-4 w-4 text-[hsl(var(--email-text-secondary))]" />
                  <span className="text-[10px] text-[hsl(var(--email-text-secondary))]">Reply</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Reply (R)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={handleReplyAll} className="flex flex-col items-center gap-0.5 px-3 py-1 rounded hover:bg-muted/40 transition-colors">
                  <ReplyAll className="h-4 w-4 text-[hsl(var(--email-text-secondary))]" />
                  <span className="text-[10px] text-[hsl(var(--email-text-secondary))]">Reply All</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Reply All</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={handleForward} className="flex flex-col items-center gap-0.5 px-3 py-1 rounded hover:bg-muted/40 transition-colors">
                  <Forward className="h-4 w-4 text-[hsl(var(--email-text-secondary))]" />
                  <span className="text-[10px] text-[hsl(var(--email-text-secondary))]">Forward</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Forward (F)</TooltipContent>
            </Tooltip>

            <div className="w-px h-8 bg-border/50 mx-1" />

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleDelete}
                  disabled={!onDelete || actionLoading === 'delete'}
                  className="flex flex-col items-center gap-0.5 px-3 py-1 rounded hover:bg-muted/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {actionLoading === 'delete' ? <Loader2 className="h-4 w-4 animate-spin text-foreground/70" /> : <Trash2 className="h-4 w-4 text-[hsl(var(--email-text-secondary))]" />}
                  <span className="text-[10px] text-[hsl(var(--email-text-secondary))]">Delete</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Delete</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleArchive}
                  disabled={!onArchive || actionLoading === 'archive'}
                  className="flex flex-col items-center gap-0.5 px-3 py-1 rounded hover:bg-muted/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {actionLoading === 'archive' ? <Loader2 className="h-4 w-4 animate-spin text-foreground/70" /> : <Archive className="h-4 w-4 text-[hsl(var(--email-text-secondary))]" />}
                  <span className="text-[10px] text-[hsl(var(--email-text-secondary))]">Archive</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Archive</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={() => onToggleStar(latest)} className="flex flex-col items-center gap-0.5 px-3 py-1 rounded hover:bg-muted/40 transition-colors">
                  <Flag className={cn('h-4 w-4', thread.isStarred ? 'fill-[hsl(var(--outlook-blue))] text-[hsl(var(--outlook-blue))]' : 'text-foreground/70')} />
                  <span className="text-[10px] text-[hsl(var(--email-text-secondary))]">Flag</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Flag</TooltipContent>
            </Tooltip>

            <div className="w-px h-8 bg-border/50 mx-1" />

            {/* Custom actions: AI Assist + Link to Deal — Outlook command bar style */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setShowAiAssist(!showAiAssist)}
                  className={cn(
                    'flex flex-col items-center gap-0.5 px-3 py-1 rounded transition-colors border',
                    showAiAssist
                      ? 'bg-[hsl(var(--outlook-blue)/0.1)] border-[hsl(var(--outlook-blue)/0.3)] text-[hsl(var(--outlook-blue))]'
                      : 'border-transparent hover:bg-muted/40'
                  )}
                >
                  <Sparkles className={cn('h-4 w-4', showAiAssist ? 'text-[hsl(var(--outlook-blue))]' : 'text-foreground/70')} />
                  <span className={cn('text-[10px]', showAiAssist ? 'text-[hsl(var(--outlook-blue))]' : 'text-foreground/60')}>AI Assist</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">AI-powered email analysis</TooltipContent>
            </Tooltip>

            {hasUploadableAttachments && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setShowSendToDataRoom(true)}
                    className="flex flex-col items-center gap-0.5 px-3 py-1 rounded transition-colors border border-transparent hover:bg-muted/40"
                  >
                    <FolderPlus className="h-4 w-4 text-[hsl(var(--email-text-secondary))]" />
                    <span className="text-[10px] text-[hsl(var(--email-text-secondary))]">To Data Room</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Send attachments to a deal's data room</TooltipContent>
              </Tooltip>
            )}


            <LinkToDealPopover
              trigger={
                <button
                  className={cn(
                    'flex flex-col items-center gap-0.5 px-3 py-1 rounded transition-colors border',
                    linkedDealName
                      ? 'bg-[hsl(var(--outlook-blue)/0.1)] border-[hsl(var(--outlook-blue)/0.3)] text-[hsl(var(--outlook-blue))]'
                      : 'border-transparent hover:bg-muted/40'
                  )}
                >
                  {linkedDealName ? <Unlink className="h-4 w-4 text-[hsl(var(--outlook-blue))]" /> : <Link2 className="h-4 w-4 text-[hsl(var(--email-text-secondary))]" />}
                  <span className={cn('text-[10px]', linkedDealName ? 'text-[hsl(var(--outlook-blue))]' : 'text-foreground/60')}>
                    {linkedDealName ? 'Linked' : 'Link Deal'}
                  </span>
                </button>
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

            {onToggleExpand && (
              <>
                <div className="w-px h-8 bg-border/50 mx-1" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={onToggleExpand}
                      className="flex flex-col items-center gap-0.5 px-3 py-1 rounded hover:bg-muted/40 transition-colors"
                    >
                      {isExpanded ? <Minimize2 className="h-4 w-4 text-[hsl(var(--email-text-secondary))]" /> : <Maximize2 className="h-4 w-4 text-[hsl(var(--email-text-secondary))]" />}
                      <span className="text-[10px] text-[hsl(var(--email-text-secondary))]">{isExpanded ? 'Collapse' : 'Expand'}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">{isExpanded ? 'Show email list' : 'Expand reading pane'}</TooltipContent>
                </Tooltip>
              </>
            )}
          </div>

          {/* AI Assist sidebar is rendered as a flex sibling at the bottom of this component (see end of return). */}

          {/* AI Draft review panel */}
          {showAiDraft && (
            <AiDraftReviewPanel
              thread={thread}
              dealId={dealId}
              onClose={() => setShowAiDraft(false)}
              onApprove={(subject, body) => {
                setShowAiDraft(false);
                handleReply();
                setTimeout(() => {
                  const target = getReplyTarget();
                  setInlineDraft({
                    to: target.to_email,
                    toName: target.to_name,
                    body,
                    subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
                    cc: '',
                    bcc: '',
                    attachments: [],
                    threadId: thread.threadId,
                  });
                }, 100);
              }}
            />
          )}

          <div className="px-6 pt-5 pb-4 border-b border-[hsl(var(--email-border))]">
            {/* Large subject heading */}
            <h2 className="text-xl font-semibold text-[hsl(var(--email-text-primary))] leading-snug mb-3">{thread.subject}</h2>
            
            {/* Sender info block */}
            <div className="flex items-start gap-3">
              <EmailAvatar name={senderName} email={senderEmail} size="md" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[hsl(var(--email-text-primary))]">{senderName}</span>
                  <span className="text-xs text-[hsl(var(--email-text-muted))]">&lt;{senderEmail}&gt;</span>
                </div>
                <div className="text-xs text-[hsl(var(--email-text-muted))] mt-0.5">
                  {format(new Date(latest.received_at), 'EEEE, MMMM d, yyyy h:mm a')}
                </div>
                <div className="text-xs text-[hsl(var(--email-text-muted))] mt-0.5">
                  To: <span className="text-[hsl(var(--email-text-secondary))]">me</span>
                  {linkedDealName && (
                    <span className="ml-2 text-[hsl(var(--outlook-blue))]">• Linked to: {linkedDealName}</span>
                  )}
                </div>
              </div>
              {/* Thread count indicator */}
              {totalMessages > 1 && (
                <div className="flex items-center gap-1 text-xs text-[hsl(var(--email-text-secondary))] shrink-0">
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>{totalMessages} messages</span>
                  <button
                    onClick={isFullyExpanded ? handleCollapseAll : handleExpandAll}
                    className="ml-1 hover:text-[hsl(var(--email-text-primary))] transition-colors"
                  >
                    {isFullyExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Thread content - scrollable */}
          <ScrollArea className="flex-1 min-w-0">
            <div className="py-2 space-y-0 min-w-0 pb-24">
              <div className="px-5 mb-3">
                <AiSummaryStrip email={thread.latestEmail} />
              </div>

              {/* Thread labels */}
              <div className="px-5 mb-2">
                <ThreadLabelsBar threadId={thread.threadId} />
              </div>

              {/* AI-detected lender pass banner */}
              <PassDetectionBanner thread={thread} dealId={dealId} />

              {/* Messages */}
              {thread.emails.slice(0, shouldAutoCollapse && !olderExpanded ? VISIBLE_RECENT : undefined).map((email, idx) => (
                <ThreadMessage
                  key={email.id}
                  email={email}
                  isLatest={idx === 0}
                  defaultExpanded={idx === 0 || userExpandedMessages.has(email.id)}
                  threadId={thread.threadId}
                  threadSubject={thread.subject}
                  threadEmails={thread.emails}
                  dealId={dealId}
                  dealName={linkedDealName || thread.dealName}
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
                <CollapsedMessagesBar count={hiddenCount} onExpand={() => setOlderExpanded(true)} threadEmails={thread.emails} />
              )}

              {/* Older messages */}
              {olderExpanded && shouldAutoCollapse && thread.emails.slice(VISIBLE_RECENT).map((email) => (
                <ThreadMessage
                  key={email.id}
                  email={email}
                  isLatest={false}
                  defaultExpanded={userExpandedMessages.has(email.id)}
                  threadId={thread.threadId}
                  threadSubject={thread.subject}
                  threadEmails={thread.emails}
                  dealId={dealId}
                  dealName={linkedDealName || thread.dealName}
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
                <div className="px-5 mb-3">
                  <button
                    onClick={handleResumeDraft}
                    className="w-full flex items-center gap-2 px-4 py-3 rounded border border-[hsl(var(--outlook-blue)/0.3)] bg-[hsl(var(--outlook-blue)/0.05)] text-foreground hover:bg-[hsl(var(--outlook-blue)/0.1)] transition-all"
                  >
                    <FileText className="h-4 w-4 text-[hsl(var(--outlook-blue))]" />
                    <span className="text-sm font-medium">Resume draft</span>
                    <span className="text-xs text-muted-foreground ml-1">— You have an unsaved reply for this thread</span>
                    <kbd className="ml-auto text-[10px] bg-muted px-1.5 py-0.5 rounded">R</kbd>
                  </button>
                </div>
              )}

              {/* Reply prompt at bottom */}
              {!replyTo && !popOutDraft && !showResumeBanner && (
                <div className="px-5 mb-3">
                  <button
                    onClick={handleReply}
                    className="w-full flex items-center gap-2 px-4 py-3 border border-white/[0.08] text-muted-foreground hover:border-[hsl(var(--outlook-blue)/0.3)] hover:bg-[hsl(var(--outlook-blue)/0.04)] hover:text-foreground transition-all"
                  >
                    <Reply className="h-4 w-4" />
                    <span className="text-sm">Click to reply...</span>
                    <kbd className="ml-auto text-[10px] bg-muted px-1.5 py-0.5 rounded">R</kbd>
                  </button>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Inline reply — Outlook style with blue separator */}
          {replyTo && (
            <div className="border-t-2 border-[hsl(var(--outlook-blue))]">
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
            </div>
          )}
        </div>

        {/* AI Assist right-side sidebar — lives inside the email popup border */}
        {showAiAssist && (
          <AiAssistSidebar
            thread={thread}
            dealId={dealId}
            dealName={linkedDealName || thread.dealName}
            onClose={() => setShowAiAssist(false)}
            onInsertDraft={(subject, body) => {
              const target = getReplyTarget();
              const finalSubject = subject?.startsWith('Re:') ? subject : `Re: ${thread.subject}`;
              // If composer not open yet, open it
              if (!replyTo) {
                setReplyTo(target);
              }
              setInlineDraft({
                to: target.to_email,
                toName: target.to_name,
                subject: finalSubject,
                body,
                cc: inlineDraft?.cc || '',
                bcc: inlineDraft?.bcc || '',
                attachments: inlineDraft?.attachments || [],
                threadId: thread.threadId,
              });
              setShowResumeBanner(false);
            }}
          />
        )}
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

      {/* Send to Data Room dialog */}
      {showSendToDataRoom && (
        <SendToDataRoomDialog
          open={showSendToDataRoom}
          onClose={() => setShowSendToDataRoom(false)}
          attachments={latestAttachments}
          messageId={latestMessageId}
          threadData={{
            subject: thread.subject,
            threadId: thread.threadId,
            emails: thread.emails,
            latestEmail: thread.latestEmail,
          }}
          sourceEmail={{
            messageId: latestMessageId,
            threadId: thread.threadId,
            subject: thread.subject,
            senderName: thread.latestEmail.from_name,
            senderEmail: thread.latestEmail.from_email,
          }}
          initialDealId={dealId}
          initialDealName={linkedDealName}
        />
      )}
    </>

  );
}
