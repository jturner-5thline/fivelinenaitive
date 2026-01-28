import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { History, Search, ChevronDown, ChevronUp, ArrowUpDown, Users } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { Json } from '@/integrations/supabase/types';

interface AuditLogEntry {
  id: string;
  deal_id: string;
  user_id: string | null;
  activity_type: string;
  description: string;
  metadata: Json;
  created_at: string;
  user_display_name?: string | null;
  // Joined from profiles
  user_profile?: {
    display_name: string | null;
    avatar_url: string | null;
    email: string | null;
  };
}

interface AuditTrailPanelProps {
  dealId: string;
  className?: string;
}

const ACTIVITY_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  lender_stage_change: { label: 'Stage Change', color: 'bg-blue-500/10 text-blue-700 dark:text-blue-400' },
  lender_substage_change: { label: 'Milestone Change', color: 'bg-purple-500/10 text-purple-700 dark:text-purple-400' },
  lender_notes_updated: { label: 'Notes Updated', color: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  lender_added: { label: 'Lender Added', color: 'bg-green-500/10 text-green-700 dark:text-green-400' },
  lender_removed: { label: 'Lender Removed', color: 'bg-red-500/10 text-red-700 dark:text-red-400' },
  milestone_completed: { label: 'Milestone Done', color: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
  milestone_added: { label: 'Milestone Added', color: 'bg-teal-500/10 text-teal-700 dark:text-teal-400' },
  deal_updated: { label: 'Deal Updated', color: 'bg-slate-500/10 text-slate-700 dark:text-slate-400' },
  status_note_added: { label: 'Status Note', color: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400' },
  requested_item_added: { label: 'Item Added', color: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400' },
  requested_item_updated: { label: 'Item Updated', color: 'bg-sky-500/10 text-sky-700 dark:text-sky-400' },
};

export function AuditTrailPanel({ dealId, className }: AuditTrailPanelProps) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [profiles, setProfiles] = useState<Map<string, { display_name: string | null; avatar_url: string | null; email: string | null }>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Fetch audit logs
  useEffect(() => {
    const fetchLogs = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('activity_logs')
          .select('*')
          .eq('deal_id', dealId)
          .order('created_at', { ascending: false })
          .limit(100);

        if (error) throw error;
        
        setLogs(data || []);

        // Fetch user profiles for all unique user_ids
        const userIds = [...new Set((data || []).map(l => l.user_id).filter(Boolean))] as string[];
        if (userIds.length > 0) {
          const { data: profilesData } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url, email')
            .in('id', userIds);

          if (profilesData) {
            const profileMap = new Map(
              profilesData.map(p => [p.id, { 
                display_name: p.display_name, 
                avatar_url: p.avatar_url,
                email: p.email 
              }])
            );
            setProfiles(profileMap);
          }
        }
      } catch (error) {
        console.error('Error fetching audit logs:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLogs();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`audit-trail-${dealId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activity_logs',
          filter: `deal_id=eq.${dealId}`,
        },
        (payload) => {
          setLogs(prev => [payload.new as AuditLogEntry, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [dealId]);

  // Filter and sort logs
  const filteredLogs = useMemo(() => {
    let filtered = logs;
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = logs.filter(log => 
        log.description.toLowerCase().includes(query) ||
        log.activity_type.toLowerCase().includes(query) ||
        profiles.get(log.user_id || '')?.display_name?.toLowerCase().includes(query)
      );
    }

    return sortOrder === 'desc' ? filtered : [...filtered].reverse();
  }, [logs, searchQuery, sortOrder, profiles]);

  const displayedLogs = isExpanded ? filteredLogs : filteredLogs.slice(0, 5);

  const getInitials = (name: string | null | undefined) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" />
            Activity Audit Trail
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" />
            Activity Audit Trail
            <Badge variant="secondary" className="ml-1">
              {filteredLogs.length}
            </Badge>
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
            className="h-8 px-2"
          >
            <ArrowUpDown className="h-4 w-4 mr-1" />
            {sortOrder === 'desc' ? 'Newest' : 'Oldest'}
          </Button>
        </div>
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search activity..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-8"
          />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {displayedLogs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No activity recorded yet</p>
          </div>
        ) : (
          <ScrollArea className={isExpanded ? "h-[400px]" : undefined}>
            <div className="space-y-3">
              {displayedLogs.map((log) => {
                const profile = profiles.get(log.user_id || '');
                const userName = log.user_display_name || profile?.display_name || 'Unknown User';
                const config = ACTIVITY_TYPE_CONFIG[log.activity_type] || { 
                  label: log.activity_type.replace(/_/g, ' '), 
                  color: 'bg-muted text-muted-foreground' 
                };

                return (
                  <div key={log.id} className="flex gap-3 text-sm">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={profile?.avatar_url || undefined} />
                      <AvatarFallback className="text-xs">
                        {getInitials(userName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{userName}</span>
                        <Badge variant="outline" className={cn("text-xs", config.color)}>
                          {config.label}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground text-xs mt-0.5 line-clamp-2">
                        {log.description}
                      </p>
                      <p className="text-muted-foreground/60 text-[10px] mt-1">
                        {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                        {' · '}
                        {format(new Date(log.created_at), 'MMM d, h:mm a')}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}

        {filteredLogs.length > 5 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full mt-3"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-4 w-4 mr-1" />
                Show Less
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-1" />
                Show {filteredLogs.length - 5} More
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
