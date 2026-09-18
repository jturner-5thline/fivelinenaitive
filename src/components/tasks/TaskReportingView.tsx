import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { type Task } from '@/hooks/useTasks';
import {
  CheckCircle2, Clock, AlertTriangle, TrendingUp, BarChart3, Users,
} from 'lucide-react';
import { isPast, isToday, differenceInDays, format, eachDayOfInterval, subDays } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell, PieChart, Pie, Tooltip } from 'recharts';

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

    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Last 7 days completion trend
    const last7Days = eachDayOfInterval({ start: subDays(new Date(), 6), end: new Date() });
    const completionTrend = last7Days.map(day => ({
      day: format(day, 'EEE'),
      date: format(day, 'MMM d'),
      completed: tasks.filter(t =>
        t.completed_at && format(new Date(t.completed_at), 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd')
      ).length,
    }));

    // Avg days to complete — Urgent vs Not urgent.
    const buckets: { key: 'urgent' | 'not_urgent'; label: string }[] = [
      { key: 'urgent', label: 'Urgent' },
      { key: 'not_urgent', label: 'Not urgent' },
    ];
    const avgByPriority = buckets.map(b => {
      const matches = tasks.filter(t => {
        const isUrgent = t.priority === 'urgent';
        const wanted = b.key === 'urgent' ? isUrgent : !isUrgent;
        return wanted && t.status === 'complete' && t.completed_at && t.created_at;
      });
      const avgDays = matches.length > 0
        ? matches.reduce((sum, t) => sum + differenceInDays(new Date(t.completed_at!), new Date(t.created_at)), 0) / matches.length
        : 0;
      return { priority: b.label, avgDays: Math.round(avgDays * 10) / 10, count: matches.length };
    });

    // Overdue rate by owner
    const ownerMap = new Map<string, { name: string; total: number; overdue: number }>();
    tasks.forEach(t => {
      const name = t.assignee_profile?.display_name || 'Unassigned';
      const id = t.assigned_to || 'unassigned';
      if (!ownerMap.has(id)) ownerMap.set(id, { name, total: 0, overdue: 0 });
      const row = ownerMap.get(id)!;
      row.total++;
      if (t.due_date && t.status !== 'complete' && isPast(new Date(t.due_date + 'T23:59:59')) && !isToday(new Date(t.due_date + 'T00:00:00'))) {
        row.overdue++;
      }
    });
    const overdueByOwner = Array.from(ownerMap.values())
      .map(o => ({ ...o, rate: o.total > 0 ? Math.round((o.overdue / o.total) * 100) : 0 }))
      .sort((a, b) => b.rate - a.rate);

    return { total, completed, inProgress, blocked, notStarted, overdue, completionRate, completionTrend, avgByPriority, overdueByOwner };
  }, [tasks]);

  const PRIORITY_COLORS: Record<string, string> = { Urgent: '#e57373', 'Not urgent': '#6b7280' };

  return (
    <div className="p-6 space-y-6 overflow-auto">
      {/* Widget 1: Tasks Completed This Week */}
      <div className="rounded-xl p-5" style={{ backgroundColor: '#13181f', border: '1px solid #2a2f3e' }}>
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-4 w-4" style={{ color: '#3b7eff' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'white' }}>Tasks Completed This Week</h3>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={stats.completionTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3e" />
            <XAxis dataKey="day" tick={{ fill: '#8b92a5', fontSize: 11 }} axisLine={{ stroke: '#2a2f3e' }} />
            <YAxis tick={{ fill: '#8b92a5', fontSize: 11 }} axisLine={{ stroke: '#2a2f3e' }} allowDecimals={false} />
            <Tooltip contentStyle={{ backgroundColor: '#1a1f2e', border: '1px solid #2a2f3e', borderRadius: 8, color: 'white', fontSize: 12 }} />
            <Bar dataKey="completed" fill="#3b7eff" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Widget 2: Avg Days to Complete by Priority */}
        <div className="rounded-xl p-5" style={{ backgroundColor: '#13181f', border: '1px solid #2a2f3e' }}>
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4" style={{ color: '#3b7eff' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'white' }}>Avg Days to Complete by Priority</h3>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={stats.avgByPriority} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3e" />
              <XAxis type="number" tick={{ fill: '#8b92a5', fontSize: 11 }} axisLine={{ stroke: '#2a2f3e' }} />
              <YAxis dataKey="priority" type="category" tick={{ fill: '#8b92a5', fontSize: 11 }} axisLine={{ stroke: '#2a2f3e' }} width={60} />
              <Tooltip contentStyle={{ backgroundColor: '#1a1f2e', border: '1px solid #2a2f3e', borderRadius: 8, color: 'white', fontSize: 12 }} />
              <Bar dataKey="avgDays" radius={[0, 4, 4, 0]}>
                {stats.avgByPriority.map((entry, i) => (
                  <Cell key={i} fill={PRIORITY_COLORS[entry.priority] || '#6b7280'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Widget 3: Overdue Rate by Owner */}
        <div className="rounded-xl p-5" style={{ backgroundColor: '#13181f', border: '1px solid #2a2f3e' }}>
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-4 w-4" style={{ color: '#ff4d4d' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'white' }}>Overdue Rate by Owner</h3>
          </div>
          <div className="space-y-2 max-h-[200px] overflow-auto">
            <div className="grid grid-cols-[1fr_60px_60px_60px] gap-2 text-[10px] font-medium uppercase tracking-wide" style={{ color: '#8b92a5' }}>
              <span>Owner</span>
              <span className="text-center">Total</span>
              <span className="text-center">Overdue</span>
              <span className="text-center">Rate</span>
            </div>
            {stats.overdueByOwner.map((row, i) => (
              <div key={i} className="grid grid-cols-[1fr_60px_60px_60px] gap-2 text-xs items-center py-1" style={{ borderBottom: '1px solid #2a2f3e' }}>
                <span className="truncate" style={{ color: 'white' }}>{row.name}</span>
                <span className="text-center" style={{ color: '#8b92a5' }}>{row.total}</span>
                <span className="text-center font-medium" style={{ color: row.overdue > 0 ? '#ff4d4d' : '#8b92a5' }}>{row.overdue}</span>
                <span className="text-center font-medium" style={{ color: row.rate > 20 ? '#ff4d4d' : row.rate > 0 ? '#f59e0b' : '#22c55e' }}>{row.rate}%</span>
              </div>
            ))}
            {stats.overdueByOwner.length === 0 && (
              <p className="text-xs text-center py-4" style={{ color: '#8b92a5' }}>No data</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
