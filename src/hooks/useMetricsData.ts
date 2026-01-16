import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, subMonths, startOfMonth, endOfMonth, startOfQuarter, subQuarters, parseISO, isWithinInterval } from 'date-fns';

interface MonthlyData {
  month: string;
  closedWonValue: number;
  closedLostValue: number;
  totalFees: number;
  dealCount: number;
}

interface DealTypeBreakdown {
  type: string;
  value: number;
  percent: number;
}

interface StageBreakdown {
  stage: string;
  count: number;
  value: number;
}

interface ManagerPerformance {
  manager: string;
  closedWonValue: number;
  dealCount: number;
  avgDealSize: number;
}

export interface MetricsData {
  // Rolling 12 months data
  monthlyData: MonthlyData[];
  // Current period stats
  totalPipelineValue: number;
  totalClosedWonValue: number;
  totalFees: number;
  activeDealsCount: number;
  closedWonCount: number;
  avgDealSize: number;
  // Breakdowns
  dealTypeBreakdown: DealTypeBreakdown[];
  stageBreakdown: StageBreakdown[];
  managerPerformance: ManagerPerformance[];
  // Quarter data
  quarterlyData: MonthlyData[];
  // YTD data
  ytdData: MonthlyData[];
  // Period over period
  currentMonthValue: number;
  previousMonthValue: number;
  currentMonthFees: number;
  previousMonthFees: number;
}

interface DbDeal {
  id: string;
  company: string;
  value: number;
  total_fee: number | null;
  status: string;
  stage: string;
  deal_type: string | null;
  manager: string | null;
  created_at: string;
  updated_at: string;
}

