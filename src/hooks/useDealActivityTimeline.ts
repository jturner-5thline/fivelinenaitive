import { useQuery } from '@tanstack/react-query';
import { subDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import {
  ActivityEvent, attendeeEmails, emailDomain, isGenericDomain, matchesParty,
  titleMentionsDeal, websiteDomain,
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

      const { data: deal } = await db.from('deals').select('company, contact_email').eq('id', dealId).maybeSingle();
      const dealName: string = deal?.company || '';

      const { data: lenders } = await db.from('deal_lenders')
        .select('id, name, master_lender_id, submitted_at, approved_at, passed_at, declined_at, last_status_change_at')
        .eq('deal_id', dealId);
      const lenderRows = (lenders || []) as any[];

      // Party matchers
      const clientEmails = new Set<string>(); const clientDomains = new Set<string>();
      const ce = (deal?.contact_email || '').trim().toLowerCase();
      if (ce) { clientEmails.add(ce); const d = emailDomain(ce); if (!isGenericDomain(d)) clientDomains.add(d!); }

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

      // Calendar events
      const { data: cal } = await db.from('calendar_events')
        .select('id, event_id, title, start_time, attendees, is_cancelled')
        .gte('start_time', since).lte('start_time', new Date().toISOString())
        .limit(2000);
      for (const ev of (cal || []) as any[]) {
        if (ev.is_cancelled) continue;
        const key = `cal:${ev.event_id || ev.id}`;
        const att = attendeeEmails(ev.attendees);
        if (att.some((a) => matchesParty(a, clientEmails, clientDomains))) events.push({ at: ev.start_time, kind: 'client_meeting', key });
        else if (att.some((a) => matchesParty(a, lenderEmails, lenderDomains))) events.push({ at: ev.start_time, kind: 'lender_meeting', key });
        else if (titleMentionsDeal(ev.title, dealName)) events.push({ at: ev.start_time, kind: 'title_meeting', key });
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
