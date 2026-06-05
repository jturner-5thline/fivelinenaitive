/**
 * useTeammateCalendar — list teammates with a connected calendar (same
 * email domain as the signed-in user) and fetch events for a selected
 * teammate via the `teammate-calendar-events` edge function.
 *
 * Powers the "View teammate's calendar" selector in FullCalendarView so
 * users can check another teammate's availability without leaving the
 * canonical calendar surface.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CalendarEvent } from '@/hooks/useGoogleCalendar';

export interface Teammate {
  user_id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export function useTeammateList(enabled = true) {
  return useQuery<Teammate[], Error>({
    queryKey: ['teammate-calendar-list'],
    enabled,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('teammate-calendar-events', {
        body: { action: 'list_teammates' },
      });
      if (error) throw new Error(error.message || 'Failed to load teammates');
      return (data?.teammates ?? []) as Teammate[];
    },
  });
}

interface TeammateEventsArgs {
  userId: string | null;
  timeMin: string;
  timeMax: string;
  enabled?: boolean;
}

export function useTeammateEvents({ userId, timeMin, timeMax, enabled = true }: TeammateEventsArgs) {
  return useQuery<{ events: CalendarEvent[]; notConnected?: boolean; rateLimited?: boolean }, Error>({
    queryKey: ['teammate-calendar-events', userId, timeMin, timeMax],
    enabled: enabled && !!userId,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('teammate-calendar-events', {
        body: {
          action: 'list_events',
          target_user_id: userId,
          time_min: timeMin,
          time_max: timeMax,
        },
      });
      if (error) throw new Error(error.message || 'Failed to load teammate calendar');
      return {
        events: (data?.events ?? []) as CalendarEvent[],
        notConnected: !!data?.not_connected,
        rateLimited: !!data?.rate_limited,
      };
    },
  });
}