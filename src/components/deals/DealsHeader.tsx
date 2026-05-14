import { useState, lazy, Suspense } from 'react';
import { Settings2, LayoutDashboard, Calendar, Mail, Inbox, Briefcase, CheckSquare } from 'lucide-react';

import { HeaderNotificationPreview } from '@/components/notifications/HeaderNotificationPreview';
import { DemoModeBadge } from '@/components/DemoModeBadge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { HintTooltip } from '@/components/ui/hint-tooltip';
import { useFirstTimeHints } from '@/hooks/useFirstTimeHints';
import { CreateDealDialog } from './CreateDealDialog';
import { CreateNaitiveDealDialog } from '@/components/naitive-pipeline/CreateNaitiveDealDialog';
import { useNaitivePipelineData } from '@/hooks/useNaitivePipelineData';
import { Plus } from 'lucide-react';
import { usePageAccessFlags } from '@/hooks/useFeatureFlags';
import { useNaitivePipelineAccess } from '@/hooks/useNaitivePipelineAccess';
import { DashboardModal } from '@/components/dashboard/DashboardModal';
import { DailyBriefingModal } from '@/components/dashboard/DailyBriefingModal';
import { TasksOverlay } from '@/components/tasks/TasksOverlay';
import { DealsPageOverlay } from '@/components/deals/DealsPageOverlay';
const FullCalendarView = lazy(() =>
  import('@/components/dashboard/FullCalendarView').then((m) => ({ default: m.FullCalendarView }))
);
const InboxDialog = lazy(() =>
  import('@/components/dashboard/InboxDialog').then((m) => ({ default: m.InboxDialog }))
);
import { Newspaper } from 'lucide-react';
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
  const [isDealsOverlayOpen, setIsDealsOverlayOpen] = useState(false);
  const [isBriefingOpen, setIsBriefingOpen] = useState(false);
  const [isNikiBriefingOpen, setIsNikiBriefingOpen] = useState(false);
  const isJTurner = user?.email === 'jturner@5thline.co';
  const canSeeNiki = canSeeNikiBriefing(user?.email);
  const isNikiViewingHerself = user?.email?.toLowerCase() === NIKI_EMAIL;

  return (
    <header
      className="sticky top-0 z-50 pointer-events-none"
      aria-label="Global navigation"
    >
      {/*
        Floating glass command bar. Centered pill, dark + opaque, with
        subtle blur and a soft elevated shadow so it visually detaches
        from the page beneath it. Slightly wider and more opaque than
        the Ask naitive AI bar so it reads as the primary global surface.
      */}
      <div className="pt-2 px-3 sm:px-4 pointer-events-none">
        <div
          className="pointer-events-auto mx-auto relative flex h-11 items-center gap-1 sm:gap-2 px-3 sm:px-4 min-w-0"
          style={{
            width: 'min(560px, calc(100vw - 24px))',
            borderRadius: 22,
            background: 'rgba(16, 21, 34, 0.82)',
            backdropFilter: 'blur(18px) saturate(135%)',
            WebkitBackdropFilter: 'blur(18px) saturate(135%)',
            border: '1px solid rgba(255, 255, 255, 0.10)',
            boxShadow:
              '0 10px 30px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
          }}
        >
          <div className="flex items-center shrink-0"><DemoModeBadge /></div>

          {/* Primary quick-access nav — centered absolutely so trailing utilities don't shift it */}
          <nav className="hidden md:flex items-center gap-1.5 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            {[
              { label: 'Calendar', Icon: Calendar, isOpen: isCalendarOpen, onClick: () => setIsCalendarOpen(true) },
              { label: 'Mail', Icon: Mail, isOpen: isMailOpen, onClick: () => setIsMailOpen(true) },
              { label: 'Action Queue', Icon: Inbox, isOpen: isTasksOpen, onClick: () => setIsTasksOpen(true) },
              { label: 'Deals', Icon: Briefcase, isOpen: isDealsOverlayOpen, onClick: () => setIsDealsOverlayOpen(true) },
            ].map(({ label, Icon, isOpen, onClick }) => (
              <Tooltip key={label}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={label}
                    onClick={onClick}
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
                      isOpen
                        ? 'bg-blue-400/15 text-blue-400'
                        : 'text-blue-400/80 hover:text-blue-400 hover:bg-blue-400/10'
                    }`}
                  >
                    <Icon className="h-[27px] w-[27px]" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{label}</TooltipContent>
              </Tooltip>
            ))}
          </nav>

          <div className="flex items-center gap-1 sm:gap-2 shrink-0 ml-auto">
          {isFifthLine && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Open dashboard"
                  onClick={() => setIsDashboardOpen(true)}
                >
                  <LayoutDashboard className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Dashboard</TooltipContent>
            </Tooltip>
          )}
          {!location.pathname.startsWith('/deal/') && !isDealsRoute && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => window.dispatchEvent(new Event('toggle-widgets-edit-mode'))}
                >
                  <Settings2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Customize widgets</TooltipContent>
            </Tooltip>
          )}
          {!isDealsRoute && (
          <HintTooltip
            hint="Start here! Click to create your first deal and begin tracking your pipeline."
            visible={isHintVisible('new-deal-button')}
            onDismiss={() => dismissHint('new-deal-button')}
            side="bottom"
            align="end"
          >
            {isNaitivePipelineRoute && naitivePipelineId ? (
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
            ) : (
              <CreateDealDialog />
            )}
          </HintTooltip>
          )}

          </div>
        </div>
      </div>
      <div className="pointer-events-auto"><HeaderNotificationPreview /></div>
      {isFifthLine && <DashboardModal open={isDashboardOpen} onOpenChange={setIsDashboardOpen} />}
      <TasksOverlay open={isTasksOpen} onOpenChange={setIsTasksOpen} />
      {isJTurner && <DailyBriefingModal open={isBriefingOpen} onOpenChange={setIsBriefingOpen} />}
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
