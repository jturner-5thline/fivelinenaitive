import { useState } from 'react';
import { format } from 'date-fns';
import { Clock, UserPlus, Trash2, ArrowRight, CheckCircle, FileText, Edit, Upload } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { Json } from '@/integrations/supabase/types';

interface ActivityLog {
  id: string;
  deal_id: string;
  user_id: string | null;
  user_display_name: string | null;
  activity_type: string;
  description: string;
  metadata: Json | null;
  created_at: string;
}

interface DealUpdatesDropdownProps {
  activities: ActivityLog[];
  isLoading: boolean;
  timeAgoText: string;
  highlightClass?: string;
}

export function DealUpdatesDropdown({ 
  activities, 
  isLoading, 
  timeAgoText,
  highlightClass = ''
}: DealUpdatesDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  const getIcon = (activityType: string, description: string) => {
    const descLower = description.toLowerCase();
    
    if (activityType === 'lender_added') return <UserPlus className="h-3.5 w-3.5 text-green-500" />;
    if (activityType === 'lender_removed') return <Trash2 className="h-3.5 w-3.5 text-red-500" />;
    if (activityType === 'lender_stage_change') return <ArrowRight className="h-3.5 w-3.5 text-blue-500" />;
    if (activityType === 'lender_substage_change' || descLower.includes('milestone')) {
      return <CheckCircle className="h-3.5 w-3.5 text-purple-500" />;
    }
    if (descLower.includes('file') || descLower.includes('upload') || descLower.includes('document')) {
      return <Upload className="h-3.5 w-3.5 text-orange-500" />;
    }
    if (descLower.includes('memo') || descLower.includes('note')) {
      return <FileText className="h-3.5 w-3.5 text-cyan-500" />;
    }
    if (descLower.includes('update') || descLower.includes('change') || descLower.includes('edit')) {
      return <Edit className="h-3.5 w-3.5 text-amber-500" />;
    }
    return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  // Show up to 20 recent activities
  const recentActivities = activities.slice(0, 20);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button 
          className={cn(
            "flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer",
            highlightClass
          )}
        >
          <Clock className="h-4 w-4" />
          <span>{timeAgoText}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent 
        side="bottom" 
        align="end" 
        className="w-96 p-0 bg-popover border shadow-lg"
        sideOffset={8}
      >
        <div className="p-4 border-b bg-muted/30">
          <h3 className="font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Latest Updates
          </h3>
          <p className="text-xs text-muted-foreground mt-1">Recent activity on this deal</p>
        </div>
        <div className="p-4 max-h-80 overflow-y-auto">
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
          ) : recentActivities.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No recent updates</p>
          ) : (
            <div className="space-y-3">
              {recentActivities.map((activity) => (
                <div 
                  key={activity.id} 
                  className="flex items-start gap-3 text-sm"
                >
                  <div className="mt-0.5">{getIcon(activity.activity_type, activity.description)}</div>
                  <div className="flex-1 min-w-0">
                    <span className="text-foreground">{activity.description}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      {activity.user_display_name && (
                        <span className="text-xs text-primary font-medium">
                          {activity.user_display_name}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(activity.created_at), 'MMM d, h:mm a')}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