export function useMetricsData() {
  const { data: deals, isLoading, error } = useQuery({
    queryKey: ['metrics-deals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('id, company, value, total_fee, status, stage, deal_type, manager, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as DbDeal[];
    },
    staleTime: 30000,
  });

  const metricsData = useMemo<MetricsData>(() => {
    if (!deals || deals.length === 0) {
      return {
        monthlyData: generateEmptyMonthlyData(),
        totalPipelineValue: 0,
        totalClosedWonValue: 0,
        totalFees: 0,
        activeDealsCount: 0,
        closedWonCount: 0,
        avgDealSize: 0,
        dealTypeBreakdown: [],
        stageBreakdown: [],
        managerPerformance: [],
        quarterlyData: [],
        ytdData: [],
        currentMonthValue: 0,
        previousMonthValue: 0,
        currentMonthFees: 0,
        previousMonthFees: 0,
      };
    }

    const now = new Date();
    
    // Generate rolling 12 months data
    const monthlyData: MonthlyData[] = [];
    for (let i = 11; i >= 0; i--) {
      const monthDate = subMonths(now, i);
      const monthStart = startOfMonth(monthDate);
      const monthEnd = endOfMonth(monthDate);
      const monthLabel = format(monthDate, 'MMM-yy');

      const monthDeals = deals.filter(deal => {
        const dealDate = parseISO(deal.updated_at);
        return isWithinInterval(dealDate, { start: monthStart, end: monthEnd });
      });

      const closedWonValue = monthDeals
        .filter(d => d.status === 'archived' && d.stage === 'closed-won')
        .reduce((sum, d) => sum + Number(d.value || 0), 0);

      const closedLostValue = monthDeals
        .filter(d => d.stage === 'closed-lost')
        .reduce((sum, d) => sum + Number(d.value || 0), 0);

      const totalFees = monthDeals
        .filter(d => d.status === 'archived' && d.stage === 'closed-won')
        .reduce((sum, d) => sum + Number(d.total_fee || 0), 0);

      monthlyData.push({
        month: monthLabel,
        closedWonValue,
        closedLostValue,
        totalFees,
        dealCount: monthDeals.length,
      });
    }

    // Calculate totals
    const activeDeals = deals.filter(d => d.status !== 'archived');
    const closedWonDeals = deals.filter(d => d.status === 'archived' && d.stage === 'closed-won');
    
    const totalPipelineValue = activeDeals.reduce((sum, d) => sum + Number(d.value || 0), 0);
    const totalClosedWonValue = closedWonDeals.reduce((sum, d) => sum + Number(d.value || 0), 0);
    const totalFees = closedWonDeals.reduce((sum, d) => sum + Number(d.total_fee || 0), 0);
    const avgDealSize = closedWonDeals.length > 0 ? totalClosedWonValue / closedWonDeals.length : 0;

    // Deal type breakdown
    const typeMap = new Map<string, number>();
    deals.forEach(deal => {
      let types: string[] = ['Other'];
      if (deal.deal_type) {
        try {
          const parsed = JSON.parse(deal.deal_type);
          types = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          types = [deal.deal_type];
        }
      }
      types.forEach(type => {
        typeMap.set(type, (typeMap.get(type) || 0) + Number(deal.value || 0));
      });
    });

    const totalValue = deals.reduce((sum, d) => sum + Number(d.value || 0), 0);
    const dealTypeBreakdown: DealTypeBreakdown[] = Array.from(typeMap.entries())
      .map(([type, value]) => ({
        type,
        value,
        percent: totalValue > 0 ? Math.round((value / totalValue) * 100) : 0,
      }))
      .sort((a, b) => b.value - a.value);

    // Stage breakdown
    const stageMap = new Map<string, { count: number; value: number }>();
    deals.forEach(deal => {
      const stage = deal.stage || 'Unknown';
      const existing = stageMap.get(stage) || { count: 0, value: 0 };
      stageMap.set(stage, {
        count: existing.count + 1,
        value: existing.value + Number(deal.value || 0),
      });
    });

    const stageBreakdown: StageBreakdown[] = Array.from(stageMap.entries())
      .map(([stage, data]) => ({
        stage: formatStageName(stage),
        count: data.count,
        value: data.value,
      }))
      .sort((a, b) => b.value - a.value);

    // Manager performance
    const managerMap = new Map<string, { closedWonValue: number; dealCount: number }>();
    closedWonDeals.forEach(deal => {
      const manager = deal.manager || 'Unassigned';
      const existing = managerMap.get(manager) || { closedWonValue: 0, dealCount: 0 };
      managerMap.set(manager, {
        closedWonValue: existing.closedWonValue + Number(deal.value || 0),
        dealCount: existing.dealCount + 1,
      });
    });

    const managerPerformance: ManagerPerformance[] = Array.from(managerMap.entries())
      .map(([manager, data]) => ({
        manager,
        closedWonValue: data.closedWonValue,
        dealCount: data.dealCount,
        avgDealSize: data.dealCount > 0 ? data.closedWonValue / data.dealCount : 0,
      }))
      .sort((a, b) => b.closedWonValue - a.closedWonValue);

    // Quarter data (current quarter)
    const quarterStart = startOfQuarter(now);
    const quarterlyData: MonthlyData[] = [];
    for (let i = 0; i < 3; i++) {
      const monthDate = subMonths(now, 2 - i);
      if (monthDate >= quarterStart) {
        const monthStart = startOfMonth(monthDate);
        const monthEnd = endOfMonth(monthDate);
        const monthLabel = format(monthDate, 'MMM-yy');

        const monthDeals = deals.filter(deal => {
          const dealDate = parseISO(deal.updated_at);
          return isWithinInterval(dealDate, { start: monthStart, end: monthEnd });
        });

        const closedWonValue = monthDeals
          .filter(d => d.status === 'archived' && d.stage === 'closed-won')
          .reduce((sum, d) => sum + Number(d.value || 0), 0);

        quarterlyData.push({
          month: monthLabel,
          closedWonValue,
          closedLostValue: 0,
          totalFees: monthDeals.reduce((sum, d) => sum + Number(d.total_fee || 0), 0),
          dealCount: monthDeals.length,
        });
      }
    }

    // YTD data (cumulative)
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    let cumulativeValue = 0;
    const ytdData: MonthlyData[] = [];
    for (let i = 0; i <= now.getMonth(); i++) {
      const monthDate = new Date(now.getFullYear(), i, 1);
      const monthStart = startOfMonth(monthDate);
      const monthEnd = endOfMonth(monthDate);
      const monthLabel = format(monthDate, 'MMM-yy');

      const monthClosedValue = deals
        .filter(deal => {
          const dealDate = parseISO(deal.updated_at);
          return isWithinInterval(dealDate, { start: monthStart, end: monthEnd }) &&
            deal.status === 'archived' && deal.stage === 'closed-won';
        })
        .reduce((sum, d) => sum + Number(d.value || 0), 0);

      cumulativeValue += monthClosedValue;

      ytdData.push({
        month: monthLabel,
        closedWonValue: cumulativeValue,
        closedLostValue: 0,
        totalFees: 0,
        dealCount: 0,
      });
    }

    // Period over period (current vs previous month)
    const currentMonthStart = startOfMonth(now);
    const currentMonthEnd = endOfMonth(now);
    const previousMonthStart = startOfMonth(subMonths(now, 1));
    const previousMonthEnd = endOfMonth(subMonths(now, 1));

    const currentMonthDeals = deals.filter(deal => {
      const dealDate = parseISO(deal.updated_at);
      return isWithinInterval(dealDate, { start: currentMonthStart, end: currentMonthEnd }) &&
        deal.status === 'archived' && deal.stage === 'closed-won';
    });

    const previousMonthDeals = deals.filter(deal => {
      const dealDate = parseISO(deal.updated_at);
      return isWithinInterval(dealDate, { start: previousMonthStart, end: previousMonthEnd }) &&
        deal.status === 'archived' && deal.stage === 'closed-won';
    });

    const currentMonthValue = currentMonthDeals.reduce((sum, d) => sum + Number(d.value || 0), 0);
    const previousMonthValue = previousMonthDeals.reduce((sum, d) => sum + Number(d.value || 0), 0);
    const currentMonthFees = currentMonthDeals.reduce((sum, d) => sum + Number(d.total_fee || 0), 0);
    const previousMonthFees = previousMonthDeals.reduce((sum, d) => sum + Number(d.total_fee || 0), 0);

    return {
      monthlyData,
      totalPipelineValue,
      totalClosedWonValue,
      totalFees,
      activeDealsCount: activeDeals.length,
      closedWonCount: closedWonDeals.length,
      avgDealSize,
      dealTypeBreakdown,
      stageBreakdown,
      managerPerformance,
      quarterlyData,
      ytdData,
      currentMonthValue,
      previousMonthValue,
      currentMonthFees,
      previousMonthFees,
    };
  }, [deals]);

  return {
    data: metricsData,
    isLoading,
    error,
  };
}

function generateEmptyMonthlyData(): MonthlyData[] {
  const data: MonthlyData[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const monthDate = subMonths(now, i);
    data.push({
      month: format(monthDate, 'MMM-yy'),
      closedWonValue: 0,
      closedLostValue: 0,
      totalFees: 0,
      dealCount: 0,
    });
  }
  return data;
}

function formatStageName(stage: string): string {
  return stage
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
