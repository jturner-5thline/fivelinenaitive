import { useState, useEffect } from 'react';
import { Flag, Check, Clock, TrendingUp, BarChart3, AlertTriangle, ExternalLink, CheckCircle, BellOff } from 'lucide-react';
import { format, subDays, isAfter } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

interface FlagRecord {
  id: string;
  deal_id: string;
  note: string;
  user_id: string | null;
  created_at: string;
  resolved: boolean;
  resolved_at: string | null;
  deal_name: string;
}

export function FlagsHurdlesAnalytics() {
  const [flags, setFlags] = useState<FlagRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchFlags = async () => {
      const { data, error } = await supabase
        .from('deal_flag_notes' as any)
        .select('id, deal_id, note, user_id, created_at, resolved, resolved_at')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching flags:', error);
        setIsLoading(false);
        return;
      }

      // Get deal names
      const dealIds = [...new Set((data as any[]).map((f: any) => f.deal_id))];
      const { data: deals } = await supabase
        .from('deals')
        .select('id, company')
        .in('id', dealIds);

      const dealMap: Record<string, string> = {};
      deals?.forEach((d) => {
        dealMap[d.id] = d.company || 'Unknown';
      });

      setFlags(
        (data as any[]).map((f: any) => ({
          ...f,
          deal_name: dealMap[f.deal_id] || 'Unknown',
        }))
      );
      setIsLoading(false);
    };

    fetchFlags();
  }, []);

  const handleResolve = async (flagId: string) => {
    const { error } = await supabase
      .from('deal_flag_notes' as any)
      .update({ resolved: true, resolved_at: new Date().toISOString() } as any)
      .eq('id', flagId);
    if (!error) {
      setFlags(prev => prev.map(f => f.id === flagId ? { ...f, resolved: true, resolved_at: new Date().toISOString() } : f));
      toast({ title: 'Flag resolved', description: 'The hurdle has been marked as resolved.' });
    }
  };

  const handleSnooze = (flagId: string) => {
    // For now, remove from active display for this session
    setFlags(prev => prev.filter(f => f.id !== flagId));
    toast({ title: 'Snoozed', description: 'This hurdle will reappear next session.' });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="glass-module">
              <CardContent className="pt-4">
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-4 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const totalFlags = flags.length;
  const activeFlags = flags.filter((f) => !f.resolved);
  const resolvedFlags = flags.filter((f) => f.resolved);
  const resolutionRate = totalFlags > 0 ? Math.round((resolvedFlags.length / totalFlags) * 100) : 0;

  // Avg resolution time (days)
  const resolvedWithTime = resolvedFlags.filter((f) => f.resolved_at);
  const avgResolutionDays =
    resolvedWithTime.length > 0
      ? Math.round(
          resolvedWithTime.reduce((sum, f) => {
            const diff = new Date(f.resolved_at!).getTime() - new Date(f.created_at).getTime();
            return sum + diff / (1000 * 60 * 60 * 24);
          }, 0) / resolvedWithTime.length
        )
      : 0;

  // Flags by deal
  const flagsByDeal: Record<string, { name: string; total: number; active: number }> = {};
  flags.forEach((f) => {
    if (!flagsByDeal[f.deal_id]) {
      flagsByDeal[f.deal_id] = { name: f.deal_name, total: 0, active: 0 };
    }
    flagsByDeal[f.deal_id].total++;
    if (!f.resolved) flagsByDeal[f.deal_id].active++;
  });

  const dealChartData = Object.values(flagsByDeal)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
    .map((d) => ({
      name: d.name.length > 20 ? d.name.slice(0, 18) + '…' : d.name,
      Active: d.active,
      Resolved: d.total - d.active,
    }));

  // Status pie
  const statusData = [
    { name: 'Active', value: activeFlags.length },
    { name: 'Resolved', value: resolvedFlags.length },
  ];
  const PIE_COLORS = ['hsl(var(--destructive))', 'hsl(var(--primary))'];

  // Monthly trend
  const monthlyMap: Record<string, { month: string; count: number }> = {};
  flags.forEach((f) => {
    const month = format(new Date(f.created_at), 'MMM yyyy');
    if (!monthlyMap[month]) monthlyMap[month] = { month, count: 0 };
    monthlyMap[month].count++;
  });
  const monthlyTrend = Object.values(monthlyMap).reverse().slice(-6);

  // Recent active flags
  const recentActive = activeFlags.slice(0, 8);

  const tooltipStyle = {
    backgroundColor: 'hsl(var(--popover))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '8px',
    color: 'hsl(var(--popover-foreground))',
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Flag className="h-5 w-5 text-destructive" />
          Flags & Hurdles
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Analyze flagged challenges across your deal pipeline
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="glass-module">
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold">{totalFlags}</div>
            <p className="text-xs text-muted-foreground">Total Flags</p>
          </CardContent>
        </Card>
        <Card className="glass-module">
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-destructive">{activeFlags.length}</div>
            <p className="text-xs text-muted-foreground">Active</p>
          </CardContent>
        </Card>
        <Card className="glass-module">
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold">{resolutionRate}%</div>
            <p className="text-xs text-muted-foreground">Resolution Rate</p>
            <Progress value={resolutionRate} className="h-1.5 mt-2" />
          </CardContent>
        </Card>
        <Card className="glass-module">
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold">{avgResolutionDays}d</div>
            <p className="text-xs text-muted-foreground">Avg Resolution Time</p>
          </CardContent>
        </Card>
      </div>

      {/* Active Hurdles — promoted to top */}
      <Card className="glass-module">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Active Hurdles
          </CardTitle>
          <CardDescription>Unresolved flags requiring action</CardDescription>
        </CardHeader>
        <CardContent>
          {recentActive.length > 0 ? (
            <div className="space-y-2">
              {recentActive.map((flag) => (
                <div key={flag.id} className="flex items-start gap-2 p-2.5 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors group/item">
                  <Flag className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0 fill-current" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm break-words">{flag.note}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-[10px] h-4 px-1">
                        {flag.deal_name}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(flag.created_at), 'MMM d, yyyy')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover/item:opacity-100 transition-opacity">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => navigate(`/deals/${flag.deal_id}`)}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>View Deal</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-emerald-500 hover:text-emerald-600"
                          onClick={() => handleResolve(flag.id)}
                        >
                          <CheckCircle className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Resolve</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => handleSnooze(flag.id)}
                        >
                          <BellOff className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Snooze</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <Check className="h-8 w-8 text-primary mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">All flags resolved!</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Flags by Deal */}
        <Card className="glass-module">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Flags by Deal
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dealChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={dealChartData} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" allowDecimals={false} className="text-xs" />
                  <YAxis type="category" dataKey="name" width={120} className="text-xs" />
                  <RechartsTooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="Active" stackId="a" fill="hsl(var(--destructive))" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Resolved" stackId="a" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No flag data yet</p>
            )}
          </CardContent>
        </Card>

        {/* Status Breakdown */}
        <Card className="glass-module">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Status Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {totalFlags > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={4}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {statusData.map((_, idx) => (
                      <Cell key={idx} fill={PIE_COLORS[idx]} />
                    ))}
                  </Pie>
                  <Legend />
                  <RechartsTooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No flag data yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Monthly Trend */}
      <Card className="glass-module">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Monthly Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          {monthlyTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis allowDecimals={false} className="text-xs" />
                <RechartsTooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Flags Created" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No trend data yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
