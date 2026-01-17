import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { CalendarEventDialog } from './CalendarEventDialog';
import { 
  Calendar, 
  CalendarDays, 
  Clock, 
  MapPin, 
  Users, 
  Video, 
  ExternalLink,
  RefreshCw,
  Unplug,
  ChevronLeft,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
} from 'lucide-react';
import { format, parseISO, startOfWeek, endOfWeek, addWeeks, subWeeks, isToday, isSameDay } from 'date-fns';

interface GoogleCalendarIntegrationProps {
  onDisconnect?: () => void;
}

interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  all_day: boolean;
  status: string;
  html_link?: string;
  hangout_link?: string;
  conference_data?: any;
  attendees?: {
    email: string;
    display_name?: string;
    response_status: string;
    organizer?: boolean;
    self?: boolean;
  }[];
  organizer?: { email: string; displayName?: string };
  created?: string;
  updated?: string;
  color_id?: string;
}

export function GoogleCalendarIntegration({ onDisconnect }: GoogleCalendarIntegrationProps) {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    status,
    events,
    isLoading,
    isConnecting,
    error,
    connect,
    disconnect,
    exchangeCode,
    listEvents,
    createEvent,
    updateEvent,
    deleteEvent,
  } = useGoogleCalendar();

  const [currentWeekStart, setCurrentWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

  // Handle OAuth callback
  useEffect(() => {
    const code = searchParams.get('code');
    const isCalendarCallback = searchParams.get('calendar_callback');

    if (code && isCalendarCallback && user) {
      exchangeCode(code).then((success) => {
        // Clean up URL
        searchParams.delete('code');
        searchParams.delete('calendar_callback');
        searchParams.delete('scope');
        searchParams.delete('authuser');
        searchParams.delete('prompt');
        setSearchParams(searchParams, { replace: true });

        if (success) {
          toast.success('Google Calendar connected successfully!');
          loadEvents();
        } else {
          toast.error('Failed to connect Google Calendar');
        }
      });
    }
  }, [searchParams, user, exchangeCode, setSearchParams]);

  // Load events when connected
  useEffect(() => {
    if (status.connected && user) {
      loadEvents();
    }
  }, [status.connected, user, currentWeekStart]);

  const loadEvents = async () => {
    const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
    await listEvents({
      timeMin: currentWeekStart.toISOString(),
      timeMax: weekEnd.toISOString(),
    });
  };

  const handleConnect = async () => {
    await connect();
  };

  const handleDisconnect = async () => {
    await disconnect();
    toast.success('Google Calendar disconnected');
    onDisconnect?.();
  };

  const handleRefresh = async () => {
    await loadEvents();
    toast.success('Calendar refreshed');
  };

  const goToPreviousWeek = () => {
    setCurrentWeekStart(subWeeks(currentWeekStart, 1));
  };

  const goToNextWeek = () => {
    setCurrentWeekStart(addWeeks(currentWeekStart, 1));
  };

  const goToToday = () => {
    setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
  };

  const formatEventTime = (event: CalendarEvent) => {
    if (event.all_day) {
      return 'All day';
    }
    const start = parseISO(event.start);
    const end = parseISO(event.end);
    return `${format(start, 'h:mm a')} - ${format(end, 'h:mm a')}`;
  };

  const getEventsByDay = () => {
    const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
    const days: { date: Date; events: CalendarEvent[] }[] = [];
    
    for (let d = new Date(currentWeekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
      const dayDate = new Date(d);
      const dayEvents = events.filter(event => {
        const eventDate = parseISO(event.start);
        return isSameDay(eventDate, dayDate);
      });
      days.push({ date: dayDate, events: dayEvents });
    }
    
    return days;
  };

  const handleCreateEvent = () => {
    setEditingEvent(null);
    setEventDialogOpen(true);
  };

  const handleEditEvent = (event: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingEvent(event);
    setEventDialogOpen(true);
  };

  const handleSaveEvent = async (eventData: {
    summary: string;
    description?: string;
    location?: string;
    start: string;
    end: string;
    allDay?: boolean;
  }) => {
    if (editingEvent) {
      const result = await updateEvent(editingEvent.id, eventData);
      if (result) {
        toast.success('Event updated');
        setEventDialogOpen(false);
        loadEvents();
      } else {
        toast.error('Failed to update event');
      }
    } else {
      const result = await createEvent(eventData);
      if (result) {
        toast.success('Event created');
        setEventDialogOpen(false);
        loadEvents();
      } else {
        toast.error('Failed to create event');
      }
    }
  };

  const handleDeleteEvent = async () => {
    if (!editingEvent) return;

    const success = await deleteEvent(editingEvent.id);
    if (success) {
      toast.success('Event deleted');
      setEventDialogOpen(false);
      setSelectedEvent(null);
      loadEvents();
    } else {
      toast.error('Failed to delete event');
    }
  };

  if (!status.connected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Google Calendar
          </CardTitle>
          <CardDescription>
            Connect your Google Calendar to view and manage your events
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleConnect} disabled={isConnecting}>
            {isConnecting ? 'Connecting...' : 'Connect Google Calendar'}
          </Button>
          {error && (
            <p className="text-sm text-destructive mt-2">{error}</p>
          )}
        </CardContent>
      </Card>
    );
  }

  const weekDays = getEventsByDay();

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Google Calendar
              </CardTitle>
              <CardDescription className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-green-600 border-green-600">
                  Connected
                </Badge>
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="default" size="sm" onClick={handleCreateEvent}>
                <Plus className="h-4 w-4 mr-1" />
                New Event
              </Button>
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={handleDisconnect}>
                <Unplug className="h-4 w-4 mr-1" />
                Disconnect
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Week Navigation */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={goToPreviousWeek}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={goToNextWeek}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={goToToday}>
                Today
              </Button>
            </div>
            <h3 className="font-medium">
              {format(currentWeekStart, 'MMM d')} - {format(endOfWeek(currentWeekStart, { weekStartsOn: 1 }), 'MMM d, yyyy')}
            </h3>
          </div>

          {/* Events by Day */}
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ))}
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-4 pr-4">
                {weekDays.map(({ date, events: dayEvents }) => (
                  <div key={date.toISOString()} className="space-y-2">
                    <h4 className={`text-sm font-medium flex items-center gap-2 ${isToday(date) ? 'text-primary' : 'text-muted-foreground'}`}>
                      <CalendarDays className="h-4 w-4" />
                      {format(date, 'EEEE, MMM d')}
                      {isToday(date) && <Badge variant="secondary" className="text-xs">Today</Badge>}
                    </h4>
                    
                    {dayEvents.length === 0 ? (
                      <p className="text-sm text-muted-foreground pl-6">No events</p>
                    ) : (
                      <div className="space-y-2 pl-6">
                        {dayEvents.map((event) => (
                          <div
                            key={event.id}
                            className="p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors"
                            onClick={() => setSelectedEvent(selectedEvent?.id === event.id ? null : event)}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{event.summary}</p>
                                <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  {formatEventTime(event)}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={(e) => handleEditEvent(event, e)}
                                  className="p-1 hover:bg-primary/10 rounded"
                                  title="Edit event"
                                >
                                  <Pencil className="h-4 w-4 text-muted-foreground hover:text-primary" />
                                </button>
                                {event.hangout_link && (
                                  <a
                                    href={event.hangout_link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="p-1 hover:bg-primary/10 rounded"
                                  >
                                    <Video className="h-4 w-4 text-primary" />
                                  </a>
                                )}
                                {event.html_link && (
                                  <a
                                    href={event.html_link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="p-1 hover:bg-primary/10 rounded"
                                  >
                                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                                  </a>
                                )}
                              </div>
                            </div>

                            {/* Expanded details */}
                            {selectedEvent?.id === event.id && (
                              <div className="mt-3 pt-3 border-t space-y-2">
                                {event.description && (
                                  <p className="text-sm text-muted-foreground">{event.description}</p>
                                )}
                                {event.location && (
                                  <div className="flex items-center gap-2 text-sm">
                                    <MapPin className="h-3 w-3 text-muted-foreground" />
                                    <span>{event.location}</span>
                                  </div>
                                )}
                                {event.attendees && event.attendees.length > 0 && (
                                  <div className="flex items-start gap-2 text-sm">
                                    <Users className="h-3 w-3 text-muted-foreground mt-0.5" />
                                    <div className="flex flex-wrap gap-1">
                                      {event.attendees.slice(0, 5).map((attendee, i) => (
                                        <Badge key={i} variant="secondary" className="text-xs">
                                          {attendee.display_name || attendee.email}
                                        </Badge>
                                      ))}
                                      {event.attendees.length > 5 && (
                                        <Badge variant="secondary" className="text-xs">
                                          +{event.attendees.length - 5} more
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </CardContent>
      </Card>

      <CalendarEventDialog
        open={eventDialogOpen}
        onOpenChange={setEventDialogOpen}
        event={editingEvent}
        onSave={handleSaveEvent}
        onDelete={editingEvent ? handleDeleteEvent : undefined}
        isLoading={isLoading}
      />
    </>
  );
}
