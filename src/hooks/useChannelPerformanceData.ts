import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { subDays, subMonths, startOfQuarter, subQuarters } from 'date-fns';

export type ChannelTimePeriod = 'last-30d' | 'qtd' | 'last-quarter' | 'last-6m' | 'last-12m' | 'custom';

export interface ChannelDeal {
  id: string;
  company: string;
  value: number;
  stage: string;
  status: string;
  referred_by: string | null;
  sourced_via: string | null;
  crm_company_id: string | null;
  created_at: string;
  total_fee: number | null;
}

export interface ChannelSource {
  channelEntryId: string;
  name: string;
  channelType: string;
  contactName: string | null;
  companyName: string | null;
}

export interface AttributedDeal extends ChannelDeal {
  channelEntryId: string;
  channelName: string;
  channelType: string;
}

export interface StageMetrics {
  label: string;
  stageKey: string;
  dealCount: number;
  volume: number;
}

export interface ChannelPerformanceRow {
  channelEntryId: string;
  channelName: string;
  channelType: string;
  added: { count: number; volume: number };
  proposalIssued: { count: number; volume: number };
  finalCreditItems: { count: number; volume: number };
  fundedInvoiced: { count: number; volume: number };
  deals: AttributedDeal[];
}

// Stage matching helpers
const STAGE_MATCHERS: Record<string, (s: string) => boolean> = {
  proposalIssued: (s) => /proposal.issued/i.test(s),
  finalCreditItems: (s) => /final.credit/i.test(s),
  fundedInvoiced: (s) => /funded|invoiced/i.test(s) && !/not/i.test(s),
};

function classifyStage(stage: string): string | null {
  const lower = stage.toLowerCase();
  if (STAGE_MATCHERS.fundedInvoiced(lower)) return 'fundedInvoiced';
  if (STAGE_MATCHERS.finalCreditItems(lower)) return 'finalCreditItems';
  if (STAGE_MATCHERS.proposalIssued(lower)) return 'proposalIssued';
  // Everything that made it into the pipeline counts as "added"
  return 'added';
}

// Pipeline progression: a deal at "funded" has also been through all prior stages
const STAGE_ORDER = ['added', 'proposalIssued', 'finalCreditItems', 'fundedInvoiced'];
function stageReached(classification: string | null): string[] {
  if (!classification) return ['added'];
  const idx = STAGE_ORDER.indexOf(classification);
  if (idx < 0) return ['added'];
  return STAGE_ORDER.slice(0, idx + 1);
}

export function getTimePeriodRange(period: ChannelTimePeriod): { start: Date; end: Date } | null {
  const now = new Date();
  switch (period) {
    case 'last-30d': return { start: subDays(now, 30), end: now };
    case 'qtd': return { start: startOfQuarter(now), end: now };
    case 'last-quarter': {
      const prev = subQuarters(now, 1);
      return { start: startOfQuarter(prev), end: startOfQuarter(now) };
    }
    case 'last-6m': return { start: subMonths(now, 6), end: now };
    case 'last-12m': return { start: subMonths(now, 12), end: now };
    default: return null;
  }
}

function fuzzyMatch(referredBy: string, name: string): boolean {
  if (!referredBy || !name) return false;
  const ref = referredBy.toLowerCase().trim();
  const n = name.toLowerCase().trim();
  // Exact contain
  if (ref.includes(n) || n.includes(ref)) return true;
  // Check if last name + first word match (e.g. "Nandini @ Wells Fargo" -> "Wells Fargo")
  const refWords = ref.split(/[\s@,]+/).filter(Boolean);
  const nWords = n.split(/[\s]+/).filter(Boolean);
  // If any two consecutive words from name appear in referred_by
  for (let i = 0; i < nWords.length - 1; i++) {
    const pair = nWords[i] + ' ' + nWords[i + 1];
    if (ref.includes(pair)) return true;
  }
  // Single significant word match (>= 4 chars)
  for (const w of nWords) {
    if (w.length >= 4 && refWords.some(rw => rw === w)) return true;
  }
  return false;
}

