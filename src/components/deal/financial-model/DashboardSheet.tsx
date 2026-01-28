import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MonthlyData, AnnualData } from '@/hooks/useFinancialModel';
import { TrendingUp, TrendingDown, DollarSign, Users, Clock, Percent } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { cn } from '@/lib/utils';

interface DashboardSheetProps {
  monthlyData: MonthlyData[];
  annualData: AnnualData[];
  metrics: {
    totalRevenue: number;
    revenueGrowth: number;
    burnRate: number;
    runway: number;
    grossMargin: number;
    currentMRR: number;
    totalCustomers: number;
    headcount: number;
  };
}

function MetricCard({ 
  title, 
  value, 
  format, 
  icon: Icon, 
  trend,
  color = 'blue',
}: { 
  title: string; 
  value: number; 
  format: 'currency' | 'percent' | 'number' | 'months';
  icon: React.ElementType;
  trend?: 'up' | 'down';
  color?: 'blue' | 'green' | 'red' | 'amber' | 'purple';
}) {
  const formatValue = () => {
    switch (format) {
      case 'currency':
        if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
        if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
        return `$${value.toLocaleString()}`;
      case 'percent':
        return `${value.toFixed(1)}%`;
      case 'months':
        return value >= 999 ? '∞' : `${value} mo`;
      default:
        return value.toLocaleString();
    }
  };

  const colorClasses = {
    blue: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30',
    green: 'text-green-600 bg-green-100 dark:bg-green-900/30',
    red: 'text-red-600 bg-red-100 dark:bg-red-900/30',
    amber: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30',
    purple: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30',
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{title}</p>
            <p className="text-2xl font-bold mt-1">{formatValue()}</p>
          </div>
          <div className={cn('p-2 rounded-lg', colorClasses[color])}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        {trend && (
          <div className={cn(
            'flex items-center gap-1 mt-2 text-xs',
            trend === 'up' ? 'text-green-600' : 'text-red-600'
          )}>
            {trend === 'up' ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            <span>{trend === 'up' ? 'Growing' : 'Declining'}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function DashboardSheet({ monthlyData, annualData, metrics }: DashboardSheetProps) {
  // Prepare chart data (first 24 months for readability)
  const chartData = monthlyData.slice(0, 24).map(m => ({
    name: m.label,
    revenue: m.revenue,
    expenses: m.totalOpex + m.cogs,
    cashBalance: m.cashBalance,
    customers: m.totalCustomers,
  }));

  const quarterlyData = annualData.flatMap((year, yi) => 
    [1, 2, 3, 4].map((q, qi) => {
      const startMonth = qi * 3;
      const yearMonths = monthlyData.filter(m => m.year === year.year);
      const quarterMonths = yearMonths.slice(startMonth, startMonth + 3);
      const quarterRevenue = quarterMonths.reduce((sum, m) => sum + m.revenue, 0);
      return {
        name: `Q${q} ${year.year}`,
        revenue: quarterRevenue,
      };
    })
  ).slice(0, 12);

  return (
    <div className="p-4 space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="Annual Revenue"
          value={metrics.totalRevenue}
          format="currency"
          icon={DollarSign}
          color="green"
          trend="up"
        />
        <MetricCard
          title="Revenue Growth"
          value={metrics.revenueGrowth}
          format="percent"
          icon={TrendingUp}
          color="blue"
        />
        <MetricCard
          title="Monthly Burn Rate"
          value={metrics.burnRate}
          format="currency"
          icon={TrendingDown}
          color="red"
        />
        <MetricCard
          title="Runway"
          value={metrics.runway}
          format="months"
          icon={Clock}
          color="amber"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="Gross Margin"
          value={metrics.grossMargin}
          format="percent"
          icon={Percent}
          color="green"
        />
        <MetricCard
          title="Current MRR"
          value={metrics.currentMRR}
          format="currency"
          icon={DollarSign}
          color="blue"
        />
        <MetricCard
          title="Total Customers"
          value={metrics.totalCustomers}
          format="number"
          icon={Users}
          color="purple"
        />
        <MetricCard
          title="Headcount"
          value={metrics.headcount}
          format="number"
          icon={Users}
          color="amber"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue vs Expenses */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Revenue vs Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={2} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}K`} />
                <Tooltip 
                  formatter={(value: number) => `$${value.toLocaleString()}`}
                  contentStyle={{ fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="revenue" stroke="#22c55e" strokeWidth={2} dot={false} name="Revenue" />
                <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} dot={false} name="Expenses" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Quarterly Revenue */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Quarterly Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={quarterlyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}K`} />
                <Tooltip 
                  formatter={(value: number) => `$${value.toLocaleString()}`}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Cash Balance */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Cash Balance Runway</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={2} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v/1000000).toFixed(1)}M`} />
                <Tooltip 
                  formatter={(value: number) => `$${value.toLocaleString()}`}
                  contentStyle={{ fontSize: 12 }}
                />
                <Area type="monotone" dataKey="cashBalance" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.3} name="Cash" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Customer Growth */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Customer Growth</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={2} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="customers" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.3} name="Customers" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
