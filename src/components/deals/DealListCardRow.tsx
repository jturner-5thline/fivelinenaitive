import { memo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  MoreHorizontal,
  User,
  Clock,
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
export const DEAL_LIST_GRID =
  'grid grid-cols-[minmax(160px,240px)_112px_158px_minmax(120px,1.4fr)_minmax(0,1fr)] items-center gap-2';

/** Strip HTML/markup from status note text and normalize whitespace. */
function cleanStatusNote(raw?: string): string {
  if (!raw) return '';
  return raw
    .replace(/<\s*(br|\/p|\/li|\/div)\s*\/?\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

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
  /** Latest status note text for this deal. */
  statusNote?: string;
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
  statusNote,
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
        'group flex items-center gap-3 border-b border-border/60 px-2 py-3 cursor-pointer transition-colors hover:bg-muted/30',
        isSelected && 'bg-primary/5',
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
        <div className={DEAL_LIST_GRID}>
          <div className="flex items-center gap-2 min-w-0">
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
          <div className="min-w-0">
            <h3 className="font-semibold truncate text-foreground text-[19.5px] leading-tight">
              {deal.company || 'Untitled deal'}
            </h3>
            <div className="mt-1 flex items-center gap-2 min-w-0">
              <span className="font-semibold tabular-nums text-[17px] leading-tight shrink-0 w-[84px] bg-gradient-to-b from-foreground to-foreground/60 bg-clip-text text-transparent">
                {formatCurrencyValue(deal.value)}
              </span>
              {!compact && (
                <div className="flex items-center gap-1.5 min-w-0">
                <span className="inline-flex w-[70px] shrink-0 justify-start">
                {engagementLabel ? (
                  <Badge
                    variant="outline"
                    className="px-1.5 py-0 text-[8px] leading-[14px] uppercase tracking-wider rounded whitespace-nowrap border-white/10 bg-white/[0.03] text-muted-foreground"
                  >
                    {engagementLabel}
                  </Badge>
                ) : null}
                </span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      {managerInitials ? (
                        <span
                          className="inline-flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded text-[8px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.18),0_1px_2px_rgba(0,0,0,.4)]"
                          style={{ background: 'linear-gradient(135deg, #9b6fd4, #5f3f9e)' }}
                        >
                          {managerInitials}
                        </span>
                      ) : (
                        <User className="h-2.5 w-2.5 text-muted-foreground" />
                      )}
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{deal.manager || 'No manager'}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                </div>
              )}
            </div>
          </div>
          {!compact && lateMilestoneCount > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] rounded-md border-destructive/60 text-destructive shrink-0"
            >
              {lateMilestoneCount} late
            </Badge>
          )}
          </div>
          {!compact && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="justify-self-center w-[104px] [&_button]:w-full [&_button>*]:flex [&_button>*]:w-full [&_button>*]:justify-center [&_button>*]:items-center [&_button>*]:min-h-[26px]"
            >
              <InlineStatusDropdown
                dealId={deal.id}
                status={deal.status}
                onStatusChange={onStatusChange}
                className="text-foreground dark:text-[hsl(240,25%,5%)] whitespace-nowrap"
              />
            </div>
          )}
          {!compact && (
            <div
              className="min-w-0 flex items-center justify-self-center w-[150px] [&_button]:w-full [&_button>*]:flex [&_button>*]:w-full [&_button>*]:justify-center [&_button>*]:items-center [&_button>*]:min-h-[26px]"
              onClick={(e) => e.stopPropagation()}
            >
              <InlineStageDropdown
                dealId={deal.id}
                stage={deal.stage}
                pipelineId={deal.pipelineId}
                onStageChange={
                  onStageChange || ((id, newStage) => updateDeal(id, { stage: newStage }))
                }
              />
            </div>
          )}
          {!compact && (
            <span
              className="min-w-0 w-full text-left text-xs leading-snug text-muted-foreground justify-self-start whitespace-pre-line break-words line-clamp-3"
              title={cleanStatusNote(statusNote) || undefined}
            >
              {cleanStatusNote(statusNote) || '—'}
            </span>
          )}
          {!compact && (
            <span
              className={cn(
                'inline-flex items-center justify-center gap-1 text-xs text-muted-foreground justify-self-center text-center',
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