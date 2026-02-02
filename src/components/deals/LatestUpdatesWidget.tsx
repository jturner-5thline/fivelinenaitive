import { useState } from 'react';
import { format } from 'date-fns';
import { Clock, UserPlus, Trash2, ArrowRight, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useAllActivities } from '@/hooks/useAllActivities';
import { Link } from 'react-router-dom';

export function LatestUpdatesWidget() {
  const [isOpen, setIsOpen] = useState(false);
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
    <div className="fixed bottom-6 left-20 z-50 group">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <div className="relative">
            <Button
              variant="gradient"
              size="sm"
              className="rounded-full h-12 min-w-12 group-hover:px-4 px-0 shadow-lg animate-fade-in transition-all duration-300 overflow-hidden flex items-center justify-center"
            >
              <div className="flex items-center justify-center">
                <Clock className="h-4 w-4 shrink-0" />
                <span className="max-w-0 group-hover:max-w-32 group-hover:ml-2 overflow-hidden whitespace-nowrap transition-all duration-300">
                  Latest Updates
                </span>
              </div>
            </Button>
            {updateCount > 0 && (
              <Badge variant="secondary" className="absolute -top-1 -right-1 h-5 min-w-5 px-1.5 text-xs bg-destructive text-destructive-foreground border-2 border-background pointer-events-none">
                {updateCount > 99 ? '99+' : updateCount}
              </Badge>
            )}
          </div>
        </PopoverTrigger>
        <PopoverContent 
          side="top" 
          align="start" 
          className="w-96 p-0 animate-scale-in"
          sideOffset={8}
        >
          <div className="p-4 border-b">
            <h3 className="font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Latest Updates
            </h3>
            <p className="text-xs text-muted-foreground mt-1">Recent activity across all deals</p>
          </div>
          <div className="p-4 max-h-80 overflow-y-auto">
            {isLoading ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
            ) : filteredActivities.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No recent updates</p>
            ) : (
              <div className="space-y-3">
                {filteredActivities.map((activity) => (
                  <Link 
                    key={activity.id} 
                    to={`/deal/${activity.deal_id}`}
                    className="flex items-start gap-3 text-sm hover:bg-accent/50 -mx-2 px-2 py-1.5 rounded-md transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <div className="mt-0.5">{getIcon(activity.activity_type, activity.description)}</div>
                    <div className="flex-1 min-w-0">
                      {activity.deal_name && (
                        <p className="text-xs font-medium text-primary truncate">{activity.deal_name}</p>
                      )}
                      <span className="text-foreground">{activity.description}</span>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(activity.created_at), 'MMM d, h:mm a')}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
