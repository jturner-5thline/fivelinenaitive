/**
 * useLenderCallCounts — counts calendar events (claap_meetings) in a window
 * whose attendees include an email / email domain tied to a funding source,
 * split by whether that funding source is marked Active.
 *
 * Matching sources, in order of precedence per meeting:
 *   • the meeting's matched contact is a linked lender contact
 *   • an attendee email exactly matches a lender / lender-contact email
 *   • an attendee email domain matches a lender email or website domain
 * A meeting touching any active funding source counts as "existing"; one that
 * only touches non-active funding sources counts as "new".
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { INTERNAL_DOMAINS, domainOf } from '@/lib/internalDomains';

export interface LenderCallRow {
  id: string;
  title: string | null;
  started_at: string | null;
  lender: string;
  active: boolean;
}

export interface LenderCallCounts {
  existing: LenderCallRow[];
  fresh: LenderCallRow[];
}

function websiteDomain(raw: unknown): string | null {
  const v = String(raw || '').trim();
  if (!v) return null;
  const host = v
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0]
    .toLowerCase();
  if (!host || !host.includes('.')) return null;
  return host;
}

export function useLenderCallCounts(start: Date | null, end: Date | null, enabled = true) {
  const { company } = useCompany();
  return useQuery<LenderCallCounts, Error>({
    queryKey: [
      'lender_call_counts_v1',
      company?.id,
      start?.toISOString() ?? null,
      end?.toISOString() ?? null,
    ],
    enabled: enabled && !!company?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      let q = supabase
        .from('claap_meetings')
        .select('id, title, started_at, matched_contact_id')
        .eq('company_id', company!.id);
      if (start) q = q.gte('started_at', start.toISOString());
      if (end) q = q.lte('started_at', end.toISOString());
      const { data: meetingRows, error } = await q;
      if (error) throw error;
      let meetings = (meetingRows || []) as {
        id: string;
        title: string | null;
        started_at: string | null;
        matched_contact_id: string | null;
      }[];
      if (meetings.length === 0) return { existing: [], fresh: [] };

      // Calls whose title mentions a deal name are deal calls, not lender
      // relationship calls — exclude them from both buckets.
      const { data: dealNameRows } = await supabase
        .from('deals')
        .select('company')
        .eq('company_id', company!.id)
        .not('company', 'is', null);
      const dealNames = Array.from(
        new Set(
          (dealNameRows || [])
            .map((d: any) => normalizeEntityName(String(d.company || '')))
            .filter((n) => n.length >= 4 && !isExcludedDealName(n)),
        ),
      );
      if (dealNames.length > 0) {
        meetings = meetings.filter((m) => {
          const t = normalizeEntityName(m.title || '');
          if (!t) return true;
          return !dealNames.some((n) => titleMatchesEntity(t, n));
        });
      }
      if (meetings.length === 0) return { existing: [], fresh: [] };

      // Funding-source lookup tables.
      const byEmail = new Map<string, { name: string; active: boolean }>();
      const byDomain = new Map<string, { name: string; active: boolean }>();
      const byContactId = new Map<string, { name: string; active: boolean }>();

      const put = (
        map: Map<string, { name: string; active: boolean }>,
        key: string | null,
        entry: { name: string; active: boolean },
      ) => {
        if (!key) return;
        const prev = map.get(key);
        if (!prev || (!prev.active && entry.active)) map.set(key, entry);
      };

      const { data: lenders } = await supabase
        .from('master_lenders')
        .select('id, name, email, website, active');
      const lenderById = new Map<string, { name: string; active: boolean }>();
      for (const l of (lenders || []) as any[]) {
        const entry = { name: String(l.name || 'Unknown funding source'), active: !!l.active };
        lenderById.set(l.id as string, entry);
        const email = String(l.email || '').trim().toLowerCase();
        if (email.includes('@')) {
          put(byEmail, email, entry);
          const d = domainOf(email);
          if (d && !INTERNAL_DOMAINS.has(d)) put(byDomain, d, entry);
        }
        const site = websiteDomain(l.website);
        if (site && !INTERNAL_DOMAINS.has(site)) put(byDomain, site, entry);
      }

      const { data: lenderPeople } = await supabase
        .from('lender_contacts')
        .select('email, contact_id, lender_id');
      for (const c of (lenderPeople || []) as any[]) {
        const entry = lenderById.get(c.lender_id as string);
        if (!entry) continue;
        const email = String(c.email || '').trim().toLowerCase();
        if (email.includes('@')) {
          put(byEmail, email, entry);
          const d = domainOf(email);
          if (d && !INTERNAL_DOMAINS.has(d)) put(byDomain, d, entry);
        }
        if (c.contact_id) put(byContactId, c.contact_id as string, entry);
      }

      if (byEmail.size === 0 && byDomain.size === 0 && byContactId.size === 0) {
        return { existing: [], fresh: [] };
      }

      // Attendees for the meetings in range.
      const ids = meetings.map((m) => m.id);
      const attendeeEmails = new Map<string, string[]>();
      for (let i = 0; i < ids.length; i += 200) {
        const { data: parts, error: pErr } = await supabase
          .from('claap_meeting_participants')
          .select('meeting_id, email')
          .in('meeting_id', ids.slice(i, i + 200));
        if (pErr) throw pErr;
        for (const p of (parts || []) as { meeting_id: string; email: string | null }[]) {
          const email = String(p.email || '').trim().toLowerCase();
          if (!email.includes('@')) continue;
          const arr = attendeeEmails.get(p.meeting_id) || [];
          arr.push(email);
          attendeeEmails.set(p.meeting_id, arr);
        }
      }

      const existing: LenderCallRow[] = [];
      const fresh: LenderCallRow[] = [];
      for (const m of meetings) {
        const matches: { name: string; active: boolean }[] = [];
        const matched = m.matched_contact_id ? byContactId.get(m.matched_contact_id) : undefined;
        if (matched) matches.push(matched);
        for (const email of attendeeEmails.get(m.id) || []) {
          const d = domainOf(email);
          if (d && INTERNAL_DOMAINS.has(d)) continue;
          const hit = byEmail.get(email) || (d ? byDomain.get(d) : undefined);
          if (hit) matches.push(hit);
        }
        if (matches.length === 0) continue;
        const active = matches.find((x) => x.active);
        const chosen = active ?? matches[0];
        const row: LenderCallRow = {
          id: m.id,
          title: m.title,
          started_at: m.started_at,
          lender: chosen.name,
          active: !!active,
        };
        (active ? existing : fresh).push(row);
      }

      const bySoonest = (a: LenderCallRow, b: LenderCallRow) =>
        (b.started_at || '').localeCompare(a.started_at || '');
      return { existing: existing.sort(bySoonest), fresh: fresh.sort(bySoonest) };
    },
  });
}
