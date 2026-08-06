import { forwardRef, lazy, Suspense, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import {
  FolderUp,
  Building2,
  Sparkles as SparklesIcon,
  ListPlus,
  CalendarClock,
  ListChecks,
  ChevronDown,
  Pencil,
  CircleDot,
  Banknote,
  UserCog,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { logUpdateLenderRefused } from '@/lib/aiAssistRefusalLogger';
import { CreateTaskInlineCard } from './CreateTaskInlineCard';
import { UpdateLenderStatusInlineCard } from './UpdateLenderStatusInlineCard';
import { UpdateDealStatusInlineCard } from './UpdateDealStatusInlineCard';
import { SuggestedDealUpdatesSection } from './SuggestedDealUpdatesSection';
import { ContactFieldSuggestions } from '@/components/contacts/ContactFieldSuggestions';
import { AddOutstandingItemsInlineCard } from './AddOutstandingItemsInlineCard';
import { SuggestTimesPanel } from './SuggestTimesPanel';
import { AIAssistOverlay } from './AIAssistOverlay';
import type { EmailThread } from './mockEmailData';
import { useQueryClient } from '@tanstack/react-query';
import { prefetchFreeBusy, useSelfEmail } from '@/hooks/useFreeBusyCache';

const LazySaveToDealCard = lazy(() => import('./SaveToDealCard').then((m) => ({ default: m.SaveToDealCard })));

type QuickActionKey =
  | 'save_dr'
  | 'update'
  | 'update_crm'
  | 'update_lender'
  | 'update_status'
  | 'update_fields'
  | 'update_contact'
  | 'draft'
  | 'task'
  | 'meeting'
  | 'outstanding';

interface ActionDef {
  key: QuickActionKey;
  label: string;
  icon: ReactNode;
  /** Optional accent color class for the icon. */
  iconClass?: string;
}

const ALL_ACTIONS: ActionDef[] = [
  { key: 'save_dr', label: 'Save to Data Room', icon: <FolderUp className="h-4 w-4" />, iconClass: 'text-amber-300' },
  { key: 'update', label: 'Update Deal', icon: <Pencil className="h-4 w-4" />, iconClass: 'text-emerald-300' },
  { key: 'update_crm', label: 'Update CRM', icon: <UserCog className="h-4 w-4" />, iconClass: 'text-fuchsia-300' },
  { key: 'draft', label: 'Draft Reply', icon: <SparklesIcon className="h-4 w-4" />, iconClass: 'text-primary' },
  { key: 'task', label: 'Create Task', icon: <ListPlus className="h-4 w-4" />, iconClass: 'text-sky-300' },
  { key: 'meeting', label: 'Schedule Meeting', icon: <CalendarClock className="h-4 w-4" />, iconClass: 'text-violet-300' },
  { key: 'outstanding', label: 'Add to Outstanding Items', icon: <ListChecks className="h-4 w-4" />, iconClass: 'text-fuchsia-300' },
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

  // Pre-warm the user's freebusy cache as soon as the toolbar mounts so
  // clicking Suggest Times renders slots from cache instantly.
  const qc = useQueryClient();
  const selfEmail = useSelfEmail();
  useEffect(() => {
    if (selfEmail) void prefetchFreeBusy(qc, selfEmail);
  }, [qc, selfEmail, thread?.threadId]);

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

  // Schedule Meeting now consolidates with Suggest Times — clicking the
  // pill opens the SuggestTimesPanel overlay directly. The legacy
  // QuickBook popover and inline MeetingSchedulerCard paths have been
  // retired in favor of the single Suggest Times surface.
  const handleMeetingClick = () => {
    setActive((prev) => (prev === 'meeting' ? null : 'meeting'));
  };

  const handleClick = (key: QuickActionKey) => {
    if (key === 'draft') {
      // Draft Reply expands the existing Draft Reply module (panel-level
      // state). The toolbar pill itself doesn't render an inline panel.
      onOpenDraft();
      setActive(null);
      return;
    }
    if (key === 'update_crm') {
      if (!contactId) return;
      setActive((prev) => (prev === 'update_contact' ? null : 'update_contact'));
      return;
    }
    if (key === 'meeting') {
      handleMeetingClick();
      return;
    }
    setActive((prev) => (prev === key ? null : key));
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
          if (a.key === 'update') {
            const hasDeal = !!(dealId || fallbackDealId);
            const dealLabel = dealName || fallbackDealName || 'deal';
            const isUpdateActive = active === 'update_lender'
              || active === 'update_status'
              || active === 'update_fields';
            return (
              <DropdownMenu key={a.key}>
                <DropdownMenuTrigger asChild>
                  <AIAssistActionButton
                    label={a.label}
                    icon={
                      <span className="inline-flex items-center gap-1">
                        {a.icon}
                        <ChevronDown className="h-3 w-3 opacity-70" aria-hidden />
                      </span>
                    }
                    iconClass={a.iconClass}
                    isActive={isUpdateActive}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuItem
                    onSelect={() => {
                      if (!hasDeal) {
                        void logUpdateLenderRefused({
                          reason: 'no_deal_match',
                          threadId: thread.threadId,
                          contactId: contactId ?? null,
                        });
                      }
                      setActive('update_lender');
                    }}
                  >
                    <Building2 className="h-4 w-4 text-emerald-300 mr-2" />
                    Update Lender in {dealLabel}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => setActive('update_status')}
                  >
                    <CircleDot className="h-4 w-4 text-amber-300 mr-2" />
                    Update {dealLabel} status / stage
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => setActive('update_fields')}
                  >
                    <Banknote className="h-4 w-4 text-sky-300 mr-2" />
                    Update {dealLabel} fields
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            );
          }
          if (a.key === 'update_crm') {
            return (
              <AIAssistActionButton
                key={a.key}
                label={a.label}
                icon={a.icon}
                iconClass={a.iconClass}
                isActive={active === 'update_contact'}
                disabled={!contactId}
                onClick={() => handleClick(a.key)}
              />
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

      {/* In-scope action panels render as overlays on top of the rail.
          Only one is open at a time (controlled by `active`). The action
          buttons above remain mounted so re-opening is instant. The
          "meeting" tile keeps its existing inline / modal behavior and is
          intentionally NOT wrapped in AIAssistOverlay. */}
      <AIAssistOverlay open={active === 'save_dr'} onClose={() => setActive(null)} title="Save to Data Room">
        {active === 'save_dr' && (
          <Suspense fallback={null}>
            <LazySaveToDealCard
              thread={thread}
              attachments={attachments}
              messageId={latestMessageId}
              matchedDealId={dealId}
              matchedDealName={dealName}
              fallbackDealId={fallbackDealId}
              fallbackDealName={fallbackDealName}
            />
          </Suspense>
        )}
      </AIAssistOverlay>
      <AIAssistOverlay open={active === 'update_lender'} onClose={() => setActive(null)} title="Update Lender Stage">
        {active === 'update_lender' && (
          <UpdateLenderStatusInlineCard
            dealId={dealId || fallbackDealId}
            preselectLenderName={likelyLenderName}
            emailContext={{
              subject: thread.subject,
              messages: (thread.emails || []).slice(-6).map((m: any) => ({
                from: m?.from_name ? `${m.from_name} <${m.from_email || ''}>` : (m?.from_email || ''),
                at: m?.received_at || null,
                text: m?.body_text || m?.body_preview || m?.snippet || '',
              })),
            }}
            onClose={() => setActive(null)}
          />
        )}
      </AIAssistOverlay>
      <AIAssistOverlay open={active === 'update_status'} onClose={() => setActive(null)} title="Update Deal Status / Stage">
        {active === 'update_status' && (
          <UpdateDealStatusInlineCard
            dealId={dealId || fallbackDealId}
            onClose={() => setActive(null)}
          />
        )}
      </AIAssistOverlay>
      <AIAssistOverlay open={active === 'update_fields'} onClose={() => setActive(null)} title="Update Deal Fields">
        {active === 'update_fields' && (
          <UpdateDealFieldsOverlayBody
            dealId={dealId || fallbackDealId || null}
            dealName={dealName || fallbackDealName || null}
            threadId={thread.threadId}
          />
        )}
      </AIAssistOverlay>
      <AIAssistOverlay open={active === 'update_contact'} onClose={() => setActive(null)} title="Update CRM Contact / Company">
        {active === 'update_contact' && (
          contactId ? (
            <ContactFieldSuggestions contactId={contactId} />
          ) : (
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">
                No CRM contact linked to this sender yet.
              </p>
            </div>
          )
        )}
      </AIAssistOverlay>
      <AIAssistOverlay open={active === 'task'} onClose={() => setActive(null)} title="Create Task">
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
      </AIAssistOverlay>
      <AIAssistOverlay open={active === 'outstanding'} onClose={() => setActive(null)} title="Add to Outstanding Items">
        {active === 'outstanding' && (
          <AddOutstandingItemsInlineCard
            dealId={dealId || fallbackDealId}
            dealName={dealName || fallbackDealName}
            thread={thread}
            preselectLenderName={likelyLenderName}
            onClose={() => setActive(null)}
          />
        )}
      </AIAssistOverlay>
      <AIAssistOverlay open={active === 'meeting'} onClose={() => setActive(null)} title="Schedule Meeting" hideClose>
        {active === 'meeting' && (
          <SuggestTimesPanel
            threadId={thread.threadId}
            subject={thread.subject}
            recipientEmail={thread.latestEmail?.from_email || null}
            recipientName={thread.latestEmail?.from_name || null}
            dealId={dealId || fallbackDealId || null}
            onInsertDraft={(body) => onInsertDraft(body)}
            onClose={() => setActive(null)}
          />
        )}
      </AIAssistOverlay>
    </div>
  );
}

/**
 * Small wrapper used by the "Update Deal Fields" overlay. Renders the
 * existing SuggestedDealUpdatesSection (which only paints when there is at
 * least one pending suggestion) plus a quiet empty state so the overlay
 * never looks blank.
 */
function UpdateDealFieldsOverlayBody({
  dealId,
  dealName,
  threadId,
}: {
  dealId: string | null;
  dealName: string | null;
  threadId: string;
}) {
  if (!dealId) {
    return (
      <div className="rounded-xl border border-border bg-card p-3">
        <p className="text-xs text-muted-foreground">Link a deal first to see suggested updates.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <SuggestedDealUpdatesSection dealId={dealId} dealName={dealName || ''} threadId={threadId} />
      <p className="text-[11px] text-muted-foreground/70">
        AI surfaces deal field updates detected in this email thread. If nothing appears, no actionable updates were found.
      </p>
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