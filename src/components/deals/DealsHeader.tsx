import { useState } from 'react';
import { Settings2, LayoutDashboard } from 'lucide-react';

import { HeaderNotificationPreview } from '@/components/notifications/HeaderNotificationPreview';
import { DemoModeBadge } from '@/components/DemoModeBadge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Link, useLocation } from 'react-router-dom';
import { Logo } from '@/components/Logo';
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
  const { pipelineId: naitivePipelineId, stages: naitiveStages, refetch: refetchNaitive } = useNaitivePipelineData();
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [isBriefingOpen, setIsBriefingOpen] = useState(false);
  const [isNikiBriefingOpen, setIsNikiBriefingOpen] = useState(false);
  const isJTurner = user?.email === 'jturner@5thline.co';
  const canSeeNiki = canSeeNikiBriefing(user?.email);
  const isNikiViewingHerself = user?.email?.toLowerCase() === NIKI_EMAIL;

  return (
    <header className="sticky top-0 z-50 rounded-b-xl bg-background/92 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      {/*
        Global app shell header — minimal, calm, and consistent.
        Active tabs use a fully-rounded pill (no top-only / bottom-only
        radius) so corners match the rest of the platform's card system.
      */}
      <div className="relative flex h-[68px] items-center justify-between pl-3 pr-3 sm:pr-6 gap-2 min-w-0">
        <div className="flex items-center gap-2 shrink-0 min-w-0">
          <Link to="/deals" className="flex items-center gap-2 shrink-0">
            <Logo className="h-[60px]" />
          </Link>
          <DemoModeBadge />
        </div>

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
          {!location.pathname.startsWith('/deal/') && (
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
          
        </div>
      </div>
      <HeaderNotificationPreview />
      {isFifthLine && <DashboardModal open={isDashboardOpen} onOpenChange={setIsDashboardOpen} />}
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
