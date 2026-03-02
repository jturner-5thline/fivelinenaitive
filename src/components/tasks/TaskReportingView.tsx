import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { type Task } from '@/hooks/useTasks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2, Clock, AlertTriangle, TrendingUp, BarChart3, Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { isPast, isToday, differenceInDays, format, startOfWeek, endOfWeek, eachDayOfInterval, subDays } from 'date-fns';

interface TaskReportingViewProps {
  tasks: Task[];
}

export function TaskReportingView({ tasks }: TaskReportingViewProps) {
  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'complete').length;
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    const blocked = tasks.filter(t => t.status === 'blocked').length;
    const notStarted = tasks.filter(t => t.status === 'not_started').length;

    const overdue = tasks.filter(t =>
      t.due_date && t.status !== 'complete' && isPast(new Date(t.due_date + 'T23:59:59')) && !isToday(new Date(t.due_date + 'T00:00:00'))
    );

    const dueToday = tasks.filter(t =>
      t.due_date && t.status !== 'complete' && isToday(new Date(t.due_date + 'T00:00:00'))
    );

    const dueSoon = tasks.filter(t => {
      if (!t.due_date || t.status === 'complete') return false;
      const d = new Date(t.due_date + 'T00:00:00');
      const diff = differenceInDays(d, new Date());
      return diff > 0 && diff <= 7;
    });

    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Priority breakdown
    const byPriority = {
      urgent: tasks.filter(t => t.priority === 'urgent' && t.status !== 'complete').length,
      high: tasks.filter(t => t.priority === 'high' && t.status !== 'complete').length,
      medium: tasks.filter(t => t.priority === 'medium' && t.status !== 'complete').length,
      low: tasks.filter(t => t.priority === 'low' && t.status !== 'complete').length,
    };

    // Last 7 days completion trend
    const last7Days = eachDayOfInterval({
      start: subDays(new Date(), 6),
      end: new Date(),
    });
    const completionTrend = last7Days.map(day => ({
      day: format(day, 'EEE'),
      date: format(day, 'MMM d'),
      completed: tasks.filter(t =>
        t.completed_at && format(new Date(t.completed_at), 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd')
      ).length,
    }));

    // Deal breakdown
    const dealMap = new Map<string | null, { dealName: string; dealId: string | null; total: number; open: number; overdue: number; completed: number }>();
    tasks.forEach(t => {
      const dId = t.deal_id || null;
      const dName = t.deal?.company || '— No Deal';
      if (!dealMap.has(dId)) dealMap.set(dId, { dealName: dName, dealId: dId, total: 0, open: 0, overdue: 0, completed: 0 });
      const row = dealMap.get(dId)!;
      row.total++;
      if (t.status === 'complete') row.completed++;
      else {
        row.open++;
        if (t.due_date && isPast(new Date(t.due_date + 'T23:59:59')) && !isToday(new Date(t.due_date + 'T00:00:00'))) {
          row.overdue++;
        }
      }
    });
    const dealBreakdown = Array.from(dealMap.values()).sort((a, b) => b.open - a.open);

    return {
      total, completed, inProgress, blocked, notStarted,
      overdue, dueToday, dueSoon, completionRate, byPriority, completionTrend, dealBreakdown,
    };
  }, [tasks]);

  return (
    <div className="p-6 space-y-6 overflow-auto">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-muted-foreground">Total Tasks</span>
            </div>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span className="text-xs font-medium text-muted-foreground">Completed</span>
            </div>
            <p className="text-2xl font-bold">{stats.completed}</p>
            <p className="text-[10px] text-muted-foreground">{stats.completionRate}% completion rate</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="text-xs font-medium text-muted-foreground">Overdue</span>
            </div>
            <p className="text-2xl font-bold text-destructive">{stats.overdue.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-amber-500" />
              <span className="text-xs font-medium text-muted-foreground">Due Today</span>
            </div>
            <p className="text-2xl font-bold">{stats.dueToday.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Completion Progress */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Completion Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={stats.completionRate} className="h-2" />
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-muted-foreground/20" />
                <span className="text-xs text-muted-foreground">Not Started ({stats.notStarted})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-primary" />
                <span className="text-xs text-muted-foreground">In Progress ({stats.inProgress})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-destructive" />
                <span className="text-xs text-muted-foreground">Blocked ({stats.blocked})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-xs text-muted-foreground">Complete ({stats.completed})</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Priority Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Open by Priority</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(stats.byPriority).map(([key, count]) => (
              <div key={key} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cn(
                    'text-[10px] h-5',
                    key === 'urgent' && 'bg-destructive/10 text-destructive border-destructive/20',
                    key === 'high' && 'bg-orange-500/10 text-orange-600 border-orange-500/20',
                    key === 'medium' && 'bg-primary/10 text-primary border-primary/20',
                    key === 'low' && 'bg-muted text-muted-foreground border-border',
                  )}>
                    {key.charAt(0).toUpperCase() + key.slice(1)}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 bg-muted rounded-full w-[100px]">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        key === 'urgent' && 'bg-destructive',
                        key === 'high' && 'bg-orange-500',
                        key === 'medium' && 'bg-primary',
                        key === 'low' && 'bg-muted-foreground/40',
                      )}
                      style={{ width: `${stats.total > 0 ? (count / stats.total) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium w-6 text-right">{count}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* 7-Day Trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" />
              7-Day Completion Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-[80px]">
              {stats.completionTrend.map((d, i) => {
                const maxVal = Math.max(...stats.completionTrend.map(x => x.completed), 1);
                const height = (d.completed / maxVal) * 100;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[9px] font-medium">{d.completed || ''}</span>
                    <div
                      className={cn(
                        'w-full rounded-t transition-all',
                        d.completed > 0 ? 'bg-emerald-500' : 'bg-muted',
                      )}
                      style={{ height: `${Math.max(height, 4)}%` }}
                    />
                    <span className="text-[9px] text-muted-foreground">{d.day}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Overdue Tasks */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
              Overdue Tasks ({stats.overdue.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.overdue.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">🎉 No overdue tasks!</p>
            ) : (
              <div className="space-y-1.5 max-h-[150px] overflow-auto">
                {stats.overdue.map(task => (
                  <div key={task.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate">{task.title}</span>
                    <span className="text-destructive shrink-0">
                      {differenceInDays(new Date(), new Date(task.due_date! + 'T00:00:00'))}d overdue
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tasks by Deal */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-1.5">
            Tasks by Deal
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-3 py-2 font-medium">Deal Name</th>
                  <th className="text-center px-3 py-2 font-medium">Total</th>
                  <th className="text-center px-3 py-2 font-medium">Open</th>
                  <th className="text-center px-3 py-2 font-medium">Overdue</th>
                  <th className="text-center px-3 py-2 font-medium">Completed</th>
                </tr>
              </thead>
              <tbody>
                {stats.dealBreakdown.map(row => (
                  <tr key={row.dealId || 'no-deal'} className="border-b last:border-b-0 hover:bg-muted/20">
                    <td className="px-3 py-2">
                      {row.dealId ? (
                        <Link to={`/deal/${row.dealId}`} className="text-primary hover:underline">
                          {row.dealName}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">— No Deal</span>
                      )}
                    </td>
                    <td className="text-center px-3 py-2">{row.total}</td>
                    <td className="text-center px-3 py-2">{row.open}</td>
                    <td className="text-center px-3 py-2">
                      {row.overdue > 0 ? (
                        <span className="text-destructive font-medium">{row.overdue}</span>
                      ) : '0'}
                    </td>
                    <td className="text-center px-3 py-2">{row.completed}</td>
                  </tr>
                ))}
                {stats.dealBreakdown.length === 0 && (
                  <tr><td colSpan={5} className="text-center text-muted-foreground py-4">No tasks with deals</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
