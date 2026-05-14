import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { LayoutDashboard, Calendar, Mail, Inbox, ClipboardList, Newspaper, Sparkles } from 'lucide-react';

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
  const [isTasksOpen, setIsTasksOpen] = useState(false);
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

  return (
    <header
      className="fixed top-0 left-0 right-0 z-[1000] pointer-events-none"
      aria-label="Global navigation"
    >
      {/*
        Floating glass command bar. Centered pill, dark + opaque, with
        subtle blur and a soft elevated shadow so it visually detaches
        from the page beneath it. Slightly wider and more opaque than
        the Ask naitive AI bar so it reads as the primary global surface.
      */}
      <div className="pt-2 px-2 sm:px-4 pointer-events-none">
        <div
          className="floating-header pointer-events-auto mx-auto relative flex h-10 sm:h-11 items-center gap-1 sm:gap-2 px-2 sm:px-4 min-w-0"
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
              { label: 'Action Queue', Icon: Inbox, isOpen: isTasksOpen, onClick: () => setIsTasksOpen(true) },
              { label: 'Deal Rundown', Icon: ClipboardList, isOpen: isDealRundownOpen, onClick: () => setIsDealRundownOpen(true) },
              ...(isFifthLine
                ? [{ label: 'Dashboard', Icon: LayoutDashboard, isOpen: isDashboardOpen, onClick: () => setIsDashboardOpen(true) }]
                : []),
              ...(canSeeBriefingHeaderItems
                ? [
                    { label: 'Daily Briefing', Icon: Newspaper, isOpen: isBriefingOpen, onClick: () => setIsBriefingOpen(true) },
                    { label: "Niki's Daily Briefing", Icon: Sparkles, isOpen: isNikiBriefingOpen, onClick: () => setIsNikiBriefingOpen(true) },
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
                <TooltipContent>{label}</TooltipContent>
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
      <div className="pointer-events-auto"><HeaderNotificationPreview /></div>
      {isFifthLine && isDashboardOpen && (
        <Suspense fallback={<OverlayLoadingShell kind="dashboard" onClose={() => setIsDashboardOpen(false)} />}>
          <DashboardModal open={isDashboardOpen} onOpenChange={setIsDashboardOpen} />
        </Suspense>
      )}
      {isTasksOpen && (
        <Suspense fallback={<OverlayLoadingShell kind="tasks" onClose={() => setIsTasksOpen(false)} />}>
          <TasksOverlay open={isTasksOpen} onOpenChange={setIsTasksOpen} />
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
          title={isNikiViewingHerself ? 'My Daily Briefing' : "Niki's Daily Briefing"}
          targetUserId={NIKI_USER_ID}
          targetAssigneeName={NIKI_ASSIGNEE_NAME}
          excludeTabs={['financial']}
        />
      )}
    </header>
  );
}
