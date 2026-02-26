import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface CalendarEvent {
  id: string;
  calendar_id: string;
  summary: string;
  description: string | null;
  location: string | null;
  start: string;
  end: string;
  all_day: boolean;
  status: string;
  updated: string | null;
  created: string | null;
  html_link: string | null;
  hangout_link: string | null;
  conference_data?: any;
  attendees: {
    email: string;
    display_name: string | null;
    response_status: string;
    organizer: boolean;
    self: boolean;
  }[] | null;
  organizer: { email: string; displayName?: string } | null;
  color_id: string | null;
}

export interface Calendar {
  id: string;
  summary: string;
  description?: string;
  primary: boolean;
  background_color?: string;
  foreground_color?: string;
  access_role: string;
  time_zone?: string;
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

  const connect = useCallback(async () => {
    if (!user) return;
    setIsConnecting(true);
    try {
      const redirectUri = `${window.location.origin}/integrations?calendar_callback=true`;
      const { data, error } = await supabase.functions.invoke('calendar-auth', {
        body: { action: 'get_auth_url', redirect_uri: redirectUri },
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

  const exchangeCode = useCallback(async (code: string) => {
    if (!user) return false;
    setIsConnecting(true);
    try {
      const redirectUri = sessionStorage.getItem('calendar_redirect_uri') ||
        `${window.location.origin}/integrations?calendar_callback=true`;
      const { error } = await supabase.functions.invoke('calendar-auth', {
        body: { action: 'exchange_code', code, redirect_uri: redirectUri },
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

  const getEvent = useCallback(async (eventId: string, calendarId?: string) => {
    if (!user) return null;
    try {
      const { data, error } = await supabase.functions.invoke('calendar-events', {
        body: { action: 'get', event_id: eventId, calendar_id: calendarId },
      });
      if (error) throw error;
      return data.event as CalendarEvent;
    } catch (err: any) {
      console.error('Event get error:', err);
      setError(err.message);
      return null;
    }
  }, [user]);

  /** Fetch all calendars and all events across them in one call */
  const syncAllCalendars = useCallback(async (options?: {
    timeMin?: string;
    timeMax?: string;
    maxResults?: number;
  }) => {
    if (!user) return null;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('calendar-events', {
        body: {
          action: 'sync_all',
          time_min: options?.timeMin,
          time_max: options?.timeMax,
          max_results: options?.maxResults,
        },
      });
      if (error) throw error;
      setCalendars(data.calendars || []);
      setEvents(data.events || []);
      setError(null);
      return data;
    } catch (err: any) {
      console.error('Sync all error:', err);
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) checkStatus();
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
    syncAllCalendars,
  };
}
