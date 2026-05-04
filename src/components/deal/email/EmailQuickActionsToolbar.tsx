import { useEffect, useState, type ReactNode } from 'react';
import {
  FolderUp,
  Building2,
  Sparkles as SparklesIcon,
  ListPlus,
  CalendarClock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CreateTaskInlineCard } from './CreateTaskInlineCard';
import { SaveToDealCard } from './SaveToDealCard';
import { MeetingSchedulerCard } from './MeetingSchedulerCard';
import { UpdateLenderStatusInlineCard } from './UpdateLenderStatusInlineCard';
import type { EmailThread } from './mockEmailData';
import type { DealAttachmentCategory } from '@/hooks/useDealAttachments';

type QuickActionKey = 'save_dr' | 'lender' | 'draft' | 'task' | 'meeting';

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
    setActive((prev) => (prev === key ? null : key));
  };

  return (
    <div className="space-y-2">
      {/* Pill row — single horizontally scrollable line. Pills never wrap;
          edge-fade masks hint at additional pills when overflowing. */}
      <div
        className="flex flex-nowrap items-center gap-1.5 overflow-x-auto overflow-y-hidden -mx-0.5 px-0.5 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{
          WebkitMaskImage:
            'linear-gradient(to right, transparent 0, black 12px, black calc(100% - 12px), transparent 100%)',
          maskImage:
            'linear-gradient(to right, transparent 0, black 12px, black calc(100% - 12px), transparent 100%)',
        }}
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
                'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full shrink-0 whitespace-nowrap',
                'text-[11px] font-medium leading-none',
                'border border-white/10 bg-white/5 backdrop-blur-sm',
                'text-foreground/80 transition-colors',
                'shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.06)]',
                'hover:bg-white/[0.09] hover:text-foreground hover:border-white/15',
                isActive && 'bg-primary/15 border-primary/30 text-primary',
              )}
            >
              <span className={cn(!isActive && a.iconClass)}>{a.icon}</span>
              <span>{a.label}</span>
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
          onInsert={(text) => onInsertDraft(text)}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}