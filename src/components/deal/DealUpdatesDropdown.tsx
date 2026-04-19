import { useState, useEffect, useRef, useCallback } from 'react';
import { format } from 'date-fns';
import { Clock, UserPlus, Trash2, ArrowRight, CheckCircle, FileText, Edit, Upload } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Json } from '@/integrations/supabase/types';
import { useLenderLabelResolver } from '@/hooks/useLenderLabelResolver';

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

const SEEN_KEY_PREFIX = 'deal_updates_seen_';

export function DealUpdatesDropdown({ 
  activities, 
  isLoading, 
  timeAgoText,
  highlightClass = ''
}: DealUpdatesDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const { formatLenderActivity } = useLenderLabelResolver();

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

  // Filter to only show lender updates and milestone changes
  const lenderUpdateTypes = ['lender_added', 'lender_stage_change', 'lender_removed', 'lender_substage_change'];
  const recentActivities = activities.filter(a => 
    lenderUpdateTypes.includes(a.activity_type) || 
    a.description.toLowerCase().includes('milestone changed')
  ).slice(0, 20);

  // Get a stable deal id from the first activity
  const dealId = activities[0]?.deal_id;
  const storageKey = dealId ? `${SEEN_KEY_PREFIX}${dealId}` : null;

  // Load seen timestamp on mount / deal change
  useEffect(() => {
    if (storageKey) {
      try {
        setSeenAt(localStorage.getItem(storageKey));
      } catch {
        setSeenAt(null);
      }
    }
  }, [storageKey]);

  // Count unseen activities
  const unseenCount = seenAt
    ? recentActivities.filter(a => a.created_at > seenAt).length
    : recentActivities.length;

  // Check if user has scrolled to the bottom (seen all)
  const checkScrolledToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20;
    const allFitWithoutScroll = el.scrollHeight <= el.clientHeight;
    if (atBottom || allFitWithoutScroll) {
      markAllSeen();
    }
  }, [recentActivities, storageKey]);

  const markAllSeen = useCallback(() => {
    if (!storageKey || recentActivities.length === 0) return;
    const latestTimestamp = recentActivities.reduce(
      (max, a) => a.created_at > max ? a.created_at : max,
      recentActivities[0].created_at
    );
    localStorage.setItem(storageKey, latestTimestamp);
    setSeenAt(latestTimestamp);
  }, [storageKey, recentActivities]);

  // When popover opens, check if all fit without scroll
  useEffect(() => {
    if (isOpen && recentActivities.length > 0) {
      // Small delay to let content render
      const timer = setTimeout(checkScrolledToBottom, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, checkScrolledToBottom]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button 
          className={cn(
            "flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer relative",
            highlightClass
          )}
        >
          <div className="relative">
            <Clock className="h-4 w-4" />
            {unseenCount > 0 && (
              <Badge 
                variant="destructive" 
                className="absolute -top-2 -right-2 h-4 min-w-4 rounded-full text-[10px] px-1 flex items-center justify-center"
              >
                {unseenCount > 9 ? '9+' : unseenCount}
              </Badge>
            )}
          </div>
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
        <div 
          ref={scrollRef}
          onScroll={checkScrolledToBottom}
          className="p-4 max-h-80 overflow-y-auto"
        >
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
          ) : recentActivities.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No recent updates</p>
          ) : (
            <div className="space-y-3">
              {recentActivities.map((activity) => {
                const displayDescription = formatLenderActivity({
                  activityType: activity.activity_type,
                  description: activity.description,
                  metadata: activity.metadata,
                });

                return (
                <div 
                  key={activity.id} 
                  className="flex items-start gap-3 text-sm"
                >
                  <div className="mt-0.5">{getIcon(activity.activity_type, activity.description)}</div>
                  <div className="flex-1 min-w-0">
                    <span className="text-foreground">{displayDescription}</span>
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
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
