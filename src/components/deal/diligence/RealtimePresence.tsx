import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface PresenceUser {
  userId: string;
  displayName: string;
  initials: string;
  color: string;
  lastSeen: string;
  view: string;
}

const COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-pink-500', 'bg-indigo-500',
];

function getColor(userId: string) {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

interface RealtimePresenceProps {
  dealId: string;
  currentView: string;
  className?: string;
}

export function RealtimePresence({ dealId, currentView, className }: RealtimePresenceProps) {
  const [users, setUsers] = useState<PresenceUser[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const setup = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      const displayName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'User';

      channel = supabase.channel(`diligence:${dealId}`, {
        config: { presence: { key: user.id } },
      });

      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel!.presenceState();
          const presenceUsers: PresenceUser[] = [];
          for (const [key, values] of Object.entries(state)) {
            const v = values[0] as any;
            if (key !== user.id) {
              presenceUsers.push({
                userId: key,
                displayName: v.displayName || 'User',
                initials: getInitials(v.displayName || 'User'),
                color: getColor(key),
                lastSeen: new Date().toISOString(),
                view: v.view || 'ingestion',
              });
            }
          }
          setUsers(presenceUsers);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel!.track({
              displayName,
              view: currentView,
              online_at: new Date().toISOString(),
            });
          }
        });
    };

    setup();

    return () => {
      if (channel) {
        channel.unsubscribe();
      }
    };
  }, [dealId]);

  // Update presence when view changes
  useEffect(() => {
    const updateView = async () => {
      const channel = supabase.channel(`diligence:${dealId}`);
      // Track is idempotent
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const displayName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'User';
          await channel.track({ displayName, view: currentView, online_at: new Date().toISOString() });
        }
      } catch { /* ignore */ }
    };
    updateView();
  }, [currentView, dealId]);

  if (users.length === 0) return null;

  return (
    <TooltipProvider>
      <div className={cn("flex items-center gap-0.5", className)}>
        <span className="text-[10px] text-muted-foreground mr-1">{users.length} viewing</span>
        <div className="flex -space-x-1.5">
          {users.slice(0, 5).map(u => (
            <Tooltip key={u.userId}>
              <TooltipTrigger asChild>
                <Avatar className="h-6 w-6 border-2 border-background cursor-default">
                  <AvatarFallback className={cn("text-[9px] font-bold text-white", u.color)}>
                    {u.initials}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                <p className="font-medium">{u.displayName}</p>
                <p className="text-muted-foreground capitalize">Viewing: {u.view}</p>
              </TooltipContent>
            </Tooltip>
          ))}
          {users.length > 5 && (
            <Avatar className="h-6 w-6 border-2 border-background">
              <AvatarFallback className="text-[9px] bg-muted text-muted-foreground">
                +{users.length - 5}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
