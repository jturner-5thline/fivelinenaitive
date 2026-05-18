import { useEffect, useState, type ReactNode } from 'react';
import {
  FolderUp,
  Building2,
  Sparkles as SparklesIcon,
  ListPlus,
  CalendarClock,
  AlignLeft,
  Loader2,
  ListChecks,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { CreateTaskInlineCard } from './CreateTaskInlineCard';
import { SaveToDealCard } from './SaveToDealCard';
import { MeetingSchedulerCard } from './MeetingSchedulerCard';
import { UpdateLenderStatusInlineCard } from './UpdateLenderStatusInlineCard';
import { AddOutstandingItemsInlineCard } from './AddOutstandingItemsInlineCard';
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
  { key: 'save_dr', label: 'Save to Data Room', icon: <FolderUp className="h-3 w-3" />, iconClass: 'text-amber-300' },
  { key: 'lender', label: 'Update Lender Status', icon: <Building2 className="h-3 w-3" />, iconClass: 'text-emerald-300' },
  { key: 'draft', label: 'Draft Reply', icon: <SparklesIcon className="h-3 w-3" />, iconClass: 'text-primary' },
  { key: 'task', label: 'Create Task', icon: <ListPlus className="h-3 w-3" />, iconClass: 'text-sky-300' },
  { key: 'meeting', label: 'Schedule Meeting', icon: <CalendarClock className="h-3 w-3" />, iconClass: 'text-violet-300' },
  { key: 'outstanding', label: 'Add to Outstanding Items', icon: <ListChecks className="h-3 w-3" />, iconClass: 'text-fuchsia-300' },
  { key: 'summarize', label: 'Summarize this thread', icon: <AlignLeft className="h-3 w-3" />, iconClass: 'text-cyan-300' },
];

interface Props {
  thread: EmailThread;
  dealId?: string | null;
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
  const [summary, setSummary] = useState<string[] | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [summaryDebug, setSummaryDebug] = useState<EmailThreadSummaryDebug | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

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
      {/* Pill row — single horizontally scrollable line. Pills never wrap;
          edge-fade masks hint at additional pills when overflowing. */}
      <div
        className="grid grid-cols-2 gap-1.5"
        role="toolbar"
        aria-label="Email quick actions"
      >
        {actions.map((a) => {
          const isActive = active === a.key;
          return (
            <button
              key={a.key}
              type="button"
              onClick={() => handleClick(a.key)}
              title={a.label}
              aria-pressed={isActive}
              className={cn(
                'inline-flex w-full items-center justify-start gap-1.5 min-h-[32px] px-3 py-1 rounded-lg text-left',
                'text-[11px] font-medium leading-tight',
                'border border-white/10 bg-white/5 backdrop-blur-sm',
                'text-foreground/80 transition-colors',
                'shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.06)]',
                'hover:bg-white/[0.09] hover:text-foreground hover:border-white/15',
                isActive && 'bg-primary/15 border-primary/30 text-primary',
              )}
            >
              <span className={cn('shrink-0', !isActive && a.iconClass)}>{a.icon}</span>
              <span className="truncate">{a.label}</span>
            </button>
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
      {active === 'meeting' && (
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
    </div>
  );
}