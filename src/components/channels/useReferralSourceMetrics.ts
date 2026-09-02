import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useOptionalSalesBdDateRange } from '@/contexts/SalesBdDateRangeContext';
import { useDealReferralSources } from '@/hooks/useDealReferralSources';
import { isExcludedDealName } from '@/utils/excludedDeals';
import { normalizeEntityName, titleMatchesEntity, entityNameVariants } from '@/lib/entityTitleMatch';
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
  organizer_email?: string | null;
  /** Internal (5th Line) attendee emails — used for per-user filtering. */
  internal_emails?: string[];
  recording_url?: string | null;
  transcript?: string | null;
  transcript_available?: boolean;
  claap_meeting_id?: string | null;
}


const FUNDING_SOURCE_NAME_SUFFIXES = new Set([
  'capital',
  'credit',
  'finance',
  'financial',
  'fund',
  'funding',
  'global',
  'group',
  'holdings',
  'management',
  'partners',
]);

function fundingSourceTitleAliases(value: string) {
  const normalized = normalizeEntityName(value);
  if (!normalized) return [];

  const words = normalized.split(' ');
  while (words.length > 1 && FUNDING_SOURCE_NAME_SUFFIXES.has(words[words.length - 1])) {
    words.pop();
  }

  const shortened = words.join(' ');
  return Array.from(new Set([normalized, shortened])).filter((name) => name.length >= 3);
}

/**
 * Real data behind the Sales & BD referral widgets. Everything is scoped to the
 * Sales & BD header timeframe (via SalesBdDateRangeContext) and the active
 * company, and honours the global test-deal exclusions.
 */
