import { Component, type ErrorInfo, type ReactNode, useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import { Virtuoso } from 'react-virtuoso';
import { Badge } from '@/components/ui/badge';
import { SmartEmailPanel } from './SmartEmailPanel';
import { ThreadLabelsBar } from './ThreadLabelsBar';
import { AiAssistInlinePanel } from './AiAssistInlinePanel';
import { AiAssistSidebar } from './AiAssistSidebar';
import { YourReplyComposer } from './YourReplyComposer';
import { LinkToDealPopover } from './LinkToDealPopover';
import { LinkedDealPreviewPopover } from './LinkedDealPreviewPopover';
import { ThreadSummaryCard } from './ThreadSummaryCard';
import { Button } from '@/components/ui/button';
import { useAssistEnabled } from '@/hooks/useAssistEnabled';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { formatDistanceToNow, format } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  MoreVertical,
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
  X,
} from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { MockEmail, EmailThread, getAvatarColor, groupEmailsByThread } from './mockEmailData';
import { InlineReplyComposer, type ReplyDraft } from './InlineReplyComposer';
import { PopOutComposer } from './PopOutComposer';
import type { SuggestedReply } from './SuggestedReplyCards';
import { useEmailDraft, useUnsavedDraftGuard } from '@/hooks/useEmailDraft';
import { detectBareEmailsInDraft } from '@/lib/detectDraftEmails';
import { detectThreadQAndA, buildQADedupKey, type ThreadMessageLite } from '@/lib/detectThreadQAndA';
import { usePendingDealSuggestions } from '@/hooks/usePendingDealSuggestions';
import { useResolveDealForEmail } from '@/hooks/useResolveDealForEmail';
import { useUserEmailSignature } from '@/hooks/useUserEmailSignature';
import { isAutoDealNoteSuggestionEnabled } from '@/hooks/useAutoDealNoteSuggestionPref';
import { usePendingDealResolutionsStore } from '@/stores/pendingDealResolutionsStore';
import { summarizeSelectedEmailThread, type EmailThreadSummaryDebug } from './threadSummaryUtils';
import { EmailContextMenu } from './EmailContextMenu';
import { CreateTaskFromEmailDialog } from '@/components/tasks/CreateTaskFromEmailDialog';
import { EmailBodyRenderer } from './EmailBodyRenderer';
import { EmailSelectionActionMenu } from './EmailSelectionActionMenu';
import { EmailAttachmentList } from './EmailAttachmentList';
import { EmailAttachmentsStrip, detectAttachmentFallbackReason } from './EmailAttachmentsStrip';
import { useFullEmailMessage, prefetchFullEmailMessage } from './useFullEmailMessage';
import { EmailSyncIndicator } from './EmailSyncIndicator';
import { LenderPassBanner } from './LenderPassBanner';
import { useLenderPassDetection } from '@/hooks/useLenderPassDetection';
import { SendToDataRoomDialog } from './SendToDataRoomDialog';
import { FolderPlus } from 'lucide-react';
import { Users } from 'lucide-react';
import { useThreadWorkflowAnalysis } from '@/hooks/useThreadWorkflowAnalysis';
import { useEmailPrioritySignals } from '@/hooks/useEmailPrioritySignals';
import type { DetectedSignal, EmailPrioritySignalType, PrioritySignalSeverity } from '@/lib/emailPrioritySignals';
import { getSignalDef, getSignalSeverity } from '@/lib/emailPrioritySignals';
import { useEmailClassifierData } from '@/hooks/useEmailClassifierData';
import { classifyEmail } from '@/utils/emailClassifier';

/**
 * Staleness bucket for "Clients & Deals" rows. Computed from the age of the
 * newest inbound message in the thread (when nothing has been replied to)
 * vs. the time since our last outbound reply.
 *
 *  - fresh   green   < 24h
 *  - aging   yellow  2–5 days no reply
 *  - stale   orange  6–10 days no reply
 *  - urgent  red     11+ days no reply (pulses)
 *
 * If the most recent message in the thread is one we sent, the bucket is
 * always reset to "fresh" (green) — the ball's back in their court.
 */
export type StaleBucket = 'fresh' | 'aging' | 'stale' | 'urgent';

export function computeStaleBucket(
  latestReceivedAt: string | Date | undefined | null,
  alreadyResponded: boolean,
  now: Date = new Date(),
): StaleBucket {
  if (alreadyResponded) return 'fresh';
  if (!latestReceivedAt) return 'fresh';
  const ts = typeof latestReceivedAt === 'string' ? new Date(latestReceivedAt) : latestReceivedAt;
  if (!ts || isNaN(ts.getTime())) return 'fresh';
  const hours = (now.getTime() - ts.getTime()) / 36e5;
  if (hours < 24) return 'fresh';
  const days = hours / 24;
  if (days < 6) return 'aging';   // 1–5 full days
  if (days < 11) return 'stale';  // 6–10 full days
  return 'urgent';                // 11+ days
}

const STALE_DOT_CLASSES: Record<StaleBucket, string> = {
  fresh: 'bg-emerald-500',
  aging: 'bg-yellow-400',
  stale: 'bg-orange-500',
  urgent: 'bg-red-500 animate-pulse ring-2 ring-red-500/30',
};

const STALE_DOT_TITLES: Record<StaleBucket, string> = {
  fresh: 'Fresh — replied or under 24h',
  aging: 'Aging — 2–5 days without reply',
  stale: 'Stale — 6–10 days without reply',
  urgent: 'Urgent — 11+ days without reply',
};

// Visual styling for the inbox-row priority indicator. Red = urgent
// (pass / decline / wire / funded / not_a_fit). Yellow = action
// (diligence, term sheet, close, etc.). Kept inline so the row component
// can resolve everything from the detected signal alone.
const PRIORITY_EDGE_BAR: Record<PrioritySignalSeverity, string> = {
  urgent: 'bg-red-500',
  action: 'bg-amber-500',
};
const PRIORITY_PILL_CLASSES: Record<PrioritySignalSeverity, string> = {
  urgent: 'bg-red-500/12 text-red-500 border-red-500/35',
  action: 'bg-amber-500/12 text-amber-500 border-amber-500/35',
};
const PRIORITY_ICON_CLASSES: Record<PrioritySignalSeverity, string> = {
  urgent: 'fill-red-500 text-red-500',
  action: 'fill-amber-500 text-amber-500',
};
import { useAutoEmailLabelEvaluator } from '@/hooks/useAutoEmailLabelEvaluator';
import type { EmailLabel } from '@/hooks/useEmailLabels';
import { useLabels, useAllLabelAssignments, buildThreadLabelMap } from '@/hooks/useEmailLabels';
import { labelSwatch } from './EmailLabelsManageDialog';
import { systemLabelsForEmail } from './systemAutoLabels';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useDealMatchForEmail } from '@/hooks/useDealMatchForEmail';
import { DealMatchBadge } from '@/components/dashboard/inbox/DealMatchBadge';
import type { DraftMode } from './AiDraftReviewPanel';
import { useIsMobile } from '@/hooks/use-mobile';

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
  autoLabels?: EmailLabel[];
  priorityFlag?: DetectedSignal;
  userLabels?: EmailLabel[];
  onRowReply?: (email: MockEmail) => void;
  onRowReplyAll?: (email: MockEmail) => void;
  onRowForward?: (email: MockEmail) => void;
  onSaveToDeal?: (email: MockEmail) => void;
  selectedCount?: number;
  isInBulkSelection?: boolean;
  onBulkMarkRead?: () => void;
  onBulkMarkUnread?: () => void;
  onBulkArchive?: () => void;
  onBulkDelete?: () => void;
}

function providerLabelsIndicateRead(email: MockEmail): boolean {
  const labels = Array.isArray(email.labels) ? email.labels : [];
  if (!labels.length) return false;
  return !labels.some((label: any) => {
    const v = String(label?.id ?? label?.name ?? label?.display_name ?? label?.label ?? label).toUpperCase();
    return v === 'UNREAD';
  });
}

