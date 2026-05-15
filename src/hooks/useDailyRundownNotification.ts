import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCopilotStore, type CopilotMessage } from '@/stores/copilotStore';

/**
 * Daily Rundown ready notification.
 *
 * On authenticated app load, if today is a US business weekday past the
 * configured refresh time, the user is among the briefing-eligible
 * audience, and they have not already been notified today, push a
 * clickable system message into the naitive AI chat. Clicking the message
 * opens the existing Daily Rundown modal (DealsHeader listens for the
 * `open-daily-rundown` window event).
 *
 * Duplicate firing across tabs / refreshes is prevented by persisting
 * `profiles.last_daily_rundown_notice_at` in the database.
 */

/** Hour-of-day (in user timezone, defaults to ET) the rundown is refreshed. */
export const DAILY_RUNDOWN_REFRESH_HOUR_ET = 7;

/** Allow-list mirrors DealsHeader.canSeeBriefingHeaderItems. */
const BRIEFING_ELIGIBLE_EMAILS = new Set([
  'jturner@5thline.co',
  'nheikali@5thline.co',
]);

/** Today's YYYY-MM-DD in the America/New_York business timezone. */
function todayET(): { dateStr: string; hour: number; weekday: number } {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false, weekday: 'short',
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  const dateStr = `${get('year')}-${get('month')}-${get('day')}`;
  const hour = parseInt(get('hour'), 10);
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = weekdayMap[get('weekday')] ?? 0;
  return { dateStr, hour, weekday };
}

function isSameETDay(iso: string | null | undefined, dateStr: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}` === dateStr;
}

export function useDailyRundownNotification() {
  const { user } = useAuth();
  const addMessage = useCopilotStore(s => s.addMessage);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!user) return;
    if (firedRef.current) return;

    const email = user.email?.toLowerCase() ?? '';
    if (!BRIEFING_ELIGIBLE_EMAILS.has(email)) return;

    const { dateStr, hour, weekday } = todayET();

    // Weekdays only.
    if (weekday < 1 || weekday > 5) return;
    // After the daily refresh hour.
    if (hour < DAILY_RUNDOWN_REFRESH_HOUR_ET) return;

    let cancelled = false;
    (async () => {
      // Holiday check.
      const { data: holiday } = await supabase
        .from('business_holidays')
        .select('id')
        .eq('holiday_date', dateStr)
        .eq('is_active', true)
        .maybeSingle();
      if (cancelled || holiday) return;

      // Already notified today?
      const { data: profile } = await supabase
        .from('profiles')
        .select('last_daily_rundown_notice_at')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (isSameETDay(profile?.last_daily_rundown_notice_at as any, dateStr)) return;

      // Reserve the slot first to prevent multi-tab duplicates.
      const nowIso = new Date().toISOString();
      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ last_daily_rundown_notice_at: nowIso } as any)
        .eq('user_id', user.id);
      if (cancelled || updateErr) return;

      firedRef.current = true;

      const message: CopilotMessage = {
        id: `daily-rundown-ready-${dateStr}`,
        role: 'assistant',
        content: 'Your Daily Rundown is Ready',
        timestamp: new Date(),
        metadata: { kind: 'daily_rundown_ready', dateStr },
      };
      addMessage(message);
    })();

    return () => { cancelled = true; };
  }, [user, addMessage]);
}
