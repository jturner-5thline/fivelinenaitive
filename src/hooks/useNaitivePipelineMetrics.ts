import { useMemo } from 'react';
import { Deal, DealStatus } from '@/types/deal';
import { DealStageOption } from '@/contexts/DealStagesContext';
import { differenceInDays, subDays, isAfter } from 'date-fns';

export interface NaitivePipelineKPIs {
  totalDeals: number;
  weightedPipelineValue: number;
  dealsAddedLast30Days: number;
  avgDaysInCurrentStage: number;
  atRiskDeals: number;
  stalledDeals: number;
  closedWonRate: number;
  closedWonCount: number;
  closedLostCount: number;
}

export interface StageFunnelItem {
  name: string;
  stageId: string;
  count: number;
  value: number;
}

export interface StageAgingItem {
  name: string;
  stageId: string;
  avgDays: number;
  dealCount: number;
}

export interface HealthMixItem {
  status: DealStatus;
  label: string;
  count: number;
  color: string;
}

export interface PipelineTrendPoint {
  date: string;
  created: number;
  closedWon: number;
  closedLost: number;
}

export interface NaitivePipelineNotification {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  dealId: string;
  dealName: string;
}

export interface NaitivePipelineRecommendation {
  id: string;
  message: string;
  category: 'action' | 'insight' | 'opportunity';
}

export interface NaitiveDealHurdle {
  dealId: string;
  dealName: string;
  hurdle: string;
  severity: 'high' | 'medium' | 'low';
}

const STAGE_WEIGHT_MAP: Record<string, number> = {
  'qual-booked': 0.1,
  'qual-booked-2': 0.2,
  'demo-booked': 0.4,
  'onboarding-booked': 0.6,
  'onboarding': 0.8,
  'converted': 1.0,
  'closed-lost': 0,
};

const STALLED_THRESHOLD_DAYS = 14;
const NO_ACTIVITY_THRESHOLD_DAYS = 7;

