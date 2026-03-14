import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format, subMonths, startOfMonth } from 'date-fns';

export interface HubSpotMetrics {
  totalDeals: number;
  totalDealValue: number;
  dealsWon: number;
  dealsWonValue: number;
  dealsLost: number;
  dealsLostValue: number;
  winRate: number;
  avgDealSize: number;
  totalContacts: number;
  totalCompanies: number;
  // Breakdowns
  pipelineByStage: { stage: string; count: number; value: number }[];
  dealsByOwner: { owner: string; count: number; value: number }[];
  dealValueTrend: { month: string; value: number; count: number }[];
  contactsBySource: { source: string; count: number }[];
}

export function useHubSpotMetrics() {
  const { user } = useAuth();

  const { data: deals, isLoading: dealsLoading } = useQuery({
    queryKey: ['hs-metrics-deals', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('id, company, value, total_fee, status, stage, deal_type, manager, created_at, updated_at, hubspot_deal_id')
        .not('hubspot_deal_id', 'is', null);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const metrics = useMemo((): HubSpotMetrics => {
    const allDeals = deals || [];
    const totalDeals = allDeals.length;
    const totalDealValue = allDeals.reduce((s, d) => s + (d.value || 0), 0);

    const wonDeals = allDeals.filter(d => d.status === 'won' || d.stage?.toLowerCase().includes('closed won') || d.stage?.toLowerCase().includes('funded'));
    const lostDeals = allDeals.filter(d => d.status === 'lost' || d.stage?.toLowerCase().includes('closed lost'));

    const dealsWon = wonDeals.length;
    const dealsWonValue = wonDeals.reduce((s, d) => s + (d.value || 0), 0);
    const dealsLost = lostDeals.length;
    const dealsLostValue = lostDeals.reduce((s, d) => s + (d.value || 0), 0);
    const closedTotal = dealsWon + dealsLost;
    const winRate = closedTotal > 0 ? (dealsWon / closedTotal) * 100 : 0;
    const avgDealSize = totalDeals > 0 ? totalDealValue / totalDeals : 0;

    // Pipeline by stage
    const stageMap: Record<string, { count: number; value: number }> = {};
    allDeals.forEach(d => {
      const stage = d.stage || 'Unknown';
      if (!stageMap[stage]) stageMap[stage] = { count: 0, value: 0 };
      stageMap[stage].count++;
      stageMap[stage].value += d.value || 0;
    });
    const pipelineByStage = Object.entries(stageMap)
      .map(([stage, v]) => ({ stage, ...v }))
      .sort((a, b) => b.value - a.value);

    // Deals by owner/manager
    const ownerMap: Record<string, { count: number; value: number }> = {};
    allDeals.forEach(d => {
      const owner = d.manager || 'Unassigned';
      if (!ownerMap[owner]) ownerMap[owner] = { count: 0, value: 0 };
      ownerMap[owner].count++;
      ownerMap[owner].value += d.value || 0;
    });
    const dealsByOwner = Object.entries(ownerMap)
      .map(([owner, v]) => ({ owner, ...v }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    // Deal value trend (12 months)
    const now = new Date();
    const dealValueTrend: { month: string; value: number; count: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const monthDate = subMonths(now, i);
      const monthStr = format(monthDate, 'MMM-yy');
      const monthStart = startOfMonth(monthDate);
      const nextMonthStart = startOfMonth(subMonths(now, i - 1));

      const monthDeals = allDeals.filter(d => {
        const created = new Date(d.created_at);
        return created >= monthStart && created < nextMonthStart;
      });

      dealValueTrend.push({
        month: monthStr,
        value: monthDeals.reduce((s, d) => s + (d.value || 0), 0),
        count: monthDeals.length,
      });
    }

    // Contacts/companies by source - we don't have separate HS tables, use deal types as proxy
    const typeMap: Record<string, number> = {};
    allDeals.forEach(d => {
      const t = d.deal_type || 'Other';
      typeMap[t] = (typeMap[t] || 0) + 1;
    });
    const contactsBySource = Object.entries(typeMap)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count);

    return {
      totalDeals,
      totalDealValue,
      dealsWon,
      dealsWonValue,
      dealsLost,
      dealsLostValue,
      winRate,
      avgDealSize,
      totalContacts: 0, // Would need separate HS contacts table
      totalCompanies: 0, // Would need separate HS companies table
      pipelineByStage,
      dealsByOwner,
      dealValueTrend,
      contactsBySource,
    };
  }, [deals]);

  return { data: metrics, isLoading: dealsLoading };
}
