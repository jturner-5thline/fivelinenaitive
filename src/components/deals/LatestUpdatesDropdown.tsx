import { useState, useCallback, useEffect } from 'react';
import { format } from 'date-fns';
import { Clock, UserPlus, Trash2, ArrowRight, CheckCircle, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAllActivities } from '@/hooks/useAllActivities';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const LAST_READ_KEY = 'latest-updates-last-read-at';
const READ_TYPE = 'latest_updates_cutoff';
const READ_ID = 'global';

export function LatestUpdatesDropdown() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  // Seed from localStorage for instant UI, then reconcile from DB (per-user,
  // cross-device). DB value wins so a refresh after Mark-all-read persists.
  const [lastReadAt, setLastReadAt] = useState<string | null>(() =>
    localStorage.getItem(LAST_READ_KEY)
  );
  const { activities, isLoading } = useAllActivities({ limit: 50 });

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('notification_reads')
        .select('read_at')
        .eq('user_id', user.id)
        .eq('notification_type', READ_TYPE)
        .eq('notification_id', READ_ID)
        .maybeSingle();
      if (cancelled || error) return;
      const dbAt = data?.read_at ?? null;
      if (!dbAt) return;
      // Freshness-aware merge: take the later of local/db so a synced row
      // can't resurrect already-read state.
      setLastReadAt(prev => {
        if (!prev) return dbAt;
        return new Date(dbAt) > new Date(prev) ? dbAt : prev;
      });
      localStorage.setItem(LAST_READ_KEY, dbAt);
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Filter to only show lender updates and milestone changes
  const lenderUpdateTypes = ['lender_added', 'lender_stage_change', 'lender_removed', 'lender_substage_change'];
  const filteredActivities = activities.filter(a => 
    lenderUpdateTypes.includes(a.activity_type) || 
    a.description.toLowerCase().includes('milestone changed')
  ).slice(0, 15);

  const unreadActivities = filteredActivities.filter(a =>
    !lastReadAt || new Date(a.created_at) > new Date(lastReadAt)
  );
  const unreadCount = unreadActivities.length;

  const handleMarkAllAsRead = useCallback(async () => {
    const now = new Date().toISOString();
    // Optimistic — drops the badge immediately even if the DB write is slow.
    localStorage.setItem(LAST_READ_KEY, now);
    setLastReadAt(now);
    if (!user) return;
    // Idempotent upsert on (user_id, type, id). Re-running is a no-op aside
    // from bumping read_at. Missing rows are inserted; no error when nothing
    // is unread.
    const { error } = await supabase
      .from('notification_reads')
      .upsert(
        {
          user_id: user.id,
          notification_type: READ_TYPE,
          notification_id: READ_ID,
          read_at: now,
        },
        { onConflict: 'user_id,notification_type,notification_id' }
      );
    if (error) {
      console.error('Failed to persist latest-updates read cutoff:', error);
    }
  }, [user]);

  const getIcon = (activityType: string, description: string) => {
    const isMilestoneChange = activityType === 'lender_substage_change' || description.toLowerCase().includes('milestone changed');
    if (activityType === 'lender_added') return <UserPlus className="h-3.5 w-3.5 text-green-500" />;
    if (activityType === 'lender_removed') return <Trash2 className="h-3.5 w-3.5 text-red-500" />;
    if (activityType === 'lender_stage_change') return <ArrowRight className="h-3.5 w-3.5 text-blue-500" />;
    if (isMilestoneChange) return <CheckCircle className="h-3.5 w-3.5 text-purple-500" />;
    return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  const isUnread = (createdAt: string) =>
    !lastReadAt || new Date(createdAt) > new Date(lastReadAt);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative h-9 w-9"
          aria-label="Latest updates"
        >
          <Clock className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1.5 -right-1.5 h-5 min-w-5 px-1.5 text-xs"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="p-0 gap-0 overflow-hidden border border-border/40 sm:max-w-[560px]">
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-border/40">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-primary" />
            Latest Updates
            {unreadCount > 0 && (
              <Badge variant="outline" className="ml-auto text-xs">
                {unreadCount} new
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {unreadCount > 0 && (
          <div className="px-4 py-2 border-b border-border/40">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-center text-xs text-muted-foreground hover:text-teal-400 gap-1.5"
              onClick={handleMarkAllAsRead}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all as read
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-50 animate-pulse" />
            <p>Loading updates...</p>
          </div>
        ) : filteredActivities.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="font-medium">No recent updates</p>
            <p className="text-xs mt-1">Activity will appear here</p>
          </div>
        ) : (
          <ScrollArea className="h-[60vh] max-h-[520px]">
            <div className="px-3 pt-3 pb-3 space-y-2">
              {filteredActivities.map((activity) => {
                const unread = isUnread(activity.created_at);
                return (
                  <Link
                    key={activity.id}
                    to={`/deal/${activity.deal_id}`}
                    onClick={() => setOpen(false)}
                    className={`group flex items-start gap-3 py-3 px-3.5 cursor-pointer rounded-2xl border transition-all duration-200 bg-card/60 backdrop-blur-md border-border/40 shadow-sm hover:bg-card/80 hover:border-teal-400/30 hover:shadow-md ${unread ? 'border-teal-400/25 bg-card/75' : ''}`}
                  >
                    {unread && (
                      <div className="mt-2 h-2 w-2 rounded-full bg-teal-400 shadow-[0_0_8px_hsl(var(--primary)/0.6)] shrink-0" />
                    )}
                    <div className="mt-0.5">{getIcon(activity.activity_type, activity.description)}</div>
                    <div className="flex-1 min-w-0 text-left">
                      {activity.deal_name && (
                        <p className={`text-[13px] truncate text-foreground ${unread ? 'font-semibold' : 'font-medium'}`}>{activity.deal_name}</p>
                      )}
                      <span className={`block text-[13px] leading-snug text-muted-foreground mt-0.5 ${unread ? 'text-foreground/90' : ''}`}>{activity.description}</span>
                      <p className="text-[11px] text-muted-foreground/70 mt-1.5 tracking-wide">
                        {format(new Date(activity.created_at), 'MMM d, h:mm a')}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
