import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

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

interface Calendar {
  id: string;
  summary: string;
  description?: string;
  primary: boolean;
  background_color?: string;
  foreground_color?: string;
  access_role: string;
}

interface CalendarStatus {
  connected: boolean;
  expires_at?: string;
  is_expired?: boolean;
  scope?: string;
  connected_at?: string;
}

export function useGoogleCalendar() {
  const { user } = useAuth();
  const [status, setStatus] = useState<CalendarStatus>({ connected: false });
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check connection status
  const checkStatus = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase.functions.invoke('calendar-status');
      
      if (error) throw error;
      setStatus(data);
      setError(null);
    } catch (err: any) {
      console.error('Calendar status error:', err);
      setError(err.message);
    }
  }, [user]);

  // Get OAuth URL and redirect to Google
  const connect = useCallback(async () => {
    if (!user) return;

    setIsConnecting(true);
    try {
      const redirectUri = `${window.location.origin}/integrations?calendar_callback=true`;
      
      const { data, error } = await supabase.functions.invoke('calendar-auth', {
        body: {
          action: 'get_auth_url',
          redirect_uri: redirectUri,
        },
      });

      if (error) throw error;
      
      sessionStorage.setItem('calendar_redirect_uri', redirectUri);
      window.location.href = data.auth_url;
    } catch (err: any) {
      console.error('Calendar connect error:', err);
      setError(err.message);
      setIsConnecting(false);
    }
  }, [user]);

  // Exchange authorization code for tokens
  const exchangeCode = useCallback(async (code: string) => {
    if (!user) return false;

    setIsConnecting(true);
    try {
      const redirectUri = sessionStorage.getItem('calendar_redirect_uri') || 
        `${window.location.origin}/integrations?calendar_callback=true`;
      
      const { data, error } = await supabase.functions.invoke('calendar-auth', {
        body: {
          action: 'exchange_code',
          code,
          redirect_uri: redirectUri,
        },
      });

      if (error) throw error;
      
      sessionStorage.removeItem('calendar_redirect_uri');
      await checkStatus();
      setError(null);
      return true;
    } catch (err: any) {
      console.error('Calendar code exchange error:', err);
      setError(err.message);
      return false;
    } finally {
      setIsConnecting(false);
    }
  }, [user, checkStatus]);

  // Disconnect Calendar
  const disconnect = useCallback(async () => {
    if (!user) return;

    try {
      const { error } = await supabase.functions.invoke('calendar-auth', {
        body: { action: 'disconnect' },
      });

      if (error) throw error;
      
      setStatus({ connected: false });
      setCalendars([]);
      setEvents([]);
      setError(null);
    } catch (err: any) {
      console.error('Calendar disconnect error:', err);
      setError(err.message);
    }
  }, [user]);

  // List calendars
  const listCalendars = useCallback(async () => {
    if (!user) return null;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('calendar-events', {
        body: { action: 'list_calendars' },
      });

      if (error) throw error;
      
      setCalendars(data.calendars || []);
      setError(null);
      return data.calendars;
    } catch (err: any) {
      console.error('Calendar list error:', err);
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // List events
  const listEvents = useCallback(async (options?: {
    calendarId?: string;
    timeMin?: string;
    timeMax?: string;
    maxResults?: number;
    pageToken?: string;
  }) => {
    if (!user) return null;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('calendar-events', {
        body: {
          action: 'list',
          calendar_id: options?.calendarId,
          time_min: options?.timeMin,
          time_max: options?.timeMax,
          max_results: options?.maxResults || 50,
          page_token: options?.pageToken,
        },
      });

      if (error) throw error;
      
      setEvents(data.events || []);
      setError(null);
      return data;
    } catch (err: any) {
      console.error('Events list error:', err);
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Get single event
  const getEvent = useCallback(async (eventId: string, calendarId?: string) => {
    if (!user) return null;

    try {
      const { data, error } = await supabase.functions.invoke('calendar-events', {
        body: {
          action: 'get',
          event_id: eventId,
          calendar_id: calendarId,
        },
      });

      if (error) throw error;
      return data.event;
    } catch (err: any) {
      console.error('Event get error:', err);
      setError(err.message);
      return null;
    }
  }, [user]);

  // Create event
  const createEvent = useCallback(async (eventData: {
    summary: string;
    description?: string;
    location?: string;
    start: string;
    end: string;
    allDay?: boolean;
    attendees?: string[];
  }, calendarId?: string) => {
    if (!user) return null;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('calendar-events', {
        body: {
          action: 'create',
          calendar_id: calendarId,
          event_data: {
            summary: eventData.summary,
            description: eventData.description,
            location: eventData.location,
            start: eventData.start,
            end: eventData.end,
            all_day: eventData.allDay,
            attendees: eventData.attendees,
          },
        },
      });

      if (error) throw error;
      setError(null);
      return data.event;
    } catch (err: any) {
      console.error('Event create error:', err);
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Update event
  const updateEvent = useCallback(async (eventId: string, eventData: {
    summary: string;
    description?: string;
    location?: string;
    start: string;
    end: string;
    allDay?: boolean;
    attendees?: string[];
  }, calendarId?: string) => {
    if (!user) return null;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('calendar-events', {
        body: {
          action: 'update',
          event_id: eventId,
          calendar_id: calendarId,
          event_data: {
            summary: eventData.summary,
            description: eventData.description,
            location: eventData.location,
            start: eventData.start,
            end: eventData.end,
            all_day: eventData.allDay,
            attendees: eventData.attendees,
          },
        },
      });

      if (error) throw error;
      setError(null);
      return data.event;
    } catch (err: any) {
      console.error('Event update error:', err);
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Delete event
  const deleteEvent = useCallback(async (eventId: string, calendarId?: string) => {
    if (!user) return false;

    setIsLoading(true);
    try {
      const { error } = await supabase.functions.invoke('calendar-events', {
        body: {
          action: 'delete',
          event_id: eventId,
          calendar_id: calendarId,
        },
      });

      if (error) throw error;
      setError(null);
      return true;
    } catch (err: any) {
      console.error('Event delete error:', err);
      setError(err.message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Check status on mount
  useEffect(() => {
    if (user) {
      checkStatus();
    }
  }, [user, checkStatus]);

  return {
    status,
    calendars,
    events,
    isLoading,
    isConnecting,
    error,
    connect,
    disconnect,
    exchangeCode,
    checkStatus,
    listCalendars,
    listEvents,
    getEvent,
    createEvent,
    updateEvent,
    deleteEvent,
  };
}