function ThreadListItemImpl({ thread, isSelected, onSelect, onToggleLink, onToggleStar, isChecked, onCheckChange, onMarkRead, onMarkUnread, onArchive, onDelete, autoLabels, priorityFlag, userLabels, onRowReply, onRowReplyAll, onRowForward, onSaveToDeal, selectedCount, isInBulkSelection, onBulkMarkRead, onBulkMarkUnread, onBulkArchive, onBulkDelete }: ThreadListItemProps) {
  const [hovered, setHovered] = useState(false);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const latest = thread.latestEmail;
  // Each row represents a specific message (`latest`). Display its own
  // sender + snippet — Gmail's All Mail behaviour — so search results don't
  // mislabel an inbound message with the thread's most-recent replier.
  const newestInThread = latest;
  const newestIsOutbound = latest.folder === 'sent' || latest.from_name === 'You';
  const displayName = newestIsOutbound ? 'Me' : latest.from_name;
  const previewSnippet =
    latest.snippet ||
    latest.body_preview ||
    latest.body_text ||
    '';
  const threadCount = thread.emails.length;
  const isUnread = thread.hasUnread && !providerLabelsIndicateRead(latest);
  const showCheckbox = hovered || isChecked;

  // Notification-type emails (Asana, Google Calendar invites, naitive system,
  // generic noreply/no-reply senders) are read-only — hide hover actions on
  // them since flag/trash/snooze aren't useful.
  const isNotificationEmail = (() => {
    const from = String(latest.from_email || '').toLowerCase();
    if (!from) return false;
    const local = from.split('@')[0] || '';
    const domain = from.split('@')[1] || '';
    if (/^(no[-._]?reply|notifications?|do[-._]?not[-._]?reply|automated|mailer[-._]?daemon|bounce)/.test(local)) return true;
    if (/notifications?@/.test(from)) return true;
    if (/(^|\.)asana\.com$/.test(domain)) return true;
    if (/calendar-notification@google\.com$/.test(from)) return true;
    if (/(^|\.)naitive\.co$/.test(domain) && /^(noreply|no-reply|notifications?|system|alerts?)/.test(local)) return true;
    return false;
  })();

  // Location chip — surfaces where the email actually lives in Gmail when
  // it's NOT in the user's inbox. The all-mail search can return archived
  // mail and emails moved to user labels (Censys, Lenders, …); without this
  // chip the user has no way to tell why a result isn't in their inbox.
  const locationChip = (() => {
    const rawLabels = Array.isArray(latest.labels) ? latest.labels : [];
    const upper = new Set(rawLabels.map((l) => String(l).toUpperCase()));
    if (upper.has('INBOX')) return null; // Lives in inbox — no chip needed
    if (latest.folder === 'sent' || upper.has('SENT')) return null; // Sent has its own visual
    if (upper.has('TRASH')) return { label: 'Trash', tone: 'muted' as const };
    if (upper.has('SPAM')) return { label: 'Spam', tone: 'muted' as const };
    // Prefer a user-defined label name over the generic "Archived" chip.
    const SYSTEM = new Set(['INBOX','SENT','DRAFT','TRASH','SPAM','UNREAD','STARRED','IMPORTANT','CATEGORY_PERSONAL','CATEGORY_SOCIAL','CATEGORY_PROMOTIONS','CATEGORY_UPDATES','CATEGORY_FORUMS']);
    const userLabel = rawLabels.find((l) => !SYSTEM.has(String(l).toUpperCase()));
    if (userLabel) return { label: String(userLabel), tone: 'label' as const };
    return { label: 'Archived', tone: 'muted' as const };
  })();

  // Runtime deal-match against in-memory deals. Returns null when no
  // candidate clears the medium-confidence threshold so unmatched emails
  // render with no badge (per spec).
  const dealMatch = useDealMatchForEmail({
    subject: thread.subject,
    fromEmail: latest.from_email,
    fromName: latest.from_name,
    // Feed the full thread so the matcher can weigh recipient domains,
    // repeated body mentions, and affiliated participants — not just the
    // latest sender.
    messages: thread.emails.map((e, idx) => ({
      subject: e.subject,
      body: e.body_text || e.body_html || e.body_preview || e.snippet || '',
      fromEmail: e.from_email,
      fromName: e.from_name,
      toEmails: e.to_email ? [e.to_email] : undefined,
      isLatest: idx === 0,
      isQuoted: idx > 0,
    })),
  });

  // True when the most recent message in the thread is one we sent.
  // Used to surface a "Responded" pill in the inbox row.
  // For staleness purposes the spec treats the thread as "handled" only
  // when jturner@5thline.co is the latest sender — matches the live email
  // ownership model in this workspace.
  const HANDLER_EMAIL = 'jturner@5thline.co';
  const newest = thread.emails[0];
  const respondedByHandler =
    !!newest && (
      (newest.from_email || '').trim().toLowerCase() === HANDLER_EMAIL ||
      // Fallback for the existing "You" placeholder used in mock/sent rows
      newest.from_name === 'You'
    );
  const responded = respondedByHandler;

  // Age-based staleness dot — only rendered for threads that classify as
  // "Clients & Deals" so it doesn't clutter Asana / calendar / marketing
  // rows. Computed from the most recent inbound message; resets to green
  // the moment we send a reply.
  const { entities: classifierEntities, orgCtx } = useEmailClassifierData();
  const isClientsAndDeals = useMemo(() => {
    try {
      const cats = classifyEmail(latest as any, classifierEntities, orgCtx);
      return cats.includes('clients_deals');
    } catch {
      return false;
    }
  }, [latest, classifierEntities, orgCtx]);
  const staleBucket: StaleBucket | null = isClientsAndDeals
    ? computeStaleBucket(latest.received_at, respondedByHandler)
    : null;

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
      onMouseEnter={() => {
        setHovered(true);
        // Prefetch the latest message body so clicking opens with no spinner.
        // Also warm the newest-in-thread message (often the same id, but can
        // differ when the user just sent a reply).
        prefetchFullEmailMessage(latest?.id);
        if (newestInThread?.id && newestInThread.id !== latest?.id) {
          prefetchFullEmailMessage(newestInThread.id);
        }
      }}
      onFocus={() => {
        prefetchFullEmailMessage(latest?.id);
      }}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Selected accent bar */}
      {isSelected && (
        <div className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-[hsl(var(--outlook-blue))]" />
      )}
      {/* Staleness dot — left edge, vertically centered. Only rendered for
          rows classified as "Clients & Deals" so other tabs (Asana,
          Calendar, marketing) stay clean. Red bucket pulses to draw the
          eye to 11+-day-old unanswered threads. Sits inset from the very
          edge so it doesn't collide with the selected/priority accent
          bars. */}
      {staleBucket && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                'absolute left-1 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full z-10 shrink-0 cursor-help',
                STALE_DOT_CLASSES[staleBucket],
              )}
              aria-label={STALE_DOT_TITLES[staleBucket]}
              data-stale-bucket={staleBucket}
              onClick={(e) => e.stopPropagation()}
            />
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-[240px] text-xs leading-relaxed">
            <div className="font-medium">{STALE_DOT_TITLES[staleBucket]}</div>
            <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-1.5"><span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" /> Fresh — &lt;24h or replied</div>
              <div className="flex items-center gap-1.5"><span className="inline-block h-1.5 w-1.5 rounded-full bg-yellow-400" /> Aging — 2–5 days, no reply</div>
              <div className="flex items-center gap-1.5"><span className="inline-block h-1.5 w-1.5 rounded-full bg-orange-500" /> Stale — 6–10 days, no reply</div>
              <div className="flex items-center gap-1.5"><span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" /> Urgent — 11+ days, no reply</div>
            </div>
            {latest.received_at && (
              <div className="mt-1.5 pt-1.5 border-t border-border/50 text-[11px] text-muted-foreground">
                Calculated {format(new Date(), 'MMM d, h:mm a')} · last msg {formatDistanceToNow(new Date(latest.received_at), { addSuffix: true })}
              </div>
            )}
          </TooltipContent>
        </Tooltip>
      )}
      {/* Priority signal accent bar — red for urgent, yellow for action.
          Hidden when the row is selected so the blue selection bar wins. */}
      {priorityFlag && !isSelected && (
        <div
          className={cn(
            'absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full',
            PRIORITY_EDGE_BAR[getSignalSeverity(priorityFlag.type)],
          )}
          aria-label={`Priority signal: ${priorityFlag.label}`}
          title={`Priority signal: ${priorityFlag.label} — "${priorityFlag.quote}"`}
        />
      )}
      {/* Label color stripe — only when no higher-priority bar (selected /
          urgency signal) is already painted. Uses the first (highest-
          ranked) label's color so the row at-a-glance reads as that label. */}
      {!isSelected && !priorityFlag && userLabels && userLabels.length > 0 && (
        <div
          className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full"
          style={{ backgroundColor: labelSwatch(userLabels[0].color) }}
          aria-label={`Label: ${userLabels[0].name}`}
          title={userLabels.map((l) => l.name).join(', ')}
        />
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
              {latest.provider === 'microsoft' && (
                <span
                  title="Outlook"
                  className="shrink-0 inline-flex items-center justify-center h-3.5 w-3.5 rounded-[3px] bg-[hsl(var(--outlook-blue))] text-[8px] font-bold text-white leading-none"
                >
                  O
                </span>
              )}
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
          <div className="mt-0.5 flex items-start gap-1.5 min-w-0 max-w-full">
            {priorityFlag && (() => {
              const sev = getSignalSeverity(priorityFlag.type);
              return (
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[9px] h-[16px] px-1 gap-0.5 shrink-0',
                    PRIORITY_PILL_CLASSES[sev],
                  )}
                  title={`Priority signal: ${priorityFlag.label} — "${priorityFlag.quote}"`}
                >
                  <Flag className={cn('h-2.5 w-2.5', PRIORITY_ICON_CLASSES[sev])} />
                  {priorityFlag.label}
                </Badge>
              );
            })()}
            {dealMatch ? (
              <DealMatchBadge match={dealMatch} variant="compact" />
            ) : thread.dealName ? (
              <Badge variant="outline" className="text-[9px] h-[16px] px-1 gap-0.5 bg-[hsl(var(--outlook-blue)/0.12)] text-[hsl(var(--outlook-blue))] border-[hsl(var(--outlook-blue)/0.25)] shrink-0">
                {thread.dealName}
              </Badge>
            ) : null}
            {responded && (
              <Badge
                variant="outline"
                className="text-[9px] h-[16px] px-1 gap-0.5 bg-emerald-500/10 text-emerald-500 border-emerald-500/30 shrink-0"
                title="You replied to this thread"
              >
                Responded
              </Badge>
            )}
            {locationChip && (
              <Badge
                variant="outline"
                title={`Stored in: ${locationChip.label}`}
                className={cn(
                  'text-[9px] h-[16px] px-1 gap-0.5 shrink-0 border',
                  locationChip.tone === 'muted'
                    ? 'bg-muted/40 text-muted-foreground border-border/60'
                    : 'bg-foreground/[0.04] text-foreground/80 border-foreground/15',
                )}
              >
                <span className="truncate max-w-[90px]">{locationChip.label}</span>
              </Badge>
            )}
            {userLabels && userLabels.length > 0 && (
              <div className="flex items-center gap-1 shrink-0 min-w-0 max-w-[55%] overflow-hidden">
                {userLabels.slice(0, 3).map((l) => {
                  const hex = labelSwatch(l.color);
                  return (
                    <Badge
                      key={l.id}
                      variant="outline"
                      title={l.name}
                      className="text-[9px] h-[16px] px-1 gap-1 shrink-0 border bg-transparent"
                      style={{
                        color: hex,
                        borderColor: `${hex}55`,
                        backgroundColor: `${hex}1a`,
                      }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: hex }}
                      />
                      <span className="truncate max-w-[80px]">{l.name}</span>
                    </Badge>
                  );
                })}
                {userLabels.length > 3 && (
                  <span
                    className="text-[9px] text-muted-foreground shrink-0"
                    title={userLabels.slice(3).map((l) => l.name).join(', ')}
                  >
                    +{userLabels.length - 3}
                  </span>
                )}
              </div>
            )}
            <p
              className="min-w-0 max-w-full flex-1 text-[11px] leading-snug text-[hsl(var(--email-text-muted))] break-words"
              style={{
                overflowWrap: 'break-word',
                wordBreak: 'normal',
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: 2,
                overflow: 'hidden',
              }}
            >
              {previewSnippet}
            </p>
          </div>
        </div>
      </div>

      {/* Hover actions: consolidated into a single ⋮ menu. Hidden for
          notification-type emails where these actions aren't useful. */}
      {hovered && !isNotificationEmail && (
        <div className="absolute right-2 top-1.5 flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted/60 transition-colors"
                aria-label="More actions"
              >
                <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onToggleStar(latest); }}>
                <Flag className={cn('h-3.5 w-3.5 mr-2', thread.isStarred ? 'fill-[hsl(var(--outlook-blue))] text-[hsl(var(--outlook-blue))]' : '')} />
                {thread.isStarred ? 'Unflag' : 'Flag'}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onDelete?.(latest); }}>
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Move to Trash
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onArchive?.(latest); }}>
                <Pin className="h-3.5 w-3.5 mr-2" />
                Snooze / Pin
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );

  return (
    <>
    <EmailContextMenu
      isRead={!isUnread}
      isStarred={thread.isStarred}
      // Persist label assignments against the canonical provider thread id
      // so they carry across deals / sessions / refetches. Falls back to the
      // local UI threadId when the provider id is unknown (mock data).
      threadId={thread.provider_thread_id || thread.threadId}
      onOpen={onSelect}
      onLinkToDeal={onSaveToDeal ? () => onSaveToDeal(latest) : undefined}
      onMarkRead={() => onMarkRead?.(latest)}
      onMarkUnread={() => onMarkUnread?.(latest)}
      onToggleStar={() => onToggleStar(latest)}
      onArchive={() => onArchive?.(latest)}
      onDelete={() => onDelete?.(latest)}
      onCreateTask={() => setCreateTaskOpen(true)}
      onReply={onRowReply ? () => onRowReply(latest) : undefined}
      onReplyAll={onRowReplyAll ? () => onRowReplyAll(latest) : undefined}
      onForward={onRowForward ? () => onRowForward(latest) : undefined}
      onSaveToDeal={onSaveToDeal ? () => onSaveToDeal(latest) : undefined}
      isLinkedToDeal={!!latest.is_linked_to_deal}
      subject={latest.subject}
      fromEmail={latest.from_email}
      selectedCount={selectedCount}
      isInBulkSelection={!!isInBulkSelection}
      onBulkMarkRead={onBulkMarkRead}
      onBulkMarkUnread={onBulkMarkUnread}
      onBulkArchive={onBulkArchive}
      onBulkDelete={onBulkDelete}
    >
      {rowContent}
    </EmailContextMenu>
    <CreateTaskFromEmailDialog
      open={createTaskOpen}
      onOpenChange={setCreateTaskOpen}
      email={{
        messageId: latest.id,
        threadId: thread.provider_thread_id || thread.threadId,
        subject: latest.subject,
        fromName: latest.from_name,
        fromEmail: latest.from_email,
        snippet: latest.snippet || latest.body_preview,
        receivedAt: latest.received_at || null,
      }}
    />
    </>
  );
}

// Wrap in memo: the only props that meaningfully change per row across a parent
// re-render are `isSelected` and `isChecked` (and the thread reference itself).
// We compare those primitives plus thread.threadId/hasUnread/isStarred and the
// length of autoLabels — handlers are assumed referentially stable (the parent
// uses useCallback / inline handlers that we now stabilize).
const ThreadListItem = memo(ThreadListItemImpl, (prev, next) => {
  return (
    prev.thread === next.thread &&
    prev.isSelected === next.isSelected &&
    prev.isChecked === next.isChecked &&
    prev.onSelect === next.onSelect &&
    prev.onCheckChange === next.onCheckChange &&
    prev.onToggleLink === next.onToggleLink &&
    prev.onToggleStar === next.onToggleStar &&
    prev.onMarkRead === next.onMarkRead &&
    prev.onMarkUnread === next.onMarkUnread &&
    prev.onArchive === next.onArchive &&
    prev.onDelete === next.onDelete &&
    autoLabelsEqual(prev.autoLabels, next.autoLabels) &&
    autoLabelsEqual(prev.userLabels, next.userLabels)
  );
});

function autoLabelsEqual(a?: EmailLabel[], b?: EmailLabel[]) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false;
  }
  return true;
}

