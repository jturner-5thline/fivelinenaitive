import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useOptionalSalesBdDateRange } from '@/contexts/SalesBdDateRangeContext';

export interface DealReferralSourceEntry {
  /** The raw referred_by value (deduplicated key) */
  referredBy: string;
  /** Number of deals referred */
  dealCount: number;
  /** Total dollar volume across referred deals */
  totalVolume: number;
  /** Most recent deal */
  latestDeal: {
    id: string;
    company: string;
    value: number;
    stage: string;
    status: string;
    created_at: string;
    pipelineName: string;
  };
  /** All deals referred by this source */
  deals: {
    id: string;
    company: string;
    value: number;
    stage: string;
    status: string;
    created_at: string;
    pipelineName: string;
    pipelineId: string;
  }[];
  /** Channel type from channel_entries if matched */
  channelType: string | null;
  /** Linked company name from channel_entries if matched */
  companyName: string | null;
}

interface RawDealRow {
  id: string;
  company: string;
  value: number | null;
  stage: string;
  status: string;
  referred_by: string;
  created_at: string;
  pipeline_id: string;
}

interface PipelineRow {
  id: string;
  name: string;
  is_default: boolean;
}

export function useDealReferralSources(filters?: {
  channelFilter?: string[];
  companyFilter?: string[];
  pipelineFilter?: 'all' | 'active' | 'in-development';
}) {
  const { company } = useCompany();
  const dateCtx = useOptionalSalesBdDateRange();
  const rangeStart = dateCtx?.start ?? null;
  const rangeEnd = dateCtx?.end ?? null;
  const granularity = dateCtx?.range.granularity ?? null;

  const { data: pipelines = [] } = useQuery({
    queryKey: ['deal_referral_pipelines', company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_pipelines')
        .select('id, name, is_default')
        .eq('company_id', company!.id);
      if (error) throw error;
      return (data || []) as PipelineRow[];
    },
  });

  const { activePipelineIds, inDevPipelineIds } = useMemo(() => {
    const active: string[] = [];
    const inDev: string[] = [];
    for (const p of pipelines) {
      const lower = p.name.toLowerCase();
      if (lower.includes('in development') || lower.includes('in-development')) {
        inDev.push(p.id);
      } else if (p.is_default || lower.includes('active')) {
        active.push(p.id);
      }
    }
    return { activePipelineIds: active, inDevPipelineIds: inDev };
  }, [pipelines]);

  const targetPipelineIds = useMemo(() => {
    if (filters?.pipelineFilter === 'active') return activePipelineIds;
    if (filters?.pipelineFilter === 'in-development') return inDevPipelineIds;
    return [...activePipelineIds, ...inDevPipelineIds];
  }, [activePipelineIds, inDevPipelineIds, filters?.pipelineFilter]);

  const pipelineMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of pipelines) m.set(p.id, p.name);
    return m;
  }, [pipelines]);

  const { data: deals = [], isLoading: dealsLoading } = useQuery({
    queryKey: ['deal_referral_deals', company?.id, targetPipelineIds, rangeStart?.toISOString() ?? null, rangeEnd?.toISOString() ?? null, granularity],
    enabled: !!company?.id && targetPipelineIds.length > 0,
    queryFn: async () => {
      let query = supabase
        .from('deals')
        .select('id, company, value, stage, status, referred_by, created_at, pipeline_id')
        .eq('company_id', company!.id)
        .not('referred_by', 'is', null)
        .neq('referred_by', '')
        .in('pipeline_id', targetPipelineIds);

      if (rangeStart) query = query.gte('created_at', rangeStart.toISOString());
      if (rangeEnd) query = query.lte('created_at', rangeEnd.toISOString());

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as RawDealRow[];
    },
  });

  const { data: channelEntries = [] } = useQuery({
    queryKey: ['deal_referral_channel_entries', company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('channel_entries')
        .select(`
          id, channel_type,
          contact:contacts!channel_entries_contact_id_fkey(full_name),
          crm_company:crm_companies!channel_entries_crm_company_id_fkey(name)
        `)
        .eq('company_id', company!.id);
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const referralSources = useMemo(() => {
    const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

    const grouped = new Map<string, { raw: string; deals: typeof deals }>();
    for (const deal of deals) {
      const key = normalize(deal.referred_by);
      if (!grouped.has(key)) {
        grouped.set(key, { raw: deal.referred_by, deals: [] });
      }
      grouped.get(key)!.deals.push(deal);
    }

    // Channel enrichment lookup
    const channelLookup = new Map<string, { channelType: string; companyName: string | null }>();
    for (const ce of channelEntries) {
      const contactName = ce.contact?.full_name;
      const companyName = ce.crm_company?.name;
      if (contactName) {
        channelLookup.set(normalize(contactName), { channelType: ce.channel_type, companyName });
      }
      if (companyName) {
        channelLookup.set(normalize(companyName), { channelType: ce.channel_type, companyName });
      }
    }

    const entries: DealReferralSourceEntry[] = [];
    for (const [key, { raw, deals: groupDeals }] of grouped) {
      const sorted = [...groupDeals].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const totalVolume = groupDeals.reduce((sum, d) => sum + Number(d.value || 0), 0);
      const latest = sorted[0];

      const match = channelLookup.get(key);

      entries.push({
        referredBy: raw,
        dealCount: groupDeals.length,
        totalVolume,
        latestDeal: {
          id: latest.id,
          company: latest.company,
          value: Number(latest.value || 0),
          stage: latest.stage,
          status: latest.status,
          created_at: latest.created_at,
          pipelineName: pipelineMap.get(latest.pipeline_id) || 'Unknown',
        },
        deals: sorted.map(d => ({
          id: d.id,
          company: d.company,
          value: Number(d.value || 0),
          stage: d.stage,
          status: d.status,
          created_at: d.created_at,
          pipelineName: pipelineMap.get(d.pipeline_id) || 'Unknown',
          pipelineId: d.pipeline_id,
        })),
        channelType: match?.channelType || null,
        companyName: match?.companyName || null,
      });
    }

    let filtered = entries;
    if (filters?.channelFilter?.length) {
      filtered = filtered.filter(e => e.channelType && filters.channelFilter!.includes(e.channelType));
    }
    if (filters?.companyFilter?.length) {
      filtered = filtered.filter(e => e.companyName && filters.companyFilter!.includes(e.companyName));
    }

    // Sort by total volume desc
    filtered.sort((a, b) => b.totalVolume - a.totalVolume);

    return filtered;
  }, [deals, channelEntries, pipelineMap, filters?.channelFilter, filters?.companyFilter]);

  // Unique companies for filter options
  const companyOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of referralSources) {
      if (r.companyName) set.add(r.companyName);
    }
    return Array.from(set).sort().map(c => ({ value: c, label: c }));
  }, [referralSources]);

  return {
    referralSources,
    isLoading: dealsLoading,
    totalCount: referralSources.length,
    totalVolume: referralSources.reduce((s, r) => s + r.totalVolume, 0),
    totalDeals: referralSources.reduce((s, r) => s + r.dealCount, 0),
    companyOptions,
  };
}
