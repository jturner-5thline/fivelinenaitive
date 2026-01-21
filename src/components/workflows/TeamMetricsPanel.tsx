import { Users, Clock, TrendingUp, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useTeamMetrics, TeamMetric } from '@/hooks/useBehaviorInsights';

const METRIC_CONFIG: Record<string, { label: string; icon: React.ReactNode; unit: string; format: (v: number) => string }> = {
  avg_response_time: {
    label: 'Avg Response Time',
    icon: <Clock className="h-4 w-4" />,
    unit: 'hours',
    format: (v) => `${v.toFixed(1)}h`,
  },
  collaboration_score: {
    label: 'Collaboration Score',
    icon: <Users className="h-4 w-4" />,
    unit: '%',
    format: (v) => `${Math.round(v)}%`,
  },
  stage_duration: {
    label: 'Avg Stage Duration',
    icon: <TrendingUp className="h-4 w-4" />,
    unit: 'days',
    format: (v) => `${Math.round(v)}d`,
  },
  handoff_efficiency: {
    label: 'Handoff Efficiency',
    icon: <Activity className="h-4 w-4" />,
    unit: '%',
    format: (v) => `${Math.round(v)}%`,
  },
};

export function TeamMetricsPanel() {
  const { data: metrics = [], isLoading } = useTeamMetrics();

  // Get latest metric for each type
  const latestMetrics = metrics.reduce((acc, metric) => {
    if (!acc[metric.metric_type] || new Date(metric.metric_date) > new Date(acc[metric.metric_type].metric_date)) {
      acc[metric.metric_type] = metric;
    }
    return acc;
  }, {} as Record<string, TeamMetric>);

  const metricsList = Object.values(latestMetrics);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-56 mt-2" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (metricsList.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="h-5 w-5 text-primary" />
            Team Metrics
          </CardTitle>
          <CardDescription>
            Track how your team interacts with the platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No team metrics available yet</p>
            <p className="text-xs mt-1">Metrics will appear as your team uses the platform</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Activity className="h-5 w-5 text-primary" />
          Team Metrics
        </CardTitle>
        <CardDescription>
          How your team interacts with the platform
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {metricsList.map((metric) => {
            const config = METRIC_CONFIG[metric.metric_type];
            if (!config) return null;

            return (
              <div
                key={metric.id}
                className="p-4 rounded-lg border bg-muted/30"
              >
                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                  {config.icon}
                  <span className="text-xs font-medium">{config.label}</span>
                </div>
                <p className="text-2xl font-bold">
                  {config.format(metric.metric_value)}
                </p>
                {metric.breakdown && Object.keys(metric.breakdown).length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {metric.breakdown.sampleSize && `Based on ${metric.breakdown.sampleSize} samples`}
                    {metric.breakdown.uniqueUsers && `${metric.breakdown.uniqueUsers} active users`}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
