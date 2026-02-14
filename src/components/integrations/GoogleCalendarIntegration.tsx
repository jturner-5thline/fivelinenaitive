import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { CalendarTimeGrid } from './CalendarTimeGrid';
import { 
  Calendar, 
  RefreshCw,
  Unplug,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { format, parseISO, startOfWeek, endOfWeek, addWeeks, subWeeks } from 'date-fns';

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
  } = useGoogleCalendar();

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

  const handleEventClick = (event: CalendarEvent) => {
    if (event.html_link) {
      window.open(event.html_link, '_blank');
    }
  };

  const getEventsByDay = () => {
    const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
    const days: { date: Date; events: CalendarEvent[] }[] = [];
    
    for (let d = new Date(currentWeekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
      const dayDate = new Date(d);
      const dayEvents = events.filter(event => {
        try {
          const eventDate = parseISO(event.start);
          return eventDate.toDateString() === dayDate.toDateString();
        } catch {
          return false;
        }
      });
      days.push({ date: dayDate, events: dayEvents });
    }
    
    return days;
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
            Connect your Google Calendar to view your events (read-only)
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
              <span className="text-xs text-muted-foreground">Read-only</span>
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

        {/* Calendar Grid */}
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-[400px] w-full" />
          </div>
        ) : (
          <CalendarTimeGrid
            days={weekDays}
            onEventEdit={handleEventClick}
            isUpdating={false}
          />
        )}

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}
