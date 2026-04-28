import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Lock, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, ComposedChart, Area, PieChart, Pie, Cell, Legend } from 'recharts';
import { createGlassBarShape } from '@/components/metrics/charts/LiquidGlassBar';
import { PieGlassDefs, pieGlassFill, GlassActiveShape } from '@/components/metrics/charts/LiquidGlassPie';

const formatCurrency = (value: number) => {
  if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
};

const formatCurrencyFull = (value: number) =>
  `$${Math.round(value).toLocaleString()}`;

// ── Deals by Status (fee-weighted) ───────────────────────────────────────────
// Mirrors the Outstanding A/R pie chart styling exactly. Allocation is based
// on the share of Total Fee per status bucket. Deals with a missing/blank
// Total Fee are excluded from both numerator and denominator.
//
// Status colors are pinned to the same semantic tags shown on the Deals page:
//   On Track  → green-500
//   At Risk   → yellow-500
//   Off Track → red-500
const STATUS_BUCKETS = [
  { key: 'on-track' as const,  label: 'On Track',  color: 'hsl(142 71% 45%)' }, // tailwind green-500
  { key: 'at-risk' as const,   label: 'At Risk',   color: 'hsl(48 96% 53%)' },  // tailwind yellow-500
  { key: 'off-track' as const, label: 'Off Track', color: 'hsl(0 84% 60%)' },   // tailwind red-500
];
const STATUS_COLORS = STATUS_BUCKETS.map(b => b.color);

function useDealsByStatusFee() {
  return useQuery({
    queryKey: ['executive-dashboard', 'deals-by-status-fee'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('status, total_fee, company')
        .not('total_fee', 'is', null);
      if (error) throw error;

      // Apply the global test-deal exclusion (Test-Niki's Store, Example Deal,
      // anything starting with "test ").
      const excluded = new Set(["Test-Niki's Store", 'Example Deal']);
      const rows = (data ?? []).filter(d => {
        const name = (d.company ?? '').trim();
        if (excluded.has(name)) return false;
        if (name.toLowerCase().startsWith('test ')) return false;
        const fee = Number(d.total_fee);
        return Number.isFinite(fee) && fee > 0;
      });

      const totals = { 'on-track': 0, 'at-risk': 0, 'off-track': 0 } as Record<
        'on-track' | 'at-risk' | 'off-track',
        number
      >;
      for (const r of rows) {
        const s = r.status as keyof typeof totals;
        if (s in totals) totals[s] += Number(r.total_fee);
      }
      const total = totals['on-track'] + totals['at-risk'] + totals['off-track'];
      return { totals, total };
    },
    staleTime: 60_000,
  });
}

