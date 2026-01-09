import { MoreHorizontal, User, Clock, AlertTriangle, CheckCircle2, Flag, Trash2, Archive, UserPlus } from 'lucide-react';
import DOMPurify from 'dompurify';
import { Link, useNavigate } from 'react-router-dom';
import { differenceInMinutes, differenceInHours, differenceInDays, differenceInWeeks } from 'date-fns';
import { Deal, DealStatus, STATUS_CONFIG, STAGE_CONFIG, ENGAGEMENT_TYPE_CONFIG, EXCLUSIVITY_CONFIG } from '@/types/deal';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useDealTypes } from '@/contexts/DealTypesContext';
import { useDealStages } from '@/contexts/DealStagesContext';
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
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';

interface DealCardProps {
  deal: Deal;
  onStatusChange: (dealId: string, newStatus: DealStatus) => void;
  onMarkReviewed?: (dealId: string) => void;
  onToggleFlag?: (dealId: string, isFlagged: boolean) => void;
}

export function DealCard({ deal, onStatusChange, onMarkReviewed, onToggleFlag }: DealCardProps) {
  const navigate = useNavigate();
  const { formatCurrencyValue, preferences } = usePreferences();
  const { dealTypes } = useDealTypes();
  const { getStageConfig } = useDealStages();
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
    <Link to={`/deal/${deal.id}`} className="block h-full">
      <Card className={`group cursor-pointer h-full flex flex-col relative ${timeAgoData.isStale ? 'ring-2 ring-warning/50' : ''}`}>
        {timeAgoData.isStale && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="absolute -top-2 -right-2 z-10">
                  <div className={`flex items-center justify-center h-6 w-6 rounded-full ${timeAgoData.days >= 30 ? 'bg-destructive' : 'bg-warning'} shadow-md`}>
                    <AlertTriangle className="h-3.5 w-3.5 text-white" />
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Stale deal - no updates for {timeAgoData.days} days</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {timeAgoData.isStale && onMarkReviewed && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-10 h-7 gap-1.5 bg-background shadow-md border-success/50 text-success hover:bg-success/10 hover:text-success opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onMarkReviewed(deal.id);
                  }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Mark Reviewed
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Update timestamp to mark as reviewed</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      <CardHeader className="space-y-0 pb-3">
        <div className="flex flex-row items-center justify-between">
          <h3 className="text-xl font-semibold bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)] leading-tight">{deal.company}</h3>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xl font-semibold bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)]">{formatCurrencyValue(deal.value)}</span>
            {onToggleFlag && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-8 w-8 relative ${deal.isFlagged ? 'text-destructive' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onToggleFlag(deal.id, !deal.isFlagged);
                      }}
                    >
                      <Flag className={`h-4 w-4 ${deal.isFlagged ? 'fill-current' : ''}`} />
                      {deal.isFlagged && deal.flagNotes && (
                        <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-primary border-2 border-background" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    {deal.isFlagged ? (
                      <div>
                        <p className="font-medium">Flagged for discussion</p>
                        {deal.flagNotes && <p className="text-xs mt-1 opacity-90">{deal.flagNotes}</p>}
                      </div>
                    ) : (
                      <p>Flag for discussion</p>
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
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
                      e.preventDefault();
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
                      e.preventDefault();
                      e.stopPropagation();
                      onStatusChange(deal.id, 'archived');
                    }}
                  >
                    <Archive className="h-4 w-4 mr-2" />
                    Archive
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    navigate(`/deal/${deal.id}?action=delete`);
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4">
          <Badge
            variant="outline"
            className={`${statusConfig.badgeColor} text-white border-0 text-xs rounded-lg`}
          >
            {statusConfig.label}
          </Badge>
          <Badge
            variant="outline"
            className="text-xs rounded-lg"
          >
            {stageConfig.label}
          </Badge>
          {deal.migratedFromPersonal && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className="text-xs rounded-lg bg-accent/50 text-accent-foreground border-accent gap-1"
                  >
                    <UserPlus className="h-3 w-3" />
                    Migrated
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>This deal was migrated from a personal account</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        {deal.notes && deal.notes !== '<p></p>' ? (
          <HoverCard openDelay={300}>
            <HoverCardTrigger asChild>
              <div 
              className="text-sm line-clamp-2 mt-4 min-h-[2.5rem] text-muted-foreground prose prose-sm max-w-none [&>*]:m-0 [&_ul]:pl-4 [&_ol]:pl-4 cursor-pointer"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(deal.notes, { ALLOWED_TAGS: ['p', 'strong', 'em', 'ul', 'ol', 'li', 'br'], ALLOWED_ATTR: [] }) }}
              />
            </HoverCardTrigger>
            <HoverCardContent className="w-80 max-h-60 overflow-y-auto" align="start">
              <div 
                className="prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(deal.notes, { ALLOWED_TAGS: ['p', 'strong', 'em', 'ul', 'ol', 'li', 'br'], ALLOWED_ATTR: [] }) }}
              />
            </HoverCardContent>
          </HoverCard>
        ) : (
          <p className="text-sm line-clamp-2 mt-4 min-h-[2.5rem] text-muted-foreground/50 italic">
            No Status
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4 mt-auto">

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" />
            <span className="truncate">{deal.manager || 'No manager'}</span>
          </div>
          {deal.dealOwner && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground/70">Owner:</span>
              <span className="truncate">{deal.dealOwner}</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
          <Badge variant="secondary" className="text-xs rounded-lg">
            {ENGAGEMENT_TYPE_CONFIG[deal.engagementType].label}
          </Badge>
          {deal.exclusivity && EXCLUSIVITY_CONFIG[deal.exclusivity] && (
            <Badge variant="outline" className="text-xs rounded-lg bg-primary/10 text-primary border-primary/20">
              {EXCLUSIVITY_CONFIG[deal.exclusivity].label}
            </Badge>
          )}
          {dealTypeLabels.map((label, index) => (
            <Badge key={index} variant="outline" className="text-xs rounded-lg">
              {label}
            </Badge>
          ))}
          <div className={`flex items-center gap-1.5 text-xs text-muted-foreground ml-auto ${timeAgoData.highlightClass}`}>
            <Clock className="h-3 w-3" />
            <span>{timeAgoData.text}</span>
          </div>
        </div>
      </CardContent>
    </Card>
    </Link>
  );
}
