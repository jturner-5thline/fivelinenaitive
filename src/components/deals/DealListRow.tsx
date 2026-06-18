import { useState, ReactNode, useCallback, memo } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { MoreHorizontal, User, Clock, AlertTriangle, CheckCircle2, Flag, Trash2, Archive, UserPlus, Bell, ArrowRightLeft } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { differenceInMinutes, differenceInHours, differenceInDays, differenceInWeeks } from 'date-fns';
import { Deal, DealStatus, STATUS_CONFIG, STAGE_CONFIG, ENGAGEMENT_TYPE_CONFIG } from '@/types/deal';
import { InlineStatusDropdown } from './InlineStatusDropdown';
import { InlineStageDropdown } from './InlineStageDropdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useDealsContext } from '@/contexts/DealsContext';
import { useDealTypes } from '@/contexts/DealTypesContext';
import { usePipelineStageConfig } from '@/hooks/usePipelineStageConfig';
import { useAdminRole } from '@/hooks/useAdminRole';
import { DealFlexEngagement } from '@/hooks/useFlexEngagementScores';
import { TableCell, TableRow } from '@/components/ui/table';
import { FlagNoteDialog } from './FlagNoteDialog';
import { MoveToPipelineDialog } from './MoveToPipelineDialog';
import { DealListColumnId, DEFAULT_VISIBLE_COLUMNS } from '@/hooks/useDealListColumnOrder';
import { isPast, isToday } from 'date-fns';
import { usePipelineContext } from '@/contexts/PipelineContext';
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
import { shouldIgnoreOverlayOriginEvent } from '@/lib/overlayClickSuppression';

interface DealListRowProps {
  deal: Deal;
  onStatusChange: (dealId: string, newStatus: DealStatus | null) => void;
  onStageChange?: (dealId: string, newStage: string) => void;
  onMarkReviewed?: (dealId: string) => void;
  onToggleFlag?: (dealId: string, isFlagged: boolean, flagNotes?: string) => Promise<void>;
  flexEngagement?: DealFlexEngagement;
  columnOrder?: DealListColumnId[];
  notificationCount?: number;
  isSelected?: boolean;
  onToggleSelect?: (dealId: string) => void;
}

