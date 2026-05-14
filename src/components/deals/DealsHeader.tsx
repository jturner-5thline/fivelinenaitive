import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { LayoutDashboard, Calendar, Mail, Inbox, ClipboardList, ListChecks, Newspaper, Sparkles } from 'lucide-react';

import { HeaderNotificationPreview } from '@/components/notifications/HeaderNotificationPreview';
import { DemoModeBadge } from '@/components/DemoModeBadge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { HintTooltip } from '@/components/ui/hint-tooltip';
import { useFirstTimeHints } from '@/hooks/useFirstTimeHints';
import { CreateDealDialog } from './CreateDealDialog';
import { CreateNaitiveDealDialog } from '@/components/naitive-pipeline/CreateNaitiveDealDialog';
import { useNaitivePipelineData } from '@/hooks/useNaitivePipelineData';
import { Plus } from 'lucide-react';
import { usePageAccessFlags } from '@/hooks/useFeatureFlags';
import { useNaitivePipelineAccess } from '@/hooks/useNaitivePipelineAccess';
import { DailyBriefingModal } from '@/components/dashboard/DailyBriefingModal';
import { OverlayLoadingShell } from '@/components/overlays/OverlayLoadingShell';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ActionQueuePanel } from '@/components/ai-queue/ActionQueuePanel';
import { useAiActionQueue } from '@/hooks/useAiActionQueue';
import { useSidebar } from '@/components/ui/sidebar';

// Lazy-loaded overlay modules. Each is code-split so the header itself
// stays cheap and the overlay shell can render an instant skeleton while
// the real component's chunk + data hydrate in the background.
const loadDashboard = () =>
  import('@/components/dashboard/DashboardModal').then((m) => ({ default: m.DashboardModal }));
const loadTasks = () =>
  import('@/components/tasks/TasksOverlay').then((m) => ({ default: m.TasksOverlay }));
const loadCalendar = () =>
  import('@/components/dashboard/FullCalendarView').then((m) => ({ default: m.FullCalendarView }));
const loadMail = () =>
  import('@/components/dashboard/InboxDialog').then((m) => ({ default: m.InboxDialog }));

const DashboardModal = lazy(loadDashboard);
const TasksOverlay = lazy(loadTasks);
const FullCalendarView = lazy(loadCalendar);
const InboxDialog = lazy(loadMail);

const OVERLAY_PREFETCHERS: Record<string, () => Promise<unknown>> = {
  Dashboard: loadDashboard,
  Calendar: loadCalendar,
  Mail: loadMail,
  'Action Queue': loadTasks,
};
import {
  canSeeNikiBriefing,
  NIKI_USER_ID,
  NIKI_ASSIGNEE_NAME,
  NIKI_EMAIL,
} from '@/constants/nikiBriefing';

