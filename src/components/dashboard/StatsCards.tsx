import { TrendingUp, Briefcase, FileSearch, DollarSign } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { usePreferences } from '@/contexts/PreferencesContext';

interface StatsCardsProps {
  stats: {
    activeDeals: number;
    activeDealValue: number;
    dealsInDiligence: number;
    dollarsInDiligence: number;
    totalDeals: number;
  };
}

export function StatsCards({ stats }: StatsCardsProps) {
  const { formatCurrencyValue } = usePreferences();

  const statItems = [
    {
      label: 'Active Deals',
      value: stats.activeDeals.toString(),
      icon: Briefcase,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      label: 'Active Deal Volume',
      value: formatCurrencyValue(stats.activeDealValue),
      icon: TrendingUp,
      color: 'text-accent',
      bgColor: 'bg-accent/10',
    },
    {
      label: 'Deals in Diligence',
      value: stats.dealsInDiligence.toString(),
      icon: FileSearch,
      color: 'text-success',
      bgColor: 'bg-success/10',
    },
    {
      label: 'Dollars in Diligence',
      value: formatCurrencyValue(stats.dollarsInDiligence),
      icon: DollarSign,
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