export function useChannelPerformanceData(
  timePeriod: ChannelTimePeriod = 'last-12m',
  channelTypeFilter: string = 'all',
  channelEntryFilter: string = 'all',
) {
  const { company } = useCompany();

  const { data: channelEntries = [], isLoading: channelsLoading } = useQuery({
    queryKey: ['channel_perf_entries', company?.id],
    enabled: !!company?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('channel_entries')
        .select(`
          id, channel_type, contact_id, crm_company_id, notes,
          contact:contacts!channel_entries_contact_id_fkey(id, full_name, email),
          crm_company:crm_companies!channel_entries_crm_company_id_fkey(id, name)
        `)
        .eq('company_id', company!.id);
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const { data: deals = [], isLoading: dealsLoading } = useQuery({
    queryKey: ['channel_perf_deals', company?.id],
    enabled: !!company?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('id, company, value, stage, status, referred_by, sourced_via, crm_company_id, created_at, total_fee')
        .eq('company_id', company!.id)
        .neq('status', 'archived');
      if (error) throw error;
      return (data || []) as ChannelDeal[];
    },
  });

  const isLoading = channelsLoading || dealsLoading;

  // Build channel sources list
  const channelSources = useMemo<ChannelSource[]>(() => {
    return channelEntries.map((ce: any) => ({
      channelEntryId: ce.id,
      name: ce.crm_company?.name || ce.contact?.full_name || 'Unknown',
      channelType: ce.channel_type,
      contactName: ce.contact?.full_name || null,
      companyName: ce.crm_company?.name || null,
    }));
  }, [channelEntries]);

  // Attribution: match deals to channel entries
  const { attributedDeals, performanceRows, kpis } = useMemo(() => {
    const timeRange = getTimePeriodRange(timePeriod);
    
    // Filter deals by time
    let filteredDeals = deals;
    if (timeRange) {
      filteredDeals = deals.filter(d => {
        const dt = new Date(d.created_at);
        return dt >= timeRange.start && dt <= timeRange.end;
      });
    }

    // Attribution pass - each deal attributed to at most one channel
    const attributed: AttributedDeal[] = [];
    const usedDealIds = new Set<string>();

    for (const deal of filteredDeals) {
      if (!deal.referred_by && !deal.crm_company_id) continue;

      let bestMatch: ChannelSource | null = null;

      for (const src of channelSources) {
        // Direct CRM company match
        if (deal.crm_company_id && channelEntries.find((ce: any) => ce.id === src.channelEntryId)?.crm_company_id === deal.crm_company_id) {
          bestMatch = src;
          break;
        }
        // Fuzzy match on referred_by
        if (deal.referred_by) {
          if (src.companyName && fuzzyMatch(deal.referred_by, src.companyName)) {
            bestMatch = src;
            break;
          }
          if (src.contactName && fuzzyMatch(deal.referred_by, src.contactName)) {
            bestMatch = src;
            break;
          }
        }
      }

      if (bestMatch && !usedDealIds.has(deal.id)) {
        usedDealIds.add(deal.id);
        attributed.push({
          ...deal,
          channelEntryId: bestMatch.channelEntryId,
          channelName: bestMatch.name,
          channelType: bestMatch.channelType,
        });
      }
    }

    // Apply filters
    let filtered = attributed;
    if (channelTypeFilter !== 'all') {
      filtered = filtered.filter(d => d.channelType === channelTypeFilter);
    }
    if (channelEntryFilter !== 'all') {
      filtered = filtered.filter(d => d.channelEntryId === channelEntryFilter);
    }

    // Build performance rows by channel
    const rowMap = new Map<string, ChannelPerformanceRow>();
    
    for (const src of channelSources) {
      if (channelTypeFilter !== 'all' && src.channelType !== channelTypeFilter) continue;
      if (channelEntryFilter !== 'all' && src.channelEntryId !== channelEntryFilter) continue;
      
      rowMap.set(src.channelEntryId, {
        channelEntryId: src.channelEntryId,
        channelName: src.name,
        channelType: src.channelType,
        added: { count: 0, volume: 0 },
        proposalIssued: { count: 0, volume: 0 },
        finalCreditItems: { count: 0, volume: 0 },
        fundedInvoiced: { count: 0, volume: 0 },
        deals: [],
      });
    }

    for (const deal of filtered) {
      const row = rowMap.get(deal.channelEntryId);
      if (!row) continue;
      
      row.deals.push(deal);
      const classification = classifyStage(deal.stage);
      const reached = stageReached(classification);
      const vol = deal.value || 0;
      
      for (const stg of reached) {
        const bucket = row[stg as keyof Pick<ChannelPerformanceRow, 'added' | 'proposalIssued' | 'finalCreditItems' | 'fundedInvoiced'>];
        if (bucket) {
          bucket.count += 1;
          bucket.volume += vol;
        }
      }
    }

    const rows = Array.from(rowMap.values()).sort((a, b) => b.fundedInvoiced.volume - a.fundedInvoiced.volume);

    // Aggregate KPIs
    const kpis = {
      added: { count: 0, volume: 0 },
      proposalIssued: { count: 0, volume: 0 },
      finalCreditItems: { count: 0, volume: 0 },
      fundedInvoiced: { count: 0, volume: 0 },
      totalAttributed: filtered.length,
      totalDeals: filteredDeals.length,
    };
    
    for (const deal of filtered) {
      const classification = classifyStage(deal.stage);
      const reached = stageReached(classification);
      const vol = deal.value || 0;
      for (const stg of reached) {
        const bucket = kpis[stg as keyof typeof kpis];
        if (bucket && typeof bucket === 'object') {
          (bucket as any).count += 1;
          (bucket as any).volume += vol;
        }
      }
    }

    return { attributedDeals: filtered, performanceRows: rows, kpis };
  }, [deals, channelSources, channelEntries, timePeriod, channelTypeFilter, channelEntryFilter]);

  return {
    channelSources,
    attributedDeals,
    performanceRows,
    kpis,
    isLoading,
    totalDeals: deals.length,
  };
}
