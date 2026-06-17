import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { buildDemoCalendarEvents, DEMO_PRIMARY_CALENDAR } from '@/lib/demoSeed';

const isDemoUserEmail = (email?: string | null) =>
  email === 'demo@5thline.co' || email === 'demo@example.com';

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
  is_expired?: boolean;
  scope?: string;
  connected_at?: string;
  email?: string;
}

/**
 * Module-level cache so reopening the Calendar widget rehydrates instantly
 * with the last successful response while the network revalidates in the
 * background. Scoped per-user.
 *
 * This keeps `useGoogleCalendar` ergonomic (still a plain hook) without
 * pulling React Query into the call sites, and avoids ever showing fake /
 * stale "demo" data while real data loads.
 */
const calendarCache: Record<
  string,
  { events: CalendarEvent[]; calendars: Calendar[]; status?: CalendarStatus }
> = {};

export function useGoogleCalendar() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const isDemoProfile = Boolean(
    (profile as { is_demo_user?: boolean } | null)?.is_demo_user,
  );
  const isDemo = isDemoUserEmail(user?.email) || isDemoProfile;
  const selfEmail = user?.email ?? 'demo@5thline.co';
  const selfName =
    (profile as { display_name?: string | null } | null)?.display_name ||
    user?.email ||
    'Demo User';
  const cacheKey = user?.id || 'anon';
  const cached = calendarCache[cacheKey];
  const [status, setStatus] = useState<CalendarStatus>(cached?.status || { connected: false });
  // If we have cached data we are NOT in the initial loading state — render
  // the cached calendar immediately and silently revalidate.
  const [isStatusLoading, setIsStatusLoading] = useState(!cached?.status);
  const [calendars, setCalendars] = useState<Calendar[]>(cached?.calendars || []);
  const [events, setEvents] = useState<CalendarEvent[]>(cached?.events || []);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    if (!user) { setIsStatusLoading(false); return; }
    if (isDemo) {
      const demoStatus: CalendarStatus = {
        connected: true,
        connected_at: new Date().toISOString(),
        email: 'demo@5thline.co',
      };
      setStatus(demoStatus);
      calendarCache[cacheKey] = {
        ...(calendarCache[cacheKey] || { events: [], calendars: [] }),
        status: demoStatus,
      };
      setIsStatusLoading(false);
      return;
    }
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.access_token) {
        setIsStatusLoading(false);
        return;
      }
      const { data, error } = await supabase.functions.invoke('calendar-status');
      if (error) throw error;
      setStatus(data);
      calendarCache[cacheKey] = { ...(calendarCache[cacheKey] || { events: [], calendars: [] }), status: data };
      setError(null);
    } catch (err: any) {
      const msg = err?.message || '';
      if (!/401|Unauthorized|Invalid token/i.test(msg)) {
        console.error('Calendar status error:', err);
        setError(msg);
      }
    } finally {
      setIsStatusLoading(false);
    }
  }, [user, cacheKey, isDemo]);

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
    if (isDemo) {
      const cals = [DEMO_PRIMARY_CALENDAR];
      setCalendars(cals);
      calendarCache[cacheKey] = { ...(calendarCache[cacheKey] || { events: [], calendars: [] }), calendars: cals };
      return cals;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('calendar-events', {
        body: { action: 'list_calendars' },
      });
      if (error) throw error;
      setCalendars(data.calendars || []);
      calendarCache[cacheKey] = { ...(calendarCache[cacheKey] || { events: [], calendars: [] }), calendars: data.calendars || [] };
      setError(null);
      return data.calendars;
    } catch (err: any) {
      console.error('Calendar list error:', err);
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [user, cacheKey, isDemo]);

  const listEvents = useCallback(async (options?: {
    calendarId?: string;
    timeMin?: string;
    timeMax?: string;
    maxResults?: number;
    pageToken?: string;
  }) => {
    if (!user) return null;
    if (isDemo) {
      const evts = buildDemoCalendarEvents({ selfEmail, selfName });
      setEvents(evts);
      calendarCache[cacheKey] = { ...(calendarCache[cacheKey] || { events: [], calendars: [] }), events: evts };
      return { events: evts };
    }
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
      calendarCache[cacheKey] = { ...(calendarCache[cacheKey] || { events: [], calendars: [] }), events: data.events || [] };
      setError(null);
      return data;
    } catch (err: any) {
      console.error('Events list error:', err);
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [user, cacheKey]);

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

  const syncAllCalendars = useCallback(async (options?: {
    timeMin?: string;
    timeMax?: string;
    maxResults?: number;
  }) => {
    if (!user) return null;
    if (isDemo) {
      const cals = [DEMO_PRIMARY_CALENDAR];
      const evts = buildDemoCalendarEvents({ selfEmail, selfName });
      setCalendars(cals);
      setEvents(evts);
      calendarCache[cacheKey] = { events: evts, calendars: cals, status: { connected: true } };
      return { calendars: cals, events: evts };
    }
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
  }, [user, isDemo, cacheKey]);

  const createEvent = useCallback(async (eventData: {
    summary: string;
    description?: string;
    location?: string;
    start: string;
    end: string;
    allDay?: boolean;
  }, calendarId?: string) => {
    if (!user) return null;
    try {
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const { data, error } = await supabase.functions.invoke('calendar-events', {
        body: {
          action: 'create',
          calendar_id: calendarId,
          timezone: userTimezone,
          event_data: {
            summary: eventData.summary,
            description: eventData.description,
            location: eventData.location,
            start: eventData.start,
            end: eventData.end,
            all_day: eventData.allDay,
          },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data.event as CalendarEvent;
    } catch (err: any) {
      console.error('Create event error:', err);
      setError(err.message);
      throw err;
    }
  }, [user]);

  const updateEvent = useCallback(async (eventId: string, eventData: {
    summary: string;
    description?: string;
    location?: string;
    start: string;
    end: string;
    allDay?: boolean;
  }, calendarId?: string) => {
    if (!user) return null;
    try {
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const { data, error } = await supabase.functions.invoke('calendar-events', {
        body: {
          action: 'update',
          event_id: eventId,
          calendar_id: calendarId,
          timezone: userTimezone,
          event_data: {
            summary: eventData.summary,
            description: eventData.description,
            location: eventData.location,
            start: eventData.start,
            end: eventData.end,
            all_day: eventData.allDay,
          },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data.event as CalendarEvent;
    } catch (err: any) {
      console.error('Update event error:', err);
      setError(err.message);
      throw err;
    }
  }, [user]);

  const deleteEvent = useCallback(async (eventId: string, calendarId?: string) => {
    if (!user) return;
    try {
      const { data, error } = await supabase.functions.invoke('calendar-events', {
        body: {
          action: 'delete',
          event_id: eventId,
          calendar_id: calendarId,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    } catch (err: any) {
      console.error('Delete event error:', err);
      setError(err.message);
      throw err;
    }
  }, [user]);

  useEffect(() => {
    if (user) checkStatus();
  }, [user, checkStatus]);

  return {
    status,
    isStatusLoading,
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
    createEvent,
    updateEvent,
    deleteEvent,
  };
}
