/**
 * useUserCalendarPrefs — reads/writes the signed-in user's calendar
 * preferences (TZ + working hours + recently-used TZs) on
 * `user_email_ai_preferences`. Used by NaitiveCalendar (TZ chip,
 * working-hours dim band) and the Working Hours settings panel.
 */
import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type WorkingHours = Record<DayOfWeek, { start: string; end: string } | null>;

export const DEFAULT_WORKING_HOURS: WorkingHours = {
  mon: { start: '09:00', end: '18:00' },
  tue: { start: '09:00', end: '18:00' },
  wed: { start: '09:00', end: '18:00' },
  thu: { start: '09:00', end: '18:00' },
  fri: { start: '09:00', end: '18:00' },
  sat: null,
  sun: null,
};

export interface UserCalendarPrefs {
  calendar_tz: string | null;
  working_hours: WorkingHours;
  recent_tz: string[];
}

const BROWSER_TZ =
  typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';

export function useUserCalendarPrefs() {
  const qc = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const query = useQuery<UserCalendarPrefs>({
    queryKey: ['user-calendar-prefs', userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_email_ai_preferences')
        .select('calendar_tz, working_hours, recent_tz')
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      return {
        calendar_tz: data?.calendar_tz ?? null,
        working_hours: (data?.working_hours as WorkingHours) ?? DEFAULT_WORKING_HOURS,
        recent_tz: (data?.recent_tz as string[]) ?? [],
      };
    },
  });

  const setTz = useCallback(
    async (tz: string) => {
      if (!userId) return;
      const prev = query.data?.recent_tz ?? [];
      const recent = [tz, ...prev.filter((t) => t !== tz)].slice(0, 3);
      await supabase.from('user_email_ai_preferences').upsert(
        { user_id: userId, calendar_tz: tz, recent_tz: recent },
        { onConflict: 'user_id' },
      );
      qc.invalidateQueries({ queryKey: ['user-calendar-prefs', userId] });
    },
    [userId, query.data?.recent_tz, qc],
  );

  const setWorkingHours = useCallback(
    async (wh: WorkingHours) => {
      if (!userId) return;
      await supabase.from('user_email_ai_preferences').upsert(
        { user_id: userId, working_hours: wh as any },
        { onConflict: 'user_id' },
      );
      qc.invalidateQueries({ queryKey: ['user-calendar-prefs', userId] });
    },
    [userId, qc],
  );

  const tz = query.data?.calendar_tz ?? BROWSER_TZ;

  return {
    tz,
    workingHours: query.data?.working_hours ?? DEFAULT_WORKING_HOURS,
    recentTz: query.data?.recent_tz ?? [],
    setTz,
    setWorkingHours,
    isLoaded: !!query.data,
  };
}