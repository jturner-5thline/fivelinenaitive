import { memo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  MoreHorizontal,
  User,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Flag,
  Trash2,
  Archive,
  UserPlus,
  Bell,
  ArrowRightLeft,
} from 'lucide-react';
import {
  differenceInMinutes,
  differenceInHours,
  differenceInDays,
  differenceInWeeks,
  isPast,
  isToday,
} from 'date-fns';
import { Deal, DealStatus, STATUS_CONFIG, ENGAGEMENT_TYPE_CONFIG } from '@/types/deal';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { InlineStatusDropdown } from './InlineStatusDropdown';
import { InlineStageDropdown } from './InlineStageDropdown';
import { FlagNoteDialog } from './FlagNoteDialog';
import { MoveToPipelineDialog } from './MoveToPipelineDialog';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useDealsContext } from '@/contexts/DealsContext';
import { useAdminRole } from '@/hooks/useAdminRole';
import { usePipelineContext } from '@/contexts/PipelineContext';
import { DealFlexEngagement } from '@/hooks/useFlexEngagementScores';
import { shouldIgnoreOverlayOriginEvent } from '@/lib/overlayClickSuppression';
import { cn } from '@/lib/utils';

/** Shared column template so the header row in DealsList stays aligned. */
export const DEAL_LIST_GRID = 'grid grid-cols-[minmax(180px,1.3fr)_130px_150px] items-center gap-4';

interface DealListCardRowProps {
  deal: Deal;
  onStatusChange: (dealId: string, newStatus: DealStatus | null) => void;
  onStageChange?: (dealId: string, newStage: string) => void;
  onMarkReviewed?: (dealId: string) => void;
  onToggleFlag?: (dealId: string, isFlagged: boolean, flagNotes?: string) => Promise<void>;
  flexEngagement?: DealFlexEngagement;
  notificationCount?: number;
  isSelected?: boolean;
  onToggleSelect?: (dealId: string) => void;
  /** Hide secondary metadata (fee, hours, dates) when the detail panel is open. */
  compact?: boolean;
}