function DealListRowImpl({ deal, onStatusChange, onStageChange, onMarkReviewed, onToggleFlag, flexEngagement, columnOrder = DEFAULT_VISIBLE_COLUMNS, notificationCount = 0, isSelected, onToggleSelect }: DealListRowProps) {
  const [isFlagDialogOpen, setIsFlagDialogOpen] = useState(false);
  // See DealCard: active flag notes are the source of truth once loaded.
  // Legacy `deal.isFlagged` is only a pre-load seed.
  const [activeFlagCount, setActiveFlagCount] = useState<number | null>(null);
  const effectiveFlagCount = activeFlagCount ?? (deal.isFlagged ? 1 : 0);
  const showFlagIndicator = effectiveFlagCount > 0;
  const displayFlagCount = effectiveFlagCount;
  const [isPipelineDialogOpen, setIsPipelineDialogOpen] = useState(false);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // Open the canonical deal summary used by the Deal Rundown widget —
  // /deals?deal=<id> renders <NaitiveDealOverlay /> from the Deals page.
  // Routing to /deal/<id> would land on the standalone detail variant, which
  // is intentionally avoided so both surfaces share one summary experience.
  const openDealSummary = (dealId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('deal', dealId);
    setSearchParams(next, { replace: false });
  };
  const { formatCurrencyValue, preferences } = usePreferences();
  const { updateDeal } = useDealsContext();
  const { dealTypes } = useDealTypes();
  const { isAdmin } = useAdminRole();
  const { pipelines } = usePipelineContext();
  const { getStageConfigForDeal } = usePipelineStageConfig();
  
  const statusConfig = STATUS_CONFIG[deal.status as DealStatus] || { label: deal.status, dotColor: 'bg-muted', badgeColor: 'bg-muted' };
  const stageConfig = getStageConfigForDeal(deal.stage, deal.pipelineId);

  const getDealTypeLabels = () => {
    if (!deal.dealTypes || deal.dealTypes.length === 0) return [];
    return deal.dealTypes
      .map(id => dealTypes.find(dt => dt.id === id)?.label)
      .filter(Boolean);
  };

  const dealTypeLabels = getDealTypeLabels();

  const getTimeAgoData = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    
    const minutes = differenceInMinutes(now, date);
    const hours = differenceInHours(now, date);
    const days = differenceInDays(now, date);
    const weeks = differenceInWeeks(now, date);
    
    let text: string;
    let highlightClass = '';
    const isStale = days >= preferences.staleDealsDays && deal.status !== 'archived';
    const isCritical = days >= 30;
    
    if (minutes < 60) {
      text = `${minutes} Min. Ago`;
    } else if (hours < 24) {
      text = `${hours} ${hours === 1 ? 'Hour' : 'Hours'} Ago`;
    } else if (days < 7) {
      text = `${days} ${days === 1 ? 'Day' : 'Days'} Ago`;
      if (isStale) {
        highlightClass = 'bg-warning/20 px-1.5 py-0.5 rounded text-warning';
      }
    } else if (days <= 30) {
      text = `${weeks} ${weeks === 1 ? 'Week' : 'Weeks'} Ago`;
      if (isStale) {
        highlightClass = isCritical ? 'bg-destructive/20 px-1.5 py-0.5 rounded text-destructive' : 'bg-warning/20 px-1.5 py-0.5 rounded text-warning';
      }
    } else {
      text = 'Over 30 Days';
      highlightClass = 'bg-destructive/20 px-1.5 py-0.5 rounded text-destructive';
    }
    
    return { text, highlightClass, isStale, days };
  };

  const timeAgoData = getTimeAgoData(deal.updatedAt);

  // Column cell renderers
  const columnCells: Record<DealListColumnId, ReactNode> = {
    company: (
      <TableCell key="company" className="font-medium">
        <div className="flex items-center gap-2">
          {timeAgoData.isStale && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertTriangle className={`h-4 w-4 shrink-0 ${timeAgoData.days >= 30 ? 'text-destructive' : 'text-warning'}`} />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Stale deal - no updates for {timeAgoData.days} days</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <span className="truncate max-w-[200px] text-foreground font-semibold">
            {deal.company}
          </span>
          {notificationCount > 0 && deal.status !== 'archived' && deal.stage !== 'closed-lost' && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="relative flex items-center">
                    <Bell className="h-3.5 w-3.5 text-primary" />
                    <span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                      {notificationCount}
                    </span>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{notificationCount} pending notification{notificationCount > 1 ? 's' : ''}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {deal.migratedFromPersonal && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <UserPlus className="h-3.5 w-3.5 text-accent-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Migrated from personal account</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </TableCell>
    ),
    value: (
      <TableCell key="value" className="text-center tabular-nums">
        <span className="font-semibold text-foreground">
          {formatCurrencyValue(deal.value)}
        </span>
      </TableCell>
    ),
    status: (
      <TableCell key="status" className="text-center">
        <InlineStatusDropdown
          dealId={deal.id}
          status={deal.status}
          onStatusChange={onStatusChange}
          className="text-foreground dark:text-[hsl(240,25%,5%)] whitespace-nowrap"
        />
      </TableCell>
    ),
    stage: (
      <TableCell key="stage" className="text-center">
        <InlineStageDropdown
          dealId={deal.id}
          stage={deal.stage}
          pipelineId={deal.pipelineId}
          onStageChange={onStageChange || ((id, newStage) => updateDeal(id, { stage: newStage }))}
        />
      </TableCell>
    ),
    manager: (
      <TableCell key="manager">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <User className="h-3.5 w-3.5" />
          <span className="truncate max-w-[100px]">{deal.manager || 'No manager'}</span>
        </div>
      </TableCell>
    ),
    type: (
      <TableCell key="type" className="text-center">
        <Badge variant="secondary" className="text-xs rounded-lg whitespace-nowrap">
          {ENGAGEMENT_TYPE_CONFIG[deal.engagementType]?.label ?? (deal.engagementType || '—')}
        </Badge>
      </TableCell>
    ),
    dealType: (
      <TableCell key="dealType">
        <div className="flex flex-nowrap gap-1 overflow-hidden">
          {dealTypeLabels.length > 0 ? (
            <>
              {dealTypeLabels.slice(0, 1).map((label, index) => (
                <Badge key={index} variant="outline" className="text-xs rounded-lg">
                  {label}
                </Badge>
              ))}
              {dealTypeLabels.length > 1 && (
                <Badge variant="outline" className="text-xs rounded-lg">
                  +{dealTypeLabels.length - 1}
                </Badge>
              )}
            </>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </div>
      </TableCell>
    ),
    totalFee: (
      <TableCell key="totalFee" className="text-center tabular-nums">
        <span className="text-sm font-medium text-foreground">
          {deal.totalFee ? `$${deal.totalFee.toLocaleString()}` : '—'}
        </span>
      </TableCell>
    ),
    totalHours: (() => {
      const total = (deal.preSigningHours || 0) + (deal.postSigningHours || 0);
      return (
        <TableCell key="totalHours">
          <span className="text-sm text-foreground">{total > 0 ? total : '—'}</span>
        </TableCell>
      );
    })(),
    revenuePerHour: (() => {
      const totalHours = (deal.preSigningHours || 0) + (deal.postSigningHours || 0);
      const rpm = totalHours > 0 && deal.totalFee ? deal.totalFee / totalHours : null;
      return (
        <TableCell key="revenuePerHour">
          <span className="text-sm text-foreground">{rpm !== null ? `$${Math.round(rpm).toLocaleString()}` : '—'}</span>
        </TableCell>
      );
    })(),
    lateMilestones: (() => {
      const late = (deal.milestones || []).filter(m => !m.completed && m.dueDate && isPast(new Date(m.dueDate)) && !isToday(new Date(m.dueDate)));
      return (
        <TableCell key="lateMilestones">
          {late.length > 0 ? (
            <Badge variant="outline" className="text-xs rounded-lg border-destructive text-destructive">
              {late.length} late
            </Badge>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </TableCell>
      );
    })(),
    updated: (
      <TableCell key="updated">
        <div className={`flex items-center gap-1.5 text-xs text-muted-foreground ${timeAgoData.highlightClass}`}>
          <Clock className="h-3 w-3" />
          <span>{timeAgoData.text}</span>
        </div>
      </TableCell>
    ),
  };

  return (
    <TableRow 
      className={`group cursor-pointer rounded-md shadow-[inset_0_0_0_1px_rgba(59,130,246,0.25)] bg-transparent hover:shadow-[inset_0_0_0_1px_hsl(292,46%,72%,0.6)] transition-colors duration-200 h-14 [&>td]:py-0 [&>td]:align-middle [&>td]:whitespace-nowrap ${timeAgoData.isStale ? 'bg-warning/5' : ''} ${isSelected ? 'bg-primary/10 shadow-[inset_0_0_0_1px_hsl(272,100%,70%,0.5)]' : ''} [&>td:first-child]:rounded-l-md [&>td:last-child]:rounded-r-md`}
      data-deal-open-id={deal.id}
      onClick={(e) => {
        if (shouldIgnoreOverlayOriginEvent(e, e.currentTarget)) return;
        openDealSummary(deal.id);
      }}
    >
      {onToggleSelect && (
        <TableCell className="w-[40px] px-2" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelect(deal.id)}
          />
        </TableCell>
      )}
      {columnOrder.map(colId => columnCells[colId])}

      {/* Actions - always last */}
      <TableCell>
        <div className="flex items-center gap-1">
          {onToggleFlag && (
            <>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-7 w-7 relative ${showFlagIndicator ? 'text-destructive' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsFlagDialogOpen(true);
                      }}
                    >
                      <Flag className={`h-3.5 w-3.5 ${showFlagIndicator ? 'fill-current' : ''}`} />
                      {displayFlagCount > 1 && (
                        <span className="absolute -top-1 -right-1 h-3.5 min-w-[14px] rounded-full bg-destructive text-destructive-foreground text-[8px] font-bold flex items-center justify-center px-0.5">
                          {displayFlagCount}
                        </span>
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{showFlagIndicator ? `${displayFlagCount} flag${displayFlagCount > 1 ? 's' : ''}` : 'Flag for discussion'}</p>
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
                    className="h-7 w-7 text-success opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMarkReviewed(deal.id);
                    }}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Mark as reviewed</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Change Status</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {Object.entries(STATUS_CONFIG).map(([key, { label, dotColor }]) => (
                <DropdownMenuItem
                  key={key}
                  onClick={(e) => {
                    e.stopPropagation();
                    onStatusChange(deal.id, key as DealStatus);
                  }}
                  className={`flex items-center gap-2 ${deal.status === key ? 'bg-muted' : ''}`}
                >
                  <span className={`h-2 w-2 rounded-full ${dotColor}`} />
                  {label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              {pipelines.length > 1 && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsPipelineDialogOpen(true);
                  }}
                >
                  <ArrowRightLeft className="h-4 w-4 mr-2" />
                  Move to Pipeline
                </DropdownMenuItem>
              )}
              {deal.status !== 'archived' && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onStatusChange(deal.id, 'archived');
                  }}
                >
                  <Archive className="h-4 w-4 mr-2" />
                  Archive
                </DropdownMenuItem>
              )}
              {isAdmin && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/deal/${deal.id}?action=delete`);
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <MoveToPipelineDialog
            dealId={deal.id}
            dealName={deal.company}
            currentPipelineId={deal.pipelineId}
            isOpen={isPipelineDialogOpen}
            onClose={() => setIsPipelineDialogOpen(false)}
          />
        </div>
      </TableCell>
    </TableRow>
  );
}

/**
 * Memoized export — same rationale as DealCard. Without this every keystroke
 * in the toolbar search re-renders every row in the deals list.
 */
export const DealListRow = memo(DealListRowImpl, (prev, next) => {
  return (
    prev.deal === next.deal &&
    prev.flexEngagement === next.flexEngagement &&
    prev.notificationCount === next.notificationCount &&
    prev.columnOrder === next.columnOrder &&
    prev.isSelected === next.isSelected
  );
});
