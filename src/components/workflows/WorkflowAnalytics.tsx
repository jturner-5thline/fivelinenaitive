import { useMemo } from 'react';
import { format, subDays, startOfDay, parseISO, differenceInSeconds } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { Activity, Clock, CheckCircle2, XCircle, AlertCircle, Zap, TrendingUp, Timer } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { WorkflowRun } from '@/hooks/useWorkflowRuns';
import type { Workflow } from '@/hooks/useWorkflows';

interface WorkflowAnalyticsProps {
  runs: WorkflowRun[];
  workflows: Workflow[];
}

export function WorkflowAnalytics({ runs, workflows }: WorkflowAnalyticsProps) {
  // Calculate stats
  const stats = useMemo(() => {
    const total = runs.length;
    const completed = runs.filter(r => r.status === 'completed').length;
    const partial = runs.filter(r => r.status === 'partial').length;
    const failed = runs.filter(r => r.status === 'failed').length;
    const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Calculate average execution time
    const completedRuns = runs.filter(r => r.completed_at);
    let avgExecutionTime = 0;
    if (completedRuns.length > 0) {
      const totalTime = completedRuns.reduce((acc, run) => {
        const start = parseISO(run.started_at);
        const end = parseISO(run.completed_at!);
        return acc + differenceInSeconds(end, start);
      }, 0);
      avgExecutionTime = Math.round(totalTime / completedRuns.length);
    }

    return { total, completed, partial, failed, successRate, avgExecutionTime };
  }, [runs]);

  // Runs by trigger type
  const triggerTypeData = useMemo(() => {
    const triggerCounts: Record<string, number> = {};
    
    runs.forEach(run => {
      const workflow = workflows.find(w => w.id === run.workflow_id);
      const triggerType = workflow?.trigger_type || 'unknown';
      triggerCounts[triggerType] = (triggerCounts[triggerType] || 0) + 1;
    });

    const TRIGGER_LABELS: Record<string, string> = {
      deal_stage_change: 'Deal Stage',
      lender_stage_change: 'Lender Stage',
      new_deal: 'New Deal',
      deal_closed: 'Deal Closed',
      scheduled: 'Scheduled',
    };

    return Object.entries(triggerCounts).map(([type, count]) => ({
      name: TRIGGER_LABELS[type] || type,
      value: count,
    }));
  }, [runs, workflows]);

  // Daily runs for the last 14 days
  const dailyRunsData = useMemo(() => {
    const days = 14;
    const data = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = startOfDay(subDays(new Date(), i));
      const dateStr = format(date, 'yyyy-MM-dd');
      const dayRuns = runs.filter(run => {
        const runDate = format(startOfDay(parseISO(run.started_at)), 'yyyy-MM-dd');
        return runDate === dateStr;
      });

      data.push({
        date: format(date, 'MMM d'),
        successful: dayRuns.filter(r => r.status === 'completed').length,
        partial: dayRuns.filter(r => r.status === 'partial').length,
        failed: dayRuns.filter(r => r.status === 'failed').length,
      });
    }

    return data;
  }, [runs]);

  // Top workflows by execution count
  const topWorkflows = useMemo(() => {
    const workflowCounts: Record<string, { name: string; count: number; successCount: number }> = {};

    runs.forEach(run => {
      const wfId = run.workflow_id;
      if (!workflowCounts[wfId]) {
        workflowCounts[wfId] = {
          name: run.workflow_name || 'Unknown',
          count: 0,
          successCount: 0,
        };
      }
      workflowCounts[wfId].count++;
      if (run.status === 'completed') {
        workflowCounts[wfId].successCount++;
      }
    });

    return Object.values(workflowCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [runs]);

  // Action type distribution
  const actionTypeData = useMemo(() => {
    const actionCounts: Record<string, number> = {};

    runs.forEach(run => {
      if (run.results) {
        run.results.forEach(result => {
          actionCounts[result.type] = (actionCounts[result.type] || 0) + 1;
        });
      }
    });

    const ACTION_LABELS: Record<string, string> = {
      send_notification: 'Notification',
      send_email: 'Email',
      webhook: 'Webhook',
      update_field: 'Update Field',
      trigger_workflow: 'Chain Workflow',
    };

    return Object.entries(actionCounts).map(([type, count]) => ({
      name: ACTION_LABELS[type] || type,
      value: count,
    }));
  }, [runs]);

  const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

  const chartConfig = {
    successful: { label: 'Successful', color: 'hsl(var(--chart-2))' },
    partial: { label: 'Partial', color: 'hsl(var(--chart-4))' },
    failed: { label: 'Failed', color: 'hsl(var(--destructive))' },
  };

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Activity className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total Runs</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{stats.successRate}%</p>
              <p className="text-xs text-muted-foreground">Success Rate</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{stats.completed}</p>
              <p className="text-xs text-muted-foreground">Successful</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-500/10 rounded-lg">
              <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{stats.partial}</p>
              <p className="text-xs text-muted-foreground">Partial</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-destructive/10 rounded-lg">
              <XCircle className="h-4 w-4 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{stats.failed}</p>
              <p className="text-xs text-muted-foreground">Failed</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Timer className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{stats.avgExecutionTime}s</p>
              <p className="text-xs text-muted-foreground">Avg Duration</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Daily Runs Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Runs Over Time</CardTitle>
            <CardDescription>Last 14 days</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[200px] w-full">
              <BarChart data={dailyRunsData}>
                <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10 }} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="successful" stackId="a" fill="hsl(var(--chart-2))" radius={[0, 0, 0, 0]} />
                <Bar dataKey="partial" stackId="a" fill="hsl(var(--chart-4))" radius={[0, 0, 0, 0]} />
                <Bar dataKey="failed" stackId="a" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Trigger Type Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Runs by Trigger Type</CardTitle>
            <CardDescription>Distribution of workflow triggers</CardDescription>
          </CardHeader>
          <CardContent>
            {triggerTypeData.length === 0 ? (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
                No data available
              </div>
            ) : (
              <div className="h-[200px] flex items-center">
                <ResponsiveContainer width="50%" height="100%">
                  <PieChart>
                    <Pie
                      data={triggerTypeData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {triggerTypeData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {triggerTypeData.map((item, index) => (
                    <div key={item.name} className="flex items-center gap-2 text-sm">
                      <div
                        className="w-3 h-3 rounded-sm"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span className="flex-1 truncate">{item.name}</span>
                      <span className="text-muted-foreground">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Top Workflows */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Most Active Workflows
            </CardTitle>
            <CardDescription>Top 5 workflows by execution count</CardDescription>
          </CardHeader>
          <CardContent>
            {topWorkflows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No workflow data yet</p>
            ) : (
              <div className="space-y-3">
                {topWorkflows.map((wf, index) => {
                  const successRate = wf.count > 0 ? Math.round((wf.successCount / wf.count) * 100) : 0;
                  return (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge variant="outline" className="text-xs shrink-0">
                          #{index + 1}
                        </Badge>
                        <span className="font-medium truncate">{wf.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">{wf.count} runs</span>
                        <Badge
                          variant={successRate >= 80 ? 'default' : successRate >= 50 ? 'secondary' : 'destructive'}
                          className="text-xs"
                        >
                          {successRate}%
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Action Types */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Action Types Executed</CardTitle>
            <CardDescription>Distribution of actions across all runs</CardDescription>
          </CardHeader>
          <CardContent>
            {actionTypeData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No action data yet</p>
            ) : (
              <div className="space-y-3">
                {actionTypeData.map((action, index) => {
                  const maxValue = Math.max(...actionTypeData.map(a => a.value));
                  const percentage = maxValue > 0 ? (action.value / maxValue) * 100 : 0;
                  return (
                    <div key={action.name} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span>{action.name}</span>
                        <span className="text-muted-foreground">{action.value}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${percentage}%`,
                            backgroundColor: COLORS[index % COLORS.length],
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
