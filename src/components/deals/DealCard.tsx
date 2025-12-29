import { MoreHorizontal, User, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { differenceInMinutes, differenceInHours, differenceInDays, differenceInWeeks } from 'date-fns';
import { Deal, DealStatus, STATUS_CONFIG, STAGE_CONFIG, ENGAGEMENT_TYPE_CONFIG, EXCLUSIVITY_CONFIG } from '@/types/deal';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useDealTypes } from '@/contexts/DealTypesContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface DealCardProps {
  deal: Deal;
  onStatusChange: (dealId: string, newStatus: DealStatus) => void;
}

export function DealCard({ deal, onStatusChange }: DealCardProps) {
  const { formatCurrencyValue } = usePreferences();
  const { dealTypes } = useDealTypes();
  const statusConfig = STATUS_CONFIG[deal.status];
  const stageConfig = STAGE_CONFIG[deal.stage];

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
    
    if (minutes < 60) {
      text = `${minutes} Min. Ago`;
    } else if (hours < 24) {
      text = `${hours} Hours Ago`;
    } else if (days < 7) {
      text = `${days} Days Ago`;
      if (days > 3) {
        highlightClass = 'bg-warning/20 px-1.5 py-0.5 rounded';
      }
    } else if (days <= 30) {
      text = `${weeks} Weeks Ago`;
      highlightClass = 'bg-destructive/20 px-1.5 py-0.5 rounded';
    } else {
      text = 'Over 30 Days';
      highlightClass = 'bg-destructive/20 px-1.5 py-0.5 rounded';
    }
    
    return { text, highlightClass };
  };

  const timeAgoData = getTimeAgoData(deal.updatedAt);

  return (
    <Link to={`/deal/${deal.id}`} className="block h-full">
      <Card className="group cursor-pointer h-full flex flex-col">
      <CardHeader className="space-y-0 pb-3">
        <div className="flex flex-row items-center justify-between">
          <h3 className="text-xl font-semibold bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)] leading-tight">{deal.company}</h3>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xl font-semibold bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)]">{formatCurrencyValue(deal.value)}</span>
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
                <DropdownMenuItem>View Details</DropdownMenuItem>
                <DropdownMenuItem>Edit Deal</DropdownMenuItem>
                <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
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
        </div>
        <p className={`text-sm line-clamp-2 mt-4 min-h-[2.5rem] ${deal.notes ? 'text-muted-foreground' : 'text-muted-foreground/50 italic'}`}>
          {deal.notes || 'No Status'}
        </p>
      </CardHeader>
      <CardContent className="space-y-4 mt-auto">

        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <User className="h-3.5 w-3.5" />
          <span className="truncate">{deal.manager}</span>
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
