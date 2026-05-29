import { useMemo } from 'react';
import { Deal } from '@/types/deal';
import { DealStageOption } from '@/contexts/DealStagesContext';
import { differenceInDays, subDays, isAfter } from 'date-fns';

// Terminal stages
const WON_STAGES = ['fs-active-client'];
const LOST_STAGES = ['fs-not-a-fit', 'fs-dropped-client', 'fs-client-churned', 'fs-client-lost'];
const TERMINAL_STAGES = [...WON_STAGES, ...LOST_STAGES];
const INACTIVE_STAGES = ['fs-unresponsive', 'fs-on-hold', ...TERMINAL_STAGES];

// Stages explicitly excluded from ALL FinServ Dashboard aggregate widgets and
// the Pipeline Stats & Conversion table per product requirement. They may
// still appear on the board view's per-stage columns, but they must not
// influence any pipeline-summary metric here.
const EXCLUDED_FROM_AGGREGATES = ['fs-client-churned', 'fs-client-lost'];

// Stage weights for weighted pipeline value
const STAGE_WEIGHTS: Record<string, number> = {
  'fs-unresponsive': 0,
  'fs-on-hold': 0.05,
  'fs-indication-of-interest': 0.1,
  'fs-not-a-fit': 0,
  'fs-dropped-client': 0,
  'fs-evaluation': 0.25,
  'fs-proposal-dev': 0.4,
  'fs-proposal-sent': 0.6,
  'fs-agreement-pending': 0.8,
  'fs-active-client': 1.0,
  'fs-client-churned': 0,
  'fs-client-lost': 0,
};

export interface FinServKPIs {
  totalDeals: number;
  activeDeals: number;
  weightedValue: number;
  addedLast30: number;
  wonCount: number;
  lostCount: number;
  winRate: number;
  avgDaysInStage: number;
  atRiskCount: number;
  stalledCount: number;
}

export interface FinServStageMetric {
  stageId: string;
  label: string;
  count: number;
  value: number;
  avgDays: number;
  conversionRate: number;
}

export interface FinServTopClient {
  name: string;
  dealCount: number;
  totalValue: number;
}

export interface FinServInsight {
  id: string;
  type: 'bottleneck' | 'strength' | 'risk' | 'opportunity';
  message: string;
}

const ACTIVE_CLIENT_STAGE = 'fs-active-client';