// ─── Email List Skeleton ─────────────────────────────────────
function EmailListSkeleton() {
  return (
    <div
      className="space-y-0"
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label="Searching emails"
    >
      <span className="sr-only">Searching emails…</span>
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="flex items-start gap-2.5 px-3 py-2 border-l-2 border-transparent"
        >
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

export class EmailPaneErrorBoundary extends Component<{
  children: ReactNode;
  fallbackTitle: string;
  fallbackMessage: string;
  resetKey: string;
}, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[EmailPaneErrorBoundary] ${this.props.fallbackTitle}`, error, info);
  }

  componentDidUpdate(prevProps: Readonly<{ resetKey: string }>) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full min-h-0 w-full min-w-0 items-center justify-center p-6">
          <div className="max-w-md rounded-lg border border-[hsl(var(--email-border))] bg-card/40 px-5 py-4 text-center">
            <p className="text-sm font-semibold text-[hsl(var(--email-text-primary))]">{this.props.fallbackTitle}</p>
            <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--email-text-secondary))]">{this.props.fallbackMessage}</p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false })}
              className="mt-3 inline-flex items-center justify-center rounded-md border border-[hsl(var(--email-border))] bg-card/60 px-3 py-1.5 text-xs font-medium text-[hsl(var(--email-text-primary))] hover:bg-card/80 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function EmailDetailStatusState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex h-full min-h-[240px] w-full min-w-0 items-center justify-center p-6">
      <div className="w-full min-w-0 max-w-2xl rounded-lg border border-[hsl(var(--email-border))] bg-card/40 px-5 py-4 text-center">
        <p className="text-sm font-semibold text-[hsl(var(--email-text-primary))]">{title}</p>
        <p className="mt-1 min-w-0 whitespace-pre-wrap break-words text-xs leading-relaxed text-[hsl(var(--email-text-secondary))]" style={{ overflowWrap: 'break-word', wordBreak: 'normal' }}>{description}</p>
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="mt-3 inline-flex items-center justify-center rounded-md border border-[hsl(var(--email-border))] bg-card/60 px-3 py-1.5 text-xs font-medium text-[hsl(var(--email-text-primary))] hover:bg-card/80 transition-colors"
          >
            {actionLabel}
          </button>
        )}
      </div>
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
  /**
   * When provided, the list virtualizes its rows using the given element as
   * the scroll parent. Off-screen rows are not rendered. The parent retains
   * ownership of the scroll container so existing pagination footers /
   * IntersectionObservers continue to work unchanged.
   */
  scrollParent?: HTMLElement | null;
  onRowReply?: (email: MockEmail) => void;
  onRowReplyAll?: (email: MockEmail) => void;
  onRowForward?: (email: MockEmail) => void;
  onSaveToDeal?: (email: MockEmail) => void;
  onBulkMarkRead?: () => void;
  onBulkMarkUnread?: () => void;
  onBulkArchive?: () => void;
  onBulkDelete?: () => void;
}

export function EmailList({ emails, selectedThread, onSelectThread, onToggleLink, onToggleStar, isLoading, selectedIds, onSelectionChange, onMarkRead, onMarkUnread, onArchive, onDelete, scrollParent, onRowReply, onRowReplyAll, onRowForward, onSaveToDeal, onBulkMarkRead, onBulkMarkUnread, onBulkArchive, onBulkDelete }: EmailListProps) {
  const { evaluate: evaluateAutoLabels } = useAutoEmailLabelEvaluator();
  // Detect high-priority deal signals (e.g. "due diligence", "term sheet",
  // "wire", "signed") and dispatch in-app + Slack notifications. Returns a
  // map keyed by threadId so individual rows render the priority flag.
  const { flagsByThread } = useEmailPrioritySignals(emails);
  // User-defined labels applied per thread. Build the map once at the list
  // level and pass each row only its slice so memoization stays intact.
  const { data: userLabelDefs = [] } = useLabels();
  const { data: labelAssignments = [] } = useAllLabelAssignments();
  const threadLabelMap = useMemo(
    () => buildThreadLabelMap(userLabelDefs, labelAssignments),
    [userLabelDefs, labelAssignments],
  );
  // Inbox list shows ONE ROW PER MESSAGE (Gmail "All Mail" behavior), not one
  // row per conversation. We still build the underlying conversation grouping
  // so the reading pane (which keys off `EmailThread.emails`) can show the
  // prior-thread context collapsed under the selected message — but the list
  // we render is flattened, sorted newest-first by per-message received_at.
  //
  // Each row's pseudo-thread:
  //   • threadId       = the individual message id (unique per row, drives
  //                      selection + checkbox identity)
  //   • latestEmail    = THIS message (drives sender/subject/preview/time)
  //   • emails         = the full conversation, ordered newest-first, so the
  //                      detail view still has thread context to collapse
  //   • hasUnread      = unread state of THIS message only (per-row bolding)
  //   • isStarred / hasAttachments / needsResponse: scoped to THIS message
  //   • subject        = THIS message's subject (preserves Re:/Fwd: prefixes
  //                      so individual rows look like Gmail's All Mail view)
  const threads = useMemo<EmailThread[]>(() => {
    const conversations = groupEmailsByThread(emails);
    const byProviderOrThread = new Map<string, EmailThread>();
    for (const t of conversations) {
      byProviderOrThread.set(t.provider_thread_id || t.threadId, t);
    }
    const rows: EmailThread[] = emails.map((msg) => {
      const convo = byProviderOrThread.get(msg.provider_thread_id || msg.threadId);
      const convoEmails = convo?.emails ?? [msg];
      const participantSet = new Set<string>();
      if (msg.from_name && msg.from_name !== 'You') participantSet.add(msg.from_name);
      return {
        // Unique per message — drives row identity, selection, checkboxes.
        threadId: msg.id,
        provider_thread_id: msg.provider_thread_id ?? null,
        subject: msg.subject || '(no subject)',
        // Full conversation so the reading pane can show thread history
        // collapsed below the selected message.
        emails: convoEmails,
        latestEmail: msg,
        participants: Array.from(participantSet),
        // Gmail labels are authoritative: if the provider says this message
        // has been read (no UNREAD label present), never show it as unread —
        // even if a stale `is_read=false` is still cached locally. This is
        // what hides the blue dot for emails the user already read in Gmail.
        hasUnread: !msg.is_read && !providerLabelsIndicateRead(msg),
        isStarred: !!msg.is_starred,
        isLinked: !!msg.is_linked_to_deal,
        hasAttachments: !!msg.has_attachments,
        needsResponse: !!msg.needs_response,
        dealName: msg.deal_name,
        category: msg.category,
      } as EmailThread;
    });
    return rows.sort(
      (a, b) =>
        new Date(b.latestEmail.received_at).getTime() -
        new Date(a.latestEmail.received_at).getTime(),
    );
  }, [emails]);

  // Stabilize per-row check handler so memoized rows don't see a new function
  // every render.
  const handleCheckChange = useCallback((threadId: string, checked: boolean) => {
    if (!onSelectionChange || !selectedIds) return;
    const next = new Set(selectedIds);
    if (checked) next.add(threadId);
    else next.delete(threadId);
    onSelectionChange(next);
  }, [onSelectionChange, selectedIds]);

  // The parent column already provides the scroll container (overflow-auto);
  // an additional Radix <ScrollArea> here would create a nested scroller that
  // intercepts wheel events and prevents scroll chaining/IO sentinels from
  // working correctly. Render rows as a plain list — the parent owns scroll.
  // Compute the per-thread merged userLabels lazily inside the row renderer
  // so windowed rows only run this work when they actually paint.
  // NOTE: All hooks below MUST run on every render — early returns for
  // loading/empty states live AFTER the hook calls to keep hook order stable.
  const buildUserLabels = useCallback(
    (thread: EmailThread): EmailLabel[] => {
      const dbLabels =
        threadLabelMap.get(thread.provider_thread_id || thread.threadId) ?? [];
      const sysLabels = systemLabelsForEmail(thread.latestEmail);
      if (sysLabels.length === 0) return dbLabels;
      const seen = new Set<string>();
      const merged: EmailLabel[] = [];
      for (const l of [...sysLabels, ...dbLabels]) {
        if (seen.has(l.id)) continue;
        seen.add(l.id);
        merged.push(l);
      }
      return merged;
    },
    [threadLabelMap],
  );

  const renderThread = useCallback(
    (_index: number, thread: EmailThread) => (
      <ThreadListRow
        key={thread.threadId}
        thread={thread}
        isSelected={selectedThread?.threadId === thread.threadId}
        isChecked={selectedIds?.has(thread.threadId)}
        onSelectThread={onSelectThread}
        onCheckChangeOuter={handleCheckChange}
        onToggleLink={onToggleLink}
        onToggleStar={onToggleStar}
        onMarkRead={onMarkRead}
        onMarkUnread={onMarkUnread}
        onArchive={onArchive}
        onDelete={onDelete}
        evaluateAutoLabels={evaluateAutoLabels}
        priorityFlag={flagsByThread[thread.threadId]}
        userLabels={buildUserLabels(thread)}
        onRowReply={onRowReply}
        onRowReplyAll={onRowReplyAll}
        onRowForward={onRowForward}
        onSaveToDeal={onSaveToDeal}
        selectedCount={selectedIds?.size ?? 0}
        isInBulkSelection={!!selectedIds?.has(thread.threadId)}
        onBulkMarkRead={onBulkMarkRead}
        onBulkMarkUnread={onBulkMarkUnread}
        onBulkArchive={onBulkArchive}
        onBulkDelete={onBulkDelete}
      />
    ),
    [
      selectedThread,
      selectedIds,
      onSelectThread,
      handleCheckChange,
      onToggleLink,
      onToggleStar,
      onMarkRead,
      onMarkUnread,
      onArchive,
      onDelete,
      evaluateAutoLabels,
      flagsByThread,
      buildUserLabels,
      onRowReply,
      onRowReplyAll,
      onRowForward,
      onSaveToDeal,
      onBulkMarkRead,
      onBulkMarkUnread,
      onBulkArchive,
      onBulkDelete,
    ],
  );

  // Idle-prefetch the top visible threads' newest message bodies so the
  // first click opens instantly (skeleton frame at most). Runs once per
  // unique top-N slice and is cancelled on unmount / list churn.
  useEffect(() => {
    if (!threads || threads.length === 0) return;
    const ric: (cb: () => void) => number =
      (window as any).requestIdleCallback?.bind(window) ||
      ((cb: () => void) => window.setTimeout(cb, 200) as unknown as number);
    const cic: (id: number) => void =
      (window as any).cancelIdleCallback?.bind(window) ||
      ((id: number) => window.clearTimeout(id));
    const handle = ric(() => {
      const top = threads.slice(0, 8);
      for (const t of top) {
        const newest = t.emails?.[0];
        if (newest?.id) prefetchFullEmailMessage(newest.id);
      }
    });
    return () => cic(handle);
  }, [threads]);

  if (isLoading) {
    return <EmailListSkeleton />;
  }

  if (threads.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full py-16 text-center"
        role="status"
        aria-live="polite"
      >
        <MessageSquare className="h-8 w-8 text-muted-foreground/30 mb-2" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">No emails in this folder</p>
      </div>
    );
  }

  // When the parent passes a scroll element, virtualize. Off-screen rows are
  // not rendered — DOM stays bounded regardless of how many pages are loaded.
  // We intentionally keep the existing pagination footer outside this
  // component so its IntersectionObserver continues to operate against the
  // same scroll parent.
  if (scrollParent) {
    return (
      <>
        <EmailSyncIndicator />
        <Virtuoso
          data={threads}
          customScrollParent={scrollParent}
          itemContent={renderThread}
          computeItemKey={(_i, t) => t.threadId}
          // Reserve a sensible initial height so a quick first paint doesn't
          // collapse the list before measurements complete.
          defaultItemHeight={72}
          increaseViewportBy={{ top: 400, bottom: 600 }}
        />
      </>
    );
  }

  // Fallback: plain list (used by deal-page reading pane and any callers
  // that don't supply a scroll parent). Preserves prior behavior exactly.
  return (
    <div
      className="space-y-0"
      style={{
        contain: 'layout paint style',
      }}
    >
      <EmailSyncIndicator />
      {threads.map((thread, idx) => renderThread(idx, thread))}
    </div>
  );
}

// Stable adapter: turns the parent's `(thread) => onSelect(thread)` and
// `(checked) => handleCheckChange(threadId, checked)` patterns (which would
// allocate a new arrow per render and bust memoization) into stable callbacks
// keyed by thread.threadId.
interface ThreadListRowProps {
  thread: EmailThread;
  isSelected: boolean;
  isChecked?: boolean;
  onSelectThread: (thread: EmailThread) => void;
  onCheckChangeOuter: (threadId: string, checked: boolean) => void;
  onToggleLink: (email: MockEmail) => void;
  onToggleStar: (email: MockEmail) => void;
  onMarkRead?: (email: MockEmail) => void;
  onMarkUnread?: (email: MockEmail) => void;
  onArchive?: (email: MockEmail) => void;
  onDelete?: (email: MockEmail) => void;
  evaluateAutoLabels: (email: MockEmail) => EmailLabel[];
  priorityFlag?: DetectedSignal;
  userLabels?: EmailLabel[];
  onRowReply?: (email: MockEmail) => void;
  onRowReplyAll?: (email: MockEmail) => void;
  onRowForward?: (email: MockEmail) => void;
  onSaveToDeal?: (email: MockEmail) => void;
  selectedCount?: number;
  isInBulkSelection?: boolean;
  onBulkMarkRead?: () => void;
  onBulkMarkUnread?: () => void;
  onBulkArchive?: () => void;
  onBulkDelete?: () => void;
}

const ThreadListRow = memo(function ThreadListRow({
  thread,
  isSelected,
  isChecked,
  onSelectThread,
  onCheckChangeOuter,
  onToggleLink,
  onToggleStar,
  onMarkRead,
  onMarkUnread,
  onArchive,
  onDelete,
  evaluateAutoLabels,
  priorityFlag,
  userLabels,
  onRowReply,
  onRowReplyAll,
  onRowForward,
  onSaveToDeal,
  selectedCount,
  isInBulkSelection,
  onBulkMarkRead,
  onBulkMarkUnread,
  onBulkArchive,
  onBulkDelete,
}: ThreadListRowProps) {
  const onSelect = useCallback(() => onSelectThread(thread), [onSelectThread, thread]);
  const onCheckChange = useCallback(
    (checked: boolean) => onCheckChangeOuter(thread.threadId, checked),
    [onCheckChangeOuter, thread.threadId],
  );
  // Re-evaluate only when the email identity changes
  const autoLabels = useMemo(
    () => evaluateAutoLabels(thread.latestEmail),
    [evaluateAutoLabels, thread.latestEmail],
  );
  return (
    <ThreadListItem
      thread={thread}
      isSelected={isSelected}
      onSelect={onSelect}
      onToggleLink={onToggleLink}
      onToggleStar={onToggleStar}
      isChecked={isChecked}
      onCheckChange={onCheckChange}
      onMarkRead={onMarkRead}
      onMarkUnread={onMarkUnread}
      onArchive={onArchive}
      onDelete={onDelete}
      autoLabels={autoLabels}
      priorityFlag={priorityFlag}
      userLabels={userLabels}
      onRowReply={onRowReply}
      onRowReplyAll={onRowReplyAll}
      onRowForward={onRowForward}
      onSaveToDeal={onSaveToDeal}
      selectedCount={selectedCount}
      isInBulkSelection={isInBulkSelection}
      onBulkMarkRead={onBulkMarkRead}
      onBulkMarkUnread={onBulkMarkUnread}
      onBulkArchive={onBulkArchive}
      onBulkDelete={onBulkDelete}
    />
  );
});

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

// ─── Always-visible email header details ─────────────────────
function toArray(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String).map(s => s.trim()).filter(Boolean);
  if (typeof v === 'string') return v.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}

function HeaderRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-xs text-[hsl(var(--email-text-muted))] leading-snug">
      <span className="w-14 shrink-0 font-medium text-[hsl(var(--email-text-secondary))]">{label}</span>
      <span className="min-w-0 max-w-full break-all text-[hsl(var(--email-text-primary))]" style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}

// ─── Thread-level recipient + participant header ─────────────────
// Replaces the legacy "To: me" placeholder. Pulls cc/bcc per message
// from gmail_messages so the user can see the real participant list.
interface ThreadParticipantsHeaderProps {
  threadId: string | undefined;
  threadEmails: MockEmail[];
  latest: MockEmail;
}
function ThreadParticipantsHeader({ threadId, threadEmails, latest }: ThreadParticipantsHeaderProps) {
  const [rows, setRows] = useState<Array<{
    gmail_message_id: string;
    from_email: string | null;
    from_name: string | null;
    to_emails: string[] | null;
    cc_emails: string[] | null;
    bcc_emails: string[] | null;
  }>>([]);

  useEffect(() => {
    let cancelled = false;
    if (!threadId) { setRows([]); return; }
    (async () => {
      const { data } = await supabase
        .from('gmail_messages')
        .select('gmail_message_id, from_email, from_name, to_emails, cc_emails, bcc_emails, received_at')
        .eq('thread_id', threadId)
        .order('received_at', { ascending: false });
      if (!cancelled && Array.isArray(data)) setRows(data as any);
    })();
    return () => { cancelled = true; };
  }, [threadId]);

  // Resolve the latest message's row (for To/Cc display).
  const latestRow = rows.find(r => r.gmail_message_id === latest.id) || rows[0];

  const latestTo = toArray(latestRow?.to_emails);
  const latestCc = toArray(latestRow?.cc_emails);
  const latestBcc = toArray(latestRow?.bcc_emails);

  // Fallback to the single-recipient field from MockEmail when DB rows haven't
  // arrived yet (or for mock messages).
  const toDisplay = latestTo.length > 0
    ? latestTo
    : (latest.to_email ? [latest.to_name && latest.to_name !== latest.to_email ? `${latest.to_name} <${latest.to_email}>` : latest.to_email] : []);

  // Aggregate unique participants across the entire thread.
  const participants = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    const push = (raw: string | null | undefined) => {
      if (!raw) return;
      const v = String(raw).trim();
      if (!v) return;
      const key = v.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(v);
    };
    // From DB rows
    for (const r of rows) {
      push(r.from_email);
      (r.to_emails || []).forEach(push);
      (r.cc_emails || []).forEach(push);
      (r.bcc_emails || []).forEach(push);
    }
    // Fallback: hydrate from in-memory thread emails (covers mock + not-yet-loaded)
    for (const e of threadEmails) {
      push(e.from_email);
      push(e.to_email);
    }
    return out;
  }, [rows, threadEmails]);

  const renderList = (items: string[], max = 3) => {
    if (items.length === 0) return null;
    const visible = items.slice(0, max);
    const extra = items.length - visible.length;
    return (
      <>
        <span className="text-[hsl(var(--email-text-secondary))]">{visible.join(', ')}</span>
        {extra > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="ml-1.5 inline-flex items-center rounded-full bg-muted/50 hover:bg-muted px-1.5 py-0 text-[10px] text-[hsl(var(--email-text-secondary))] border border-[hsl(var(--email-border))] transition-colors"
              >+{extra} more</button>
            </PopoverTrigger>
            <PopoverContent className="w-72 max-h-72 overflow-auto text-xs space-y-1 p-3">
              {items.map(addr => <div key={addr} className="break-all">{addr}</div>)}
            </PopoverContent>
          </Popover>
        )}
      </>
    );
  };

  return (
      <div className="mt-0.5 flex items-start gap-x-2 gap-y-0.5 flex-wrap text-xs text-[hsl(var(--email-text-muted))] min-w-0 max-w-full">
      {toDisplay.length > 0 && (
        <span className="inline-flex min-w-0 max-w-full flex-wrap items-start gap-1">
          <span className="shrink-0">To:</span>
          <span className="min-w-0 break-all">{renderList(toDisplay)}</span>
        </span>
      )}
      {latestCc.length > 0 && (
        <span className="inline-flex min-w-0 max-w-full flex-wrap items-start gap-1">
          <span className="shrink-0">Cc:</span>
          <span className="min-w-0 break-all">{renderList(latestCc)}</span>
        </span>
      )}
      {latestBcc.length > 0 && latest.folder === 'sent' && (
        <span className="inline-flex min-w-0 max-w-full flex-wrap items-start gap-1">
          <span className="shrink-0">Bcc:</span>
          <span className="min-w-0 break-all">{renderList(latestBcc)}</span>
        </span>
      )}
      {participants.length > 1 && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--email-border))] bg-muted/40 hover:bg-muted px-1.5 py-0 text-[10px] text-[hsl(var(--email-text-secondary))] transition-colors leading-none"
            >
              <Users className="h-3 w-3" />
              {participants.length}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80 max-h-80 overflow-auto p-3 text-xs space-y-1">
            <div className="font-medium mb-1 text-[hsl(var(--email-text-primary))]">All participants</div>
            {participants.map(p => <div key={p} className="break-all text-[hsl(var(--email-text-secondary))]">{p}</div>)}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

function EmailHeaderDetails({ email, fullData }: { email: MockEmail; fullData: any }) {
  const fromCombined = email.from_name && email.from_email && email.from_name !== email.from_email
    ? `${email.from_name} <${email.from_email}>`
    : (email.from_email || email.from_name || '');

  const toFromFull = toArray(fullData?.to_emails);
  const toFallback = email.to_email
    ? [email.to_name && email.to_name !== email.to_email ? `${email.to_name} <${email.to_email}>` : email.to_email]
    : [];
  const toList = toFromFull.length > 0 ? toFromFull : toFallback;

  const ccList = toArray(fullData?.cc_emails).length > 0
    ? toArray(fullData?.cc_emails)
    : toArray((email as any)._cc);
  const bccList = toArray(fullData?.bcc_emails).length > 0
    ? toArray(fullData?.bcc_emails)
    : toArray((email as any)._bcc);
  const replyToList = toArray(fullData?.reply_to ?? fullData?.reply_to_emails);

  const dateLabel = email.received_at ? format(new Date(email.received_at), 'EEE, MMM d, yyyy h:mm a') : '';
  const shortDate = email.received_at ? format(new Date(email.received_at), 'MMM d, h:mm a') : '';

  const [open, setOpen] = useState(false);

  // Compact recipient summary: first 2 names + "+N more"
  const toSummary = (() => {
    if (toList.length === 0) return '';
    const visible = toList.slice(0, 2).join(', ');
    const extra = toList.length - 2;
    return extra > 0 ? `${visible}, +${extra} more` : visible;
  })();

  // Compact CC summary mirrors the To formatting so recipients are not hidden
  // behind the "details" toggle when a message has Cc'd participants.
  const ccSummary = (() => {
    if (ccList.length === 0) return '';
    const visible = ccList.slice(0, 2).join(', ');
    const extra = ccList.length - 2;
    return extra > 0 ? `${visible}, +${extra} more` : visible;
  })();

  return (
    <div className="mb-2 text-xs leading-snug">
      {/* Compact single-row summary (default) */}
      <div className="flex items-center gap-2 flex-wrap text-[hsl(var(--email-text-muted))]">
        {toSummary && (
          <span className="min-w-0 max-w-full break-all" style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
            <span className="text-[hsl(var(--email-text-muted))]">to </span>
            <span className="text-[hsl(var(--email-text-secondary))]">{toSummary}</span>
          </span>
        )}
        {ccSummary && (
          <span className="min-w-0 max-w-full break-all" style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
            <span className="text-[hsl(var(--email-text-muted))]">cc </span>
            <span className="text-[hsl(var(--email-text-secondary))]">{ccSummary}</span>
          </span>
        )}
        {shortDate && (
          <>
            <span className="text-[hsl(var(--email-text-muted))]/60">·</span>
            <span>{shortDate}</span>
          </>
        )}
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="ml-auto inline-flex items-center gap-0.5 text-[11px] text-[hsl(var(--email-text-muted))] hover:text-[hsl(var(--email-text-primary))] transition-colors"
        >
          {open ? 'hide details' : 'details'}
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
      </div>

      {open && (
        <div className="mt-1.5 space-y-0.5 border-l border-[hsl(var(--email-border))] pl-2.5">
          {fromCombined && <HeaderRow label="From" value={fromCombined} />}
          {toList.length > 0 && <HeaderRow label="To" value={toList.join(', ')} />}
          {ccList.length > 0 && <HeaderRow label="Cc" value={ccList.join(', ')} />}
          {bccList.length > 0 && <HeaderRow label="Bcc" value={bccList.join(', ')} />}
          {replyToList.length > 0 && <HeaderRow label="Reply-To" value={replyToList.join(', ')} />}
          {dateLabel && <HeaderRow label="Date" value={dateLabel} />}
          {email.subject && <HeaderRow label="Subject" value={email.subject} />}
        </div>
      )}
    </div>
  );
}

// ─── Thread Message Card ─────────────────────────────────────
function ThreadMessage({ email, isLatest, defaultExpanded, onExpandChange, threadId, threadSubject, threadEmails, dealId, dealName, onReply, onReplyAll, onForward }: { 
  email: MockEmail; 
  isLatest: boolean; 
  defaultExpanded: boolean;
  onExpandChange?: (expanded: boolean) => void;
  threadId: string;
  threadSubject: string;
  threadEmails: MockEmail[];
  dealId?: string;
  dealName?: string;
  onReply?: (email: MockEmail) => void;
  onReplyAll?: (email: MockEmail) => void;
  onForward?: (email: MockEmail) => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showQuoted, setShowQuoted] = useState(false);
  const messageRef = useRef<HTMLDivElement>(null);
  const displayName = email.from_name === 'You' ? 'You' : email.from_name;

  // Lazy-load the full body + attachments when this message is expanded.
  const alreadyHasFullBody = !!(email.body_loaded || email.body_html || (email.body_text && email.body_text.length > 0));
  const { data: fullData, loading: fullLoading, error: fullError, reload: reloadFull } = useFullEmailMessage(
    email.id,
    expanded,
    alreadyHasFullBody,
  );

  // Resolve the best available body: prefer freshly fetched HTML, then prop HTML,
  // then fetched text, then prop text.
  //
  // IMPORTANT: do NOT fall back to `email.body_preview` here. `body_preview`
  // is sourced from the Gmail `snippet` field at list time — a truncated
  // ~200-char excerpt that ends mid-word with no ellipsis. Rendering it as
  // the message body caused the "message ends mid-sentence with no scrollbar"
  // bug: while `useFullEmailMessage` was still in flight (or had returned
  // an empty body), the open thread showed the snippet as if it were the
  // full message. The fix is to treat only real body sources as renderable
  // and surface the proper loading / unavailable state otherwise.
  const resolvedHtml = fullData?.body_html || email.body_html || '';
  const resolvedText = fullData?.body_text || email.body_text || '';
  const trimmedResolvedText = resolvedText.trim();
  const hasRenderableBody = !!resolvedHtml || trimmedResolvedText.length > 0;
  const gmailThreadTarget = email.provider_thread_id || email.threadId || threadId;
  // Gmail truncates very large outbound messages (>102KB) and appends a
  // "[Message clipped]" / "...This message has been truncated" tail. Nylas
  // returns the truncated payload as-is. Surface a clear link to view the
  // full message in Gmail (Niki bug, Asana #1215178140447221).
  const truncationProbe = (resolvedHtml || resolvedText).toLowerCase();
  const looksTruncated = /\[message clipped\]|message has been truncated|view entire message/.test(truncationProbe);
  const gmailOpenUrl = email.id
    ? `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(email.id)}`
    : null;

  // For plain-text bodies, split off the quoted reply chain so we can show/hide it.
  const { main: textMain, quoted: textQuoted } = resolvedHtml
    ? { main: '', quoted: null }
    : splitQuotedContent(resolvedText);

  // Resolve attachments strictly for THIS message. Once the per-message fetch
  // resolves, trust it as the source of truth — never fall back to
  // `email.attachments` from props, since list/thread-level aggregation can
  // leak attachments from sibling messages in the same thread. Only use the
  // prop attachments while we haven't fetched yet (e.g. before expand or for
  // mock messages without a real Gmail id).
  const attachments = fullData
    ? (fullData.attachments || [])
    : (email.attachments || []);
  const hasRealAttachments = attachments.length > 0;
  const showAttachmentsLoading =
    expanded && fullLoading && !fullData && !!email.has_attachments;

  const toggleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    onExpandChange?.(next);
    if (next && messageRef.current) {
      setTimeout(() => messageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
    }
  };

  useEffect(() => {
    if (!expanded) return;
  }, [expanded, gmailThreadTarget, email.id, threadEmails.length, resolvedHtml, trimmedResolvedText, fullError, fullLoading]);

  return (
    <div ref={messageRef} className={cn(
      'w-full min-w-0 max-w-full border-b border-[hsl(var(--email-border))] transition-all duration-100',
      // Unified popup surface: no separate fill on expanded messages — keep a
      // subtle hover tint so collapsed rows remain clickable-feeling.
      expanded ? 'bg-transparent' : 'hover:bg-[hsl(var(--foreground)/0.03)]'
    )}>
      <button
        onClick={toggleExpand}
        className="w-full min-w-0 max-w-full flex items-start gap-3 px-5 py-2.5 text-left"
      >
        <EmailAvatar name={email.from_name === 'You' ? 'J' : email.from_name} email={email.from_email} size="md" />
        <div className="flex-1 min-w-0 flex flex-col gap-0.5 min-h-[28px] justify-center">
          <span
            className={cn(
              'min-w-[64px] shrink-0 truncate',
              isLatest
                ? 'font-semibold text-[hsl(var(--email-text-primary))]'
                : 'font-medium text-[hsl(var(--email-text-secondary))]'
            )}
            style={{ overflowWrap: 'normal', wordBreak: 'normal', whiteSpace: 'nowrap' }}
            title={displayName}
          >
            {displayName}
          </span>
          {!expanded && (
            <span
              className="min-w-0 w-full text-xs text-[hsl(var(--email-text-muted))] break-words"
              style={{
                overflowWrap: 'break-word',
                wordBreak: 'normal',
                whiteSpace: 'normal',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
              title={email.snippet}
            >
              {email.snippet}
            </span>
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
        <div className="w-full min-w-0 max-w-full overflow-visible px-4 pb-5 pl-[56px] sm:px-6 sm:pl-[64px]">
          <EmailHeaderDetails email={email} fullData={fullData as any} />

          {fullLoading && !hasRenderableBody && (
            <div className="py-2">
              {/* Snippet fast-path: render the list-sync snippet immediately
                  so the user sees content within one frame instead of staring
                  at a spinner while the full body fetch (up to 15s) resolves.
                  Clearly marked as a preview so the prior "snippet renders as
                  if it were the full body" bug stays fixed — the snippet ends
                  mid-word, so we badge it and keep the loading indicator
                  visible until the real body arrives and replaces it. */}
              {(email.snippet || email.body_preview) ? (
                <>
                  <div className="mb-2 flex items-center gap-2 text-[11px] text-[hsl(var(--email-text-muted))]">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Loading full message — showing preview</span>
                  </div>
                  <div
                    className="text-[14px] leading-[1.7] text-[hsl(var(--email-text-secondary))] italic break-words"
                    style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                  >
                    {(email.snippet || email.body_preview || '').trim()}
                    <span className="text-[hsl(var(--email-text-muted))]">…</span>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Loading full message…</span>
                </div>
              )}
            </div>
          )}

          {!fullLoading && fullError && !hasRenderableBody && (
            <div
              className="my-2 flex items-start justify-between gap-3 rounded border border-[hsl(var(--email-border))] bg-[hsl(var(--destructive)/0.05)] px-3 py-2 text-xs text-[hsl(var(--email-text-secondary))]"
              title={fullError}
            >
              <div className="min-w-0">
                <div className="font-medium text-[hsl(var(--email-text-primary))]">
                  Couldn’t load this message
                </div>
                <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {fullError}
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); reloadFull(); }}
                className="shrink-0 inline-flex items-center gap-1 rounded border border-[hsl(var(--email-border))] bg-background px-2 py-1 text-[11px] font-medium hover:bg-[hsl(var(--foreground)/0.04)]"
              >
                Retry
              </button>
            </div>
          )}

          {/* Attachments header — surfaced above the body so users can see
              attached files immediately without scrolling through the message. */}
          {hasRealAttachments && (
            <div className="mb-3">
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
            </div>
          )}
          {showAttachmentsLoading && (
            <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Loading attachments…</span>
            </div>
          )}

          {/* Body — HTML preferred, plain text fallback. Inline attachments
              are passed so signature logos / embedded images can resolve their
              `cid:` references. */}
          {/* Contextual AI menu on text selection (right-click + floating
              toolbar). Scoped to this message's body — selections in the
              composer, AI Assist panel, or inputs elsewhere are ignored. */}
          <EmailSelectionActionMenu
            context={{
              threadId,
              messageId: email.id,
              subject: threadSubject,
              fromName: email.from_name,
              fromEmail: email.from_email,
              toEmails: (email as any).to_emails || (email.to_email ? [email.to_email] : []),
              ccEmails: (email as any).cc_emails || [],
              receivedAt: email.received_at,
              dealId: dealId || null,
              dealName: dealName || null,
              page: typeof window !== 'undefined' ? window.location.pathname : undefined,
            }}
            className="w-full min-w-0 max-w-full overflow-x-auto"
          >
            <EmailPaneErrorBoundary
              resetKey={`${email.id}-${resolvedHtml ? 'html' : 'text'}-${expanded ? 'open' : 'closed'}`}
              fallbackTitle="This message couldn’t be rendered"
              fallbackMessage="Try another email in the thread or collapse and reopen this message."
            >
              {resolvedHtml ? (
                <EmailBodyRenderer
                  html={resolvedHtml}
                  messageId={email.id}
                  inlineAttachments={fullData?.inline_attachments}
                  attachments={fullData?.attachments}
                  fromEmail={email.from_email}
                />
              ) : hasRenderableBody ? (
                <EmailBodyRenderer text={textMain} />
              ) : (
                <EmailDetailStatusState
                  title="Full message unavailable"
                  description={email.snippet || email.body_preview || 'This message returned no readable body content.'}
                  actionLabel="Retry"
                  onAction={() => reloadFull()}
                />
              )}
            </EmailPaneErrorBoundary>
          </EmailSelectionActionMenu>
          {looksTruncated && gmailOpenUrl && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded border border-[hsl(var(--email-border))] bg-[hsl(var(--foreground)/0.03)] px-3 py-2 text-[11px] text-[hsl(var(--email-text-secondary))]">
              <span>This message was clipped by Gmail (over 102KB). The full body isn’t available here.</span>
              <a
                href={gmailOpenUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded border border-[hsl(var(--email-border))] bg-background px-2 py-1 font-medium hover:bg-[hsl(var(--foreground)/0.04)]"
              >
                View full message in Gmail
              </a>
            </div>
          )}

          {/* Quoted text (only meaningful for plain text bodies) */}
          {!resolvedHtml && hasRenderableBody && textQuoted && (
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
                <div className="min-w-0 max-w-full overflow-x-auto">
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
                </div>
              )}
            </div>
          )}

          {/* Per-message action row — Reply / Reply All / Forward anchored
              to THIS specific message, not the thread as a whole. */}
          {(onReply || onReplyAll || onForward) && (
            <div className="mt-4 flex items-center gap-2">
              {onReply && (
                <button
                  onClick={(e) => { e.stopPropagation(); onReply(email); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-[hsl(var(--email-border))] text-[hsl(var(--email-text-secondary))] hover:text-[hsl(var(--email-text-primary))] hover:border-[hsl(var(--outlook-blue)/0.4)] hover:bg-[hsl(var(--outlook-blue)/0.06)] transition-colors"
                >
                  <Reply className="h-3.5 w-3.5" />
                  <span>Reply</span>
                </button>
              )}
              {onReplyAll && (
                <button
                  onClick={(e) => { e.stopPropagation(); onReplyAll(email); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-[hsl(var(--email-border))] text-[hsl(var(--email-text-secondary))] hover:text-[hsl(var(--email-text-primary))] hover:border-[hsl(var(--outlook-blue)/0.4)] hover:bg-[hsl(var(--outlook-blue)/0.06)] transition-colors"
                >
                  <ReplyAll className="h-3.5 w-3.5" />
                  <span>Reply All</span>
                </button>
              )}
              {onForward && (
                <button
                  onClick={(e) => { e.stopPropagation(); onForward(email); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-[hsl(var(--email-border))] text-[hsl(var(--email-text-secondary))] hover:text-[hsl(var(--email-text-primary))] hover:border-[hsl(var(--outlook-blue)/0.4)] hover:bg-[hsl(var(--outlook-blue)/0.06)] transition-colors"
                >
                  <Forward className="h-3.5 w-3.5" />
                  <span>Forward</span>
                </button>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  );
}

// ─── Collapsed older messages expander with thread summarize ──
function CollapsedMessagesBar({ count, onExpand, threadEmails, threadId, subject }: { count: number; onExpand: () => void; threadEmails?: MockEmail[]; threadId: string; subject: string }) {
  const [summary, setSummary] = useState<string[] | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryDebug, setSummaryDebug] = useState<EmailThreadSummaryDebug | null>(null);

  const handleSummarize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!threadEmails || threadEmails.length === 0) {
      setSummary(null);
      setSummaryError("Couldn't read the selected email thread for summary");
      return;
    }
    setSummarizing(true);
    setSummaryError(null);
    try {
      const result = await summarizeSelectedEmailThread({ threadId, subject, emails: threadEmails });
      setSummary(result.bullets);
      setSummaryDebug(result.debug);
    } catch (error) {
      const debug = error instanceof Error && 'debug' in error
        ? (error as Error & { debug?: EmailThreadSummaryDebug }).debug || null
        : null;
      setSummary(null);
      setSummaryDebug(debug);
      setSummaryError(
        error instanceof Error && error.message
          ? error.message
          : "Couldn't read the selected email thread for summary",
      );
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

      {summaryError && !summarizing && (
        <div className="mx-5 text-[11px] text-amber-300/90">{summaryError}</div>
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
          {summaryDebug && (import.meta as any).env?.DEV && (
            <div className="mt-2 text-[10px] text-foreground/40 font-mono break-all">
              id={summaryDebug.threadId} · subject="{summaryDebug.subject}" · msgs={summaryDebug.messageCount} · first={summaryDebug.firstTimestamp || 'n/a'} · last={summaryDebug.lastTimestamp || 'n/a'} · src={summaryDebug.source} · chars={summaryDebug.cleanedCharCount}
            </div>
          )}
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
  onSendReply: (
    email: Omit<MockEmail, 'id' | 'threadId'>,
    threadId: string,
    linkContext?: { dealId: string | null; dealName: string | null },
  ) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onDelete?: (email: MockEmail) => void;
  onArchive?: (email: MockEmail) => void;
  /**
   * Optional deep-link target — when set, the matching message is
   * scrolled into view and briefly highlighted with a ring so the user
   * can see exactly where the priority signal was detected.
   */
  deepLinkMessageId?: string | null;
  /** Detected signal label/type, surfaced as a small badge in the header. */
  deepLinkSignal?: string | null;
}

export function EmailDetail({ thread, dealId, onBack, onToggleLink, onToggleStar, onSendReply, isExpanded, onToggleExpand, onDelete, onArchive, onMarkRead, onMarkUnread, deepLinkMessageId, deepLinkSignal, pendingAction, onPendingActionConsumed }: EmailDetailProps & { onMarkRead?: (email: MockEmail) => void; onMarkUnread?: (email: MockEmail) => void; pendingAction?: 'reply'|'replyAll'|'forward'|null; onPendingActionConsumed?: () => void }) {
  const isMobile = useIsMobile();
  // Scroll-and-highlight the deep-linked message when present. Re-runs if
  // the user navigates between threads with consecutive priority signals.
  useEffect(() => {
    if (!deepLinkMessageId) return;
    // Defer to allow ThreadMessage children to mount + expand.
    const t = setTimeout(() => {
      const el = document.querySelector<HTMLElement>(
        `[data-deeplink-msg-id="${CSS.escape(deepLinkMessageId)}"]`,
      );
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-amber-400/70', 'rounded-md');
      setTimeout(() => {
        el.classList.remove('ring-2', 'ring-amber-400/70', 'rounded-md');
      }, 4000);
    }, 250);
    return () => clearTimeout(t);
  }, [deepLinkMessageId, thread.threadId]);

  const [showSmartPanel, setShowSmartPanel] = useState(false);
  const [smartPopoverOpen, setSmartPopoverOpen] = useState(false);
  // Assist feature governance: when disabled for the resolved
  // company/tenant context, every AI Assist email surface (sidebar,
  // toggle, thread summary popover) is hidden — no dead controls.
  const assistEnabled = useAssistEnabled();
  // AI Assist sidebar is always-on by default. On desktop it's persistently rendered;
  // on smaller widths it collapses into a toggleable drawer driven by this state.
  const AI_ASSIST_PREF_KEY = 'email.aiAssistOpen';
  const [showAiAssistPref, setShowAiAssist] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      const raw = window.localStorage.getItem(AI_ASSIST_PREF_KEY);
      return raw === null ? true : raw === '1';
    } catch {
      return true;
    }
  });
  // Effective visibility — user pref AND Assist feature is enabled for
  // this account/company. Keeps downstream layout math (grid columns,
  // resize observers) honest when Assist is gated off.
  const showAiAssist = assistEnabled && showAiAssistPref;
  const renderAiAssistColumn = showAiAssist && !isMobile;
  const aiAssistButtonRef = useRef<HTMLButtonElement | null>(null);
  const messagePaneRef = useRef<HTMLDivElement | null>(null);
  const aiAssistPaneRef = useRef<HTMLDivElement | null>(null);
  // The open-email command bar is portalled into the unified mail header
  // (#email-detail-toolbar-slot) so Close/Reply/Forward/Delete/Archive/Flag/
  // AI Assist/Link Deal/Expand share a single horizontal row with New +
  // Search mail rather than living in a second stacked toolbar above the
  // message body.
  const [toolbarSlot, setToolbarSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const el = document.getElementById('email-detail-toolbar-slot');
    setToolbarSlot(el);
  }, []);
  useEffect(() => {
    try {
      // Persist the user *preference*, not the gated effective state, so a
      // user who turned Assist on doesn't lose their pref if an admin
      // temporarily disables the Assist feature for the workspace.
      window.localStorage.setItem(AI_ASSIST_PREF_KEY, showAiAssistPref ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [showAiAssistPref]);
  // Removed paint-chain diagnostic: it walked the DOM and ran
  // getComputedStyle on every ancestor of two panes on every thread switch
  // and every AI Assist toggle. Pure dev-debug — was a measurable per-open
  // jank source on the email popup hot path.
  const [showAiDraft, setShowAiDraft] = useState(false);
  const [aiDraftMode, setAiDraftMode] = useState<DraftMode | undefined>(undefined);
  // Canonical user-confirmed link comes from the deal_emails table (link_source='manual',
  // locked=true). thread.dealName is the AI classifier's best guess and must never be
  // shown as a "Linked" badge — it only seeds the chip color until hydrate resolves.
  const [linkedDealName, setLinkedDealName] = useState<string | undefined>(undefined);
  const [linkedDealId, setLinkedDealId] = useState<string | undefined>(undefined);
  const [linkHydrating, setLinkHydrating] = useState<boolean>(!dealId);
  const [linkHydrateError, setLinkHydrateError] = useState<string | null>(null);
  const [showSendToDataRoom, setShowSendToDataRoom] = useState(false);

  // Floating "you just linked this deal" preview card. Opens deterministically
  // when a user picks a deal in LinkToDealPopover so the toolbar's Linked
  // state isn't mistaken for a stuck spinner. Lives as a sibling of the
  // picker — not nested — so the picker's outside-click handler can't race
  // the preview's mount.
  const [linkPreviewDealId, setLinkPreviewDealId] = useState<string | null>(null);
  const [linkPreviewOpen, setLinkPreviewOpen] = useState(false);
  const linkPreviewAnchorRef = useRef<HTMLSpanElement | null>(null);

  // Pre-send link-to-deal prompt removed — replies send immediately and
  // inherit any pre-resolved deal link silently. Manual linking remains
  // available via the "Link Deal" toolbar action.

  // Lift workflow analysis here so the in-thread Attachments module can show the
  // "Add to Data Room" CTA whenever a likely-deal match exists (mirrors AI Assist).
  const workflowThreadData = {
    subject: thread.subject,
    threadId: thread.threadId,
    latestEmail: thread.latestEmail,
    emails: thread.emails,
  };
  const { analysis: detailWorkflowAnalysis } = useThreadWorkflowAnalysis({
    dealId,
    threadData: workflowThreadData,
    autoRun: true,
  });
  const effectiveDealId = dealId || linkedDealId || detailWorkflowAnalysis?.likely_deal?.id;
  const effectiveDealName =
    linkedDealName || thread.dealName || detailWorkflowAnalysis?.likely_deal?.name;

  // Hydrate per-thread deal link from the deal_emails table. Looks up any of
  // the thread's real Gmail message IDs; if a row exists, we adopt its
  // deal_id (+ resolve the deal name) so AI Assist downstream cards
  // (Update Funding Source Status, Suggested Updates, Outstanding Items, Lender
  // Q&A, Deal Context) all see the same resolved deal — eliminating the
  // contradictory "no deal linked" state when the chip row already shows
  // a deal.
  // Hydrate canonical deal link from deal_emails. Manual/locked rows always win
  // over AI suggestions. 5s hard timeout → inline error+Retry instead of a
  // permanent spinner. Re-runs whenever the thread changes or Retry is hit.
  const [hydrateNonce, setHydrateNonce] = useState(0);
  useEffect(() => {
    if (dealId) { setLinkHydrating(false); return; }
    const messageIds = thread.emails
      .map((e) => e.id)
      .filter((mid): mid is string => !!mid && !mid.startsWith('mock-'));
    if (messageIds.length === 0) { setLinkHydrating(false); return; }
    let cancelled = false;
    setLinkHydrating(true);
    setLinkHydrateError(null);
    const timeoutMs = 5000;
    const timeoutHandle = window.setTimeout(() => {
      if (cancelled) return;
      console.error('[link-deal hydrate] timeout', { threadId: thread.threadId, messageIds });
      setLinkHydrateError('Couldn\u2019t verify deal link');
      setLinkHydrating(false);
    }, timeoutMs);
    (async () => {
      try {
        // Prefer manual+locked, newest first. The composite index makes this cheap.
        const { data: rows, error: linkErr } = await supabase
          .from('deal_emails')
          .select('deal_id, link_source, locked, linked_at')
          .in('gmail_message_id', messageIds)
          .order('locked', { ascending: false })
          .order('linked_at', { ascending: false })
          .limit(5);
        if (cancelled) return;
        if (linkErr) throw linkErr;
        const winner = (rows ?? []).find((r: any) => r.locked || r.link_source === 'manual') ?? (rows ?? [])[0];
        if (!winner?.deal_id) {
          window.clearTimeout(timeoutHandle);
          setLinkHydrating(false);
          return;
        }
        const { data: dealRow, error: dErr } = await supabase
          .from('deals')
          .select('id, company')
          .eq('id', winner.deal_id)
          .maybeSingle();
        if (cancelled) return;
        if (dErr) throw dErr;
        window.clearTimeout(timeoutHandle);
        setLinkedDealId(winner.deal_id);
        if (dealRow?.company) setLinkedDealName(dealRow.company);
        setLinkHydrating(false);
      } catch (err: any) {
        if (cancelled) return;
        console.error('[link-deal hydrate] failed', err);
        window.clearTimeout(timeoutHandle);
        setLinkHydrateError(err?.message || 'Could not load deal link');
        setLinkHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutHandle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.threadId, dealId, hydrateNonce]);

  // Shared persistence helper used by both the toolbar popover and the AI
  // Assist sidebar. Writes manual+locked rows so AI auto-linkers cannot
  // overwrite (enforced by a DB trigger as belt-and-suspenders). On failure,
  // reverts the optimistic UI and shows a Retry toast.
  const persistManualDealLink = useCallback(async (id: string, name: string, prev: { id?: string; name?: string }) => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id;
      if (!userId) return;
      const realIds = thread.emails
        .map((e) => e.id)
        .filter((mid): mid is string => !!mid && !mid.startsWith('mock-'));
      if (realIds.length === 0) return;
      const rows = realIds.map((mid) => ({
        deal_id: id,
        gmail_message_id: mid,
        user_id: userId,
        link_source: 'manual' as const,
        locked: true,
      }));
      const { error: upsertErr } = await supabase
        .from('deal_emails')
        .upsert(rows, { onConflict: 'deal_id,gmail_message_id', ignoreDuplicates: false });
      if (upsertErr) throw upsertErr;
      // Verify the write actually landed (defends against RLS denial / trigger drop).
      const { data: verify, error: vErr } = await supabase
        .from('deal_emails')
        .select('deal_id')
        .eq('deal_id', id)
        .in('gmail_message_id', realIds)
        .limit(1);
      if (vErr) throw vErr;
      if (!verify || verify.length === 0) {
        throw new Error('Link saved but not visible on read-back');
      }
    } catch (err: any) {
      console.error('[link-deal mutate] persist failed', err);
      // Revert optimistic state so the badge matches DB truth.
      setLinkedDealId(prev.id);
      setLinkedDealName(prev.name);
      const msg = err?.message || 'Couldn\u2019t save deal link';
      toast.error('Couldn\u2019t save deal link', {
        description: msg,
        action: {
          label: 'Retry',
          onClick: () => { void persistManualDealLink(id, name, prev); },
        },
      });
      throw err;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.threadId, thread.emails]);

  const composerSignature = useUserEmailSignature();

  // Hoist the latest message's full body load so the toolbar/dialog can see
  // its attachments (the per-message MessageBlock loads its own copy too —
  // both share the Nylas cache so this is cheap).
  const latestMessageId = thread.latestEmail.id;
  const isMockLatest = !latestMessageId || latestMessageId.startsWith('mock-');
  const { data: latestFullData, loading: latestFullLoading } = useFullEmailMessage(
    latestMessageId,
    !isMockLatest,
    !!(thread.latestEmail.body_html || thread.latestEmail.body_text),
  );
  // Resolve the latest message's attachments STRICTLY from the per-message
  // fetch once available. Falling back to thread-level `latestEmail.attachments`
  // can leak sibling-message attachments into a message that has none of its
  // own. Only use the fallback before the per-message data has loaded.
  const latestAttachments = latestFullData
    ? (latestFullData.attachments || [])
    : (thread.latestEmail.attachments || []);
  const hasUploadableAttachments = latestAttachments.some(a => !a.is_inline && !!a.id);
  const attachmentFallbackReason = detectAttachmentFallbackReason(thread.emails);
  // Only render the thread-header attachments strip when the CURRENTLY VIEWED
  // (latest) message itself has attachments. Previously this surfaced sibling
  // attachments from earlier messages in the thread, which confused users
  // reading a reply that had no attachments of its own.
  const latestHasOwnAttachments = latestFullData
    ? (latestFullData.attachments?.length ?? 0) > 0
    : !!thread.latestEmail.has_attachments || (thread.latestEmail.attachments?.length ?? 0) > 0;
  const shouldRenderAttachmentsRow =
    latestHasOwnAttachments ||
    // Keep the row mounted during initial hydration of the latest message so
    // the user sees a loading state instead of an empty band that snaps in,
    // but only when we have a signal the latest message likely has attachments.
    (latestFullLoading && !!thread.latestEmail.has_attachments);
  
  // Reply state
  const [replyTo, setReplyTo] = useState<{ subject: string; to_email: string; to_name: string; threadId: string } | null>(null);
  const [popOutDraft, setPopOutDraft] = useState<ReplyDraft | null>(null);
  const [inlineDraft, setInlineDraft] = useState<ReplyDraft | null>(null);
  /**
   * AI-suggested reply options streamed from AiAssistSidebar's
   * `generate_draft_options` engine. When non-empty, the inline composer
   * renders the radio-card picker above the body textarea.
   */
  const [inlineSuggestions, setInlineSuggestions] = useState<SuggestedReply[]>([]);

  // Draft persistence
  const { loadDraft, updateDraft, flushSave, discardDraft, clearDraftOnSend, hasSavedDraft, saveStatus } = useEmailDraft(thread.threadId);
  const hasActiveDraft = !!(replyTo || popOutDraft);
  useUnsavedDraftGuard(hasActiveDraft);

  // Auto-suggest deal note from emails detected in draft body.
  // Resolved deal IDs may differ from the linked deal — we still scope
  // the suggestion to the resolved deal's space.
  const resolveDeal = useResolveDealForEmail();
  const { create: createPendingSuggestion } = usePendingDealSuggestions(dealId);
  const enqueueResolution = usePendingDealResolutionsStore((s) => s.enqueue);

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

  // Resolve the current user's email + simple aliases so Reply All can
  // exclude the user from To/Cc. Loaded once per mount.
  const [currentUserEmails, setCurrentUserEmails] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const primary = data?.user?.email?.toLowerCase();
      if (!cancelled && primary) setCurrentUserEmails([primary]);
    })();
    return () => { cancelled = true; };
  }, []);

  // ─── Reply All recipient resolution ─────────────────────────
  // Pulls the real to/cc arrays for the given message from gmail_messages
  // (so we don't rely on the truncated single-recipient MockEmail fields),
  // then builds Gmail-style Reply All lists.
  const buildReplyAllRecipients = useCallback(async (msg: MockEmail): Promise<{ to: string; cc: string }> => {
    const me = new Set(currentUserEmails.map(e => e.toLowerCase()));
    const isOutbound = msg.from_name === 'You' || (msg.from_email && me.has(msg.from_email.toLowerCase()));

    // Try to hydrate from DB (real Gmail/Nylas messages only)
    let dbTo: string[] = [];
    let dbCc: string[] = [];
    let dbFromEmail: string | null = null;
    let dbFromName: string | null = null;
    if (msg.id && !msg.id.startsWith('mock-')) {
      try {
        const { data } = await supabase
          .from('gmail_messages')
          .select('from_email, from_name, to_emails, cc_emails')
          .eq('gmail_message_id', msg.id)
          .maybeSingle();
        if (data) {
          dbTo = Array.isArray((data as any).to_emails) ? (data as any).to_emails : [];
          dbCc = Array.isArray((data as any).cc_emails) ? (data as any).cc_emails : [];
          dbFromEmail = (data as any).from_email || null;
          dbFromName = (data as any).from_name || null;
        }
      } catch (err) {
        console.warn('[reply-all] could not load message recipients', err);
      }
    }

    // Helper: normalize an "addr" or "Name <addr>" into { email, display }
    const parse = (raw: string): { email: string; display: string } | null => {
      if (!raw) return null;
      const trimmed = raw.trim();
      if (!trimmed) return null;
      const m = trimmed.match(/^(.*?)<\s*([^>]+)\s*>$/);
      if (m) {
        const name = m[1].trim().replace(/^"|"$/g, '');
        const email = m[2].trim();
        return { email, display: name ? `${name} <${email}>` : email };
      }
      return { email: trimmed, display: trimmed };
    };

    const dedupe = (entries: Array<{ email: string; display: string }>, exclude: Set<string>) => {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const e of entries) {
        const k = e.email.toLowerCase();
        if (!k || seen.has(k) || exclude.has(k)) continue;
        seen.add(k);
        out.push(e.display);
      }
      return out;
    };

    // Build To
    const toEntries: Array<{ email: string; display: string }> = [];
    if (!isOutbound) {
      const fromEmail = dbFromEmail || msg.from_email;
      const fromName = dbFromName || msg.from_name;
      if (fromEmail) {
        toEntries.push({
          email: fromEmail,
          display: fromName && fromName !== fromEmail ? `${fromName} <${fromEmail}>` : fromEmail,
        });
      }
    }
    // Original To recipients (preserve them, minus me)
    const originalTo = dbTo.length > 0
      ? dbTo
      : (msg.to_email ? [msg.to_name && msg.to_name !== msg.to_email ? `${msg.to_name} <${msg.to_email}>` : msg.to_email] : []);
    for (const raw of originalTo) {
      const p = parse(raw);
      if (p) toEntries.push(p);
    }

    const toExclude = new Set<string>(me);
    const toList = dedupe(toEntries, toExclude);

    // Build Cc — exclude me AND anyone already in To
    const ccExclude = new Set<string>(me);
    for (const display of toList) {
      const p = parse(display);
      if (p) ccExclude.add(p.email.toLowerCase());
    }
    const ccEntries: Array<{ email: string; display: string }> = [];
    for (const raw of dbCc) {
      const p = parse(raw);
      if (p) ccEntries.push(p);
    }
    const ccList = dedupe(ccEntries, ccExclude);

    return { to: toList.join(', '), cc: ccList.join(', ') };
  }, [currentUserEmails]);

  const handleReply = useCallback(() => {
    if (popOutDraft) return;
    const saved = loadDraft();
    if (saved) {
      setInlineDraft(saved);
    }
    setReplyTo(getReplyTarget());
    setShowResumeBanner(false);
  }, [getReplyTarget, popOutDraft, loadDraft]);

  const handleReplyAll = useCallback(async () => {
    if (popOutDraft) return;
    const latest = thread.latestEmail;
    const target = getReplyTarget();
    const { to, cc } = await buildReplyAllRecipients(latest);
    setReplyTo({ ...target, to_email: to || target.to_email });
    setInlineDraft({
      to: to || target.to_email,
      toName: target.to_name,
      subject: thread.subject.startsWith('Re:') ? thread.subject : `Re: ${thread.subject}`,
      body: '',
      cc,
      bcc: '',
      attachments: [],
      threadId: thread.threadId,
    });
    setShowResumeBanner(false);
  }, [getReplyTarget, popOutDraft, thread, buildReplyAllRecipients]);

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

  // ─── Per-message reply / reply all / forward handlers ────────
  // Anchored to a specific message in the thread (not just the latest).
  // Pre-addresses the composer to that message's sender and seeds the
  // quoted body from that specific message.
  const handleReplyToMessage = useCallback((msg: MockEmail) => {
    if (popOutDraft) return;
    const isOutbound = msg.from_name === 'You';
    const target = isOutbound
      ? { to_email: msg.to_email, to_name: msg.to_name }
      : { to_email: msg.from_email, to_name: msg.from_name };
    const subject = thread.subject.startsWith('Re:') ? thread.subject : `Re: ${thread.subject}`;
    setReplyTo({ subject, to_email: target.to_email, to_name: target.to_name, threadId: thread.threadId });
    setInlineDraft({
      to: target.to_email,
      toName: target.to_name,
      subject,
      body: '',
      cc: '',
      bcc: '',
      attachments: [],
      threadId: thread.threadId,
    });
    setShowResumeBanner(false);
  }, [popOutDraft, thread]);

  const handleReplyAllToMessage = useCallback(async (msg: MockEmail) => {
    if (popOutDraft) return;
    const isOutbound = msg.from_name === 'You';
    const fallbackTarget = isOutbound
      ? { to_email: msg.to_email, to_name: msg.to_name }
      : { to_email: msg.from_email, to_name: msg.from_name };
    const subject = thread.subject.startsWith('Re:') ? thread.subject : `Re: ${thread.subject}`;
    const { to, cc } = await buildReplyAllRecipients(msg);
    setReplyTo({ subject, to_email: to || fallbackTarget.to_email, to_name: fallbackTarget.to_name, threadId: thread.threadId });
    setInlineDraft({
      to: to || fallbackTarget.to_email,
      toName: fallbackTarget.to_name,
      subject,
      body: '',
      cc,
      bcc: '',
      attachments: [],
      threadId: thread.threadId,
    });
    setShowResumeBanner(false);
  }, [popOutDraft, thread, buildReplyAllRecipients]);

  const handleForwardMessage = useCallback((msg: MockEmail) => {
    if (popOutDraft) return;
    const fwdSubject = thread.subject.startsWith('Fwd:') ? thread.subject : `Fwd: ${thread.subject}`;
    const fwdBody = `\n\n---------- Forwarded message ----------\nFrom: ${msg.from_name} <${msg.from_email}>\nDate: ${msg.received_at}\nSubject: ${msg.subject || thread.subject}\n\n${msg.body_preview || msg.snippet || ''}`;
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

  // Consume a pending row-level action (Reply / Reply All / Forward triggered
  // from a list-row right-click context menu). Runs once per (thread, action)
  // change and clears via onPendingActionConsumed.
  useEffect(() => {
    if (!pendingAction) return;
    const target = thread.latestEmail;
    if (!target) return;
    const t = setTimeout(() => {
      if (pendingAction === 'reply') handleReplyToMessage(target);
      else if (pendingAction === 'replyAll') handleReplyAllToMessage(target);
      else if (pendingAction === 'forward') handleForwardMessage(target);
      onPendingActionConsumed?.();
    }, 0);
    return () => clearTimeout(t);
  }, [pendingAction, thread.threadId, handleReplyToMessage, handleReplyAllToMessage, handleForwardMessage, onPendingActionConsumed]);

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
    if (!isAutoDealNoteSuggestionEnabled()) return;
    const draft = inlineDraft || popOutDraft;
    if (!draft?.body) return;

    const detected = detectBareEmailsInDraft(draft.body);
    if (detected.length === 0) return;

    const senderEmail = thread.latestEmail.from_email;

    (async () => {
      for (const det of detected) {
        // Skip the sender / current user — we want NEW contacts.
        if (det.email === senderEmail?.toLowerCase()) continue;

        // Resolve target deal: prefer linked dealId; otherwise fuzzy match.
        let targetDealId = dealId;
        let targetCompanyId: string | undefined;

        if (!targetDealId) {
          const candidates = resolveDeal({
            subject: thread.subject,
            senderEmail,
            detectedEmail: det.email,
          });
          if (candidates.length === 1) {
            targetDealId = candidates[0].deal.id;
          }
          // Many candidates → defer to the user via a picker card in the
          // AI Assist sidebar. We capture the full intent so creation happens
          // against the chosen deal once they pick.
          if (!targetDealId && candidates.length > 1) {
            enqueueResolution({
              threadId: thread.threadId,
              threadSubject: thread.subject,
              dedupKey: `draft-email::${thread.threadId}::${det.email}`,
              reason: `Subject + domain match ${candidates.length} deals`,
              intent: {
                kind: 'contact_email_from_draft',
                payload: {
                  email: det.email,
                  domain: det.domain,
                  inferredName: det.inferredName,
                  contextSnippet: det.contextSnippet,
                  proposedNote: '',
                  detectedAt: new Date().toISOString(),
                },
              },
              candidates: candidates.map((c) => ({
                dealId: c.deal.id,
                dealName: c.deal.company || c.deal.name || 'Unnamed deal',
                stage: c.deal.stage ?? null,
                domainMatch: c.domainMatch,
                nameMatch: c.nameMatch,
                score: c.score,
              })),
            });
            continue;
          }
          // 0 candidates → nothing we can do automatically; user can link the
          // thread to a deal and we'll re-detect on the next blur.
          if (!targetDealId) continue;
        }

        // Fetch company_id for the deal (required for RLS).
        try {
          const { data: dealRow } = await supabase
            .from('deals')
            .select('company_id')
            .eq('id', targetDealId)
            .single();
          targetCompanyId = dealRow?.company_id || undefined;
        } catch {
          continue;
        }
        if (!targetCompanyId) continue;

        await createPendingSuggestion({
          dealId: targetDealId,
          companyId: targetCompanyId,
          payload: {
            email: det.email,
            domain: det.domain,
            inferredName: det.inferredName,
            contextSnippet: det.contextSnippet,
            proposedNote: '',
            detectedAt: new Date().toISOString(),
          },
          sourceThreadId: thread.threadId,
          sourceThreadSubject: thread.subject,
          dedupKey: `draft-email::${thread.threadId}::${det.email}`,
        });
      }
    })();
  }, [flushSave, inlineDraft, popOutDraft, dealId, thread, resolveDeal, createPendingSuggestion]);

  const performSendWithLink = useCallback(
    (
      emailData: Omit<MockEmail, 'id' | 'threadId'>,
      linkContext?: { dealId: string | null; dealName: string | null },
    ) => {
      onSendReply(emailData, thread.threadId, linkContext);
      clearDraftOnSend();
      setReplyTo(null);
      setPopOutDraft(null);
      setInlineDraft(null);
    },
    [onSendReply, thread.threadId, clearDraftOnSend],
  );

  const handleSendFromComposer = useCallback(
    (emailData: Omit<MockEmail, 'id' | 'threadId'>) => {
      // If a deal is already resolvable (explicit prop, per-thread link, or
      // workflow likely-match) — log automatically. Otherwise send without
      // a deal link; the user can still link manually from the toolbar.
      performSendWithLink(
        emailData,
        effectiveDealId
          ? { dealId: effectiveDealId, dealName: effectiveDealName || null }
          : { dealId: null, dealName: null },
      );
    },
    [effectiveDealId, effectiveDealName, performSendWithLink],
  );

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

  // Notify the AI Assist sidebar so it can hide its duplicate Draft Reply
  // workspace whenever the pop-out compose modal is open.
  useEffect(() => {
    try {
      window.dispatchEvent(new CustomEvent(
        popOutDraft ? 'naitive:ai-assist:popout-opened' : 'naitive:ai-assist:popout-closed',
      ));
    } catch {}
  }, [popOutDraft]);

  // ── AI Assist → inline compose bridge ───────────────────────────────
  // The AI Assist sidebar's "Draft Reply" quick action dispatches
  // `naitive:ai-assist:open-inline-draft` (no pop-up). We open the
  // InlineReplyComposer in place — the suggested-reply radio cards are
  // populated separately via `onInsertSuggestions` once the AI engine
  // returns the generated bodies.
  useEffect(() => {
    const onOpenInlineDraft = (e: Event) => {
      const detail = (e as CustomEvent<{ threadId?: string }>).detail;
      if (detail?.threadId && detail.threadId !== thread.threadId) return;
      setPopOutDraft(null);
      // Do NOT clear inlineDraft if user already has a draft going.
      setReplyTo(getReplyTarget());
    };
    window.addEventListener('naitive:ai-assist:open-inline-draft', onOpenInlineDraft as EventListener);
    return () => window.removeEventListener('naitive:ai-assist:open-inline-draft', onOpenInlineDraft as EventListener);
  }, [getReplyTarget, thread.threadId]);

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

  // When the user opens a thread by clicking a specific (older) message,
  // make sure that message is rendered — auto-expand the "older messages"
  // section if the deep-link target falls outside the recent tail.
  useEffect(() => {
    if (!deepLinkMessageId) return;
    if (!shouldAutoCollapse) return;
    const idx = thread.emails.findIndex((e) => e.id === deepLinkMessageId);
    if (idx === -1) return;
    // thread.emails is newest-first; the visible tail is the first
    // VISIBLE_RECENT entries. Anything past that is hidden behind the bar.
    if (idx >= VISIBLE_RECENT) setOlderExpanded(true);
  }, [deepLinkMessageId, shouldAutoCollapse, thread.emails]);

  // ─── Q&A detection (inbound reply containing answers to prior outbound questions) ───
  // Runs once per thread open, debounced. Respects the global Auto-suggest toggle
  // and writes a pending suggestion the user must confirm.
  useEffect(() => {
    if (!dealId) return;
    if (!isAutoDealNoteSuggestionEnabled()) return;
    if (thread.emails.length < 2) return;

    const t = setTimeout(async () => {
      try {
        // Build lite message list in chronological order (mockEmailData groups
        // emails newest-first inside threads sometimes; sort defensively).
        const sorted = [...thread.emails].sort(
          (a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime(),
        );
        const messages: ThreadMessageLite[] = sorted.map((e) => {
          const isOutbound = e.folder === 'sent' || e.from_name === 'You';
          // Prefer the freshest body source for the latest message (already hydrated by the hoisted load).
          const isLatest = e.id === thread.latestEmail.id;
          const hydratedBody = isLatest
            ? (latestFullData?.body_text || latestFullData?.body_html || '')
            : '';
          return {
            isOutbound,
            body: hydratedBody || e.body_text || e.body_html || e.body_preview || e.snippet || '',
            fromEmail: e.from_email,
            fromName: e.from_name,
            subject: e.subject,
            receivedAt: e.received_at,
          };
        });

        const detection = detectThreadQAndA(messages);
        if (!detection) return;

        const inbound = messages[detection.inboundIndex];
        // Resolve target deal — prefer linked dealId, otherwise fuzzy.
        let targetDealId = dealId;
        let targetCompanyId: string | undefined;
        if (!targetDealId) {
          const candidates = resolveDeal({
            subject: thread.subject,
            senderEmail: inbound.fromEmail,
          });
          if (candidates.length === 1) targetDealId = candidates[0].deal.id;
          if (!targetDealId && candidates.length > 1) {
            enqueueResolution({
              threadId: thread.threadId,
              threadSubject: thread.subject,
              dedupKey: buildQADedupKey(thread.threadId, detection.pairs),
              reason: `Subject + sender domain match ${candidates.length} deals`,
              intent: {
                kind: 'qa_from_thread',
                payload: {
                  pairs: detection.pairs,
                  source: {
                    fromName: inbound.fromName || '',
                    fromEmail: inbound.fromEmail || '',
                    receivedAt: inbound.receivedAt || new Date().toISOString(),
                    subject: thread.subject,
                    threadId: thread.threadId,
                  },
                  detectedAt: new Date().toISOString(),
                  reasons: detection.reasons,
                  confidence: detection.confidence,
                  confidenceScore: detection.confidenceScore,
                  confidenceSignals: detection.confidenceSignals,
                },
              },
              candidates: candidates.map((c) => ({
                dealId: c.deal.id,
                dealName: c.deal.company || c.deal.name || 'Unnamed deal',
                stage: c.deal.stage ?? null,
                domainMatch: c.domainMatch,
                nameMatch: c.nameMatch,
                score: c.score,
              })),
            });
            return;
          }
          if (!targetDealId) return;
        }
        const { data: dealRow } = await supabase
          .from('deals')
          .select('company_id')
          .eq('id', targetDealId)
          .single();
        targetCompanyId = dealRow?.company_id || undefined;
        if (!targetCompanyId) return;

        await createPendingSuggestion({
          dealId: targetDealId,
          companyId: targetCompanyId,
          suggestionType: 'qa_from_thread',
          payload: {
            pairs: detection.pairs,
            source: {
              fromName: inbound.fromName || '',
              fromEmail: inbound.fromEmail || '',
              receivedAt: inbound.receivedAt || new Date().toISOString(),
              subject: thread.subject,
              threadId: thread.threadId,
            },
            detectedAt: new Date().toISOString(),
            reasons: detection.reasons,
            confidence: detection.confidence,
            confidenceScore: detection.confidenceScore,
            confidenceSignals: detection.confidenceSignals,
          },
          sourceThreadId: thread.threadId,
          sourceThreadSubject: thread.subject,
          dedupKey: buildQADedupKey(thread.threadId, detection.pairs),
        });
      } catch (err) {
        console.warn('[qa-detect] error', err);
      }
    }, 800);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.threadId, thread.latestEmail.id, dealId, latestFullData?.body_text, latestFullData?.body_html]);

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
      // Ignore shortcuts when focus is in any editable surface (input, textarea,
      // contenteditable, role=textbox, or anywhere inside the composer).
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          target.isContentEditable ||
          target.getAttribute?.('role') === 'textbox' ||
          target.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"]')
        ) {
          return;
        }
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        handleReply();
      }
      if (e.key === 'f' || e.key === 'F') { e.preventDefault(); handleForward(); }
      if (e.key === 'l' || e.key === 'L') { e.preventDefault(); onToggleLink(thread.latestEmail); }
      if (e.shiftKey && (e.key === 'I' || e.key === 'i')) {
        e.preventDefault();
        onMarkRead?.(thread.latestEmail);
      }
      if (e.shiftKey && (e.key === 'U' || e.key === 'u')) {
        e.preventDefault();
        onMarkUnread?.(thread.latestEmail);
      }
      if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        // Honor Assist gating — when disabled for this account/company,
        // the keyboard shortcut is a no-op (no hidden affordance).
        if (assistEnabled) setShowAiAssist((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [thread, onToggleLink, handleReply, handleForward, onMarkRead, onMarkUnread, assistEnabled]);

  const latest = thread.latestEmail;
  if (!thread?.latestEmail || !Array.isArray(thread.emails) || thread.emails.length === 0) {
    return (
      <EmailDetailStatusState
        title="Couldn't load this message"
        description="This thread has no readable messages yet. Close and reopen the thread to retry."
        actionLabel="Close"
        onAction={onBack}
      />
    );
  }
  const senderName = latest.from_name === 'You' ? latest.to_name : latest.from_name;
  const senderEmail = latest.from_name === 'You' ? latest.to_email : latest.from_email;

  // Detect narrow detail panes (e.g. AI Assist open inside a narrow popup
  // or mobile viewport). When the available width can't comfortably hold
  // both the message body AND the 280px assist column, stack the assist
  // below so the body always renders at a readable width instead of
  // collapsing to a one-character column.
  const detailGridRef = useRef<HTMLDivElement | null>(null);
  const [stackAiAssist, setStackAiAssist] = useState(false);
  useEffect(() => {
    const el = detailGridRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      // 700px = ~ body 360 + assist 280 + 60 gutter — under that, stack.
      setStackAiAssist(w > 0 && w < 700);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <>
      {/* Reactive grid: detail column uses minmax(0,1fr) so it can shrink below
          its intrinsic content width when the AI Assist column appears, which
          forces body text to re-wrap. Animated via grid-template-columns
          transition so toggling Assist feels fluid. Below 1100px the grid
          stacks (detail on top, assist below) so the middle column always has
          room to wrap. */}
        <div
          ref={detailGridRef}
          className="relative grid h-full min-w-0 w-full max-w-full overflow-hidden bg-transparent transition-[grid-template-columns] duration-200 ease-out"
        style={{
          gridTemplateColumns: renderAiAssistColumn && !stackAiAssist
            ? 'minmax(360px,1fr) minmax(170px,min(210px,19vw))'
            : 'minmax(0,1fr)',
          gridTemplateRows: renderAiAssistColumn && stackAiAssist ? 'minmax(0,1fr) auto' : undefined,
        }}
      >
        {/* Email message column — transparent so the unified popup-shell
            surface shows through. Separation from the AI Assist column is
            handled by a thin border on the sibling, not a different fill. */}
        <div
          ref={messagePaneRef}
          data-inbox-surface-scope="message"
          className="flex min-h-0 min-w-0 max-w-full flex-[1_1_0%] flex-col overflow-hidden bg-transparent"
        >
          {/* Outlook-style command bar — portalled into the unified mail
              header (#email-detail-toolbar-slot) so the entire mail UI
              shares one horizontal toolbar row. Falls back to inline
              render if the slot is unavailable. */}
          {(() => {
            const commandBar = (
          <div className="flex items-center gap-0.5 px-2 py-0 shrink-0 min-w-0 overflow-x-auto">
            <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0 md:hidden h-7 w-7">
              <ChevronLeft className="h-4 w-4" />
            </Button>

            {/* Command bar buttons with icons + labels */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onBack}
                  aria-label="Close email"
                  className="flex flex-col items-center gap-0.5 px-3 py-1 rounded hover:bg-muted/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-4 w-4 text-[hsl(var(--email-text-secondary))]" />
                  <span className="text-[10px] text-[hsl(var(--email-text-secondary))]">Close</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">Close (Esc)</TooltipContent>
            </Tooltip>
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

            {assistEnabled && <div className="w-px h-8 bg-border/50 mx-1" />}

            {/* AI Assist toggle — sidebar is always-on by default on desktop;
                on smaller widths this button expands the collapsed AI panel.
                Entire control is omitted (no dead/disabled affordance) when
                Assist is gated off for this account/company. */}
            {assistEnabled && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  ref={aiAssistButtonRef}
                  onClick={() => setShowAiAssist(!showAiAssist)}
                  aria-pressed={showAiAssist}
                  aria-label="Toggle AI Assist"
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
              <TooltipContent side="bottom" className="text-xs">
                {showAiAssist ? 'Hide AI Assist (A)' : 'Show AI Assist (A)'}
              </TooltipContent>
            </Tooltip>
            )}

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


            <span ref={linkPreviewAnchorRef} className="inline-flex">
            {linkHydrating && !linkedDealName ? (
              <div
                className="flex flex-col items-center gap-0.5 px-3 py-1 rounded border border-transparent"
                aria-busy="true"
                aria-label="Loading deal link"
              >
                <div className="h-4 w-4 rounded bg-muted/60 animate-pulse" />
                <div className="h-2 w-12 rounded bg-muted/60 animate-pulse mt-0.5" />
              </div>
            ) : linkHydrateError && !linkedDealName ? (
              <button
                type="button"
                onClick={() => { setLinkHydrateError(null); setHydrateNonce((n) => n + 1); }}
                className="flex flex-col items-center gap-0.5 px-3 py-1 rounded border border-destructive/40 text-destructive hover:bg-destructive/5"
                title={linkHydrateError}
              >
                <Link2 className="h-4 w-4" />
                <span className="text-[10px]">Retry</span>
              </button>
            ) : (
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
              onLinkDeal={async (id, name) => {
                const prev = { id: linkedDealId, name: linkedDealName };
                // Optimistic UI — AI drafting + context immediately use the
                // newly linked deal even before the DB write resolves.
                setLinkedDealId(id);
                setLinkedDealName(name);
                onToggleLink(thread.latestEmail);
                setLinkPreviewDealId(id);
                setLinkPreviewOpen(true);
                // Manual link is locked → AI auto-linker cannot overwrite.
                await persistManualDealLink(id, name, prev);
              }}
              onUnlink={async () => {
                const prevId = linkedDealId;
                setLinkedDealId(undefined);
                setLinkedDealName(undefined);
                onToggleLink(thread.latestEmail);
                setLinkPreviewOpen(false);
                setLinkPreviewDealId(null);

                if (prevId) {
                  try {
                    const messageIds = thread.emails
                      .map(e => e.id)
                      .filter(mid => mid && !mid.startsWith('mock-'));
                    if (messageIds.length > 0) {
                      await supabase
                        .from('deal_emails')
                        .delete()
                        .eq('deal_id', prevId)
                        .in('gmail_message_id', messageIds);
                    }
                  } catch (err) {
                    console.error('[link-to-deal] unlink failed', err);
                  }
                }
              }}
            />
            )}
            <LinkedDealPreviewPopover
              anchorRef={linkPreviewAnchorRef}
              open={linkPreviewOpen}
              dealId={linkPreviewDealId}
              onOpenChange={(o) => {
                setLinkPreviewOpen(o);
                if (!o) setLinkPreviewDealId(null);
              }}
            />
            </span>

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
            );
            return toolbarSlot ? createPortal(commandBar, toolbarSlot) : commandBar;
          })()}

          {/* Draft reply lives in the unified AI Assist sidebar — a single
              drafting workspace with one preview, variant switcher, and one
              action row. The legacy "Draft AI Reply" pill row was removed to
              eliminate the redundant second drafting surface. */}

          {/* Unified "Your Reply" composer (replaces the legacy AI draft review panel).
              On Send it routes through the same handleSendFromComposer pipeline used
              by the inline composer, so deal activity logging, draft cleanup, and
              thread state all stay consistent. */}
          {showAiDraft && (
            <YourReplyComposer
              thread={thread}
              dealId={effectiveDealId}
              initialMode={aiDraftMode}
              onClose={() => { setShowAiDraft(false); setAiDraftMode(undefined); }}
              onSend={(subject, body, _meta) => {
                const target = getReplyTarget();
                handleSendFromComposer({
                  subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
                  from_name: 'You',
                  from_email: 'jturner@5thline.co',
                  to_name: target.to_name,
                  to_email: target.to_email,
                  snippet: body.substring(0, 120),
                  body_preview: body,
                  received_at: new Date().toISOString(),
                  is_read: true,
                  is_starred: false,
                  folder: 'sent',
                  labels: ['Sent'],
                  has_attachments: false,
                  is_linked_to_deal: !!effectiveDealId,
                  is_follow_up: false,
                  needs_response: false,
                  category: 'deal',
                });
                setShowAiDraft(false);
                setAiDraftMode(undefined);
              }}
            />
          )}

          <div className="px-6 pt-2.5 pb-2 border-b border-[hsl(var(--email-border))] min-w-0 bg-transparent">
            {/* Compact subject heading */}
            <h2
              className="text-base font-semibold text-[hsl(var(--email-text-primary))] leading-snug mb-1 break-words"
              style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'normal' }}
            >
              {thread.subject}
              {totalMessages > 1 && (
                <span className="ml-2 text-sm font-normal text-[hsl(var(--email-text-muted))]">
                  — {totalMessages} messages
                </span>
              )}
            </h2>

            {/* Priority signal context badge — shown when this thread was opened
                via a notification deep-link, so the user can instantly verify
                which signal triggered the link. */}
            {deepLinkSignal && (() => {
              const def = getSignalDef(deepLinkSignal as EmailPrioritySignalType);
              const label = def?.label ?? deepLinkSignal.replace(/_/g, ' ');
              return (
                <div
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 mb-1.5 rounded-full text-[11px] font-medium border border-[hsl(var(--outlook-blue)/0.35)] bg-[hsl(var(--outlook-blue)/0.08)] text-[hsl(var(--outlook-blue))]"
                  title={def?.description ?? 'Signal that triggered this notification'}
                >
                  <Sparkles className="h-3 w-3" />
                  <span>Signal: {label}</span>
                </div>
              );
            })()}

            {/* Sender info block */}
            <div className="flex items-start gap-2 min-w-0">
              <EmailAvatar name={senderName} email={senderEmail} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0 text-xs leading-tight">
                  <span className="min-w-0 break-words text-[13px] font-semibold text-[hsl(var(--email-text-primary))]">{senderName}</span>
                  <span
                    className="min-w-0 break-all text-[hsl(var(--email-text-muted))]"
                    title={senderEmail}
                  >
                    &lt;{senderEmail}&gt;
                  </span>
                  <span className="text-[hsl(var(--email-text-muted))]/60 shrink-0">·</span>
                  <span className="text-[hsl(var(--email-text-muted))] shrink-0 whitespace-nowrap">
                    {format(new Date(latest.received_at), 'MMM d, h:mm a')}
                  </span>
                  {linkedDealName && (
                    <>
                      <span className="text-[hsl(var(--email-text-muted))]/60 shrink-0">·</span>
                      <span className="min-w-0 break-words text-[hsl(var(--outlook-blue))]">Linked: {linkedDealName}</span>
                    </>
                  )}
                </div>
                <ThreadParticipantsHeader
                  threadId={thread.provider_thread_id || thread.threadId}
                  threadEmails={thread.emails}
                  latest={latest}
                />
              </div>
              {/* Thread count indicator */}
              {totalMessages > 1 && (
                <div className="flex flex-col items-end gap-0.5 shrink-0">
                  <div className="flex items-center gap-1 text-[11px] text-[hsl(var(--email-text-secondary))]">
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span>{totalMessages}</span>
                    <button
                      onClick={isFullyExpanded ? handleCollapseAll : handleExpandAll}
                      className="ml-1 hover:text-[hsl(var(--email-text-primary))] transition-colors"
                    >
                      {isFullyExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                  </div>
                   {/* Thread Summary trigger — AI surface, only shown when
                       Assist is enabled for the current company/tenant.
                       Opens a compact glass popover.
                      Click-outside dismissal, Escape, and focus return are
                      handled by Radix Popover inside ThreadSummaryCard. */}
                  {assistEnabled && (
                    <ThreadSummaryCard thread={thread} dealId={effectiveDealId} variant="inline-button" />
                  )}
                </div>
              )}
            </div>
          </div>

          {shouldRenderAttachmentsRow && (
            <div className="px-6 py-1 border-b border-[hsl(var(--email-border))]">
              <EmailAttachmentsStrip
                thread={thread}
                forceVisible
                loadingOverride={latestFullLoading}
                fallbackReason={attachmentFallbackReason}
              />
            </div>
          )}

          {/* Thread content - scrollable. overscroll-contain prevents wheel
              chaining into the dialog (which causes parent layout); contain
              isolates layout/paint to this column so AI Assist updates don't
              repaint the body. */}
          <ScrollArea
            className="flex-1 min-h-0 min-w-0 overflow-hidden"
            viewportClassName="min-w-0 max-w-full overflow-x-auto"
            style={{ overscrollBehavior: 'contain', contain: 'layout paint style' }}
          >
            <div className="w-full min-w-0 max-w-full overflow-visible py-2 space-y-0 pb-24">
              <div className="px-5 mb-3">
                <AiSummaryStrip email={thread.latestEmail} />
              </div>

              {/* Thread labels */}
              <div className="px-5 mb-2">
                <ThreadLabelsBar threadId={thread.provider_thread_id || thread.threadId} />
              </div>

              {/* AI-detected lender pass banner */}
              <PassDetectionBanner thread={thread} dealId={dealId} />

              {/* Messages — rendered chronologically (oldest at top, newest
                  at bottom). The newest message is expanded by default; all
                  earlier messages are collapsed and individually expandable.
                  When the thread is long (>5), the older messages are
                  hidden behind a "show older" bar at the top. */}
              {(() => {
                // thread.emails is stored newest-first; reverse to chronological.
                const chronological = [...thread.emails].reverse();
                const newestId = thread.latestEmail.id;
                const olderHidden = shouldAutoCollapse && !olderExpanded;
                // When auto-collapsed, hide the oldest messages (top of the
                // chronological list) and only show the most recent N at the
                // bottom.
                const sliceStart = olderHidden
                  ? Math.max(0, chronological.length - VISIBLE_RECENT)
                  : 0;
                const visible = chronological.slice(sliceStart);
                return (
                  <>
                    {olderHidden && hiddenCount > 0 && (
                      <CollapsedMessagesBar
                        count={hiddenCount}
                        onExpand={() => setOlderExpanded(true)}
                        threadEmails={thread.emails}
                        threadId={thread.provider_thread_id || thread.threadId}
                        subject={thread.subject}
                      />
                    )}
                    {visible.map((email) => (
                      <div
                        key={email.id}
                        data-deeplink-msg-id={email.id}
                        className="transition-shadow"
                      >
                        <ThreadMessage
                          email={email}
                          isLatest={email.id === newestId}
                          defaultExpanded={
                            email.id === newestId
                            || userExpandedMessages.has(email.id)
                            || (!!deepLinkMessageId && (email.id === deepLinkMessageId))
                          }
                          threadId={thread.threadId}
                          threadSubject={thread.subject}
                          threadEmails={thread.emails}
                          dealId={effectiveDealId}
                          dealName={effectiveDealName}
                          onReply={handleReplyToMessage}
                          onReplyAll={handleReplyAllToMessage}
                          onForward={handleForwardMessage}
                          onExpandChange={(exp) => {
                            setUserExpandedMessages(prev => {
                              const next = new Set(prev);
                              if (exp) next.add(email.id); else next.delete(email.id);
                              return next;
                            });
                          }}
                        />
                      </div>
                    ))}
                  </>
                );
              })()}

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
            <div className="border-t-2 border-[hsl(var(--outlook-blue))] shrink-0 flex flex-col h-[min(92vh,980px)] md:h-[min(88vh,980px)]">
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
                dealId={effectiveDealId ?? null}
                dealName={effectiveDealName ?? null}
                signature={composerSignature}
                suggestedReplies={inlineSuggestions}
                recommendedSuggestionId="tone-balanced"
                onRetrySuggestion={(toneKey) => {
                  try {
                    window.dispatchEvent(new CustomEvent('naitive:ai-assist:retry-tone', {
                      detail: { tone: toneKey },
                    }));
                  } catch {}
                }}
              />
            </div>
          )}
        </div>

        {/* AI Assist column — sibling grid cell. Only rendered when toggled on,
            so the grid collapses to a single column and the detail pane reclaims
            the full width. Below 1100px we collapse to slide-over to keep the
            detail column wide enough for body wrapping. */}
        {renderAiAssistColumn && (
          <div
            ref={aiAssistPaneRef}
            data-inbox-surface-scope="assistant"
            className={cn(
              'flex h-full min-h-0 min-w-0 w-full overflow-hidden bg-transparent',
              stackAiAssist
                ? 'max-w-full max-h-[40vh] border-t border-[hsl(var(--email-border))]'
                : 'max-w-[min(360px,30vw)] border-l border-[hsl(var(--email-border))]',
            )}
          >
            <EmailPaneErrorBoundary
              resetKey={`ai-assist-${thread.threadId}`}
              fallbackTitle="AI Assist is temporarily unavailable"
              fallbackMessage="The email is still available to read — close and reopen AI Assist to retry."
            >
              {!thread || !Array.isArray(thread.emails) || !thread.latestEmail ? (
                <div className="flex h-full min-h-0 w-full min-w-0 items-center justify-center p-6">
                  <p className="text-xs text-[hsl(var(--email-text-secondary))]">Loading email context…</p>
                </div>
              ) : (
              <AiAssistSidebar
                thread={thread}
                dealId={effectiveDealId}
                dealName={effectiveDealName}
                onClose={() => {
                  setShowAiAssist(false);
                  // Return focus to the toolbar toggle for keyboard users.
                  requestAnimationFrame(() => aiAssistButtonRef.current?.focus());
                }}
                onLinkDeal={async (id, name) => {
                  const prev = { id: linkedDealId, name: linkedDealName };
                  setLinkedDealId(id);
                  setLinkedDealName(name);
                  onToggleLink(thread.latestEmail);
                  await persistManualDealLink(id, name, prev);
                }}
                onInsertDraft={(body) => {
                  const target = getReplyTarget();
                  // Reply lives in the existing thread — keep the current
                  // composer subject (or derive from the thread). Drafts are
                  // body-only by design.
                  const finalSubject = inlineDraft?.subject
                    || (thread.subject?.startsWith('Re:') ? thread.subject : `Re: ${thread.subject}`);
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
                onInsertSuggestions={(suggestions) => {
                  setInlineSuggestions(suggestions as SuggestedReply[]);
                }}
                onOpenInlineReply={() => {
                  setPopOutDraft(null);
                  setReplyTo(getReplyTarget());
                  setShowResumeBanner(false);
                }}
              />
              )}
            </EmailPaneErrorBoundary>
          </div>
        )}

        {/* Pop-out composer — positioned absolutely inside the email modal
            grid so it stays fully contained within the email pop-up frame. */}
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
            dealId={effectiveDealId ?? null}
            dealName={effectiveDealName ?? null}
            signature={composerSignature}
          />
        )}
      </div>

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

