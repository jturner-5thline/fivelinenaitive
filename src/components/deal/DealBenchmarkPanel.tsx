import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus, BarChart3, Clock, Users, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { differenceInDays } from 'date-fns';

interface BenchmarkDeal {
  id: string;
  stage: string;
  status: string;
  value?: number;
  createdAt?: string;
  updatedAt?: string;
  lenderCount: number;
  milestoneProgress: number; // 0-100
}

interface DealBenchmarkPanelProps {
  currentDeal: BenchmarkDeal;
  portfolioDeals: BenchmarkDeal[];
}

interface BenchmarkMetric {
  label: string;
  currentValue: number;
  avgValue: number;
  unit: string;
  percentile: number;
  icon: typeof TrendingUp;
  higherIsBetter: boolean;
}

export function DealBenchmarkPanel({ currentDeal, portfolioDeals }: DealBenchmarkPanelProps) {
  const benchmarks = useMemo(() => {
    if (portfolioDeals.length < 2) return null;

    const activeDeals = portfolioDeals.filter(d => d.status === 'active' && d.id !== currentDeal.id);
    if (activeDeals.length === 0) return null;

    const now = new Date();

    // Days active
    const currentDaysActive = currentDeal.createdAt ? differenceInDays(now, new Date(currentDeal.createdAt)) : 0;
    const avgDaysActive = activeDeals.reduce((sum, d) => sum + (d.createdAt ? differenceInDays(now, new Date(d.createdAt)) : 0), 0) / activeDeals.length;
    const daysActiveValues = activeDeals.map(d => d.createdAt ? differenceInDays(now, new Date(d.createdAt)) : 0).sort((a, b) => a - b);
    const daysPercentile = Math.round((daysActiveValues.filter(v => v >= currentDaysActive).length / daysActiveValues.length) * 100);

    // Lender count
    const avgLenders = activeDeals.reduce((sum, d) => sum + d.lenderCount, 0) / activeDeals.length;
    const lenderValues = activeDeals.map(d => d.lenderCount).sort((a, b) => a - b);
    const lenderPercentile = Math.round((lenderValues.filter(v => v <= currentDeal.lenderCount).length / lenderValues.length) * 100);

    // Milestone progress
    const avgMilestoneProgress = activeDeals.reduce((sum, d) => sum + d.milestoneProgress, 0) / activeDeals.length;
    const milestoneValues = activeDeals.map(d => d.milestoneProgress).sort((a, b) => a - b);
    const milestonePercentile = Math.round((milestoneValues.filter(v => v <= currentDeal.milestoneProgress).length / milestoneValues.length) * 100);

    // Deal value
    const currentValue = currentDeal.value || 0;
    const dealsWithValue = activeDeals.filter(d => d.value && d.value > 0);
    const avgValue = dealsWithValue.length > 0 ? dealsWithValue.reduce((sum, d) => sum + (d.value || 0), 0) / dealsWithValue.length : 0;

    const metrics: BenchmarkMetric[] = [
      {
        label: 'Days Active',
        currentValue: currentDaysActive,
        avgValue: Math.round(avgDaysActive),
        unit: 'days',
        percentile: daysPercentile,
        icon: Clock,
        higherIsBetter: false,
      },
      {
        label: 'Lender Count',
        currentValue: currentDeal.lenderCount,
        avgValue: Math.round(avgLenders),
        unit: '',
        percentile: lenderPercentile,
        icon: Users,
        higherIsBetter: true,
      },
      {
        label: 'Milestone Progress',
        currentValue: currentDeal.milestoneProgress,
        avgValue: Math.round(avgMilestoneProgress),
        unit: '%',
        percentile: milestonePercentile,
        icon: Zap,
        higherIsBetter: true,
      },
    ];

    return { metrics, totalDeals: activeDeals.length };
  }, [currentDeal, portfolioDeals]);

  if (!benchmarks) {
    return (
      <div className="text-center py-4">
        <BarChart3 className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">Need more deals for benchmarking</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
        vs. {benchmarks.totalDeals} active deal{benchmarks.totalDeals !== 1 ? 's' : ''}
      </p>
      
      <div className="space-y-3">
        {benchmarks.metrics.map(metric => {
          const diff = metric.currentValue - metric.avgValue;
          const isGood = metric.higherIsBetter ? diff >= 0 : diff <= 0;
          const Icon = metric.icon;
          const TrendIcon = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;
          
          return (
            <div key={metric.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">{metric.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold">{metric.currentValue}{metric.unit}</span>
                  <span className="text-muted-foreground">vs {metric.avgValue}{metric.unit} avg</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Progress value={metric.percentile} className="h-1.5 flex-1" />
                <Badge 
                  variant="outline" 
                  className={cn(
                    "text-[10px] h-4 gap-0.5",
                    isGood ? 'text-green-500 border-green-500/20' : 'text-amber-500 border-amber-500/20'
                  )}
                >
                  <TrendIcon className="h-2.5 w-2.5" />
                  p{metric.percentile}
                </Badge>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
