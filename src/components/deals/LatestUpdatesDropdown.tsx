import { useState } from 'react';
import { format } from 'date-fns';
import { Clock, UserPlus, Trash2, ArrowRight, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAllActivities } from '@/hooks/useAllActivities';
import { Link } from 'react-router-dom';

export function LatestUpdatesDropdown() {
  const [open, setOpen] = useState(false);
  const { activities, isLoading } = useAllActivities({ limit: 50 });

  // Filter to only show lender updates and milestone changes
  const lenderUpdateTypes = ['lender_added', 'lender_stage_change', 'lender_removed', 'lender_substage_change'];
  const filteredActivities = activities.filter(a => 
    lenderUpdateTypes.includes(a.activity_type) || 
    a.description.toLowerCase().includes('milestone changed')
  ).slice(0, 15);

  const updateCount = filteredActivities.length;

  const getIcon = (activityType: string, description: string) => {
    const isMilestoneChange = activityType === 'lender_substage_change' || description.toLowerCase().includes('milestone changed');
    if (activityType === 'lender_added') return <UserPlus className="h-3.5 w-3.5 text-green-500" />;
    if (activityType === 'lender_removed') return <Trash2 className="h-3.5 w-3.5 text-red-500" />;
    if (activityType === 'lender_stage_change') return <ArrowRight className="h-3.5 w-3.5 text-blue-500" />;
    if (isMilestoneChange) return <CheckCircle className="h-3.5 w-3.5 text-purple-500" />;
    return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-2 relative"
        >
          <Clock className="h-4 w-4" />
          Latest Updates
          {updateCount > 0 && (
            <Badge 
              variant="destructive"
              className="ml-1 h-5 min-w-5 px-1.5 text-xs"
            >
              {updateCount > 99 ? '99+' : updateCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 bg-popover">
        <DropdownMenuLabel className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <span className="font-semibold">Latest Updates</span>
          {updateCount > 0 && (
            <Badge variant="outline" className="ml-auto text-xs">
              {updateCount} items
            </Badge>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-50 animate-pulse" />
            <p>Loading updates...</p>
          </div>
        ) : filteredActivities.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="font-medium">No recent updates</p>
            <p className="text-xs mt-1">Activity will appear here</p>
          </div>
        ) : (
          <ScrollArea className="h-[320px]">
            <div className="p-1">
              {filteredActivities.map((activity) => (
                <DropdownMenuItem
                  key={activity.id}
                  asChild
                  className="flex items-start gap-3 py-2.5 px-3 cursor-pointer hover:bg-accent/50 rounded-md mx-1"
                >
                  <Link 
                    to={`/deal/${activity.deal_id}`}
                    onClick={() => setOpen(false)}
                  >
                    <div className="mt-0.5">{getIcon(activity.activity_type, activity.description)}</div>
                    <div className="flex-1 min-w-0">
                      {activity.deal_name && (
                        <p className="text-xs font-medium text-primary truncate">{activity.deal_name}</p>
                      )}
                      <span className="text-sm text-foreground">{activity.description}</span>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(activity.created_at), 'MMM d, h:mm a')}
                      </p>
                    </div>
                  </Link>
                </DropdownMenuItem>
              ))}
            </div>
          </ScrollArea>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