export function useReferralSourceMetrics() {
  const { company } = useCompany();
  const queryClient = useQueryClient();
  const dateCtx = useOptionalSalesBdDateRange();
  const start = dateCtx?.start ?? null;
  const end = dateCtx?.end ?? null;
  const { referralSources, isLoading: sourcesLoading } = useDealReferralSources();
  // Pipeline stage is a current, all-history classification. It must not be
  // recalculated from the selected reporting window, otherwise a narrower
  // range can incorrectly move a tiered source back into Nurturing.
  const { referralSources: allTimeReferralSources } = useDealReferralSources({
    ignoreDateRange: true,
  });

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
  // Calendar is authoritative; a matching Claap recording is attached when
  // available so the meeting remains visible even when it was not recorded.
  const { data: meetings = [], isLoading: meetingsLoading } = useQuery<MeetingRow[]>({
    queryKey: [
      'referral_source_meetings_calendar_v3',
      company?.id,
      start?.toISOString() ?? null,
      end?.toISOString() ?? null,
    ],
    enabled: !!company?.id && !!start && !!end,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('calendar-meetings-all', {
        body: {
          company_id: company!.id,
          time_min: start!.toISOString(),
          time_max: end!.toISOString(),
        },
      });
      if (error) throw error;
      const all = (data?.events || []) as any[];
      if (all.length === 0) return [];

      const SALES_TITLE = /<>\s*(5th\s*line|5thline|naitive)/i;
      const DEAL_SYNC_TITLE = /deal\s*sync/i;
      let candidates = all
        .filter((event) => !SALES_TITLE.test(event.title || '') && !DEAL_SYNC_TITLE.test(event.title || ''))
        .map((event) => ({
          ...event,
          id: String(event.id),
          started_at: event.start || null,
          matched_contact_id: event.matched_contact_id || null,
          matched_crm_company_id: event.matched_crm_company_id || null,
          organizer_email: event.organizer_email || null,
          internal_emails: Array.isArray(event.internal_emails) ? event.internal_emails : [],
        })) as MeetingRow[];
      if (candidates.length === 0) return [];

      const { data: dealNameRows } = await supabase
        .from('deals')
        .select('company')
        .eq('company_id', company!.id)
        .not('company', 'is', null);
      const dealNames = Array.from(new Set((dealNameRows || [])
        .filter((d: any) => !isExcludedDealName(String(d.company || '')))
        .flatMap((d: any) => entityNameVariants(String(d.company || '')))
        .filter((n) => n.length >= 4 && !isExcludedDealName(n))));
      if (dealNames.length > 0) {
        candidates = candidates.filter((m) => {
          const title = normalizeEntityName(m.title || '');
          return !title || !dealNames.some((name) => titleMatchesEntity(title, name));
        });
      }
      if (candidates.length === 0) return [];

      const clientDomains = new Set<string>();
      const addEmailDomain = (value: unknown) => {
        const domain = domainOf(typeof value === 'string' ? value : null);
        if (domain && !INTERNAL_DOMAINS.has(domain)) clientDomains.add(domain);
      };
      const addWebsiteDomain = (value: unknown) => {
        if (typeof value !== 'string' || !value.trim()) return;
        const normalized = value.trim().toLowerCase()
          .replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].split('?')[0];
        if (normalized && normalized.includes('.') && !INTERNAL_DOMAINS.has(normalized)) clientDomains.add(normalized);
      };
      // Client identity is sourced from every deal in this workspace, not just
      // the currently active pipelines, so older clients are excluded as well.
      const { data: clientDeals } = await supabase.from('deals')
        .select('id, contact_email, company_url, crm_company_id')
        .eq('company_id', company!.id)
        .limit(5000);
      {
        const dealRows = (clientDeals || []) as any[];
        for (const deal of dealRows) {
          addEmailDomain(deal.contact_email);
          addWebsiteDomain(deal.company_url);
        }
        const dealIds = dealRows.map((deal) => deal.id).filter(Boolean);
        if (dealIds.length > 0) {
          const { data: links } = await supabase
            .from('contact_deals').select('deal_id, contact_id').in('deal_id', dealIds);
          const contactIds = Array.from(new Set((links || []).map((link: any) => link.contact_id).filter(Boolean)));
          if (contactIds.length > 0) {
            const { data: contacts } = await supabase
              .from('contacts').select('email, additional_emails, website_url, crm_company_id, primary_company_id').in('id', contactIds);
            for (const contact of (contacts || []) as any[]) {
              addEmailDomain(contact.email);
              for (const email of contact.additional_emails || []) addEmailDomain(email);
              addWebsiteDomain(contact.website_url);
            }
          }
        }
        const crmCompanyIds = Array.from(new Set(dealRows.map((deal) => deal.crm_company_id).filter(Boolean)));
        if (crmCompanyIds.length > 0) {
          const { data: crmCompanies } = await supabase
            .from('crm_companies').select('website_url').in('id', crmCompanyIds);
          for (const crmCompany of (crmCompanies || []) as any[]) addWebsiteDomain(crmCompany.website_url);
        }
      }

      const lenderDomains = new Set<string>();
      const lenderNames = new Set<string>();
      const lenderContactIds = new Set<string>();
      const { data: lenders } = await supabase.from('master_lenders').select('id, name, email, website');
      for (const lender of (lenders || []) as any[]) {
        for (const raw of [lender.email, lender.website]) {
          const domain = domainOf(typeof raw === 'string' && raw.includes('@')
            ? raw
            : `x@${String(raw || '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0]}`);
          if (domain && !INTERNAL_DOMAINS.has(domain)) lenderDomains.add(domain);
        }
        for (const alias of fundingSourceTitleAliases(String(lender.name || ''))) lenderNames.add(alias);
      }
      const { data: lenderPeople } = await supabase.from('lender_contacts').select('email, contact_id');
      for (const person of (lenderPeople || []) as any[]) {
        const domain = domainOf(person.email);
        if (domain && !INTERNAL_DOMAINS.has(domain)) lenderDomains.add(domain);
        if (person.contact_id) lenderContactIds.add(person.contact_id);
      }
      const { data: lenderContacts } = await supabase.from('contacts')
        .select('id, email').eq('company_id', company!.id).ilike('contact_type', '%lender%');
      for (const contact of (lenderContacts || []) as any[]) {
        lenderContactIds.add(contact.id);
        const domain = domainOf(contact.email);
        if (domain && !INTERNAL_DOMAINS.has(domain)) lenderDomains.add(domain);
      }

      return candidates.filter((meeting) => {
        const rawTitle = String(meeting.title || '').trim().toLowerCase();
        if (rawTitle === 'block' || rawTitle === 'blocked') return false;
        const title = normalizeEntityName(meeting.title || '');
        if (title && [...lenderNames].some((name) => titleMatchesEntity(title, name))) return false;
        if (meeting.matched_contact_id && lenderContactIds.has(meeting.matched_contact_id)) return false;
        const domains = ((meeting as any).attendee_domains || []) as string[];
        const attendeeCount = Array.isArray((meeting as any).attendees) ? (meeting as any).attendees.length : 0;
        // Exclude events with no attendees (personal holds/blocks)
        if (attendeeCount === 0 && domains.length === 0) return false;
        if (domains.length === 0) return true;
        if (domains.every((domain) => INTERNAL_DOMAINS.has(domain))) return false;
        if (domains.some((domain) => clientDomains.has(domain))) return false;
        if (domains.some((domain) => lenderDomains.has(domain))) return false;
        return true;
      });

    },
  });

  // ---- Manual removals (user "removes" a call from the count) --------------
  const exclusionsKey = ['referral_meeting_exclusions', company?.id] as const;
  const { data: excludedMeetingIds = new Set<string>() } = useQuery({
    queryKey: exclusionsKey,
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('referral_meeting_exclusions')
        .select('meeting_id')
        .eq('company_id', company!.id);
      if (error) throw error;
      return new Set<string>((data || []).map((r: any) => r.meeting_id as string));
    },
  });

  const removeMeeting = useMutation({
    mutationFn: async (meetingId: string) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('referral_meeting_exclusions')
        .upsert(
          { company_id: company!.id, meeting_id: meetingId, excluded_by: auth?.user?.id ?? null },
          { onConflict: 'company_id,meeting_id' },
        );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: exclusionsKey }),
    onError: (e: any) => toast.error(e?.message || 'Could not remove that call'),
  });

  const restoreMeeting = useMutation({
    mutationFn: async (meetingId: string) => {
      const { error } = await supabase
        .from('referral_meeting_exclusions')
        .delete()
        .eq('company_id', company!.id)
        .eq('meeting_id', meetingId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: exclusionsKey }),
    onError: (e: any) => toast.error(e?.message || 'Could not restore that call'),
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

  // Only sources that are currently sitting in the pipeline's "Nurturing"
  // stage count here — once a source's referred deals qualify it for Tier 3/2/1
  // it is no longer a newly added nurturing source.
  const tieredSourceNames = useMemo(() => {
    const set = new Set<string>();
    for (const r of allTimeReferralSources) {
      if (r.tier !== null && r.tier !== undefined) set.add(normalizeEntityName(r.referredBy || ''));
    }
    return set;
  }, [allTimeReferralSources]);

  const nurturingNewSources = useMemo(
    () =>
      newSources.filter((s) => {
        const name = normalizeEntityName(s.name || s.contact_name || '');
        return !!name && !tieredSourceNames.has(name);
      }),
    [newSources, tieredSourceNames],
  );



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

  // ---- Per-user (internal host/attendee) filtering -------------------------
  // Calendars explicitly excluded from referral meeting metrics — they must not
  // appear as filter options either.
  const EXCLUDED_OWNER_LOCALPARTS = new Set([
    'abranch', 'aschiff', 'cminaldi', 'crichardson', 'jraskin', 'jrivera',
    'sbhangale', 'kandil', 'mckenzie.clark', 'mclark',
  ]);
  const internalEmailList = useMemo(() => {
    const set = new Set<string>();
    meetings.forEach((m) => (m.internal_emails || []).forEach((e) => {
      const local = String(e || '').toLowerCase().split('@')[0];
      if (!EXCLUDED_OWNER_LOCALPARTS.has(local)) set.add(e);
    }));
    return Array.from(set).sort();
  }, [meetings]);


  const { data: internalProfiles = new Map<string, string>() } = useQuery({
    queryKey: ['referral_meeting_owner_profiles', internalEmailList.join(',')],
    enabled: internalEmailList.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('email, full_name, first_name, last_name')
        .in('email', internalEmailList);
      if (error) throw error;
      const map = new Map<string, string>();
      for (const p of (data || []) as any[]) {
        const label =
          p.full_name ||
          [p.first_name, p.last_name].filter(Boolean).join(' ') ||
          String(p.email || '');
        if (p.email) map.set(String(p.email).toLowerCase(), label);
      }
      return map;
    },
  });

  const meetingOwnerOptions = useMemo(
    () =>
      internalEmailList.map((email) => ({
        email,
        label: internalProfiles.get(email) || email.split('@')[0].replace(/[._]/g, ' '),
        count: meetings.filter(
          (m) => !excludedMeetingIds.has(m.id) && (m.internal_emails || []).includes(email),
        ).length,
      })).filter((o) => o.count > 0),
    [internalEmailList, internalProfiles, meetings, excludedMeetingIds],
  );

  const [meetingOwnerFilter, setMeetingOwnerFilter] = useState<string[]>([]);

  const visibleMeetings = useMemo(
    () =>
      meetings.filter(
        (m) =>
          !excludedMeetingIds.has(m.id) &&
          (meetingOwnerFilter.length === 0 ||
            (m.internal_emails || []).some((e) => meetingOwnerFilter.includes(e))),
      ),
    [meetings, excludedMeetingIds, meetingOwnerFilter],
  );

  const meetingRows = useMemo<DrillRow[]>(
    () =>
      [...visibleMeetings]
        .sort((a, b) => (b.started_at || '').localeCompare(a.started_at || ''))
        .map((m) => ({
          id: m.id,
          primary: m.title || 'Untitled meeting',
          secondary: [
            m.started_at ? new Date(m.started_at).toLocaleDateString() : null,
            (m.internal_emails || [])
              .map((e) => internalProfiles.get(e) || e)
              .join(', ') || null,
          ]
            .filter(Boolean)
            .join(' · ') || undefined,
        })),
    [visibleMeetings, internalProfiles],
  );


  const removedMeetingRows = useMemo<DrillRow[]>(
    () =>
      meetings
        .filter((m) => excludedMeetingIds.has(m.id))
        .sort((a, b) => (b.started_at || '').localeCompare(a.started_at || ''))
        .map((m) => ({
          id: m.id,
          primary: m.title || 'Untitled meeting',
          secondary: m.started_at ? new Date(m.started_at).toLocaleDateString() : undefined,
        })),
    [meetings, excludedMeetingIds],
  );

  const newSourceRows = useMemo<DrillRow[]>(
    () =>
      [...nurturingNewSources]
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
        .map((s) => {
          const added = s.created_at
            ? new Date(s.created_at).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
            : null;
          return {
            id: s.id,
            primary: s.name || s.contact_name || 'Untitled source',
            secondary:
              [
                added ? `Added to Nurturing ${added}` : null,
                s.company,
                s.channel ? channelLabel(s.channel) : null,
              ]
                .filter(Boolean)
                .join(' · ') || undefined,
          };
        }),
    [nurturingNewSources],
  );


  return {
    isLoading: sourcesLoading || meetingsLoading || newSourcesLoading,
    meetingCount: visibleMeetings.length,
    meetingRows,
    /** Calls a user manually removed from the meetings count. */
    removedMeetingRows,
    removeMeeting: (meetingId: string) => removeMeeting.mutate(meetingId),
    restoreMeeting: (meetingId: string) => restoreMeeting.mutate(meetingId),
    isUpdatingMeetingExclusions: removeMeeting.isPending || restoreMeeting.isPending,
    /** Internal users (host/attendees) available to filter the meetings count by. */
    meetingOwnerOptions,
    meetingOwnerFilter,
    setMeetingOwnerFilter,

    newSourceCount: nurturingNewSources.length,
    newSourceRows,
    sourceLeaderboard,
    channelLeaderboard,
    /** True when no referred deal carries a fee figure. */
    hasFeeData: sourceLeaderboard.some((r) => r.fees > 0),
  };
}

