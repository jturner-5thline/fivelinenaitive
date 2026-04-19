import { useState, useEffect, useRef, useCallback } from 'react';
import { format } from 'date-fns';
import { Clock, UserPlus, Trash2, ArrowRight, CheckCircle, FileText, Edit, Upload, History } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { htmlToPlainText } from '@/lib/htmlToPlainText';
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

interface StatusNote {
  id: string;
  note: string;
  created_at: string;
}

interface DealUpdatesUnifiedProps {
  activities: ActivityLog[];
  isLoadingActivities: boolean;
  timeAgoText: string;
  highlightClass?: string;
  statusNotes: StatusNote[];
  onDeleteNote: (noteId: string) => void;
}

const SEEN_KEY_PREFIX = 'deal_updates_seen_';

export function DealUpdatesUnified({
  activities,
  isLoadingActivities,
  timeAgoText,
  highlightClass = '',
  statusNotes,
  onDeleteNote,
}: DealUpdatesUnifiedProps) {
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

  const lenderUpdateTypes = ['lender_added', 'lender_stage_change', 'lender_removed', 'lender_substage_change'];
  const recentActivities = activities.filter(a =>
    lenderUpdateTypes.includes(a.activity_type) ||
    a.description.toLowerCase().includes('milestone changed')
  ).slice(0, 20);

  const dealId = activities[0]?.deal_id;
  const storageKey = dealId ? `${SEEN_KEY_PREFIX}${dealId}` : null;

  useEffect(() => {
    if (storageKey) {
      try { setSeenAt(localStorage.getItem(storageKey)); } catch { setSeenAt(null); }
    }
  }, [storageKey]);

  const unseenCount = seenAt
    ? recentActivities.filter(a => a.created_at > seenAt).length
    : recentActivities.length;

  const markAllSeen = useCallback(() => {
    if (!storageKey || recentActivities.length === 0) return;
    const latestTimestamp = recentActivities.reduce(
      (max, a) => a.created_at > max ? a.created_at : max,
      recentActivities[0].created_at
    );
    localStorage.setItem(storageKey, latestTimestamp);
    setSeenAt(latestTimestamp);
  }, [storageKey, recentActivities]);

  const checkScrolledToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20;
    const allFitWithoutScroll = el.scrollHeight <= el.clientHeight;
    if (atBottom || allFitWithoutScroll) markAllSeen();
  }, [markAllSeen]);

  useEffect(() => {
    if (isOpen && recentActivities.length > 0) {
      const timer = setTimeout(checkScrolledToBottom, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, checkScrolledToBottom]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer relative",
            highlightClass
          )}
        >
          <div className="relative">
            <Clock className="h-3.5 w-3.5" />
            {unseenCount > 0 && (
              <Badge
                variant="destructive"
                className="absolute -top-2 -right-2 h-3.5 min-w-3.5 rounded-full text-[9px] px-0.5 flex items-center justify-center"
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
        align="start"
        className="w-96 p-0 bg-popover border shadow-lg"
        sideOffset={8}
      >
        <Tabs defaultValue="updates" className="w-full">
          <div className="p-1.5 border-b border-border bg-muted/30">
            <TabsList className="w-full h-9 grid grid-cols-2 bg-muted/60 rounded-md p-0.5 gap-0">
              <TabsTrigger
                value="updates"
                className="h-full rounded-[5px] text-xs font-medium text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all"
              >
                <Clock className="h-3.5 w-3.5 mr-1.5" />
                Latest Updates
              </TabsTrigger>
              <TabsTrigger
                value="history"
                className="h-full rounded-[5px] text-xs font-medium text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all"
              >
                <History className="h-3.5 w-3.5 mr-1.5" />
                Status History
                {statusNotes.length > 0 && (
                  <Badge variant="secondary" className="ml-1.5 h-4 min-w-4 text-[10px] px-1">
                    {statusNotes.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="updates" className="mt-0">
            <div
              ref={scrollRef}
              onScroll={checkScrolledToBottom}
              className="p-4 max-h-72 overflow-y-auto"
            >
              {isLoadingActivities ? (
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
                    <div key={activity.id} className="flex items-start gap-3 text-sm">
                      <div className="mt-0.5">{getIcon(activity.activity_type, activity.description)}</div>
                      <div className="flex-1 min-w-0">
                        <span className="text-foreground">{displayDescription}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          {activity.user_display_name && (
                            <span className="text-xs text-primary font-medium">{activity.user_display_name}</span>
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
          </TabsContent>

          <TabsContent value="history" className="mt-0">
            <ScrollArea className="max-h-72">
              {statusNotes.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No status history</p>
              ) : (
                <div className="p-2 space-y-2">
                  {statusNotes.map((item) => (
                    <div
                      key={item.id}
                      className="text-sm p-3 bg-muted/50 rounded-lg group relative"
                    >
                      <p className="text-muted-foreground pr-6 break-words whitespace-pre-wrap overflow-hidden text-xs">
                        {htmlToPlainText(item.note)}
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        {format(new Date(item.created_at), 'MMM d, yyyy')} at {format(new Date(item.created_at), 'h:mm a')}
                      </p>
                      <button
                        onClick={() => onDeleteNote(item.id)}
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
