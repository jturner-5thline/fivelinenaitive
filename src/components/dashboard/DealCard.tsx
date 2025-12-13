import { MoreHorizontal, Building2, User, Calendar, TrendingUp, Landmark } from 'lucide-react';
import { Deal, DealStatus, STATUS_CONFIG, STAGE_CONFIG, ENGAGEMENT_TYPE_CONFIG } from '@/types/deal';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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

interface DealCardProps {
  deal: Deal;
  onStatusChange: (dealId: string, newStatus: DealStatus) => void;
}

export function DealCard({ deal, onStatusChange }: DealCardProps) {
  const statusConfig = STATUS_CONFIG[deal.status];
  const stageConfig = STAGE_CONFIG[deal.stage];

  const formatValue = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    }
    return `$${(value / 1000).toFixed(0)}K`;
  };

  return (
    <Card className="group transition-all hover:shadow-md hover:border-primary/20">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="space-y-1">
          <h3 className="font-semibold text-foreground leading-tight">{deal.name}</h3>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Building2 className="h-3.5 w-3.5" />
            {deal.company}
          </div>
        </div>
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
            {Object.entries(STATUS_CONFIG).map(([key, { label }]) => (
              <DropdownMenuItem
                key={key}
                onClick={() => onStatusChange(deal.id, key as DealStatus)}
                className={deal.status === key ? 'bg-muted' : ''}
              >
                {label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem>View Details</DropdownMenuItem>
            <DropdownMenuItem>Edit Deal</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={`${stageConfig.color} text-white border-0 text-xs`}
            >
              {stageConfig.label}
            </Badge>
            <Badge
              variant="outline"
              className={`${statusConfig.color} text-white border-0 text-xs`}
            >
              {statusConfig.label}
            </Badge>
          </div>
          <div className="flex items-center gap-1 text-lg font-semibold text-foreground">
            <TrendingUp className="h-4 w-4 text-success" />
            {formatValue(deal.value)}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <User className="h-3.5 w-3.5" />
            <span className="truncate">{deal.manager}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Landmark className="h-3.5 w-3.5" />
            <span className="truncate">{deal.lender}</span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <Badge variant="secondary" className="text-xs">
            {ENGAGEMENT_TYPE_CONFIG[deal.engagementType].label}
          </Badge>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>{deal.updatedAt}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
