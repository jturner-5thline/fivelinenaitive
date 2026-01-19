import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useHubSpotAnalyticsSummary, useHubSpotDeals, useHubSpotPipelines } from "@/hooks/useHubSpot";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
  AreaChart,
  Area
} from "recharts";
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  Building2, 
  DollarSign, 
  Target,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Ticket
} from "lucide-react";
import { useMemo } from "react";

const COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export function HubSpotAnalyticsDashboard() {
  const { data: analyticsData, isLoading: analyticsLoading } = useHubSpotAnalyticsSummary();
  const { data: dealsData, isLoading: dealsLoading } = useHubSpotDeals();
  const { data: pipelinesData } = useHubSpotPipelines();

  // Calculate pipeline stage distribution
  const pipelineStageData = useMemo(() => {
    if (!dealsData?.results || !pipelinesData?.results) return [];
    
    const stageCounts: Record<string, { name: string; value: number; amount: number }> = {};
    
    dealsData.results.forEach((deal) => {
      const stageId = deal.properties.dealstage;
      if (!stageId) return;
      
      // Find stage label from pipelines
      let stageLabel = stageId;
      for (const pipeline of pipelinesData.results) {
        const stage = pipeline.stages.find(s => s.id === stageId);
        if (stage) {
          stageLabel = stage.label;
          break;
        }
      }
      
      if (!stageCounts[stageId]) {
        stageCounts[stageId] = { name: stageLabel, value: 0, amount: 0 };
      }
      stageCounts[stageId].value++;
      stageCounts[stageId].amount += parseFloat(deal.properties.amount || '0');
    });
    
    return Object.values(stageCounts);
  }, [dealsData, pipelinesData]);

  // Calculate deal value distribution
  const dealValueDistribution = useMemo(() => {
    if (!dealsData?.results) return [];
    
    const ranges = [
      { name: '$0-10K', min: 0, max: 10000, value: 0 },
      { name: '$10K-50K', min: 10000, max: 50000, value: 0 },
      { name: '$50K-100K', min: 50000, max: 100000, value: 0 },
      { name: '$100K-500K', min: 100000, max: 500000, value: 0 },
      { name: '$500K+', min: 500000, max: Infinity, value: 0 },
    ];
    
    dealsData.results.forEach((deal) => {
      const amount = parseFloat(deal.properties.amount || '0');
      const range = ranges.find(r => amount >= r.min && amount < r.max);
      if (range) range.value++;
    });
    
    return ranges;
  }, [dealsData]);

  // Monthly deal creation trend (last 6 months simulation based on createdate)
  const monthlyTrend = useMemo(() => {
    if (!dealsData?.results) return [];
    
    const months: Record<string, { month: string; deals: number; value: number }> = {};
    const now = new Date();
    
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = date.toISOString().slice(0, 7);
      months[key] = {
        month: date.toLocaleDateString('en-US', { month: 'short' }),
        deals: 0,
        value: 0,
      };
    }
    
    dealsData.results.forEach((deal) => {
      const createDate = deal.properties.createdate;
      if (!createDate) return;
      const key = createDate.slice(0, 7);
      if (months[key]) {
        months[key].deals++;
        months[key].value += parseFloat(deal.properties.amount || '0');
      }
    });
    
    return Object.values(months);
  }, [dealsData]);

  // Win rate calculation
  const winRate = useMemo(() => {
    if (!dealsData?.results) return { rate: 0, won: 0, lost: 0 };
    
    const closed = dealsData.results.filter(d => d.properties.hs_is_closed === 'true');
    const won = closed.filter(d => d.properties.hs_is_closed_won === 'true').length;
    const lost = closed.length - won;
    
    return {
      rate: closed.length > 0 ? Math.round((won / closed.length) * 100) : 0,
      won,
      lost,
    };
  }, [dealsData]);

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };

  if (analyticsLoading || dealsLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  const summary = analyticsData?.summary;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Contacts</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalContacts || 0}</div>
            <p className="text-xs text-muted-foreground">
              In your HubSpot CRM
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Deals</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.openDeals || 0}</div>
            <p className="text-xs text-muted-foreground">
              {summary?.closedWonDeals || 0} closed won
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pipeline Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(summary?.totalDealsValue || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Across all deals
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
            {winRate.rate >= 50 ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{winRate.rate}%</div>
            <p className="text-xs text-muted-foreground">
              {winRate.won} won / {winRate.lost} lost
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Secondary KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-muted/30">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Building2 className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">{summary?.totalCompanies || 0}</p>
                <p className="text-xs text-muted-foreground">Companies</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/30">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/10">
                <Users className="h-4 w-4 text-orange-500" />
              </div>
              <div>
                <p className="text-sm font-medium">{summary?.totalOwners || 0}</p>
                <p className="text-xs text-muted-foreground">Team Members</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/30">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <Clock className="h-4 w-4 text-yellow-500" />
              </div>
              <div>
                <p className="text-sm font-medium">{summary?.openTasks || 0}</p>
                <p className="text-xs text-muted-foreground">Open Tasks</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/30">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <Ticket className="h-4 w-4 text-red-500" />
              </div>
              <div>
                <p className="text-sm font-medium">{summary?.openTickets || 0}</p>
                <p className="text-xs text-muted-foreground">Open Tickets</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 1 */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Pipeline Stage Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Deal Pipeline Distribution</CardTitle>
            <CardDescription>Deals by pipeline stage</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={pipelineStageData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12 }} />
                <Tooltip 
                  formatter={(value: number, name: string) => [
                    name === 'value' ? `${value} deals` : formatCurrency(value),
                    name === 'value' ? 'Deals' : 'Value'
                  ]}
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Deal Value Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Deal Size Distribution</CardTitle>
            <CardDescription>Number of deals by value range</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={dealValueDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, value }) => value > 0 ? `${name}: ${value}` : ''}
                  labelLine={false}
                >
                  {dealValueDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number) => [`${value} deals`, 'Count']}
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monthly Deal Trend</CardTitle>
          <CardDescription>Deal creation and value over time</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={monthlyTrend}>
              <defs>
                <linearGradient id="colorDeals" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => formatCurrency(v)} />
              <Tooltip 
                formatter={(value: number, name: string) => [
                  name === 'deals' ? `${value} deals` : formatCurrency(value),
                  name === 'deals' ? 'New Deals' : 'Deal Value'
                ]}
                contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
              />
              <Legend />
              <Area 
                yAxisId="left"
                type="monotone" 
                dataKey="deals" 
                stroke="hsl(var(--primary))" 
                fillOpacity={1}
                fill="url(#colorDeals)"
                name="New Deals"
              />
              <Area 
                yAxisId="right"
                type="monotone" 
                dataKey="value" 
                stroke="hsl(var(--chart-2))" 
                fillOpacity={1}
                fill="url(#colorValue)"
                name="Deal Value"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}