import { useState, ReactNode } from 'react';
import { MoreHorizontal, User, Clock, AlertTriangle, CheckCircle2, Flag, Trash2, Archive, UserPlus, Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { differenceInMinutes, differenceInHours, differenceInDays, differenceInWeeks } from 'date-fns';
import { Deal, DealStatus, STATUS_CONFIG, STAGE_CONFIG, ENGAGEMENT_TYPE_CONFIG } from '@/types/deal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useDealTypes } from '@/contexts/DealTypesContext';
import { useDealStages } from '@/contexts/DealStagesContext';
import { useAdminRole } from '@/hooks/useAdminRole';
import { DealFlexEngagement } from '@/hooks/useFlexEngagementScores';
import { TableCell, TableRow } from '@/components/ui/table';
import { FlagNoteDialog } from './FlagNoteDialog';
import { DealListColumnId, DEFAULT_VISIBLE_COLUMNS } from '@/hooks/useDealListColumnOrder';
import { isPast, isToday } from 'date-fns';
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

interface DealListRowProps {
  deal: Deal;
  onStatusChange: (dealId: string, newStatus: DealStatus) => void;
  onMarkReviewed?: (dealId: string) => void;
  onToggleFlag?: (dealId: string, isFlagged: boolean, flagNotes?: string) => Promise<void>;
  flexEngagement?: DealFlexEngagement;
  columnOrder?: DealListColumnId[];
  notificationCount?: number;
}

export function DealListRow({ deal, onStatusChange, onMarkReviewed, onToggleFlag, flexEngagement, columnOrder = DEFAULT_VISIBLE_COLUMNS, notificationCount = 0 }: DealListRowProps) {
  const [isFlagDialogOpen, setIsFlagDialogOpen] = useState(false);
  const navigate = useNavigate();
  const { formatCurrencyValue, preferences } = usePreferences();
  const { dealTypes } = useDealTypes();
  const { getStageConfig } = useDealStages();
  const { isAdmin } = useAdminRole();
  const dynamicStageConfig = getStageConfig();
  
  const statusConfig = STATUS_CONFIG[deal.status] || { label: deal.status, dotColor: 'bg-muted', badgeColor: 'bg-muted' };
  const stageConfig = dynamicStageConfig[deal.stage] || STAGE_CONFIG[deal.stage] || { label: deal.stage, color: 'bg-muted' };

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
          {notificationCount > 0 && (
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
      <TableCell key="value">
        <span className="font-semibold text-foreground">
          {formatCurrencyValue(deal.value)}
        </span>
      </TableCell>
    ),
    status: (
      <TableCell key="status">
        <Badge
          variant="outline"
          className={`${statusConfig.badgeColor} text-foreground dark:text-[hsl(240,25%,5%)] border-0 text-xs rounded-lg font-semibold whitespace-nowrap`}
        >
          {statusConfig.label}
        </Badge>
      </TableCell>
    ),
    stage: (
      <TableCell key="stage">
        <Badge variant="outline" className="text-xs rounded-lg">
          {stageConfig.label}
        </Badge>
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
      <TableCell key="type">
        <Badge variant="secondary" className="text-xs rounded-lg whitespace-nowrap">
          {ENGAGEMENT_TYPE_CONFIG[deal.engagementType].label}
        </Badge>
      </TableCell>
    ),
    dealType: (
      <TableCell key="dealType">
        <div className="flex flex-wrap gap-1">
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
      <TableCell key="totalFee">
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
      className={`group cursor-pointer rounded-md shadow-[inset_0_0_0_1px_rgba(59,130,246,0.25)] bg-transparent hover:bg-accent hover:shadow-[inset_0_0_0_1px_hsl(var(--border))] transition-colors ${timeAgoData.isStale ? 'bg-warning/5' : ''} [&>td:first-child]:rounded-l-md [&>td:last-child]:rounded-r-md`}
      onClick={() => navigate(`/deal/${deal.id}`)}
    >
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
                      className={`h-7 w-7 ${deal.isFlagged ? 'text-destructive' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsFlagDialogOpen(true);
                      }}
                    >
                      <Flag className={`h-3.5 w-3.5 ${deal.isFlagged ? 'fill-current' : ''}`} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{deal.isFlagged ? 'Edit flag' : 'Flag for discussion'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <FlagNoteDialog
                dealId={deal.id}
                dealName={deal.company}
                isOpen={isFlagDialogOpen}
                onClose={() => setIsFlagDialogOpen(false)}
                currentFlagNotes={deal.flagNotes}
                isFlagged={deal.isFlagged}
                onSave={async (isFlagged, flagNotes) => {
                  await onToggleFlag(deal.id, isFlagged, flagNotes);
                }}
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
        </div>
      </TableCell>
    </TableRow>
  );
}
