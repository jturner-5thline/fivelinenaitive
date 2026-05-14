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
import { usePipelineData } from '@/hooks/useDailyBriefingData';
import { useDailyDismissedIds } from '@/hooks/useDailyDismissals';
import { OverlayLoadingShell } from '@/components/overlays/OverlayLoadingShell';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ActionQueuePanel } from '@/components/ai-queue/ActionQueuePanel';
import { useAiActionQueue } from '@/hooks/useAiActionQueue';
import { useSidebar } from '@/components/ui/sidebar';
import { setHeaderOverlayDirection } from '@/lib/headerOverlayNav';

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

  // ─── Daily Rundown completion badges ───────────────────────────────
  // Show a red "1" badge on the Daily Rundown / Niki's Daily Rundown
  // header icons whenever today's rundown has at least one undismissed
  // deal in its deal section. Clears immediately when the user dismisses
  // the last remaining deal (event-driven via useDailyDismissedIds).
  // Both variants share the same dismissal scope (`rundown-deal:daily_briefing`)
  // because both render through DailyBriefingModal with the default type;
  // per-variant incompleteness is determined by each variant's own
  // scopedDeals list (self vs. Niki).
  const dismissedRundownDealIds = useDailyDismissedIds('rundown-deal:daily_briefing');
  const { data: selfRundownData } = usePipelineData(canSeeBriefingHeaderItems);
  const { data: nikiRundownData } = usePipelineData(canSeeNiki, NIKI_ASSIGNEE_NAME);
  const hasIncompleteRundown = (deals: { id: string }[] | undefined) =>
    !!(deals && deals.length > 0 && deals.some(d => !dismissedRundownDealIds.has(d.id)));
  const dailyRundownHasBadge = canSeeBriefingHeaderItems && hasIncompleteRundown(selfRundownData?.scopedDeals as any);
  const nikiRundownHasBadge = canSeeNiki && hasIncompleteRundown(nikiRundownData?.scopedDeals as any);

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

  // ─── Header pop-up swipe navigation ────────────────────────────────
  // Treat the header pop-ups as one ordered sequence so the user can
  // move between adjacent overlays via icon click, Alt+←/→, or a
  // horizontal swipe / two-finger trackpad gesture. Direction comes from
  // the icon's left-to-right index in the visible nav.
  const overlayRegistry = [
    { label: 'Calendar' as const, isOpen: isCalendarOpen, open: () => setIsCalendarOpen(true), close: () => setIsCalendarOpen(false), available: true },
    { label: 'Mail' as const, isOpen: isMailOpen, open: () => setIsMailOpen(true), close: () => setIsMailOpen(false), available: true },
    { label: 'Action Queue' as const, isOpen: isActionQueueOpen, open: () => { setIsActionQueueOpen(true); refetchActionQueue(); }, close: () => setIsActionQueueOpen(false), available: true },
    { label: 'Tasks' as const, isOpen: isTasksListOpen, open: () => setIsTasksListOpen(true), close: () => setIsTasksListOpen(false), available: true },
    { label: 'Deal Rundown' as const, isOpen: isDealRundownOpen, open: () => setIsDealRundownOpen(true), close: () => setIsDealRundownOpen(false), available: true },
    { label: 'Dashboard' as const, isOpen: isDashboardOpen, open: () => setIsDashboardOpen(true), close: () => setIsDashboardOpen(false), available: isFifthLine },
    { label: 'Daily Rundown' as const, isOpen: isBriefingOpen, open: () => setIsBriefingOpen(true), close: () => setIsBriefingOpen(false), available: canSeeBriefingHeaderItems },
    { label: "Niki's Daily Rundown" as const, isOpen: isNikiBriefingOpen, open: () => setIsNikiBriefingOpen(true), close: () => setIsNikiBriefingOpen(false), available: canSeeBriefingHeaderItems },
  ].filter(o => o.available);

  const currentOverlay = overlayRegistry.find(o => o.isOpen) ?? null;

  const goToOverlay = useCallback((target: string) => {
    const fromIdx = currentOverlay
      ? overlayRegistry.findIndex(o => o.label === currentOverlay.label)
      : -1;
    const toIdx = overlayRegistry.findIndex(o => o.label === target);
    if (toIdx < 0) return;
    const to = overlayRegistry[toIdx];
    if (fromIdx < 0) {
      // No overlay open yet — just open the target with no slide.
      to.open();
      return;
    }
    if (fromIdx === toIdx) return;
    const from = overlayRegistry[fromIdx];
    setHeaderOverlayDirection(toIdx > fromIdx ? 'right' : 'left');
    // Close the outgoing overlay first so its close animation runs in
    // the same direction as the incoming open. RAF lets the close state
    // commit before the open does, which keeps Radix's data-state hooks
    // reliable across the swap.
    from.close();
    requestAnimationFrame(() => to.open());
  }, [currentOverlay, overlayRegistry]);

  const goToAdjacentOverlay = useCallback((delta: -1 | 1) => {
    if (!currentOverlay) return;
    const idx = overlayRegistry.findIndex(o => o.label === currentOverlay.label);
    const nextIdx = idx + delta;
    if (nextIdx < 0 || nextIdx >= overlayRegistry.length) return;
    goToOverlay(overlayRegistry[nextIdx].label);
  }, [currentOverlay, overlayRegistry, goToOverlay]);

  // Alt+←/→ keyboard navigation between adjacent header overlays.
  // Bare ←/→ is intentionally NOT bound here so it doesn't conflict with
  // overlays that have their own arrow-key bindings (e.g. Calendar's
  // month navigation).
  useEffect(() => {
    if (!isHeaderOverlayOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const ae = document.activeElement as HTMLElement | null;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
      e.preventDefault();
      goToAdjacentOverlay(e.key === 'ArrowRight' ? 1 : -1);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isHeaderOverlayOpen, goToAdjacentOverlay]);

  // Horizontal swipe / two-finger trackpad swipe on the active overlay.
  // Axis-locked: a vertical-dominant gesture (scroll) never triggers a
  // swap. Threshold is intentionally generous so users don't lose their
  // place mid-scroll.
  useEffect(() => {
    if (!isHeaderOverlayOpen) return;
    let startX = 0;
    let startY = 0;
    let startT = 0;
    let active = false;
    let locked: 'h' | 'v' | null = null;
    const SWIPE_PX = 80;
    const SWIPE_VX = 0.45; // px/ms

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return; // touch / pen only
      const t = e.target as HTMLElement | null;
      if (!t) return;
      // Skip when starting inside an editable element or anything that
      // opted out of the swipe gesture.
      if (t.closest('input, textarea, select, [contenteditable="true"], [data-no-overlay-swipe]')) return;
      // Only react when the gesture starts inside the active dialog.
      if (!t.closest('[role="dialog"]')) return;
      startX = e.clientX;
      startY = e.clientY;
      startT = e.timeStamp;
      active = true;
      locked = null;
    };
    const onMove = (e: PointerEvent) => {
      if (!active) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (locked === null && Math.hypot(dx, dy) > 12) {
        locked = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      }
      if (locked === 'v') active = false;
    };
    const onUp = (e: PointerEvent) => {
      if (!active) return;
      active = false;
      if (locked !== 'h') return;
      const dx = e.clientX - startX;
      const dt = Math.max(1, e.timeStamp - startT);
      const vx = Math.abs(dx) / dt;
      if (Math.abs(dx) < SWIPE_PX && vx < SWIPE_VX) return;
      // Swipe left (dx < 0) → next overlay; swipe right → previous.
      goToAdjacentOverlay(dx < 0 ? 1 : -1);
    };

    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', () => { active = false; }, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
    };
  }, [isHeaderOverlayOpen, goToAdjacentOverlay]);

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
            {(() => {
              const ICONS: Record<string, typeof Calendar> = {
                'Calendar': Calendar,
                'Mail': Mail,
                'Action Queue': Inbox,
                'Tasks': ListChecks,
                'Deal Rundown': ClipboardList,
                'Dashboard': LayoutDashboard,
                'Daily Rundown': Newspaper,
                "Niki's Daily Rundown": Sparkles,
              };
              const BADGES: Record<string, boolean> = {
                'Daily Rundown': dailyRundownHasBadge,
                "Niki's Daily Rundown": nikiRundownHasBadge,
              };
              return overlayRegistry.map(({ label, isOpen }) => ({
                label,
                Icon: ICONS[label],
                isOpen,
                hasBadge: !!BADGES[label],
                // When some overlay is already open, route the click
                // through goToOverlay so the swap animates directionally
                // (and never double-mounts two overlays).
                onClick: () => goToOverlay(label),
              }));
            })().map(({ label, Icon, isOpen, onClick, hasBadge }) => (
              <Tooltip key={label}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={label}
                    onClick={onClick}
                    onMouseEnter={() => prefetchOverlay(label)}
                    onFocus={() => prefetchOverlay(label)}
                    className={`relative inline-flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-full transition-colors ${
                      isOpen
                        ? 'bg-blue-400/15 text-blue-400'
                        : 'text-blue-400/80 hover:text-blue-400 hover:bg-blue-400/10'
                    }`}
                  >
                    <Icon className="h-5 w-5 sm:h-[27px] sm:w-[27px]" />
                    {hasBadge && (
                      <span
                        aria-label={`${label} has 1 incomplete item`}
                        className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold leading-none ring-2 ring-[rgba(14,24,42,0.85)] tabular-nums pointer-events-none"
                      >
                        1
                      </span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={6} className="">
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
      {/*
        Mail popup is kept mounted (controlled by `open`) so the second-and-onwards
        opens are instant — no Suspense/chunk wait, no fresh effect re-runs. The
        OverlayLoadingShell only ever shows on the very first click before the
        chunk has been prefetched (idle / hover). The InboxDialog itself reads
        from the pre-warmed inboxCacheStore so the modal shell + cached messages
        paint immediately, and a silent background refresh happens after open.
      */}
      <Suspense fallback={isMailOpen ? <OverlayLoadingShell kind="mail" onClose={() => setIsMailOpen(false)} /> : null}>
        <InboxDialog open={isMailOpen} onOpenChange={setIsMailOpen} />
      </Suspense>
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
