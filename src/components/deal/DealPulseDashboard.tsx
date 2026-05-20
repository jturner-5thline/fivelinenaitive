import { useMemo } from 'react';
import { Activity, TrendingUp, Users, FileCheck, AlertTriangle, Clock, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { differenceInDays, differenceInBusinessDays } from 'date-fns';
import { useFeatureAccess } from '@/hooks/useFeatureFlags';

interface DealPulseProps {
  deal: {
    id: string;
    company: string;
    stage: string;
    status: string;
    value?: number;
    updatedAt?: string;
    createdAt?: string;
    lenders?: Array<{
      id: string;
      name: string;
      stage: string;
      updatedAt?: string;
      trackingStatus?: string;
    }>;
    milestones?: Array<{
      id: string;
      title: string;
      completed: boolean;
      dueDate?: string;
    }>;
    narrative?: string;
    notes?: string;
  };
  attachmentCount?: number;
  checklistTotal?: number;
  checklistComplete?: number;
  outstandingItemsCount?: number;
}

interface HealthMetric {
  label: string;
  score: number; // 0-100
  weight: number;
  detail: string;
}

export function DealPulseDashboard({ deal, attachmentCount = 0, checklistTotal = 0, checklistComplete = 0, outstandingItemsCount = 0 }: DealPulseProps) {
  const { hasAccess, isLoading: accessLoading } = useFeatureAccess('deal_pulse_widgets');

  const metrics = useMemo(() => {
    const healthMetrics: HealthMetric[] = [];
    const now = new Date();

    // 1. Data completeness (has narrative, value, lenders, milestones)
    let dataScore = 0;
    let dataTotal = 0;
    const dataChecks = [
      { has: !!deal.value, label: 'Deal value' },
      { has: !!deal.narrative, label: 'Narrative' },
      { has: (deal.lenders?.length || 0) > 0, label: 'Funding Sources' },
      { has: (deal.milestones?.length || 0) > 0, label: 'Milestones' },
      { has: attachmentCount > 0, label: 'Documents' },
    ];
    dataChecks.forEach(c => { dataTotal++; if (c.has) dataScore++; });
    const completenessScore = Math.round((dataScore / dataTotal) * 100);
    const missingFields = dataChecks.filter(c => !c.has).map(c => c.label);
    healthMetrics.push({
      label: 'Data Completeness',
      score: completenessScore,
      weight: 25,
      detail: missingFields.length > 0 ? `Missing: ${missingFields.join(', ')}` : 'All key fields filled',
    });

    // 2. Lender engagement
    const lenders = deal.lenders || [];
    const activeLenders = lenders.filter(l => l.trackingStatus === 'active' || !l.trackingStatus);
    const staleLenders = activeLenders.filter(l => {
      if (!l.updatedAt) return true;
      return differenceInBusinessDays(now, new Date(l.updatedAt)) >= 5;
    });
    const engagementScore = lenders.length === 0 ? 0 : Math.round(((lenders.length - staleLenders.length) / lenders.length) * 100);
    healthMetrics.push({
      label: 'Funding Source Engagement',
      score: lenders.length === 0 ? 50 : engagementScore,
      weight: 30,
      detail: lenders.length === 0 ? 'No funding sources added' : `${staleLenders.length} stale of ${lenders.length} total`,
    });

    // 3. Milestone progress
    const milestones = deal.milestones || [];
    const completedMilestones = milestones.filter(m => m.completed);
    const overdueMilestones = milestones.filter(m => !m.completed && m.dueDate && new Date(m.dueDate) < now);
    const milestoneScore = milestones.length === 0 ? 50 : Math.round((completedMilestones.length / milestones.length) * 100) - (overdueMilestones.length * 10);
    healthMetrics.push({
      label: 'Milestone Progress',
      score: Math.max(0, Math.min(100, milestoneScore)),
      weight: 25,
      detail: milestones.length === 0 ? 'No milestones set' : `${completedMilestones.length}/${milestones.length} done, ${overdueMilestones.length} overdue`,
    });

    // 4. Deal freshness (when was it last updated)
    const lastUpdate = deal.updatedAt ? new Date(deal.updatedAt) : null;
    const daysSinceUpdate = lastUpdate ? differenceInDays(now, lastUpdate) : 30;
    const freshnessScore = daysSinceUpdate <= 1 ? 100 : daysSinceUpdate <= 3 ? 80 : daysSinceUpdate <= 7 ? 60 : daysSinceUpdate <= 14 ? 30 : 10;
    healthMetrics.push({
      label: 'Deal Freshness',
      score: freshnessScore,
      weight: 20,
      detail: lastUpdate ? `Last updated ${daysSinceUpdate} day${daysSinceUpdate !== 1 ? 's' : ''} ago` : 'Never updated',
    });

    // Overall health score
    const totalWeight = healthMetrics.reduce((sum, m) => sum + m.weight, 0);
    const overallScore = Math.round(healthMetrics.reduce((sum, m) => sum + (m.score * m.weight), 0) / totalWeight);

    // Days in current stage
    const daysInStage = deal.updatedAt ? differenceInDays(now, new Date(deal.updatedAt)) : 0;

    // Lender response rate
    const respondedLenders = lenders.filter(l => l.stage !== 'Outreach' && l.stage !== 'outreach');
    const responseRate = lenders.length === 0 ? 0 : Math.round((respondedLenders.length / lenders.length) * 100);

    // Data room progress
    const dataRoomProgress = checklistTotal === 0 ? 0 : Math.round((checklistComplete / checklistTotal) * 100);

    return {
      healthMetrics,
      overallScore,
      daysInStage,
      staleLenderCount: staleLenders.length,
      overdueMilestoneCount: overdueMilestones.length,
      responseRate,
      dataRoomProgress,
      outstandingItemsCount,
      lenderCount: lenders.length,
      milestoneProgress: milestones.length === 0 ? 0 : Math.round((completedMilestones.length / milestones.length) * 100),
    };
  }, [deal, attachmentCount, checklistTotal, checklistComplete, outstandingItemsCount]);

  const getScoreColor = (score: number) => {
    if (score >= 75) return 'text-green-500';
    if (score >= 50) return 'text-amber-500';
    return 'text-destructive';
  };

  const getScoreBg = (score: number) => {
    if (score >= 75) return 'bg-green-500';
    if (score >= 50) return 'bg-amber-500';
    return 'bg-destructive';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Needs Attention';
    return 'At Risk';
  };

  if (!hasAccess && !accessLoading) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
      {/* Health Score */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="col-span-2 md:col-span-1 bg-card rounded-lg border p-3 flex flex-col items-center justify-center gap-1 cursor-default">
              <div className="relative w-14 h-14">
                <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                  <circle cx="28" cy="28" r="24" fill="none" stroke="currentColor" strokeWidth="4" className="text-muted/20" />
                  <circle cx="28" cy="28" r="24" fill="none" strokeWidth="4" strokeLinecap="round"
                    className={getScoreColor(metrics.overallScore)}
                    stroke="currentColor"
                    strokeDasharray={`${(metrics.overallScore / 100) * 150.8} 150.8`}
                  />
                </svg>
                <span className={cn("absolute inset-0 flex items-center justify-center text-sm font-bold", getScoreColor(metrics.overallScore))}>
                  {metrics.overallScore}
                </span>
              </div>
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Health</span>
              <Badge variant="outline" className={cn("text-[10px] h-4", getScoreColor(metrics.overallScore))}>
                {getScoreLabel(metrics.overallScore)}
              </Badge>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <div className="space-y-2 text-xs">
              {metrics.healthMetrics.map(m => (
                <div key={m.label} className="flex items-center justify-between gap-4">
                  <span>{m.label}</span>
                  <div className="flex items-center gap-2">
                    <Progress value={m.score} className="w-16 h-1.5" />
                    <span className={cn("font-medium w-8 text-right", getScoreColor(m.score))}>{m.score}%</span>
                  </div>
                </div>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Days in Stage */}
      <div className="bg-card rounded-lg border p-3 flex flex-col items-center justify-center gap-1">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <span className={cn("text-xl font-bold", metrics.daysInStage > 14 ? 'text-amber-500' : 'text-foreground')}>
          {metrics.daysInStage}
        </span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider text-center">Days in Stage</span>
      </div>

      {/* Lenders */}
      <div className="bg-card rounded-lg border p-3 flex flex-col items-center justify-center gap-1">
        <Users className="h-4 w-4 text-muted-foreground" />
        <div className="flex items-baseline gap-1">
          <span className="text-xl font-bold">{metrics.lenderCount}</span>
          {metrics.staleLenderCount > 0 && (
            <span className="text-xs text-destructive font-medium">({metrics.staleLenderCount} stale)</span>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Funding Sources</span>
      </div>

      {/* Response Rate */}
      <div className="bg-card rounded-lg border p-3 flex flex-col items-center justify-center gap-1">
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
        <span className={cn("text-xl font-bold", metrics.responseRate >= 60 ? 'text-green-500' : metrics.responseRate >= 30 ? 'text-amber-500' : 'text-muted-foreground')}>
          {metrics.responseRate}%
        </span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Response Rate</span>
      </div>

      {/* Milestones */}
      <div className="bg-card rounded-lg border p-3 flex flex-col items-center justify-center gap-1">
        <Zap className="h-4 w-4 text-muted-foreground" />
        <div className="flex items-baseline gap-1">
          <span className="text-xl font-bold">{metrics.milestoneProgress}%</span>
          {metrics.overdueMilestoneCount > 0 && (
            <span className="text-xs text-destructive font-medium">({metrics.overdueMilestoneCount} late)</span>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Milestones</span>
      </div>

      {/* Data Room */}
      <div className="bg-card rounded-lg border p-3 flex flex-col items-center justify-center gap-1">
        <FileCheck className="h-4 w-4 text-muted-foreground" />
        <span className="text-xl font-bold">{metrics.dataRoomProgress}%</span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Data Room</span>
        {metrics.outstandingItemsCount > 0 && (
          <span className="text-[10px] text-amber-500 font-medium">{metrics.outstandingItemsCount} outstanding</span>
        )}
      </div>
    </div>
  );
}
