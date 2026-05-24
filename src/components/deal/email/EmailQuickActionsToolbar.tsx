import { forwardRef, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  FolderUp,
  Building2,
  Sparkles as SparklesIcon,
  ListPlus,
  CalendarClock,
  AlignLeft,
  Loader2,
  ListChecks,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { logUpdateLenderRefused } from '@/lib/aiAssistRefusalLogger';
import { CreateTaskInlineCard } from './CreateTaskInlineCard';
import { SaveToDealCard } from './SaveToDealCard';
import { MeetingSchedulerCard } from './MeetingSchedulerCard';
import { UpdateLenderStatusInlineCard } from './UpdateLenderStatusInlineCard';
import { AddOutstandingItemsInlineCard } from './AddOutstandingItemsInlineCard';
import { QuickBookMeetingPopover } from './QuickBookMeetingPopover';
import { useAuth } from '@/contexts/AuthContext';
import type { EmailThread } from './mockEmailData';
import { summarizeSelectedEmailThread, type EmailThreadSummaryDebug } from './threadSummaryUtils';

type QuickActionKey = 'save_dr' | 'lender' | 'draft' | 'task' | 'meeting' | 'summarize' | 'outstanding';

interface ActionDef {
  key: QuickActionKey;
  label: string;
  icon: ReactNode;
  /** Optional accent color class for the icon. */
  iconClass?: string;
}

const ALL_ACTIONS: ActionDef[] = [
  { key: 'save_dr', label: 'Save to Data Room', icon: <FolderUp className="h-4 w-4" />, iconClass: 'text-amber-300' },
  { key: 'lender', label: 'Update Lender Stage', icon: <Building2 className="h-4 w-4" />, iconClass: 'text-emerald-300' },
  { key: 'draft', label: 'Draft Reply', icon: <SparklesIcon className="h-4 w-4" />, iconClass: 'text-primary' },
  { key: 'task', label: 'Create Task', icon: <ListPlus className="h-4 w-4" />, iconClass: 'text-sky-300' },
  { key: 'meeting', label: 'Schedule Meeting', icon: <CalendarClock className="h-4 w-4" />, iconClass: 'text-violet-300' },
  { key: 'outstanding', label: 'Add to Outstanding Items', icon: <ListChecks className="h-4 w-4" />, iconClass: 'text-fuchsia-300' },
  { key: 'summarize', label: 'Summarize thread', icon: <AlignLeft className="h-4 w-4" />, iconClass: 'text-cyan-300' },
];

interface Props {
  thread: EmailThread;
  dealId?: string | null;
  contactId?: string | null;
  dealName?: string | null;
  /** AI-suggested lender (e.g. workflow analysis likely_lender_firm.name). */
  likelyLenderName?: string | null;
  /** Attachments resolved for the latest message (for Save to Data Room). */
  attachments: any[];
  latestMessageId?: string | null;
  fallbackDealId?: string | null;
  fallbackDealName?: string | null;
  /** Trigger Draft Reply expansion + ensure draft is generated. */
  onOpenDraft: () => void;
  /** Insert text into the composer (used by the meeting scheduler). */
  onInsertDraft: (body: string) => void;
}

/**
 * EmailQuickActionsToolbar
 * ------------------------
 * Always-visible row of 5 icon+label pills consolidating the panel's
 * primary actions. Clicking a pill toggles an inline expansion panel
 * directly below the toolbar. Only one panel is expanded at a time —
 * selecting another collapses the previous. Draft Reply and Schedule
 * Meeting delegate to existing panel-level state so behavior stays
 * consistent with the rest of the sidebar.
 */
export function EmailQuickActionsToolbar({
  thread,
  dealId,
  contactId,
  dealName,
  likelyLenderName,
  attachments,
  latestMessageId,
  fallbackDealId,
  fallbackDealName,
  onOpenDraft,
  onInsertDraft,
}: Props) {
  const [active, setActive] = useState<QuickActionKey | null>(null);
  // Meeting tile has two modes: 'quick-book' (popover) and 'propose'
  // (legacy inline MeetingSchedulerCard reached via the popover's
  // "Propose via email instead" link). Defaults to quick-book.
  const [meetingMode, setMeetingMode] = useState<'quick-book' | 'propose'>('quick-book');
  const [summary, setSummary] = useState<string[] | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [summaryDebug, setSummaryDebug] = useState<EmailThreadSummaryDebug | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const { user } = useAuth();

  // Reset summary if thread changes
  useEffect(() => {
    setSummary(null);
    setSummaryDebug(null);
    setSummaryError(null);
  }, [thread?.threadId]);

  // Only show "Save to Data Room" when the currently viewed message has at
  // least one non-inline attachment with an id. Guard against null/undefined.
  const uploadableCount = (attachments || []).filter(
    (a) => a && !a.is_inline && !!a.id,
  ).length;
  const actions = ALL_ACTIONS.filter(
    (a) => a.key !== 'save_dr' || uploadableCount > 0,
  );

  // If the active panel is "save_dr" but no uploadable attachments remain
  // (e.g. user navigated to a different message), collapse it.
  useEffect(() => {
    if (active === 'save_dr' && uploadableCount === 0) setActive(null);
  }, [active, uploadableCount]);

  const meetingPopoverOpen = active === 'meeting' && meetingMode === 'quick-book';
  const modalRoot = typeof document !== 'undefined'
    ? document.getElementById('email-popup-modal-root')
    : null;

  useEffect(() => {
    if (!meetingPopoverOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActive((prev) => (prev === 'meeting' ? null : prev));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [meetingPopoverOpen]);

  const handleMeetingClick = () => {
    // eslint-disable-next-line no-console
    console.log('[ScheduleMeeting] tile clicked', { meetingPopoverOpen, hasDeal: !!dealId, hasContact: !!contactId });
    setMeetingMode('quick-book');
    setActive('meeting');
  };

  const handleClick = (key: QuickActionKey) => {
    if (key === 'draft') {
      // Draft Reply expands the existing Draft Reply module (panel-level
      // state). The toolbar pill itself doesn't render an inline panel.
      onOpenDraft();
      setActive(null);
      return;
    }
    if (key === 'summarize') {
      // Toggle: collapse if already showing
      if (active === 'summarize') {
        setActive(null);
        return;
      }
      setActive('summarize');
      void runSummarize();
      return;
    }
    if (key === 'meeting') {
      handleMeetingClick();
      return;
    }
    setActive((prev) => (prev === key ? null : key));
  };

  const runSummarize = async () => {
    if (summarizing) return;
    const propEmails = thread?.emails || [];
    if (propEmails.length === 0) {
      setSummary(null);
      setSummaryError("Couldn't read the selected email thread for summary");
      return;
    }
    setSummarizing(true);
    setSummaryError(null);
    try {
      const result = await summarizeSelectedEmailThread({
        threadId: thread.provider_thread_id || thread.threadId,
        subject: thread.subject,
        emails: propEmails,
      });
      setSummary(result.bullets);
      setSummaryDebug(result.debug);
    } catch (err) {
      console.warn('[EmailQuickActionsToolbar] summarize failed', err);
      const debug = err instanceof Error && 'debug' in err
        ? (err as Error & { debug?: EmailThreadSummaryDebug }).debug || null
        : null;
      setSummary(null);
      setSummaryDebug(debug);
      setSummaryError(
        err instanceof Error && err.message
          ? err.message
          : "Couldn't read the selected email thread for summary",
      );
    } finally {
      setSummarizing(false);
    }
  };

  return (
    <div className="space-y-2">
      {/* 2-column quick-action grid. Cohesive cards — subtle elevated
          surface, 1px hairline border, accent-colored icon at 70%, label
          at 90% foreground. Single AIAssistActionButton component drives
          every cell so spacing, height, radius, and states stay uniform. */}
      <div
        className="grid grid-cols-2 gap-2"
        role="toolbar"
        aria-label="Email quick actions"
      >
        {actions.map((a) => {
          const isActive = active === a.key;
          if (a.key === 'lender') {
            const hasDeal = !!(dealId || fallbackDealId);
            const btn = (
              <AIAssistActionButton
                label={a.label}
                icon={
                  <span className="inline-flex items-center gap-1">
                    {a.icon}
                    {!hasDeal && (
                      <Info className="h-3 w-3 opacity-60" aria-hidden />
                    )}
                  </span>
                }
                iconClass={a.iconClass}
                isActive={isActive}
                aria-disabled={!hasDeal || undefined}
                className={cn(
                  !hasDeal && 'opacity-50 cursor-not-allowed hover:bg-white/[0.03] hover:border-white/10 hover:text-foreground/90',
                )}
                onClick={() => {
                  if (!hasDeal) {
                    void logUpdateLenderRefused({
                      reason: 'no_deal_match',
                      threadId: thread.threadId,
                      contactId: contactId ?? null,
                    });
                    return;
                  }
                  handleClick(a.key);
                }}
              />
            );
            if (hasDeal) return <div key={a.key}>{btn}</div>;
            return (
              <Tooltip key={a.key}>
                <TooltipTrigger asChild>
                  <div>{btn}</div>
                </TooltipTrigger>
                <TooltipContent side="top">
                  Link a deal first to update lender stage
                </TooltipContent>
              </Tooltip>
            );
          }
          if (a.key === 'meeting') {
            return (
              <AIAssistActionButton
                key={a.key}
                label={a.label}
                icon={a.icon}
                iconClass={a.iconClass}
                isActive={isActive}
                onClick={handleMeetingClick}
              />
            );
          }
          return (
            <AIAssistActionButton
              key={a.key}
              label={a.label}
              icon={a.icon}
              iconClass={a.iconClass}
              isActive={isActive}
              onClick={() => handleClick(a.key)}
            />
          );
        })}
      </div>

      {/* Inline expansion area. Only one action's panel renders at a time. */}
      {active === 'save_dr' && (
        <SaveToDealCard
          thread={thread}
          attachments={attachments}
          messageId={latestMessageId}
          matchedDealId={dealId}
          matchedDealName={dealName}
          fallbackDealId={fallbackDealId}
          fallbackDealName={fallbackDealName}
        />
      )}
      {active === 'lender' && (
        <UpdateLenderStatusInlineCard
          dealId={dealId || fallbackDealId}
          preselectLenderName={likelyLenderName}
          onClose={() => setActive(null)}
        />
      )}
      {active === 'task' && (
        <CreateTaskInlineCard
          dealId={dealId || fallbackDealId || null}
          dealName={dealName || fallbackDealName || null}
          threadId={thread.threadId}
          subject={thread.subject}
          senderEmail={thread.latestEmail?.from_email}
          senderName={thread.latestEmail?.from_name || undefined}
          defaultOpen
          onCancel={() => setActive(null)}
        />
      )}
      {active === 'meeting' && meetingMode === 'propose' && (
        <MeetingSchedulerCard
          recipientEmail={thread.latestEmail?.from_email}
          recipientName={thread.latestEmail?.from_name || undefined}
          threadSubject={thread.subject}
          dealName={dealName || fallbackDealName || undefined}
          thread={thread}
          onInsert={(text) => onInsertDraft(text)}
          onClose={() => setActive(null)}
        />
      )}
      {active === 'outstanding' && (
        <AddOutstandingItemsInlineCard
          dealId={dealId || fallbackDealId}
          dealName={dealName || fallbackDealName}
          thread={thread}
          preselectLenderName={likelyLenderName}
          onClose={() => setActive(null)}
        />
      )}
      {active === 'summarize' && (
        <div className="rounded-xl border border-[hsl(195_85%_60%/0.35)] bg-[hsl(200_75%_55%/0.08)] p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <AlignLeft className="h-3 w-3 text-cyan-300" />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-cyan-200/90">
              Thread summary
            </span>
            {summarizing && <Loader2 className="h-3 w-3 animate-spin text-cyan-200/80 ml-1" />}
          </div>
          {summarizing && !summary && (
            <div className="text-[11.5px] text-foreground/60">Reading the thread…</div>
          )}
          {summaryError && !summarizing && (
            <div className="text-[11.5px] text-amber-300/90">{summaryError}</div>
          )}
          {summary && (
            <ul className="space-y-1">
              {summary.map((bullet, i) => (
                <li key={i} className="text-[12px] leading-snug text-foreground/85 flex gap-1.5">
                  <span className="text-cyan-300 shrink-0 leading-snug">•</span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          )}
          {summaryDebug && (import.meta as any).env?.DEV && (
            <div className="mt-2 text-[10px] text-foreground/40 font-mono break-all">
              id={summaryDebug.threadId} · subject="{summaryDebug.subject}" · msgs={summaryDebug.messageCount} · first={summaryDebug.firstTimestamp || 'n/a'} · last={summaryDebug.lastTimestamp || 'n/a'} · src={summaryDebug.source} · chars={summaryDebug.cleanedCharCount}
            </div>
          )}
          {summary && (
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => { setSummary(null); setSummaryError(null); void runSummarize(); }}
                disabled={summarizing}
                className="text-[10.5px] text-cyan-200/80 hover:text-cyan-100 transition-colors disabled:opacity-50"
              >
                Regenerate
              </button>
            </div>
          )}
        </div>
      )}

      {meetingPopoverOpen && modalRoot && createPortal(
        <div className="absolute inset-0 z-50">
          <button
            type="button"
            aria-label="Close schedule meeting dialog"
            className="absolute inset-0 rounded-[inherit] bg-background/40 backdrop-blur-sm"
            onClick={() => setActive(null)}
          />
          <div className="relative h-full w-full">
            <div
              className="absolute left-1/2 top-1/2 z-10 flex w-[min(525px,calc(100%-48px))] max-w-[calc(100%-48px)] max-h-[calc(100%-48px)] -translate-x-1/2 -translate-y-1/2 items-stretch overflow-hidden rounded-xl border border-border bg-card shadow-xl"
              onClick={(event) => event.stopPropagation()}
            >
              <QuickBookMeetingPopover
                thread={thread}
                dealId={dealId || fallbackDealId}
                dealName={dealName || fallbackDealName || undefined}
                meEmail={user?.email || null}
                meName={(user?.user_metadata as any)?.full_name || null}
                onInsertDraft={(text) => onInsertDraft(text)}
                onProposeViaEmail={() => {
                  setMeetingMode('propose');
                  setActive('meeting');
                }}
                onClose={() => setActive(null)}
              />
            </div>
          </div>
        </div>,
        modalRoot,
      )}
    </div>
  );
}

// ─── AIAssistActionButton ──────────────────────────────────────────────
// Single source of truth for every Quick Action card in the AI Assist
// sidebar. Same height / radius / padding / typography as the "Save Email
// to Deal" pill family elsewhere on the panel so the whole right rail
// reads as one design system.
interface AIAssistActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  icon: ReactNode;
  iconClass?: string;
  isActive?: boolean;
}

const AIAssistActionButton = forwardRef<HTMLButtonElement, AIAssistActionButtonProps>(function AIAssistActionButton({
  label,
  icon,
  iconClass,
  isActive = false,
  disabled = false,
  onClick,
  ...props
}, ref) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-pressed={isActive}
      {...props}
      className={cn(
        // Layout — equal-height 2-col grid cell, icon + label left-aligned
        'group inline-flex w-full items-center gap-2 h-10 px-3 py-2 rounded-lg text-left',
        // Typography
        'text-sm font-medium leading-none',
        // Default surface — subtle elevation over the inbox surface
        'border border-white/10 bg-white/[0.03]',
        'text-foreground/90 transition-colors duration-150',
        // Hover
        'hover:bg-white/[0.06] hover:border-white/20 hover:text-foreground',
        // Active / pressed — dim background, no layout shift
        'active:bg-white/[0.02]',
        // Focus ring — keyboard accessibility, offset against panel bg
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--inbox-surface))]',
        // Toggle state (when its inline panel is open)
        isActive && 'bg-primary/10 border-primary/40 text-primary hover:bg-primary/15 hover:border-primary/50 hover:text-primary',
        // Disabled
        disabled && 'opacity-40 cursor-not-allowed pointer-events-none',
      )}
    >
      <span
        className={cn(
          'shrink-0 transition-opacity duration-150',
          isActive
            ? 'text-primary opacity-100'
            : cn(iconClass || 'text-primary', 'opacity-70 group-hover:opacity-100'),
        )}
      >
        {icon}
      </span>
      <span className="truncate flex-1 min-w-0">{label}</span>
    </button>
  );
});