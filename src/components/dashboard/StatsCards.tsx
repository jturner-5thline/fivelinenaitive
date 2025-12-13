import { TrendingUp, Briefcase, CheckCircle, Target } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface StatsCardsProps {
  stats: {
    totalValue: number;
    activeDeals: number;
    completedDeals: number;
    completionRate: number;
    totalDeals: number;
  };
}

export function StatsCards({ stats }: StatsCardsProps) {
  const formatValue = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    }
    return `$${(value / 1000).toFixed(0)}K`;
  };

  const statItems = [
    {
      label: 'Total Pipeline Value',
      value: formatValue(stats.totalValue),
      icon: TrendingUp,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      label: 'Active Deals',
      value: stats.activeDeals.toString(),
      icon: Briefcase,
      color: 'text-accent',
      bgColor: 'bg-accent/10',
    },
    {
      label: 'Completed Deals',
      value: stats.completedDeals.toString(),
      icon: CheckCircle,
      color: 'text-success',
      bgColor: 'bg-success/10',
    },
    {
      label: 'Completion Rate',
      value: `${stats.completionRate.toFixed(0)}%`,
      icon: Target,
      color: 'text-warning',
      bgColor: 'bg-warning/10',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {statItems.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="flex items-center gap-4 p-4">
            <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${stat.bgColor}`}>
              <stat.icon className={`h-6 w-6 ${stat.color}`} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
              <p className="text-2xl font-semibold text-foreground">{stat.value}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
