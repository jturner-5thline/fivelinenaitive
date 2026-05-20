import { useState, useMemo } from 'react';
import { 
  Users, FileText, CheckSquare, MessageSquare, TrendingUp, 
  Mail, Upload, Search, Filter, ChevronDown
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { format, isToday, isYesterday, isThisWeek } from 'date-fns';

interface TimelineEvent {
  id: string;
  type: 'lender_update' | 'stage_change' | 'document' | 'milestone' | 'note' | 'email' | 'general';
  description: string;
  timestamp: string;
  actor?: string;
  metadata?: Record<string, any>;
}

interface UnifiedTimelineProps {
  events: TimelineEvent[];
  maxHeight?: string;
}

const typeConfig: Record<string, { icon: typeof Users; color: string; label: string }> = {
  lender_update: { icon: Users, color: 'text-blue-500 bg-blue-500/10', label: 'Funding Source' },
  stage_change: { icon: TrendingUp, color: 'text-purple-500 bg-purple-500/10', label: 'Stage' },
  document: { icon: Upload, color: 'text-green-500 bg-green-500/10', label: 'Document' },
  milestone: { icon: CheckSquare, color: 'text-amber-500 bg-amber-500/10', label: 'Milestone' },
  note: { icon: MessageSquare, color: 'text-cyan-500 bg-cyan-500/10', label: 'Note' },
  email: { icon: Mail, color: 'text-pink-500 bg-pink-500/10', label: 'Email' },
  general: { icon: FileText, color: 'text-muted-foreground bg-muted', label: 'Activity' },
};

const eventTypeFilters = ['all', 'lender_update', 'stage_change', 'document', 'milestone', 'note', 'email'] as const;

export function UnifiedTimeline({ events, maxHeight = '500px' }: UnifiedTimelineProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('all');

  const filteredEvents = useMemo(() => {
    let result = [...events].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    if (activeFilter !== 'all') {
      result = result.filter(e => e.type === activeFilter);
    }
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(e => 
        e.description.toLowerCase().includes(q) || 
        e.actor?.toLowerCase().includes(q)
      );
    }
    
    return result;
  }, [events, activeFilter, searchQuery]);

  // Group by date
  const groupedEvents = useMemo(() => {
    const groups: { label: string; events: TimelineEvent[] }[] = [];
    const groupMap = new Map<string, TimelineEvent[]>();
    
    filteredEvents.forEach(event => {
      const date = new Date(event.timestamp);
      let label: string;
      if (isToday(date)) label = 'Today';
      else if (isYesterday(date)) label = 'Yesterday';
      else if (isThisWeek(date)) label = format(date, 'EEEE');
      else label = format(date, 'MMM d, yyyy');
      
      if (!groupMap.has(label)) groupMap.set(label, []);
      groupMap.get(label)!.push(event);
    });
    
    groupMap.forEach((events, label) => groups.push({ label, events }));
    return groups;
  }, [filteredEvents]);

  return (
    <div className="space-y-3">
      {/* Search and Filter */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search activity..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-1">
        {eventTypeFilters.map(filter => {
          const config = filter === 'all' ? null : typeConfig[filter];
          const count = filter === 'all' ? events.length : events.filter(e => e.type === filter).length;
          if (filter !== 'all' && count === 0) return null;
          return (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors",
                activeFilter === filter
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "bg-card text-muted-foreground border-border hover:bg-muted"
              )}
            >
              {filter === 'all' ? 'All' : config?.label}
              <span className="opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Timeline */}
      <ScrollArea style={{ maxHeight }}>
        {groupedEvents.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No activity found</p>
        ) : (
          <div className="space-y-4">
            {groupedEvents.map(group => (
              <div key={group.label}>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2 sticky top-0 bg-background/95 backdrop-blur-sm py-1 z-10">
                  {group.label}
                </p>
                <div className="space-y-1">
                  {group.events.map(event => {
                    const config = typeConfig[event.type] || typeConfig.general;
                    const Icon = config.icon;
                    return (
                      <div key={event.id} className="flex items-start gap-2.5 py-1.5 group hover:bg-muted/30 rounded px-1 -mx-1 transition-colors">
                        <div className={cn("flex-shrink-0 h-6 w-6 rounded-full flex items-center justify-center mt-0.5", config.color)}>
                          <Icon className="h-3 w-3" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs leading-relaxed">{event.description}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-muted-foreground">
                              {format(new Date(event.timestamp), 'h:mm a')}
                            </span>
                            {event.actor && (
                              <span className="text-[10px] text-muted-foreground">
                                · {event.actor}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
