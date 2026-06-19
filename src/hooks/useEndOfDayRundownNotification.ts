import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCopilotStore, type CopilotMessage } from '@/stores/copilotStore';

/**
 * End of Day Rundown ready notification.
 *
 * Fires at or after 6 PM in the user's local timezone, on business
 * weekdays only, excluding federal/business holidays. Eligible users
 * mirror the existing briefing allowlist. Posts a single clickable
 * system message into the AI Copilot chat per local business day;
 * clicking opens the Daily Rundown modal pinned to the "End of Day" tab
 * (DealsHeader listens for `open-daily-rundown-end-of-day`).
 */

export const END_OF_DAY_REFRESH_HOUR_LOCAL = 18; // 6 PM local

const ELIGIBLE_EMAILS = new Set([
  'jturner@5thline.co',
  'nheikali@5thline.co',
  'ppina@5thline.co',
  'ffustinoni@5thline.co',
]);

function localParts(now: Date) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false, weekday: 'short',
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return {
    dateStr: `${get('year')}-${get('month')}-${get('day')}`,
    hour: parseInt(get('hour'), 10),
    weekday: weekdayMap[get('weekday')] ?? 0,
  };
}

function isSameLocalDay(iso: string | null | undefined, dateStr: string): boolean {
  if (!iso) return false;
  return localParts(new Date(iso)).dateStr === dateStr;
}

export function useEndOfDayRundownNotification() {
  const { user } = useAuth();
  const addMessage = useCopilotStore(s => s.addMessage);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!user) return;
    if (firedRef.current) return;

    const email = user.email?.toLowerCase() ?? '';
    if (!ELIGIBLE_EMAILS.has(email)) return;

    const { dateStr, hour, weekday } = localParts(new Date());
    if (weekday < 1 || weekday > 5) return; // weekends
    if (hour < END_OF_DAY_REFRESH_HOUR_LOCAL) return; // before 6 PM local

    let cancelled = false;
    (async () => {
      // Federal/business holiday?
      const { data: holiday } = await supabase
        .from('business_holidays')
        .select('id')
        .eq('holiday_date', dateStr)
        .eq('is_active', true)
        .maybeSingle();
      if (cancelled || holiday) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('last_eod_rundown_notice_at')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (isSameLocalDay((profile as any)?.last_eod_rundown_notice_at, dateStr)) return;

      const nowIso = new Date().toISOString();
      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ last_eod_rundown_notice_at: nowIso } as any)
        .eq('user_id', user.id);
      if (cancelled || updateErr) return;

      firedRef.current = true;

      const message: CopilotMessage = {
        id: `end-of-day-rundown-ready-${dateStr}`,
        role: 'assistant',
        content: 'Your End of Day Briefing is Ready',
        timestamp: new Date(),
        metadata: { kind: 'end_of_day_rundown_ready', dateStr },
      };
      addMessage(message);
    })();

    return () => { cancelled = true; };
  }, [user, addMessage]);
}