export function useFinServMetrics(deals: Deal[], stages: DealStageOption[], topClientsLimit: number = 3) {
  // Aggregate-eligible deal set: drops Churned/Lost from every summary
  // calculation. Use this everywhere except the per-stage board columns.
  const aggregateDeals = useMemo(
    () => deals.filter(d => !EXCLUDED_FROM_AGGREGATES.includes(d.stage)),
    [deals],
  );
  const activeDeals = useMemo(
    () => aggregateDeals.filter(d => !INACTIVE_STAGES.includes(d.stage)),
    [aggregateDeals],
  );
  const wonDeals = useMemo(() => aggregateDeals.filter(d => WON_STAGES.includes(d.stage)), [aggregateDeals]);
  // Win-rate denominator still uses Lost-class stages (including Churned/Lost)
  // because that is the canonical win-rate formula: won / (won + lost).
  const lostDeals = useMemo(() => deals.filter(d => LOST_STAGES.includes(d.stage)), [deals]);

  const kpis = useMemo<FinServKPIs>(() => {
    const now = new Date();
    const thirtyDaysAgo = subDays(now, 30);

    const weightedValue = activeDeals.reduce((sum, d) => {
      const w = STAGE_WEIGHTS[d.stage] ?? 0.3;
      return sum + (d.value || 0) * w;
    }, 0);

    const addedLast30 = aggregateDeals.filter(d => isAfter(new Date(d.createdAt), thirtyDaysAgo)).length;
    const totalClosed = wonDeals.length + lostDeals.length;
    const winRate = totalClosed > 0 ? Math.round((wonDeals.length / totalClosed) * 100) : 0;

    const daysArr = activeDeals.map(d => differenceInDays(now, new Date(d.updatedAt)));
    const avgDays = daysArr.length > 0 ? Math.round(daysArr.reduce((a, b) => a + b, 0) / daysArr.length) : 0;

    return {
      totalDeals: aggregateDeals.length,
      activeDeals: activeDeals.length,
      weightedValue,
      addedLast30,
      wonCount: wonDeals.length,
      lostCount: lostDeals.length,
      winRate,
      avgDaysInStage: avgDays,
      atRiskCount: aggregateDeals.filter(d => d.status === 'at-risk').length,
      stalledCount: activeDeals.filter(d => differenceInDays(new Date(), new Date(d.updatedAt)) >= 14).length,
    };
  }, [aggregateDeals, activeDeals, wonDeals, lostDeals]);

  const stageMetrics = useMemo<FinServStageMetric[]>(() => {
    const now = new Date();
    // Drop Churned/Lost rows entirely from the Pipeline Stats & Conversion
    // table so their counts/values don't pollute conversion math between
    // earlier stages.
    const visibleStages = stages.filter(s => !EXCLUDED_FROM_AGGREGATES.includes(s.id));
    const stageOrder = visibleStages.map(s => s.id);

    return visibleStages.map((s, idx) => {
      const stageDeals = aggregateDeals.filter(d => d.stage === s.id);
      const days = stageDeals.map(d => differenceInDays(now, new Date(d.updatedAt)));
      const avgDays = days.length > 0 ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : 0;

      // Conversion = % of deals that moved past this stage
      const pastThisStage = aggregateDeals.filter(d => {
        const dIdx = stageOrder.indexOf(d.stage);
        return dIdx > idx;
      }).length;
      const total = stageDeals.length + pastThisStage;
      const conversionRate = total > 0 ? Math.round((pastThisStage / total) * 100) : 0;

      return {
        stageId: s.id,
        label: s.label,
        count: stageDeals.length,
        value: stageDeals.reduce((sum, d) => sum + (d.value || 0), 0),
        avgDays,
        conversionRate,
      };
    });
  }, [aggregateDeals, stages]);

  // Top Active Clients: only deals currently in the "Active Client" stage.
  // Closed Won, Closed Lost, On Hold, Unresponsive, Churned, etc. are
  // intentionally excluded so this reflects live revenue relationships only.
  const topClients = useMemo<FinServTopClient[]>(() => {
    const clientMap = new Map<string, { count: number; value: number }>();
    deals
      .filter(d => d.stage === ACTIVE_CLIENT_STAGE)
      .forEach(d => {
        const name = d.company || d.name;
        if (!name) return;
        const existing = clientMap.get(name) || { count: 0, value: 0 };
        existing.count++;
        existing.value += d.value || 0;
        clientMap.set(name, existing);
      });
    return Array.from(clientMap.entries())
      .map(([name, data]) => ({ name, dealCount: data.count, totalValue: data.value }))
      .sort((a, b) => b.totalValue - a.totalValue || b.dealCount - a.dealCount)
      .slice(0, Math.max(1, topClientsLimit));
  }, [deals, topClientsLimit]);

  const insights = useMemo<FinServInsight[]>(() => {
    const result: FinServInsight[] = [];
    const now = new Date();

    // Bottleneck detection
    stageMetrics.filter(s => !TERMINAL_STAGES.includes(s.stageId) && !['fs-unresponsive', 'fs-on-hold'].includes(s.stageId))
      .forEach(s => {
        if (s.count >= 3 && s.avgDays >= 10) {
          result.push({
            id: `bottleneck-${s.stageId}`,
            type: 'bottleneck',
            message: `${s.label} has ${s.count} deals averaging ${s.avgDays} days — potential bottleneck.`,
          });
        }
      });

    // Best conversion
    const bestConversion = stageMetrics
      .filter(s => s.conversionRate > 0 && !TERMINAL_STAGES.includes(s.stageId))
      .sort((a, b) => b.conversionRate - a.conversionRate)[0];
    if (bestConversion) {
      result.push({
        id: 'best-conversion',
        type: 'strength',
        message: `${bestConversion.label} has the highest conversion rate at ${bestConversion.conversionRate}%.`,
      });
    }

    // Longest dwell
    const longestDwell = stageMetrics
      .filter(s => s.count > 0 && !TERMINAL_STAGES.includes(s.stageId))
      .sort((a, b) => b.avgDays - a.avgDays)[0];
    if (longestDwell && longestDwell.avgDays > 7) {
      result.push({
        id: 'longest-dwell',
        type: 'risk',
        message: `${longestDwell.label} has the longest average dwell time at ${longestDwell.avgDays} days.`,
      });
    }

    // Top client concentration
    if (topClients.length > 0) {
      const totalValue = aggregateDeals.reduce((s, d) => s + (d.value || 0), 0);
      const topValue = topClients.reduce((s, c) => s + c.totalValue, 0);
      if (totalValue > 0) {
        const pct = Math.round((topValue / totalValue) * 100);
        if (pct >= 50) {
          result.push({
            id: 'concentration',
            type: 'risk',
            message: `Top 3 clients represent ${pct}% of total pipeline value — high concentration risk.`,
          });
        }
      }
    }

    // Stalled deals
    const stalledCount = activeDeals.filter(d => differenceInDays(now, new Date(d.updatedAt)) >= 14).length;
    if (stalledCount > 0) {
      result.push({
        id: 'stalled',
        type: 'risk',
        message: `${stalledCount} deal${stalledCount > 1 ? 's' : ''} stalled with no activity for 14+ days.`,
      });
    }

    // Proposal opportunity
    const proposalDeals = activeDeals.filter(d => d.stage === 'fs-proposal-sent');
    if (proposalDeals.length > 0) {
      result.push({
        id: 'proposal-push',
        type: 'opportunity',
        message: `${proposalDeals.length} proposal${proposalDeals.length > 1 ? 's' : ''} sent — follow up to accelerate conversion.`,
      });
    }

    return result;
  }, [stageMetrics, topClients, activeDeals, aggregateDeals]);

  return { kpis, stageMetrics, topClients, insights };
}
