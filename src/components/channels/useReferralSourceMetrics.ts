import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useOptionalSalesBdDateRange } from '@/contexts/SalesBdDateRangeContext';
import { useDealReferralSources } from '@/hooks/useDealReferralSources';
import { isExcludedDealName } from '@/utils/excludedDeals';
import { channelLabel } from './channelOptions';
import { INTERNAL_DOMAINS, domainOf } from '@/lib/internalDomains';

export interface DrillRow {
  id: string;
  primary: string;
  secondary?: string;
}

export interface LeaderboardRow {
  key: string;
  label: string;
  deals: number;
  dollars: number;
  fees: number;
  rows: DrillRow[];
}

interface MeetingRow {
  id: string;
  title: string | null;
  started_at: string | null;
  matched_contact_id: string | null;
  matched_crm_company_id: string | null;
}

/**
 * Real data behind the Sales & BD referral widgets. Everything is scoped to the
 * Sales & BD header timeframe (via SalesBdDateRangeContext) and the active
 * company, and honours the global test-deal exclusions.
 */
export function useReferralSourceMetrics() {
  const { company } = useCompany();
  const dateCtx = useOptionalSalesBdDateRange();
  const start = dateCtx?.start ?? null;
  const end = dateCtx?.end ?? null;
  const { referralSources, isLoading: sourcesLoading } = useDealReferralSources();

  const sources = useMemo(
    () =>
      referralSources.map((s) => ({
        ...s,
        deals: s.deals.filter((d) => !isExcludedDealName(d.company)),
      })),
    [referralSources],
  );

  const contactIds = useMemo(
    () => sources.map((s) => s.contactId).filter((v): v is string => !!v),
    [sources],
  );
  const crmCompanyIds = useMemo(
    () => sources.map((s) => s.crmCompanyId).filter((v): v is string => !!v),
    [sources],
  );

  // ---- Meetings with existing referral sources -----------------------------
  // Definition: every call on the calendar in the timeframe EXCEPT
  //  • sales calls (titled "[COMPANY] <> 5th Line / naitive")
  //  • internal calls (all attendees on an internal domain)
  //  • existing client calls (an attendee shares the email domain of a client
  //    contact on a deal in the Active or In Development pipelines)
  const { data: meetings = [], isLoading: meetingsLoading } = useQuery({
    queryKey: [
      'referral_source_meetings_v3',
      company?.id,
      start?.toISOString() ?? null,
      end?.toISOString() ?? null,
    ],
    enabled: !!company?.id,
    queryFn: async () => {
      let q = supabase
        .from('claap_meetings')
        .select('id, title, started_at, matched_contact_id, matched_crm_company_id')
        .eq('company_id', company!.id);
      if (start) q = q.gte('started_at', start.toISOString());
      if (end) q = q.lte('started_at', end.toISOString());
      const { data, error } = await q;
      if (error) throw error;
      const all = (data || []) as MeetingRow[];
      if (all.length === 0) return [];

      // 1) Drop sales-titled calls and internal "Deal Sync" style calls.
      const SALES_TITLE = /<>\s*(5th\s*line|5thline|naitive)/i;
      const DEAL_SYNC_TITLE = /deal\s*sync/i;
      let candidates = all.filter(
        (m) => !SALES_TITLE.test(m.title || '') && !DEAL_SYNC_TITLE.test(m.title || ''),
      );
      if (candidates.length === 0) return [];

      // 1b) Drop calls whose title mentions an existing deal name.
      const { data: dealNameRows } = await supabase
        .from('deals')
        .select('company')
        .eq('company_id', company!.id)
        .not('company', 'is', null);
      const dealNames = Array.from(
        new Set(
          (dealNameRows || [])
            .map((d: any) => String(d.company || '').trim().toLowerCase())
            .filter((n) => n.length >= 4 && !isExcludedDealName(n)),
        ),
      );
      if (dealNames.length > 0) {
        candidates = candidates.filter((m) => {
          const t = (m.title || '').toLowerCase();
          if (!t) return true;
          return !dealNames.some((n) => t.includes(n));
        });
      }
      if (candidates.length === 0) return [];


      // Attendees for the remaining meetings.
      const ids = candidates.map((m) => m.id);
      const attendees = new Map<string, string[]>();
      for (let i = 0; i < ids.length; i += 200) {
        const { data: parts, error: pErr } = await supabase
          .from('claap_meeting_participants')
          .select('meeting_id, email')
          .in('meeting_id', ids.slice(i, i + 200));
        if (pErr) throw pErr;
        for (const p of (parts || []) as { meeting_id: string; email: string | null }[]) {
          const d = domainOf(p.email);
          if (!d) continue;
          const arr = attendees.get(p.meeting_id) || [];
          arr.push(d);
          attendees.set(p.meeting_id, arr);
        }
      }

      // Client contact domains from Active / In Development pipeline deals.
      const { data: pipelines } = await supabase
        .from('deal_pipelines')
        .select('id, name')
        .eq('company_id', company!.id);
      const pipelineIds = (pipelines || [])
        .filter((p: any) => /^(active|in development)/i.test(String(p.name || '')))
        .map((p: any) => p.id as string);
      const clientDomains = new Set<string>();
      if (pipelineIds.length > 0) {
        const { data: clientDeals } = await supabase
          .from('deals')
          .select('contact_email')
          .in('pipeline_id', pipelineIds)
          .not('contact_email', 'is', null);
        for (const d of (clientDeals || []) as { contact_email: string | null }[]) {
          const dom = domainOf(d.contact_email);
          if (dom && !INTERNAL_DOMAINS.has(dom)) clientDomains.add(dom);
        }
      }

      // 4) Funding sources (lenders): exclude by attendee domain, matched contact,
      //    or a funding-source name appearing in the call title.
      const lenderDomains = new Set<string>();
      const lenderNames: string[] = [];
      const lenderContactIds = new Set<string>();
      const { data: lenders } = await supabase
        .from('master_lenders')
        .select('id, name, email, website');
      for (const l of (lenders || []) as any[]) {
        for (const raw of [l.email, l.website]) {
          const dom = domainOf(
            typeof raw === 'string' && raw.includes('@')
              ? raw
              : `x@${String(raw || '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0]}`,
          );
          if (dom && !INTERNAL_DOMAINS.has(dom)) lenderDomains.add(dom);
        }
        const nm = String(l.name || '').trim().toLowerCase();
        if (nm.length >= 3) lenderNames.push(nm);
      }
      const { data: lenderPeople } = await supabase
        .from('lender_contacts')
        .select('email, contact_id');
      for (const c of (lenderPeople || []) as any[]) {
        const dom = domainOf(c.email);
        if (dom && !INTERNAL_DOMAINS.has(dom)) lenderDomains.add(dom);
        if (c.contact_id) lenderContactIds.add(c.contact_id as string);
      }
      const { data: lenderContactRows } = await supabase
        .from('contacts')
        .select('id, email')
        .eq('company_id', company!.id)
        .ilike('contact_type', '%lender%');
      for (const c of (lenderContactRows || []) as any[]) {
        lenderContactIds.add(c.id as string);
        const dom = domainOf(c.email);
        if (dom && !INTERNAL_DOMAINS.has(dom)) lenderDomains.add(dom);
      }

      return candidates.filter((m) => {
        const title = (m.title || '').toLowerCase();
        // Funding-source name in the title.
        if (title && lenderNames.some((n) => title.includes(n))) return false;
        // Meeting matched directly to a funding-source contact.
        if (m.matched_contact_id && lenderContactIds.has(m.matched_contact_id)) return false;
        const doms = attendees.get(m.id) || [];
        if (doms.length === 0) return true; // unknown attendees — keep
        // 2) internal-only calls
        if (doms.every((d) => INTERNAL_DOMAINS.has(d))) return false;
        // 3) existing client calls
        if (doms.some((d) => clientDomains.has(d))) return false;
        // 4) funding-source attendees
        if (doms.some((d) => lenderDomains.has(d))) return false;
        return true;
      });

    },
  });


  // ---- New referral sources added in the timeframe -------------------------
  const { data: newSources = [], isLoading: newSourcesLoading } = useQuery({
    queryKey: [
      'referral_sources_added',
      company?.id,
      start?.toISOString() ?? null,
      end?.toISOString() ?? null,
    ],
    enabled: !!company?.id,
    queryFn: async () => {
      let q = supabase
        .from('referral_sources')
        .select('id, name, contact_name, company, channel, created_at')
        .eq('company_id', company!.id);
      if (start) q = q.gte('created_at', start.toISOString());
      if (end) q = q.lte('created_at', end.toISOString());
      const { data, error } = await q.order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as {
        id: string;
        name: string | null;
        contact_name: string | null;
        company: string | null;
        channel: string | null;
        created_at: string;
      }[];
    },
  });

  // ---- Fee revenue per referred deal ---------------------------------------
  const dealIds = useMemo(() => {
    const ids = new Set<string>();
    sources.forEach((s) => s.deals.forEach((d) => ids.add(d.id)));
    return Array.from(ids);
  }, [sources]);

  const { data: feeByDeal = new Map<string, number>() } = useQuery({
    queryKey: ['referral_deal_fees', company?.id, dealIds.length, dealIds[0] ?? null],
    enabled: !!company?.id && dealIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('id, total_fee')
        .in('id', dealIds.slice(0, 1000));
      if (error) throw error;
      const map = new Map<string, number>();
      for (const d of (data || []) as { id: string; total_fee: number | null }[]) {
        map.set(d.id, Number(d.total_fee) || 0);
      }
      return map;
    },
  });

  // ---- Leaderboards --------------------------------------------------------
  const sourceLeaderboard = useMemo<LeaderboardRow[]>(
    () =>
      sources
        .map((s) => ({
          key: s.referredBy,
          label: s.referredBy,
          deals: s.deals.length,
          dollars: s.deals.reduce((sum, d) => sum + (d.value || 0), 0),
          fees: s.deals.reduce((sum, d) => sum + (feeByDeal.get(d.id) || 0), 0),
          rows: s.deals.map((d) => ({
            id: d.id,
            primary: d.company,
            secondary: `${d.stage || '—'} · $${(d.value || 0).toLocaleString()}`,
          })),
        }))
        .filter((r) => r.deals > 0),
    [sources, feeByDeal],
  );

  const channelLeaderboard = useMemo<LeaderboardRow[]>(() => {
    const map = new Map<string, LeaderboardRow>();
    for (const s of sources) {
      const key = s.channelType || 'unassigned';
      const label = s.channelType ? channelLabel(s.channelType) : 'Unassigned';
      const entry = map.get(key) ?? { key, label, deals: 0, dollars: 0, fees: 0, rows: [] };
      entry.deals += s.deals.length;
      entry.dollars += s.deals.reduce((sum, d) => sum + (d.value || 0), 0);
      entry.fees += s.deals.reduce((sum, d) => sum + (feeByDeal.get(d.id) || 0), 0);
      entry.rows.push(
        ...s.deals.map((d) => ({
          id: d.id,
          primary: d.company,
          secondary: `${s.referredBy} · $${(d.value || 0).toLocaleString()}`,
        })),
      );
      map.set(key, entry);
    }
    return [...map.values()].filter((r) => r.deals > 0);
  }, [sources, feeByDeal]);

  const meetingRows = useMemo<DrillRow[]>(
    () =>
      [...meetings]
        .sort((a, b) => (b.started_at || '').localeCompare(a.started_at || ''))
        .map((m) => ({
          id: m.id,
          primary: m.title || 'Untitled meeting',
          secondary: m.started_at ? new Date(m.started_at).toLocaleDateString() : undefined,
        })),
    [meetings],
  );

  const newSourceRows = useMemo<DrillRow[]>(
    () =>
      newSources.map((s) => ({
        id: s.id,
        primary: s.name || s.contact_name || 'Untitled source',
        secondary: [s.company, s.channel].filter(Boolean).join(' · ') || undefined,
      })),
    [newSources],
  );

  return {
    isLoading: sourcesLoading || meetingsLoading || newSourcesLoading,
    meetingCount: meetings.length,
    meetingRows,
    newSourceCount: newSources.length,
    newSourceRows,
    sourceLeaderboard,
    channelLeaderboard,
    /** True when no referred deal carries a fee figure. */
    hasFeeData: sourceLeaderboard.some((r) => r.fees > 0),
  };
}
