import { useState } from 'react';
import { TrendingUp, Briefcase, FileSearch, DollarSign } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { usePreferences } from '@/contexts/PreferencesContext';
import { Deal } from '@/types/deal';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

interface StatsCardsProps {
  stats: {
    activeDeals: number;
    activeDealValue: number;
    dealsInDiligence: number;
    dollarsInDiligence: number;
    totalDeals: number;
  };
  deals: Deal[];
}

const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--accent))',
  'hsl(var(--success))',
  'hsl(var(--warning))',
  'hsl(var(--destructive))',
  'hsl(292, 46%, 72%)',
  'hsl(200, 70%, 50%)',
  'hsl(150, 60%, 45%)',
];

export function StatsCards({ stats, deals }: StatsCardsProps) {
  const { formatCurrencyValue } = usePreferences();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<'activeDeals' | 'activeDealValue' | null>(null);

  const activeDeals = deals.filter(d => d.status !== 'archived');

  const getStageGroups = () => {
    const stageGroups: Record<string, { count: number; value: number; fee: number }> = {};
    activeDeals.forEach(deal => {
      const stage = deal.stage || 'Unknown';
      if (!stageGroups[stage]) {
        stageGroups[stage] = { count: 0, value: 0, fee: 0 };
      }
      stageGroups[stage].count += 1;
      stageGroups[stage].value += deal.value || 0;
      stageGroups[stage].fee += deal.totalFee || 0;
    });
    return stageGroups;
  };

  const getChartDataForMetric = (metric: 'count' | 'value' | 'fee') => {
    if (!dialogType) return [];
    const stageGroups = getStageGroups();
    return Object.entries(stageGroups).map(([name, data]) => ({
      name: formatStageName(name),
      value: data[metric],
    }));
  };

  const formatStageName = (stage: string) => {
    return stage
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const handleCardClick = (type: 'activeDeals' | 'activeDealValue') => {
    setDialogType(type);
    setDialogOpen(true);
  };

  const statItems = [
    {
      label: 'Active Deals',
      value: stats.activeDeals.toString(),
      icon: Briefcase,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      clickable: true,
      clickType: 'activeDeals' as const,
    },
    {
      label: 'Active Deal Volume',
      value: formatCurrencyValue(stats.activeDealValue),
      icon: TrendingUp,
      color: 'text-accent',
      bgColor: 'bg-accent/10',
      clickable: true,
      clickType: 'activeDealValue' as const,
    },
    {
      label: 'Deals in Diligence',
      value: stats.dealsInDiligence.toString(),
      icon: FileSearch,
      color: 'text-success',
      bgColor: 'bg-success/10',
      clickable: false,
      clickType: null,
    },
    {
      label: 'Dollars in Diligence',
      value: formatCurrencyValue(stats.dollarsInDiligence),
      icon: DollarSign,
      color: 'text-warning',
      bgColor: 'bg-warning/10',
      clickable: false,
      clickType: null,
    },
  ];

  const CustomTooltipForMetric = ({ metric, active, payload }: { metric: 'count' | 'value' | 'fee'; active?: boolean; payload?: any[] }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium text-foreground">{data.name}</p>
          <p className="text-muted-foreground">
            {metric === 'count'
              ? `${data.value} deal${data.value !== 1 ? 's' : ''}`
              : formatCurrencyValue(data.value)
            }
          </p>
        </div>
      );
    }
    return null;
  };

  const renderCustomLabel = ({ percent }: any) => {
    return `${(percent * 100).toFixed(0)}%`;
  };

  const chartSections: { metric: 'count' | 'value' | 'fee'; title: string }[] = [
    { metric: 'count', title: 'Deal Count by Stage' },
    { metric: 'value', title: 'Deal Size by Stage' },
    { metric: 'fee', title: 'Closing Fee by Stage' },
  ];

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statItems.map((stat) => (
          <Card 
            key={stat.label}
            className={stat.clickable ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}
            onClick={() => stat.clickable && stat.clickType && handleCardClick(stat.clickType)}
          >
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Active Deals by Stage</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {chartSections.map(({ metric, title }) => {
              const data = getChartDataForMetric(metric);
              return (
                <div key={metric}>
                  <p className="text-sm font-medium text-muted-foreground mb-1 text-center">{title}</p>
                  <div className="h-[280px] w-full">
                    {data.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={renderCustomLabel}
                            outerRadius={70}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {data.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip content={<CustomTooltipForMetric metric={metric} />} />
                          <Legend wrapperStyle={{ fontSize: '11px' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        No data available
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
