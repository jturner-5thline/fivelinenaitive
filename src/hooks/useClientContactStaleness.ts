import { useEffect, useState } from 'react';
import { differenceInBusinessDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

/**
 * Bulk variant of useDealClientCadence — given a list of {dealId, contactEmail}
 * pairs, returns a Map keyed by dealId with the most recent in/out email
 * timestamp and business-day staleness. Used by the Morning Brief to
 * escalate "no client contact in 8 business days" relationship risks.
 */
export interface StalenessEntry {
  lastContactAt: string | null;
  businessDaysSince: number | null;
}

export function useClientContactStaleness(
  inputs: Array<{ dealId: string; contactEmail: string | null | undefined }>,
) {
  const [byDeal, setByDeal] = useState<Map<string, StalenessEntry>>(new Map());

  // Stable signature to avoid re-running on identical input array refs.
  const sig = inputs
    .map(i => `${i.dealId}:${(i.contactEmail || '').toLowerCase()}`)
    .sort()
    .join('|');

  useEffect(() => {
    const pairs = inputs.filter(i => i.dealId && (i.contactEmail || '').trim());
    if (pairs.length === 0) { setByDeal(new Map()); return; }
    const emails = Array.from(new Set(pairs.map(p => (p.contactEmail || '').toLowerCase())));
    let cancelled = false;
    (async () => {
      // Pull recent sent + received and reduce to latest per email.
      const since = new Date(Date.now() - 60 * 86400000).toISOString();
      const [recvRes, sentRes] = await Promise.all([
        supabase
          .from('gmail_messages')
          .select('received_at, from_email, to_emails')
          .gte('received_at', since)
          .limit(2000),
        supabase
          .from('gmail_sent_messages')
          .select('sent_at, to_emails')
          .gte('sent_at', since)
          .limit(2000),
      ]);
      if (cancelled) return;
      const latestByEmail = new Map<string, string>();
      const bump = (em: string | null | undefined, ts: string | null | undefined) => {
        if (!em || !ts) return;
        const key = em.toLowerCase();
        const cur = latestByEmail.get(key);
        if (!cur || ts > cur) latestByEmail.set(key, ts);
      };
      for (const m of recvRes.data ?? []) {
        bump(m.from_email, m.received_at);
        for (const t of m.to_emails ?? []) bump(t, m.received_at);
      }
      for (const m of sentRes.data ?? []) {
        for (const t of m.to_emails ?? []) bump(t, m.sent_at);
      }
      const now = new Date();
      const next = new Map<string, StalenessEntry>();
      for (const p of pairs) {
        const ts = latestByEmail.get((p.contactEmail || '').toLowerCase()) ?? null;
        next.set(p.dealId, {
          lastContactAt: ts,
          businessDaysSince: ts ? differenceInBusinessDays(now, new Date(ts)) : null,
        });
      }
      setByDeal(next);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  return byDeal;
}