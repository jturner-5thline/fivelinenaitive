import { MoreHorizontal, User, Clock, AlertTriangle, CheckCircle2, Flag, Trash2, Archive, UserPlus, Flame, Thermometer, Snowflake } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { differenceInMinutes, differenceInHours, differenceInDays, differenceInWeeks } from 'date-fns';
import { Deal, DealStatus, STATUS_CONFIG, STAGE_CONFIG, ENGAGEMENT_TYPE_CONFIG, EXCLUSIVITY_CONFIG } from '@/types/deal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useDealTypes } from '@/contexts/DealTypesContext';
import { useDealStages } from '@/contexts/DealStagesContext';
import { useAdminRole } from '@/hooks/useAdminRole';
import { DealFlexEngagement } from '@/hooks/useFlexEngagementScores';
import { TableCell, TableRow } from '@/components/ui/table';
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
  onToggleFlag?: (dealId: string, isFlagged: boolean) => void;
  flexEngagement?: DealFlexEngagement;
}

export function DealListRow({ deal, onStatusChange, onMarkReviewed, onToggleFlag, flexEngagement }: DealListRowProps) {
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
      text = `${hours} Hours Ago`;
    } else if (days < 7) {
      text = `${days} Days Ago`;
      if (isStale) {
        highlightClass = 'bg-warning/20 px-1.5 py-0.5 rounded text-warning';
      }
    } else if (days <= 30) {
      text = `${weeks} Weeks Ago`;
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

  return (
    <TableRow 
      className={`group cursor-pointer ${timeAgoData.isStale ? 'bg-warning/5' : ''}`}
      onClick={() => navigate(`/deal/${deal.id}`)}
    >
      {/* Company Name */}
      <TableCell className="font-medium">
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
          <span className="truncate max-w-[200px] bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)]">
            {deal.company}
          </span>
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

      {/* Value */}
      <TableCell>
        <span className="font-semibold bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)]">
          {formatCurrencyValue(deal.value)}
        </span>
      </TableCell>

      {/* Status */}
      <TableCell>
        <Badge
          variant="outline"
          className={`${statusConfig.badgeColor} text-white border-0 text-xs rounded-lg`}
        >
          {statusConfig.label}
        </Badge>
      </TableCell>

      {/* Stage */}
      <TableCell>
        <Badge variant="outline" className="text-xs rounded-lg">
          {stageConfig.label}
        </Badge>
      </TableCell>

      {/* Manager */}
      <TableCell>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <User className="h-3.5 w-3.5" />
          <span className="truncate max-w-[100px]">{deal.manager || 'No manager'}</span>
        </div>
      </TableCell>

      {/* Deal Type */}
      <TableCell>
        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary" className="text-xs rounded-lg">
            {ENGAGEMENT_TYPE_CONFIG[deal.engagementType].label}
          </Badge>
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
        </div>
      </TableCell>

      {/* FLEx Engagement */}
      <TableCell>
        {flexEngagement && flexEngagement.level !== "none" && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className={`text-xs rounded-lg gap-1 ${
                    flexEngagement.level === "hot" 
                      ? "bg-red-500/10 text-red-600 border-red-500/20" 
                      : flexEngagement.level === "warm"
                      ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                      : "bg-blue-500/10 text-blue-600 border-blue-500/20"
                  }`}
                >
                  {flexEngagement.level === "hot" ? (
                    <Flame className="h-3 w-3" />
                  ) : flexEngagement.level === "warm" ? (
                    <Thermometer className="h-3 w-3" />
                  ) : (
                    <Snowflake className="h-3 w-3" />
                  )}
                  {flexEngagement.lenderCount}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-xs">
                  <p className="font-medium capitalize">{flexEngagement.level} Lender Interest</p>
                  <p className="text-muted-foreground">
                    {flexEngagement.lenderCount} lender{flexEngagement.lenderCount !== 1 ? 's' : ''} engaged
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </TableCell>

      {/* Last Updated */}
      <TableCell>
        <div className={`flex items-center gap-1.5 text-xs text-muted-foreground ${timeAgoData.highlightClass}`}>
          <Clock className="h-3 w-3" />
          <span>{timeAgoData.text}</span>
        </div>
      </TableCell>

      {/* Actions */}
      <TableCell>
        <div className="flex items-center gap-1">
          {onToggleFlag && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-7 w-7 ${deal.isFlagged ? 'text-destructive' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFlag(deal.id, !deal.isFlagged);
                    }}
                  >
                    <Flag className={`h-3.5 w-3.5 ${deal.isFlagged ? 'fill-current' : ''}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{deal.isFlagged ? 'Remove flag' : 'Flag for discussion'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
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