export function useNaitivePipelineMetrics(deals: Deal[], stages: DealStageOption[]) {
  const kpis = useMemo<NaitivePipelineKPIs>(() => {
    const now = new Date();
    const thirtyDaysAgo = subDays(now, 30);

    const activeDeals = deals.filter(d => d.stage !== 'converted' && d.stage !== 'closed-lost');
    const closedWon = deals.filter(d => d.stage === 'converted');
    const closedLost = deals.filter(d => d.stage === 'closed-lost');
    const totalClosed = closedWon.length + closedLost.length;

    const weightedValue = activeDeals.reduce((sum, d) => {
      const weight = STAGE_WEIGHT_MAP[d.stage] ?? 0.3;
      return sum + (d.value || 0) * weight;
    }, 0);

    const addedLast30 = deals.filter(d => isAfter(new Date(d.createdAt), thirtyDaysAgo)).length;

    const daysInStage = activeDeals.map(d => differenceInDays(now, new Date(d.updatedAt)));
    const avgDays = daysInStage.length > 0 ? Math.round(daysInStage.reduce((a, b) => a + b, 0) / daysInStage.length) : 0;

    const atRisk = deals.filter(d => d.status === 'at-risk').length;
    const stalled = activeDeals.filter(d => differenceInDays(now, new Date(d.updatedAt)) >= STALLED_THRESHOLD_DAYS).length;
    const closedWonRate = totalClosed > 0 ? Math.round((closedWon.length / totalClosed) * 100) : 0;

    return {
      totalDeals: deals.length,
      weightedPipelineValue: weightedValue,
      dealsAddedLast30Days: addedLast30,
      avgDaysInCurrentStage: avgDays,
      atRiskDeals: atRisk,
      stalledDeals: stalled,
      closedWonRate,
      closedWonCount: closedWon.length,
      closedLostCount: closedLost.length,
    };
  }, [deals]);

  const funnelData = useMemo<StageFunnelItem[]>(() => {
    return stages
      .filter(s => s.id !== 'closed-lost')
      .map(s => {
        const stageDeals = deals.filter(d => d.stage === s.id);
        return {
          name: s.label,
          stageId: s.id,
          count: stageDeals.length,
          value: stageDeals.reduce((sum, d) => sum + (d.value || 0), 0),
        };
      });
  }, [deals, stages]);

  const agingData = useMemo<StageAgingItem[]>(() => {
    const now = new Date();
    return stages
      .filter(s => s.id !== 'converted' && s.id !== 'closed-lost')
      .map(s => {
        const stageDeals = deals.filter(d => d.stage === s.id);
        const days = stageDeals.map(d => differenceInDays(now, new Date(d.updatedAt)));
        const avg = days.length > 0 ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : 0;
        return { name: s.label, stageId: s.id, avgDays: avg, dealCount: stageDeals.length };
      });
  }, [deals, stages]);

  const healthMix = useMemo<HealthMixItem[]>(() => {
    const statuses: { status: DealStatus; label: string; color: string }[] = [
      { status: 'on-track', label: 'On Track', color: 'hsl(var(--success))' },
      { status: 'at-risk', label: 'At Risk', color: 'hsl(45, 93%, 47%)' },
      { status: 'off-track', label: 'Off Track', color: 'hsl(var(--destructive))' },
      { status: 'on-hold', label: 'On Hold', color: 'hsl(var(--muted-foreground))' },
    ];
    return statuses.map(s => ({
      ...s,
      count: deals.filter(d => d.status === s.status && d.stage !== 'converted' && d.stage !== 'closed-lost').length,
    }));
  }, [deals]);

  const trendData = useMemo<PipelineTrendPoint[]>(() => {
    const now = new Date();
    const points: PipelineTrendPoint[] = [];
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      const label = monthStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      const created = deals.filter(d => {
        const c = new Date(d.createdAt);
        return c >= monthStart && c <= monthEnd;
      }).length;
      // Won/lost approximated by updatedAt in that month
      const won = deals.filter(d => d.stage === 'converted' && new Date(d.updatedAt) >= monthStart && new Date(d.updatedAt) <= monthEnd).length;
      const lost = deals.filter(d => d.stage === 'closed-lost' && new Date(d.updatedAt) >= monthStart && new Date(d.updatedAt) <= monthEnd).length;
      points.push({ date: label, created, closedWon: won, closedLost: lost });
    }
    return points;
  }, [deals]);

  const notifications = useMemo<NaitivePipelineNotification[]>(() => {
    const now = new Date();
    const alerts: NaitivePipelineNotification[] = [];
    const activeDeals = deals.filter(d => d.stage !== 'converted' && d.stage !== 'closed-lost');

    activeDeals.forEach(d => {
      const daysSinceUpdate = differenceInDays(now, new Date(d.updatedAt));

      if (daysSinceUpdate >= STALLED_THRESHOLD_DAYS) {
        alerts.push({
          id: `stalled-${d.id}`,
          severity: daysSinceUpdate >= 21 ? 'critical' : 'warning',
          message: `No activity in ${daysSinceUpdate} days`,
          dealId: d.id,
          dealName: d.name || d.company,
        });
      }

      if (d.status === 'at-risk' && (d.value || 0) >= 100000) {
        alerts.push({
          id: `highrisk-${d.id}`,
          severity: 'critical',
          message: `High-value deal marked at risk`,
          dealId: d.id,
          dealName: d.name || d.company,
        });
      }

      if (d.isFlagged) {
        alerts.push({
          id: `flagged-${d.id}`,
          severity: 'warning',
          message: d.flagNotes || 'Deal is flagged',
          dealId: d.id,
          dealName: d.name || d.company,
        });
      }
    });

    alerts.sort((a, b) => {
      const sev = { critical: 0, warning: 1, info: 2 };
      return sev[a.severity] - sev[b.severity];
    });

    return alerts;
  }, [deals]);

  const recommendations = useMemo<NaitivePipelineRecommendation[]>(() => {
    const recs: NaitivePipelineRecommendation[] = [];
    const now = new Date();
    const activeDeals = deals.filter(d => d.stage !== 'converted' && d.stage !== 'closed-lost');

    // Stale prospect stage
    const staleProspects = activeDeals.filter(d => d.stage === 'qual-booked' && differenceInDays(now, new Date(d.updatedAt)) >= 7);
    if (staleProspects.length > 0) {
      recs.push({
        id: 'stale-prospects',
        message: `${staleProspects.length} deal${staleProspects.length > 1 ? 's' : ''} in Prospect stage with no recent activity — consider outreach or advancing.`,
        category: 'action',
      });
    }

    // Bottleneck detection
    stages.filter(s => s.id !== 'converted' && s.id !== 'closed-lost').forEach(s => {
      const stageDeals = activeDeals.filter(d => d.stage === s.id);
      if (stageDeals.length >= 3) {
        const avgDays = stageDeals.reduce((sum, d) => sum + differenceInDays(now, new Date(d.updatedAt)), 0) / stageDeals.length;
        if (avgDays >= 10) {
          recs.push({
            id: `bottleneck-${s.id}`,
            message: `${s.label} has ${stageDeals.length} deals averaging ${Math.round(avgDays)} days — potential bottleneck.`,
            category: 'insight',
          });
        }
      }
    });

    // At-risk deals needing intervention
    const atRiskDeals = activeDeals.filter(d => d.status === 'at-risk');
    if (atRiskDeals.length > 0) {
      recs.push({
        id: 'at-risk-intervention',
        message: `${atRiskDeals.length} at-risk deal${atRiskDeals.length > 1 ? 's' : ''} may need intervention to get back on track.`,
        category: 'action',
      });
    }

    // Conversion opportunity
    const closingDeals = activeDeals.filter(d => d.stage === 'onboarding');
    if (closingDeals.length > 0) {
      recs.push({
        id: 'onboarding-push',
        message: `${closingDeals.length} deal${closingDeals.length > 1 ? 's' : ''} in Onboarding stage — push to activate this period.`,
        category: 'opportunity',
      });
    }

    return recs;
  }, [deals, stages]);

  const hurdles = useMemo<NaitiveDealHurdle[]>(() => {
    const result: NaitiveDealHurdle[] = [];
    const now = new Date();
    const activeDeals = deals.filter(d => d.stage !== 'converted' && d.stage !== 'closed-lost');

    activeDeals.forEach(d => {
      const daysSinceUpdate = differenceInDays(now, new Date(d.updatedAt));
      const name = d.name || d.company;

      if (d.status === 'off-track') {
        result.push({ dealId: d.id, dealName: name, hurdle: 'Off Track — needs immediate attention', severity: 'high' });
      }
      if (d.status === 'at-risk') {
        result.push({ dealId: d.id, dealName: name, hurdle: 'At Risk — monitor closely', severity: 'medium' });
      }
      if (daysSinceUpdate >= 21) {
        result.push({ dealId: d.id, dealName: name, hurdle: 'No activity in 21+ days', severity: 'high' });
      } else if (daysSinceUpdate >= STALLED_THRESHOLD_DAYS) {
        result.push({ dealId: d.id, dealName: name, hurdle: `Stalled — ${daysSinceUpdate} days since update`, severity: 'medium' });
      }
      if (d.isFlagged) {
        result.push({ dealId: d.id, dealName: name, hurdle: d.flagNotes || 'Flagged for review', severity: 'high' });
      }
      if (!d.contact && d.stage !== 'qual-booked') {
        result.push({ dealId: d.id, dealName: name, hurdle: 'No contact info', severity: 'low' });
      }
      if ((d.value || 0) === 0 && d.stage !== 'qual-booked') {
        result.push({ dealId: d.id, dealName: name, hurdle: 'No deal value set', severity: 'low' });
      }
    });

    result.sort((a, b) => {
      const sev = { high: 0, medium: 1, low: 2 };
      return sev[a.severity] - sev[b.severity];
    });

    return result;
  }, [deals]);

  // Stage-to-stage conversion (simple: % of deals that moved past each stage)
  const stageConversionRate = useMemo(() => {
    if (deals.length === 0) return 0;
    const stageOrder = stages.map(s => s.id);
    const pastFirst = deals.filter(d => {
      const idx = stageOrder.indexOf(d.stage);
      return idx > 0;
    }).length;
    return Math.round((pastFirst / deals.length) * 100);
  }, [deals, stages]);

  return {
    kpis: { ...kpis, stageConversionRate } as NaitivePipelineKPIs & { stageConversionRate: number },
    funnelData,
    agingData,
    healthMix,
    trendData,
    notifications,
    recommendations,
    hurdles,
  };
}
