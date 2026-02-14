import { useState, useMemo } from 'react';
import { format, isToday, parseISO, isBefore, isAfter, startOfDay, endOfDay } from 'date-fns';
import { Calendar, Clock, Video, Users, Phone, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useGoogleCalendar, CalendarEvent } from '@/hooks/useGoogleCalendar';
import { useDealsContext } from '@/contexts/DealsContext';
import { cn } from '@/lib/utils';

type EventCategory = 'external' | 'internal' | 'bd';

function categorizeEvent(event: CalendarEvent): EventCategory {
  const summary = (event.summary || '').toLowerCase();
  const attendees = event.attendees || [];
  
  // BD signals
  if (summary.includes('intro') || summary.includes('pitch') || summary.includes('prospect') || summary.includes('lender') || summary.includes('term sheet')) {
    return 'bd';
  }
  
  // Check if external attendees exist
  const hasExternal = attendees.some(a => !a.self && !a.organizer);
  if (hasExternal) return 'external';
  
  return 'internal';
}

const CATEGORY_COLORS: Record<EventCategory, { bg: string; text: string; label: string }> = {
  external: { bg: 'bg-primary/10', text: 'text-primary', label: 'External' },
  internal: { bg: 'bg-muted', text: 'text-muted-foreground', label: 'Internal' },
  bd: { bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', label: 'BD' },
};

interface MyDayWidgetProps {
  defaultOpen?: boolean;
}

export function MyDayWidget({ defaultOpen = true }: MyDayWidgetProps) {
  const { events, isLoading, status: calendarStatus } = useGoogleCalendar();
  const { deals } = useDealsContext();
  const [isOpen, setIsOpen] = useState(() => {
    const saved = localStorage.getItem('dashboard-myday-open');
    return saved !== null ? JSON.parse(saved) : defaultOpen;
  });

  const handleToggle = (open: boolean) => {
    setIsOpen(open);
    localStorage.setItem('dashboard-myday-open', JSON.stringify(open));
  };

  const todayEvents = useMemo(() => {
    if (!events?.length) return [];
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    return events
      .filter(e => {
        const start = parseISO(e.start);
        return isAfter(start, todayStart) && isBefore(start, todayEnd) && !e.all_day;
      })
      .sort((a, b) => parseISO(a.start).getTime() - parseISO(b.start).getTime());
  }, [events]);

  // Try to match event attendees/subjects to deals
  const findRelatedDeal = (event: CalendarEvent) => {
    const summary = (event.summary || '').toLowerCase();
    const attendeeEmails = (event.attendees || []).map(a => a.email.toLowerCase());
    
    return deals.find(d => {
      const companyLower = d.company.toLowerCase();
      return summary.includes(companyLower) || 
        attendeeEmails.some(e => e.includes(companyLower.split(' ')[0]));
    });
  };

  const isPastEvent = (event: CalendarEvent) => isBefore(parseISO(event.end), new Date());
  const isCurrentEvent = (event: CalendarEvent) => {
    const now = new Date();
    return isBefore(parseISO(event.start), now) && isAfter(parseISO(event.end), now);
  };

  if (!calendarStatus?.connected) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            My Day
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            Connect Google Calendar to see your calls for today.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3"><Skeleton className="h-5 w-32" /></CardHeader>
        <CardContent className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={handleToggle}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-2 cursor-pointer hover:bg-muted/50 transition-colors">
            <CardTitle className="text-base font-medium flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                My Day
                <Badge variant="secondary" className="text-xs">{todayEvents.length} event{todayEvents.length !== 1 ? 's' : ''}</Badge>
              </div>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            {/* Color legend */}
            <div className="flex items-center gap-3 mb-3">
              {Object.entries(CATEGORY_COLORS).map(([key, val]) => (
                <div key={key} className="flex items-center gap-1.5 text-xs">
                  <div className={cn('h-2 w-2 rounded-full', val.bg, val.text)} style={{ backgroundColor: 'currentColor' }} />
                  <span className="text-muted-foreground">{val.label}</span>
                </div>
              ))}
            </div>

            <ScrollArea className="max-h-[350px]">
              {todayEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No events scheduled for today.</p>
              ) : (
                <div className="space-y-1">
                  {todayEvents.map(event => {
                    const category = categorizeEvent(event);
                    const colors = CATEGORY_COLORS[category];
                    const relatedDeal = findRelatedDeal(event);
                    const past = isPastEvent(event);
                    const current = isCurrentEvent(event);
                    const mainAttendee = event.attendees?.find(a => !a.self);
                    const hasVideo = !!(event.hangout_link || event.conference_data);

                    return (
                      <div
                        key={event.id}
                        className={cn(
                          'flex items-start gap-3 p-3 rounded-lg transition-colors',
                          current && 'bg-primary/5 border border-primary/20',
                          past && 'opacity-50',
                          !current && !past && 'hover:bg-muted/50'
                        )}
                      >
                        {/* Time column */}
                        <div className="text-right shrink-0 w-14">
                          <p className="text-sm font-medium text-foreground">{format(parseISO(event.start), 'h:mm a')}</p>
                          <p className="text-[10px] text-muted-foreground">{format(parseISO(event.end), 'h:mm a')}</p>
                        </div>

                        {/* Category indicator */}
                        <div className={cn('w-1 self-stretch rounded-full shrink-0', colors.bg)} />

                        {/* Content */}
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-foreground truncate">{event.summary}</p>
                            {hasVideo && <Video className="h-3 w-3 text-muted-foreground shrink-0" />}
                          </div>

                          {mainAttendee && (
                            <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                              <Users className="h-3 w-3 shrink-0" />
                              {mainAttendee.display_name || mainAttendee.email}
                              {event.attendees && event.attendees.filter(a => !a.self).length > 1 && (
                                <span>+{event.attendees.filter(a => !a.self).length - 1}</span>
                              )}
                            </p>
                          )}

                          {relatedDeal && (
                            <Badge variant="outline" className="text-[10px] gap-1">
                              {relatedDeal.company}
                            </Badge>
                          )}
                        </div>

                        {/* Join link */}
                        {hasVideo && !past && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(event.hangout_link || '', '_blank');
                            }}
                          >
                            Join
                            <ExternalLink className="h-3 w-3 ml-1" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
