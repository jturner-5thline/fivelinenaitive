import { useQuery } from '@tanstack/react-query';
import { subDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import {
  ActivityEvent, emailDomain, isGenericDomain, matchesParty, websiteDomain,
} from '@/lib/dealActivityTimeline';

const WINDOW_DAYS = 90;

/** Collects the five Deal Space activity streams for the last ~12 weeks. */
export function useDealActivityTimeline(dealId: string | undefined) {
  return useQuery<ActivityEvent[]>({
    queryKey: ['deal-activity-timeline', dealId],
    enabled: !!dealId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!dealId) return [];
      const since = subDays(new Date(), WINDOW_DAYS).toISOString();
      const db = supabase as any;

      const { data: deal } = await db.from('deals').select('company').eq('id', dealId).maybeSingle();
      const dealName: string = deal?.company || '';

      const { data: lenders } = await db.from('deal_lenders')
        .select('id, name, master_lender_id, submitted_at, approved_at, passed_at, declined_at, last_status_change_at')
        .eq('deal_id', dealId);
      const lenderRows = (lenders || []) as any[];

      // Funding-source party matchers for email activity.
      const lenderEmails = new Set<string>(); const lenderDomains = new Set<string>();
      const masterIds = lenderRows.map((l) => l.master_lender_id).filter(Boolean);
      if (masterIds.length) {
        const { data: ml } = await db.from('master_lenders').select('email, website').in('id', masterIds);
        for (const m of (ml || []) as any[]) {
          const e = (m.email || '').trim().toLowerCase();
          if (e) { lenderEmails.add(e); const d = emailDomain(e); if (!isGenericDomain(d)) lenderDomains.add(d!); }
          const w = websiteDomain(m.website); if (w && !isGenericDomain(w)) lenderDomains.add(w);
        }
      }

      const events: ActivityEvent[] = [];

      // Lender stage progressions
      for (const l of lenderRows) {
        for (const f of ['submitted_at', 'approved_at', 'passed_at', 'declined_at', 'last_status_change_at']) {
          if (l[f] && l[f] >= since) events.push({ at: l[f], kind: 'lender_stage', key: `ls:${l.id}:${l[f]}` });
        }
      }

      // The calendar mirror is caller-only under RLS. Read all verified company
      // members' connected calendars through the deal-scoped endpoint instead.
      const { data: cal, error: calendarError } = await supabase.functions.invoke('deal-team-calendar-events', {
        body: { deal_id: dealId, time_min: since, time_max: new Date().toISOString() },
      });
      if (calendarError || cal?.error) throw new Error(cal?.error || calendarError?.message || 'Could not load team calendars');
      for (const ev of (cal?.events || []) as any[]) {
        if (ev.start < since || new Date(ev.start).getTime() > Date.now()) continue;
        const key = `cal:${ev.source_key || ev.nylas_id}`;
        if (ev.match?.contact || ev.match?.domain) events.push({ at: ev.start, kind: 'client_meeting', key });
        else if (ev.match?.lender) events.push({ at: ev.start, kind: 'lender_meeting', key });
        else if (ev.match?.title) events.push({ at: ev.start, kind: 'title_meeting', key });
      }

      // Funding-source emails that reference the company
      if (dealName.trim().length >= 3 && (lenderEmails.size || lenderDomains.size)) {
        const pat = `%${dealName.trim().replace(/[%_,()]/g, ' ')}%`;
        const { data: mail } = await db.from('email_cache')
          .select('id, thread_id, gmail_message_id, from_email, to_emails, cc_emails, received_at')
          .gte('received_at', since)
          .or(`subject.ilike.${pat},body_text.ilike.${pat},snippet.ilike.${pat}`)
          .limit(1000);
        for (const m of (mail || []) as any[]) {
          const parties = [m.from_email, ...(m.to_emails || []), ...(m.cc_emails || [])]
            .map((x: any) => (typeof x === 'string' ? x : x?.email || ''))
            .map((x: string) => (x.match(/<([^>]+)>/)?.[1] || x).trim().toLowerCase())
            .filter(Boolean);
          if (parties.some((p: string) => matchesParty(p, lenderEmails, lenderDomains))) {
            events.push({ at: m.received_at, kind: 'lender_email', key: `em:${m.gmail_message_id || m.id}` });
          }
        }
      }
      return events;
    },
  });
}
