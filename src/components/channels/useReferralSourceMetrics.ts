import { computeAtRiskSources } from "./atRiskSources";
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useOptionalSalesBdDateRange } from '@/contexts/SalesBdDateRangeContext';
import { useDealReferralSources } from '@/hooks/useDealReferralSources';
import { isExcludedDealName } from '@/utils/excludedDeals';
import { normalizeEntityName } from '@/lib/entityTitleMatch';
import { channelLabel } from './channelOptions';
import { loadReferralSourceMeetings, type MeetingRow } from '@/lib/dashboardTiles/referralMeetings';

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
  const { referralSources: activePipelineAllTime } = useDealReferralSources({
    ignoreDateRange: true,
    pipelineFilter: 'active',
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
      'referral_source_meetings_calendar_v5',
      company?.id,
      start?.toISOString() ?? null,
      end?.toISOString() ?? null,
    ],
    enabled: !!company?.id && !!start && !!end,
    queryFn: () => loadReferralSourceMeetings(supabase, company!.id, start!.toISOString(), end!.toISOString()),
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


  // All pipeline sources with the date they were added (timeframe-independent),
  // so a newly added source isn't flagged/removed before it has had 4–6 months.
  const { data: allSourceRecords = [] } = useQuery({
    queryKey: ['referral_sources_added_all', company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('referral_sources')
        .select('name, contact_name, created_at')
        .eq('company_id', company!.id);
      if (error) throw error;
      return (data || []) as { name: string | null; contact_name: string | null; created_at: string }[];
    },
  });

  const atRiskInputs = useMemo(() => {
    const addedByName = new Map<string, string>();
    for (const r of allSourceRecords) {
      const k = normalizeEntityName(r.name || r.contact_name || '');
      if (!k) continue;
      const prev = addedByName.get(k);
      if (!prev || r.created_at < prev) addedByName.set(k, r.created_at);
    }
    const seen = new Set<string>();
    const inputs = activePipelineAllTime.map((s) => {
      const k = normalizeEntityName(s.referredBy || '');
      seen.add(k);
      return {
        referredBy: s.referredBy,
        addedAt: addedByName.get(k) ?? null,
        deals: s.deals
          .filter((dl) => !isExcludedDealName(dl.company))
          .map((dl) => ({ ...dl, stage: dl.stage || '' })),
      };
    });
    // Manually added sources that have never referred a qualifying deal.
    for (const r of allSourceRecords) {
      const label = (r.name || r.contact_name || '').trim();
      const k = normalizeEntityName(label);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      inputs.push({ referredBy: label, addedAt: addedByName.get(k) ?? r.created_at, deals: [] });
    }
    return inputs;
  }, [activePipelineAllTime, allSourceRecords]);


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
    atRiskSources: computeAtRiskSources(atRiskInputs),
    /** True when no referred deal carries a fee figure. */
    hasFeeData: sourceLeaderboard.some((r) => r.fees > 0),
  };
}

