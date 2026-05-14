import { useEffect, useState } from 'react';
import { differenceInCalendarDays, differenceInBusinessDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

/**
 * Tracks the last time a 5th Line user emailed *or* received an email from
 * the deal's primary borrower contact, so we can surface a "no client
 * contact in N days" nudge.
 *
 * Surface signal:
 *   • daysSince        — calendar days since last in/out email
 *   • businessDaysSince
 *   • isStale          — daysSince >= staleDays (default 7)
 *   • isCritical       — businessDaysSince >= criticalBusinessDays (default 8)
 *
 * The hook is no-op when the contact email is missing — we never invent
 * staleness from absence of data.
 */
export interface DealClientCadence {
  lastContactAt: string | null;
  daysSince: number | null;
  businessDaysSince: number | null;
  isStale: boolean;
  isCritical: boolean;
  isLoading: boolean;
  contactEmail: string | null;
  refresh: () => void;
}

export function useDealClientCadence(
  dealId: string | undefined,
  contactEmail: string | null | undefined,
  opts?: { staleDays?: number; criticalBusinessDays?: number },
): DealClientCadence {
  const staleDays = opts?.staleDays ?? 7;
  const criticalBusinessDays = opts?.criticalBusinessDays ?? 8;

  const [lastContactAt, setLastContactAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [tick, setTick] = useState(0);

  const email = (contactEmail || '').trim().toLowerCase();

  useEffect(() => {
    if (!dealId || !email) {
      setLastContactAt(null);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const [recvRes, sentRes] = await Promise.all([
          supabase
            .from('gmail_messages')
            .select('received_at, from_email, to_emails')
            .or(`from_email.ilike.%${email}%,to_emails.cs.{${email}}`)
            .order('received_at', { ascending: false })
            .limit(1),
          supabase
            .from('gmail_sent_messages')
            .select('sent_at, to_emails')
            .contains('to_emails', [email])
            .order('sent_at', { ascending: false })
            .limit(1),
        ]);
        if (cancelled) return;
        const r = recvRes.data?.[0]?.received_at ?? null;
        const s = sentRes.data?.[0]?.sent_at ?? null;
        const latest = [r, s].filter(Boolean).sort().pop() as string | undefined;
        setLastContactAt(latest ?? null);
      } catch (e) {
        if (!cancelled) setLastContactAt(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [dealId, email, tick]);

  const now = new Date();
  const daysSince = lastContactAt ? differenceInCalendarDays(now, new Date(lastContactAt)) : null;
  const businessDaysSince = lastContactAt ? differenceInBusinessDays(now, new Date(lastContactAt)) : null;

  return {
    lastContactAt,
    daysSince,
    businessDaysSince,
    isStale: daysSince !== null && daysSince >= staleDays,
    isCritical: businessDaysSince !== null && businessDaysSince >= criticalBusinessDays,
    isLoading,
    contactEmail: email || null,
    refresh: () => setTick(t => t + 1),
  };
}