/**
 * useDealTeamCalendarEvents — fetches calendar events from any teammate
 * (same email domain, Nylas-connected) whose event either mentions the
 * deal's company name in the title OR includes an attendee with an email
 * matching the deal's company URL/domain. Powers the "team meetings"
 * overlay in the deal CalendarPanel.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DealTeamCalendarEvent {
  id: string;
  nylas_id: string;
  title: string;
  start: string;
  end: string;
  all_day: boolean;
  location: string | null;
  html_link: string | null;
  hangout_link: string | null;
  participants: string[];
  match: { title: boolean; domain: boolean };
  teammate: {
    user_id: string;
    email: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
}

export function useDealTeamCalendarEvents(dealId: string | undefined, range: { start: Date; end: Date }, enabled = true) {
  const timeMin = range.start.toISOString();
  const timeMax = range.end.toISOString();
  return useQuery<DealTeamCalendarEvent[], Error>({
    queryKey: ['deal-team-calendar-events', dealId, timeMin, timeMax],
    enabled: !!dealId && enabled,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('deal-team-calendar-events', {
        body: { deal_id: dealId, time_min: timeMin, time_max: timeMax },
      });
      if (error) throw new Error(error.message || 'Failed to load team calendar events');
      return (data?.events || []) as DealTeamCalendarEvent[];
    },
  });
}