function DealsByStatusPieChart() {
  const { data, isLoading } = useDealsByStatusFee();

  if (isLoading) {
    return (
      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardHeader className="pb-2"><Skeleton className="h-5 w-32" /><Skeleton className="h-3 w-48 mt-1" /></CardHeader>
        <CardContent><Skeleton className="h-[220px] w-full" /></CardContent>
      </Card>
    );
  }

  const total = data?.total ?? 0;
  const totals = data?.totals ?? { 'on-track': 0, 'at-risk': 0, 'off-track': 0 };

  const pieData = STATUS_BUCKETS.map(b => ({ name: b.label, value: totals[b.key] }));
  const legendItems = STATUS_BUCKETS.map(b => ({
    label: b.label,
    value: formatCurrency(totals[b.key]),
    color: b.color,
  }));

  return (
    <Card className="bg-card/50 backdrop-blur border-border/50 hover:border-border transition-colors">
      <CardHeader className="pb-2 flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-sm font-medium text-foreground">Deals by Status</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">By total fee · current pipeline</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-foreground">{formatCurrency(total)}</p>
          <p className="text-[10px] text-muted-foreground">Total Fee</p>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height: 170 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <PieGlassDefs colors={STATUS_COLORS} />
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={65}
                innerRadius={30}
                paddingAngle={3}
                activeShape={GlassActiveShape}
              >
                {pieData.map((_, i) => (
                  <Cell key={i} fill={STATUS_COLORS[i]} fillOpacity={0.75} stroke={STATUS_COLORS[i]} strokeWidth={1} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number, name: string) => {
                  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
                  return [`${formatCurrencyFull(value)} (${pct}%)`, name];
                }}
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover) / 0.96)',
                  border: '1px solid hsl(0 0% 100% / 0.14)',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: 'hsl(0 0% 100%)',
                  boxShadow: 'var(--shadow-xl)',
                  backdropFilter: 'blur(16px)',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        {/* Below-chart legend — matches Outstanding A/R formatting */}
        <div className="mt-2 space-y-1.5">
          {legendItems.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: item.color, opacity: 0.75 }} />
              <span className="text-muted-foreground truncate flex-1" title={item.label}>{item.label}</span>
              <span className="font-medium text-foreground flex-shrink-0">{item.value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

function StatCard({ 
  title, 
  value, 
  subtitle, 
  trend,
  trendValue 
}: { 
  title: string; 
  value: string | number; 
  subtitle?: string;
  trend?: 'up' | 'down';
  trendValue?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {subtitle && <Badge variant="outline" className="w-fit text-xs">{subtitle}</Badge>}
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
        {trend && trendValue && (
          <div className={`flex items-center gap-1 text-xs mt-1 ${trend === 'up' ? 'text-success' : 'text-destructive'}`}>
            {trend === 'up' ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            <span>{trendValue}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NoDataCard({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {subtitle && <Badge variant="outline" className="w-fit text-xs">{subtitle}</Badge>}
      </CardHeader>
      <CardContent className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Lock className="h-8 w-8 mb-2 opacity-30" />
        <p className="text-sm font-medium">No Data Available</p>
      </CardContent>
    </Card>
  );
}

export function ExecutiveDashboard() {
  // Sample data for executive metrics
  const revenueByMonthData = [
    { month: 'Aug-25', revenue: 250000 },
    { month: 'Sep-25', revenue: 320000 },
    { month: 'Oct-25', revenue: 280000 },
    { month: 'Nov-25', revenue: 350000 },
    { month: 'Dec-25', revenue: 420000 },
    { month: 'Jan-26', revenue: 180000 },
  ];

  const pipelineByStageData = [
    { stage: 'Proposal', value: 15000000 },
    { stage: 'Terms Issued', value: 8000000 },
    { stage: 'Due Diligence', value: 12000000 },
    { stage: 'Agreement', value: 5000000 },
    { stage: 'Closed Won', value: 3000000 },
  ];

  const dealsByTypeData = [
    { type: 'Term Loan', value: 45, percent: 45 },
    { type: 'Revolver', value: 25, percent: 25 },
    { type: 'Equipment', value: 15, percent: 15 },
    { type: 'Real Estate', value: 10, percent: 10 },
    { type: 'Other', value: 5, percent: 5 },
  ];

  const cashFlowData = [
    { month: 'Aug-25', inflow: 300000, outflow: 250000 },
    { month: 'Sep-25', inflow: 280000, outflow: 260000 },
    { month: 'Oct-25', inflow: 350000, outflow: 280000 },
    { month: 'Nov-25', inflow: 400000, outflow: 300000 },
    { month: 'Dec-25', inflow: 320000, outflow: 310000 },
    { month: 'Jan-26', inflow: 180000, outflow: 200000 },
  ];

  const teamPerformanceData = [
    { name: 'James', closed: 5, value: 12000000 },
    { name: 'Flor', closed: 3, value: 8000000 },
    { name: 'Niki', closed: 4, value: 9500000 },
    { name: 'Paz', closed: 2, value: 4500000 },
    { name: 'Chandler', closed: 1, value: 3000000 },
  ];

  return (
    <div className="space-y-6">
      {/* Row 1: Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard 
          title="Total Pipeline Value" 
          value="$43M" 
          subtitle="Active deals"
          trend="up"
          trendValue="+12% vs last month"
        />
        <StatCard 
          title="Deals Closed (QTD)" 
          value="15" 
          subtitle="Quarter to date"
          trend="up"
          trendValue="+3 vs prior quarter"
        />
        <StatCard 
          title="Revenue (QTD)" 
          value="$1.8M" 
          subtitle="Quarter to date"
          trend="down"
          trendValue="-5% vs prior quarter"
        />
        <StatCard 
          title="Avg Deal Size" 
          value="$3.2M" 
          subtitle="Last 12 months"
        />
      </div>

      {/* Row 2: Revenue & Pipeline */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Revenue by Month</CardTitle>
            <Badge variant="outline" className="w-fit text-xs">Last 6 Months</Badge>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={revenueByMonthData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Area type="monotone" dataKey="revenue" fill="hsl(var(--primary) / 0.2)" stroke="hsl(var(--primary))" />
                  <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pipeline by Stage</CardTitle>
            <Badge variant="outline" className="w-fit text-xs">Current</Badge>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pipelineByStageData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <YAxis dataKey="stage" type="category" width={90} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="value" fill="hsl(var(--primary))" shape={createGlassBarShape({ radius: 4 })} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Deal Types & Cash Flow */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DealsByStatusPieChart />

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Cash Flow</CardTitle>
            <Badge variant="outline" className="w-fit text-xs">Last 6 Months</Badge>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cashFlowData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                  <Bar dataKey="inflow" fill="hsl(var(--success))" name="Inflow" shape={createGlassBarShape({ radius: 4 })} />
                  <Bar dataKey="outflow" fill="hsl(var(--destructive))" name="Outflow" shape={createGlassBarShape({ radius: 4 })} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Team Performance */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Team Performance</CardTitle>
          <Badge variant="outline" className="w-fit text-xs">Quarter to date</Badge>
        </CardHeader>
        <CardContent>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={teamPerformanceData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={formatCurrency} tick={{ fontSize: 10 }} />
                <Tooltip 
                  formatter={(value: number, name: string) => [
                    name === 'value' ? formatCurrency(value) : value,
                    name === 'value' ? 'Deal Value' : 'Deals Closed'
                  ]} 
                />
                <Legend />
                <Bar yAxisId="left" dataKey="closed" fill="hsl(var(--primary))" name="Deals Closed" shape={createGlassBarShape({ radius: 4 })} />
                <Bar yAxisId="right" dataKey="value" fill="hsl(var(--chart-2))" name="Deal Value" shape={createGlassBarShape({ radius: 4 })} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