export function DealsHeader() {
  const location = useLocation();
  const { user } = useAuth();
  // Bind the floating header's horizontal position to the sidebar width
  // so it slides in sync with the sidebar (matching the Ask naitive AI
  // bar's behaviour). When the sidebar collapses to icon-only, the
  // header narrows; when it expands, the header shifts right.
  const { state: sidebarState, isMobile: sidebarIsMobile, isHovering: sidebarIsHovering } = useSidebar();
  // Mirror the math in `src/components/ui/sidebar.tsx`:
  //   expanded → var(--sidebar-width) (14rem)
  //   collapsed (icon) → calc(var(--sidebar-width-icon) + theme(spacing.4)) (3rem + 1rem)
  //   mobile → off-canvas, header spans full viewport
  // Effective width = pinned-open OR hover-expanded, matching the
  // sidebar's own "effectiveState" logic in `src/components/ui/sidebar.tsx`.
  const sidebarEffectivelyExpanded =
    sidebarState === 'expanded' || sidebarIsHovering;
  const headerLeftOffset = sidebarIsMobile
    ? '0px'
    : sidebarEffectivelyExpanded
      ? 'var(--sidebar-width, 14rem)'
      : 'calc(var(--sidebar-width-icon, 3rem) + 1rem)';
  const { isHintVisible, dismissHint } = useFirstTimeHints();
  const { hasPageAccess } = usePageAccessFlags();
  const { hasAccess: isFifthLine } = useNaitivePipelineAccess();
  const isNaitivePipelineRoute = location.pathname.startsWith('/naitive-pipeline');
  // The /deals page now renders its own + New Deal button inline with the
  // page-level action row (Export / Notifications / Activity). Suppress
  // the duplicate header button there so the CTA lives with the other
  // operational controls instead of the top chrome.
  const isDealsRoute = location.pathname === '/deals';
  const { pipelineId: naitivePipelineId, stages: naitiveStages, refetch: refetchNaitive } = useNaitivePipelineData();
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [dashboardInitialTab, setDashboardInitialTab] = useState<'dashboard' | 'analytics'>('dashboard');

  // /analytics now redirects to /deals?dashboard=analytics — when we land
  // here with that param, auto-open the Dashboard modal on the Analytics
  // tab and clean the URL so refreshes don't re-trigger.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(location.search);
    if (params.get('dashboard') === 'analytics') {
      setDashboardInitialTab('analytics');
      setIsDashboardOpen(true);
      params.delete('dashboard');
      const next = `${location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
      window.history.replaceState({}, '', next);
    }
  }, [location.pathname, location.search]);
  const [isTasksOpen, setIsTasksOpen] = useState(false);
  const [isTasksListOpen, setIsTasksListOpen] = useState(false);
  const [isActionQueueOpen, setIsActionQueueOpen] = useState(false);
  const { data: actionQueueItems = [], refetch: refetchActionQueue } = useAiActionQueue();
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isMailOpen, setIsMailOpen] = useState(false);
  const [isDealRundownOpen, setIsDealRundownOpen] = useState(false);
  const [isBriefingOpen, setIsBriefingOpen] = useState(false);
  const [isNikiBriefingOpen, setIsNikiBriefingOpen] = useState(false);
  const isJTurner = user?.email === 'jturner@5thline.co';
  const canSeeNiki = canSeeNikiBriefing(user?.email);
  const isNikiViewingHerself = user?.email?.toLowerCase() === NIKI_EMAIL;
  const briefingUserEmails = ['jturner@5thline.co', 'nheikali@5thline.co'];
  const canSeeBriefingHeaderItems = briefingUserEmails.includes(
    user?.email?.toLowerCase() ?? ''
  );

  // Prefetch overlay chunks in the background on idle so the very first
  // click renders the real component instead of waiting on a network
  // round-trip. Subsequent opens hit the in-memory module cache.
  useEffect(() => {
    const idle =
      (window as unknown as {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      }).requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1200));
    const handle = idle(() => {
      Object.values(OVERLAY_PREFETCHERS).forEach((load) => {
        load().catch(() => {});
      });
    }, { timeout: 2500 });
    return () => {
      const cancel =
        (window as unknown as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback;
      if (cancel) cancel(handle as number);
      else window.clearTimeout(handle as number);
    };
  }, []);

  const prefetchOverlay = useCallback((label: string) => {
    const load = OVERLAY_PREFETCHERS[label];
    if (load) load().catch(() => {});
  }, []);

  // When ANY header-launched overlay is open, hide the floating header
  // chrome (pill bar + notification preview) so the overlay is the only
  // active top-level interface. Overlays themselves remain mounted below.
  const isHeaderOverlayOpen =
    isDashboardOpen ||
    isTasksOpen ||
    isTasksListOpen ||
    isActionQueueOpen ||
    isCalendarOpen ||
    isMailOpen ||
    isDealRundownOpen ||
    isBriefingOpen ||
    isNikiBriefingOpen;

  // Render the fixed header into <body> via a portal. The parent <main>
  // sets a `backdrop-filter`, which makes it the containing block for any
  // descendant `position: fixed` element — so without portaling, the
  // header would be pinned to <main> instead of the viewport and would
  // appear to drift when content scrolls. Portaling guarantees true
  // viewport-fixed positioning on every route.
  return createPortal(
    <header
      className="fixed top-0 right-0 z-[1000] pointer-events-none transition-[left] duration-300 ease-in-out"
      style={{ left: headerLeftOffset }}
      aria-label="Global navigation"
    >
      {/*
        Floating glass command bar. Centered pill, dark + opaque, with
        subtle blur and a soft elevated shadow so it visually detaches
        from the page beneath it. Slightly wider and more opaque than
        the Ask naitive AI bar so it reads as the primary global surface.
      */}
      <div
        className="pt-4 px-2 sm:px-4 pointer-events-none"
        style={{ display: isHeaderOverlayOpen ? 'none' : undefined }}
      >
        <div
          className="floating-header pointer-events-auto mx-auto relative flex h-10 sm:h-11 items-center gap-1 sm:gap-2 px-2 sm:px-4 min-w-0 rounded-2xl overflow-hidden border border-[rgba(126,184,247,0.35)] bg-[rgba(126,184,247,0.12)] text-foreground backdrop-blur-xl shadow-glass hover:bg-[rgba(126,184,247,0.2)] hover:border-[rgba(126,184,247,0.5)] hover:shadow-glass-hover before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(135deg,rgba(126,184,247,0.15)_0%,transparent_50%)]"
          style={{
            // Match the Ask naitive AI bar's default width (432px) so the
            // two surfaces read as one visual family. Stay responsive on
            // narrower viewports so the icon cluster never clips.
            width: 'min(432px, calc(100vw - 16px))',
            borderRadius: 20,
            background:
              'linear-gradient(180deg, rgba(20, 34, 58, 0.72) 0%, rgba(14, 24, 42, 0.66) 100%)',
            backdropFilter: 'blur(20px) saturate(150%)',
            WebkitBackdropFilter: 'blur(20px) saturate(150%)',
            border: '1px solid rgba(120, 170, 255, 0.16)',
            boxShadow:
              '0 10px 28px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
          }}
        >
          <div className="flex items-center shrink-0"><DemoModeBadge /></div>

          {/* Primary quick-access nav — centered absolutely so trailing utilities don't shift it */}
          <nav className="flex items-center gap-0.5 sm:gap-1.5 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            {[
              { label: 'Calendar', Icon: Calendar, isOpen: isCalendarOpen, onClick: () => setIsCalendarOpen(true) },
              { label: 'Mail', Icon: Mail, isOpen: isMailOpen, onClick: () => setIsMailOpen(true) },
              { label: 'Action Queue', Icon: Inbox, isOpen: isActionQueueOpen, onClick: () => { setIsActionQueueOpen(true); refetchActionQueue(); } },
              { label: 'Tasks', Icon: ListChecks, isOpen: isTasksListOpen, onClick: () => setIsTasksListOpen(true) },
              { label: 'Deal Rundown', Icon: ClipboardList, isOpen: isDealRundownOpen, onClick: () => setIsDealRundownOpen(true) },
              ...(isFifthLine
                ? [{ label: 'Dashboard', Icon: LayoutDashboard, isOpen: isDashboardOpen, onClick: () => setIsDashboardOpen(true) }]
                : []),
              ...(canSeeBriefingHeaderItems
                ? [
                    { label: 'Daily Rundown', Icon: Newspaper, isOpen: isBriefingOpen, onClick: () => setIsBriefingOpen(true) },
                    { label: "Niki's Daily Rundown", Icon: Sparkles, isOpen: isNikiBriefingOpen, onClick: () => setIsNikiBriefingOpen(true) },
                  ]
                : []),
            ].map(({ label, Icon, isOpen, onClick }) => (
              <Tooltip key={label}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={label}
                    onClick={onClick}
                    onMouseEnter={() => prefetchOverlay(label)}
                    onFocus={() => prefetchOverlay(label)}
                    className={`inline-flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-full transition-colors ${
                      isOpen
                        ? 'bg-blue-400/15 text-blue-400'
                        : 'text-blue-400/80 hover:text-blue-400 hover:bg-blue-400/10'
                    }`}
                  >
                    <Icon className="h-5 w-5 sm:h-[27px] sm:w-[27px]" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={6} className="z-[1100]">
                  {label}
                </TooltipContent>
              </Tooltip>
            ))}
          </nav>

          <div className="flex items-center gap-1 sm:gap-2 shrink-0 ml-auto">
          {isNaitivePipelineRoute && naitivePipelineId && (
            <HintTooltip
              hint="Start here! Click to create your first deal and begin tracking your pipeline."
              visible={isHintVisible('new-deal-button')}
              onDismiss={() => dismissHint('new-deal-button')}
              side="bottom"
              align="end"
            >
              <CreateNaitiveDealDialog
                pipelineId={naitivePipelineId}
                stages={naitiveStages}
                defaultStage={naitiveStages[0]?.id}
                onCreated={refetchNaitive}
                trigger={
                  <Button size="sm" className="gap-1.5">
                    <Plus className="h-4 w-4" />
                    Add Deal
                  </Button>
                }
              />
            </HintTooltip>
          )}

          </div>
        </div>
      </div>
      {!isHeaderOverlayOpen && (
        <div className="pointer-events-auto"><HeaderNotificationPreview /></div>
      )}
      {isFifthLine && isDashboardOpen && (
        <Suspense fallback={<OverlayLoadingShell kind="dashboard" onClose={() => setIsDashboardOpen(false)} />}>
          <DashboardModal
            open={isDashboardOpen}
            onOpenChange={(o) => {
              setIsDashboardOpen(o);
              if (!o) setDashboardInitialTab('dashboard');
            }}
            initialTab={dashboardInitialTab}
          />
        </Suspense>
      )}
      {isTasksOpen && (
        <Suspense fallback={<OverlayLoadingShell kind="tasks" onClose={() => setIsTasksOpen(false)} />}>
          <TasksOverlay open={isTasksOpen} onOpenChange={setIsTasksOpen} />
        </Suspense>
      )}
      {isTasksListOpen && (
        <Suspense fallback={<OverlayLoadingShell kind="tasks" onClose={() => setIsTasksListOpen(false)} />}>
          <TasksOverlay open={isTasksListOpen} onOpenChange={setIsTasksListOpen} />
        </Suspense>
      )}
      {isDealRundownOpen && (
        <DailyBriefingModal
          open={isDealRundownOpen}
          onOpenChange={setIsDealRundownOpen}
          title="Deal Rundown"
          initialTab="pipeline"
          briefingType="deal_rundown"
        />
      )}
      {isCalendarOpen && (
        <Suspense fallback={<OverlayLoadingShell kind="calendar" onClose={() => setIsCalendarOpen(false)} />}>
          <FullCalendarView open={isCalendarOpen} onOpenChange={setIsCalendarOpen} />
        </Suspense>
      )}
      {isMailOpen && (
        <Suspense fallback={<OverlayLoadingShell kind="mail" onClose={() => setIsMailOpen(false)} />}>
          <InboxDialog open={isMailOpen} onOpenChange={setIsMailOpen} />
        </Suspense>
      )}
      {canSeeBriefingHeaderItems && <DailyBriefingModal open={isBriefingOpen} onOpenChange={setIsBriefingOpen} />}
      {canSeeNiki && (
        <DailyBriefingModal
          open={isNikiBriefingOpen}
          onOpenChange={setIsNikiBriefingOpen}
          title={isNikiViewingHerself ? 'My Daily Rundown' : "Niki's Daily Rundown"}
          targetUserId={NIKI_USER_ID}
          targetAssigneeName={NIKI_ASSIGNEE_NAME}
          excludeTabs={['financial']}
        />
      )}
      <Dialog open={isActionQueueOpen} onOpenChange={setIsActionQueueOpen}>
        <DialogContent className="sm:max-w-[640px] p-0 overflow-hidden flex flex-col max-h-[80vh]">
          <DialogHeader className="sr-only">
            <DialogTitle>Action Queue</DialogTitle>
          </DialogHeader>
          <ActionQueuePanel items={actionQueueItems} onClose={() => setIsActionQueueOpen(false)} />
        </DialogContent>
      </Dialog>
    </header>,
    document.body,
  );
}