function DealListCardRowImpl({
  deal,
  onStatusChange,
  onStageChange,
  onMarkReviewed,
  onToggleFlag,
  notificationCount = 0,
  isSelected,
  onToggleSelect,
  compact = false,
}: DealListCardRowProps) {
  const [isFlagDialogOpen, setIsFlagDialogOpen] = useState(false);
  const [activeFlagCount, setActiveFlagCount] = useState<number | null>(null);
  const effectiveFlagCount = activeFlagCount ?? (deal.isFlagged ? 1 : 0);
  const showFlagIndicator = effectiveFlagCount > 0;
  const [isPipelineDialogOpen, setIsPipelineDialogOpen] = useState(false);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { formatCurrencyValue, preferences } = usePreferences();
  const { updateDeal } = useDealsContext();
  const { isAdmin } = useAdminRole();
  const { pipelines } = usePipelineContext();

  const openDealSummary = (dealId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('deal', dealId);
    setSearchParams(next, { replace: false });
  };

  const getTimeAgoData = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const minutes = differenceInMinutes(now, date);
    const hours = differenceInHours(now, date);
    const days = differenceInDays(now, date);
    const weeks = differenceInWeeks(now, date);
    let text: string;
    let tone: 'muted' | 'warning' | 'critical' = 'muted';
    const isStale = days >= preferences.staleDealsDays && deal.status !== 'archived';
    const isCritical = days >= 30;
    if (minutes < 60) text = `${minutes} min ago`;
    else if (hours < 24) text = `${hours} ${hours === 1 ? 'hr' : 'hrs'} ago`;
    else if (days < 7) {
      text = `${days} ${days === 1 ? 'day' : 'days'} ago`;
      if (isStale) tone = 'warning';
    } else if (days <= 30) {
      text = `${weeks} ${weeks === 1 ? 'wk' : 'wks'} ago`;
      if (isStale) tone = isCritical ? 'critical' : 'warning';
    } else {
      text = 'Over 30 days';
      tone = 'critical';
    }
    return { text, tone, isStale, days };
  };

  const timeAgoData = getTimeAgoData(deal.notesUpdatedAt || deal.updatedAt);
  const lateMilestoneCount = (deal.milestones || []).filter(
    (m) => !m.completed && m.dueDate && isPast(new Date(m.dueDate)) && !isToday(new Date(m.dueDate)),
  ).length;

  const managerInitials = deal.manager
    ? deal.manager
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase())
        .join('')
    : '';

  const engagementLabel =
    ENGAGEMENT_TYPE_CONFIG[deal.engagementType]?.label ?? (deal.engagementType || null);

  return (
    <div
      className={cn(
        'deal-glass deal-tile group flex items-center gap-3 p-3 min-h-[68px] cursor-pointer transition-all duration-200 hover:-translate-y-0.5',
        isSelected && 'ring-2 ring-primary',
      )}
      data-deal-open-id={deal.id}
      onClick={(e) => {
        if (shouldIgnoreOverlayOriginEvent(e, e.currentTarget)) return;
        openDealSummary(deal.id);
      }}
    >
      {onToggleSelect && (
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={!!isSelected}
            onCheckedChange={() => onToggleSelect(deal.id)}
            aria-label={`Select ${deal.company}`}
          />
        </div>
      )}

      <div className="flex-1 min-w-0">
        {/* Top row (table columns): name | amount | status */}
        <div className="grid grid-cols-[minmax(0,1fr)_120px_150px] items-center gap-3">
          <div className="flex items-center gap-2 min-w-0">
          {!compact && timeAgoData.isStale && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertTriangle
                    className={cn(
                      'h-4 w-4 shrink-0',
                      timeAgoData.tone === 'critical' ? 'text-destructive' : 'text-warning',
                    )}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Stale deal — no updates for {timeAgoData.days} days</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {!compact && notificationCount > 0 &&
            deal.status !== 'archived' &&
            deal.stage !== 'closed-lost' && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="relative flex items-center shrink-0">
                      <Bell className="h-3.5 w-3.5 text-primary" />
                      <span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                        {notificationCount}
                      </span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      {notificationCount} pending notification
                      {notificationCount > 1 ? 's' : ''}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          {!compact && deal.migratedFromPersonal && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <UserPlus className="h-3.5 w-3.5 text-accent-foreground shrink-0" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Migrated from personal account</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <h3 className="font-medium truncate text-foreground">
            {deal.company || 'Untitled deal'}
          </h3>
          {!compact && lateMilestoneCount > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] rounded-md border-destructive/60 text-destructive shrink-0"
            >
              {lateMilestoneCount} late
            </Badge>
          )}
          </div>
          <span className="font-medium text-foreground tabular-nums text-right">
            {formatCurrencyValue(deal.value)}
          </span>
          {!compact && (
            <div onClick={(e) => e.stopPropagation()} className="justify-self-start">
              <InlineStatusDropdown
                dealId={deal.id}
                status={deal.status}
                onStatusChange={onStatusChange}
                className="text-foreground dark:text-[hsl(240,25%,5%)] whitespace-nowrap"
              />
            </div>
          )}
        </div>

        {/* Bottom row (table columns): stage | manager initials | type · updated */}
        {!compact && (
        <div className="mt-1 grid grid-cols-[minmax(0,1fr)_120px_150px] items-center gap-3 text-sm text-muted-foreground">
          <div className="min-w-0 flex items-center" onClick={(e) => e.stopPropagation()}>
            <InlineStageDropdown
              dealId={deal.id}
              stage={deal.stage}
              pipelineId={deal.pipelineId}
              onStageChange={
                onStageChange || ((id, newStage) => updateDeal(id, { stage: newStage }))
              }
            />
          </div>
          <div className="flex justify-end">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  {managerInitials ? (
                    <span
                      className="inline-flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.18),0_1px_2px_rgba(0,0,0,.4)]"
                      style={{ background: 'linear-gradient(135deg, #9b6fd4, #5f3f9e)' }}
                    >
                      {managerInitials}
                    </span>
                  ) : (
                    <User className="h-3.5 w-3.5" />
                  )}
                </TooltipTrigger>
                <TooltipContent>
                  <p>{deal.manager || 'No manager'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="flex items-center gap-2 min-w-0">
          {engagementLabel && (
            <Badge
              variant="outline"
              className="text-[10px] uppercase tracking-wider rounded-md whitespace-nowrap border-white/10 bg-white/[0.03] text-muted-foreground shrink-0"
            >
              {engagementLabel}
            </Badge>
          )}
          {!compact && (
            <span
              className={cn(
                'inline-flex items-center gap-1 text-xs',
                timeAgoData.tone === 'critical' && 'text-destructive',
                timeAgoData.tone === 'warning' && 'text-warning',
              )}
            >
              <Clock className="h-3 w-3" />
              {timeAgoData.text}
            </span>
          )}
          </div>
        </div>
        )}
      </div>

      {/* Trailing actions */}
      {!compact && (
      <div className="flex items-center gap-1 ml-4 shrink-0" onClick={(e) => e.stopPropagation()}>
        {onToggleFlag && (
          <>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'h-8 w-8 relative',
                      showFlagIndicator
                        ? 'text-destructive'
                        : 'opacity-0 group-hover:opacity-100 transition-opacity',
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsFlagDialogOpen(true);
                    }}
                  >
                    <Flag className={cn('h-4 w-4', showFlagIndicator && 'fill-current')} />
                    {effectiveFlagCount > 1 && (
                      <span className="absolute -top-1 -right-1 h-3.5 min-w-[14px] rounded-full bg-destructive text-destructive-foreground text-[8px] font-bold flex items-center justify-center px-0.5">
                        {effectiveFlagCount}
                      </span>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {showFlagIndicator
                      ? `${effectiveFlagCount} flag${effectiveFlagCount > 1 ? 's' : ''}`
                      : 'Flag for discussion'}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <FlagNoteDialog
              dealId={deal.id}
              dealName={deal.company}
              isOpen={isFlagDialogOpen}
              onClose={() => setIsFlagDialogOpen(false)}
              onFlagCountChange={setActiveFlagCount}
            />
          </>
        )}

        {timeAgoData.isStale && onMarkReviewed && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-success opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMarkReviewed(deal.id);
                  }}
                >
                  <CheckCircle2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Mark as reviewed</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Open deal details"
                onClick={(e) => {
                  e.stopPropagation();
                  openDealSummary(deal.id);
                }}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Open deal details</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <MoveToPipelineDialog
          dealId={deal.id}
          dealName={deal.company}
          currentPipelineId={deal.pipelineId}
          isOpen={isPipelineDialogOpen}
          onClose={() => setIsPipelineDialogOpen(false)}
        />
      </div>
      )}
    </div>
  );
}

export const DealListCardRow = memo(DealListCardRowImpl, (prev, next) => {
  return (
    prev.deal === next.deal &&
    prev.flexEngagement === next.flexEngagement &&
    prev.notificationCount === next.notificationCount &&
    prev.isSelected === next.isSelected &&
    prev.compact === next.compact &&
    prev.onStatusChange === next.onStatusChange &&
    prev.onStageChange === next.onStageChange &&
    prev.onMarkReviewed === next.onMarkReviewed &&
    prev.onToggleFlag === next.onToggleFlag &&
    prev.onToggleSelect === next.onToggleSelect
  );
});