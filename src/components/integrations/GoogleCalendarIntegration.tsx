import { useEffect, useState, useMemo } from 'react';
import { useVisibilityAwareInterval } from "@/hooks/useVisibilityAwareInterval";
import { useSearchParams } from 'react-router-dom';
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { CalendarTimeGrid } from './CalendarTimeGrid';
import { CalendarDayView } from './CalendarDayView';
import { CalendarMonthView } from './CalendarMonthView';
import { CalendarAgendaView } from './CalendarAgendaView';
import { 
  Calendar, 
  RefreshCw,
  Unplug,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { format, parseISO, startOfWeek, endOfWeek, addWeeks, subWeeks, addDays, subDays, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';

type CalendarView = 'Day' | 'Week' | 'Month' | 'Agenda';

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
    isStatusLoading,
    events,
    isLoading,
    isConnecting,
    error,
    connect,
    disconnect,
    exchangeCode,
    listEvents,
  } = useGoogleCalendar();

  const [currentView, setCurrentView] = useState<CalendarView>('Week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentWeekStart, setCurrentWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));

  // Handle OAuth callback
  useEffect(() => {
    const code = searchParams.get('code');
    const isCalendarCallback = searchParams.get('calendar_callback');

    if (code && isCalendarCallback && user) {
      exchangeCode(code).then((success) => {
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

  // Compute date range based on current view
  const dateRange = useMemo(() => {
    switch (currentView) {
      case 'Day':
        return { start: currentDate, end: addDays(currentDate, 1) };
      case 'Week':
        return { start: currentWeekStart, end: endOfWeek(currentWeekStart, { weekStartsOn: 1 }) };
      case 'Month': {
        const ms = startOfMonth(currentDate);
        return { start: startOfWeek(ms, { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 }) };
      }
      case 'Agenda':
        return { start: currentDate, end: addDays(currentDate, 14) };
    }
  }, [currentView, currentDate, currentWeekStart]);

  // Load events when connected or date range changes. Refresh every 3
  // minutes — but only while the tab is visible, otherwise a long-lived
  // background tab hammers the calendar API.
  useEffect(() => {
    if (status.connected && user) loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.connected, user, dateRange.start.toISOString(), dateRange.end.toISOString()]);
  useVisibilityAwareInterval(
    () => { void loadEvents(); },
    status.connected && user ? 3 * 60 * 1000 : null,
  );

  const loadEvents = async () => {
    await listEvents({
      timeMin: dateRange.start.toISOString(),
      timeMax: dateRange.end.toISOString(),
      maxResults: currentView === 'Month' ? 200 : 50,
    });
  };

  const handleConnect = async () => { await connect(); };
  const handleDisconnect = async () => {
    await disconnect();
    toast.success('Google Calendar disconnected');
    onDisconnect?.();
  };
  const handleRefresh = async () => {
    await loadEvents();
    toast.success('Calendar refreshed');
  };

  const handleEventClick = (event: CalendarEvent) => {
    if (event.html_link) window.open(event.html_link, '_blank');
  };

  // Navigation handlers
  const goBack = () => {
    switch (currentView) {
      case 'Day': setCurrentDate(subDays(currentDate, 1)); break;
      case 'Week': setCurrentWeekStart(subWeeks(currentWeekStart, 1)); break;
      case 'Month': setCurrentDate(subMonths(currentDate, 1)); break;
      case 'Agenda': setCurrentDate(subDays(currentDate, 14)); break;
    }
  };
  const goForward = () => {
    switch (currentView) {
      case 'Day': setCurrentDate(addDays(currentDate, 1)); break;
      case 'Week': setCurrentWeekStart(addWeeks(currentWeekStart, 1)); break;
      case 'Month': setCurrentDate(addMonths(currentDate, 1)); break;
      case 'Agenda': setCurrentDate(addDays(currentDate, 14)); break;
    }
  };
  const goToToday = () => {
    setCurrentDate(new Date());
    setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
  };

  const handleViewChange = (view: CalendarView) => {
    setCurrentView(view);
    // Sync dates when switching views
    if (view === 'Week') {
      setCurrentWeekStart(startOfWeek(currentDate, { weekStartsOn: 1 }));
    }
  };

  // Title for current range
  const rangeTitle = useMemo(() => {
    switch (currentView) {
      case 'Day': return format(currentDate, 'EEEE, MMM d, yyyy');
      case 'Week': return `${format(currentWeekStart, 'MMM d')} – ${format(endOfWeek(currentWeekStart, { weekStartsOn: 1 }), 'MMM d, yyyy')}`;
      case 'Month': return format(currentDate, 'MMMM yyyy');
      case 'Agenda': return `${format(currentDate, 'MMM d')} – ${format(addDays(currentDate, 13), 'MMM d, yyyy')}`;
    }
  }, [currentView, currentDate, currentWeekStart]);

  const getEventsByDay = () => {
    const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
    const days: { date: Date; events: CalendarEvent[] }[] = [];
    for (let d = new Date(currentWeekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
      const dayDate = new Date(d);
      const dayEvents = events.filter(event => {
        try {
          const eventDate = parseISO(event.start);
          return eventDate.toDateString() === dayDate.toDateString();
        } catch { return false; }
      });
      days.push({ date: dayDate, events: dayEvents });
    }
    return days;
  };

  if (isStatusLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-5 rounded" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-4 w-56" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-[400px] w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!status.connected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Google Calendar
          </CardTitle>
          <CardDescription>
            Connect your Google Calendar to view your events (read-only). Uses your Google account connection.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleConnect} disabled={isConnecting}>
            {isConnecting ? 'Connecting...' : 'Connect Google Calendar'}
          </Button>
          {error && <p className="text-sm text-destructive mt-2">{error}</p>}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Google Calendar
            </CardTitle>
            <CardDescription className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-green-600 border-green-600">Connected</Badge>
              {status.email && <span className="text-xs text-muted-foreground">{status.email}</span>}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
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
        {/* Navigation bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={goBack}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={goForward}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={goToToday}>Today</Button>
            <h3 className="font-medium ml-2">{rangeTitle}</h3>
          </div>
          {/* Pill-style view toggle */}
          <div className="flex items-center bg-muted/50 rounded-lg p-[3px]">
            {(['Day', 'Week', 'Month', 'Agenda'] as CalendarView[]).map(view => (
              <button
                key={view}
                onClick={() => handleViewChange(view)}
                className={`px-3 py-1 text-xs rounded-md transition-all ${
                  view === currentView
                    ? 'bg-muted text-foreground font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {view}
              </button>
            ))}
          </div>
        </div>

        {/* Calendar content */}
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-[400px] w-full" />
          </div>
        ) : (
          <>
            {currentView === 'Week' && (
              <CalendarTimeGrid
                days={getEventsByDay()}
                onEventEdit={handleEventClick}
                isUpdating={false}
              />
            )}
            {currentView === 'Day' && (
              <CalendarDayView
                date={currentDate}
                events={events}
                onEventEdit={handleEventClick}
              />
            )}
            {currentView === 'Month' && (
              <CalendarMonthView
                currentDate={currentDate}
                events={events}
                onEventEdit={handleEventClick}
              />
            )}
            {currentView === 'Agenda' && (
              <CalendarAgendaView
                events={events}
                onEventEdit={handleEventClick}
              />
            )}
          </>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
