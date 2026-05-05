import { RefreshCw, AlertTriangle, AlertCircle, ArrowUp, ArrowDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useOperationalData } from '@/hooks/useDailyBriefingData';
import { OperationalDashboard } from '@/components/dashboard/operational/OperationalDashboard';
import { Button } from '@/components/ui/button';
import { useAsanaOpsTeamMetrics } from '@/hooks/useAsanaOpsTeamMetrics';
import { useAsanaPortfolioMilestones } from '@/hooks/useAsanaPortfolioMilestones';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AsanaDrilldownDialog, type AsanaDrilldownItem } from '@/components/dashboard/operational/AsanaDrilldownDialog';

const GLASS_CARD = 'bg-white/[0.03] backdrop-blur-xl glass-border-soft rounded-lg';

function rateColor(rate: number): string {
  if (rate > 0.8) return 'hsl(var(--success))';
  if (rate >= 0.5) return 'hsl(45, 93%, 47%)';
  return 'hsl(var(--destructive))';
}

function statusColor(status: 'On Track' | 'At Risk' | 'Overdue'): string {
  if (status === 'Overdue') return 'hsl(var(--destructive))';
  if (status === 'At Risk') return 'hsl(45, 93%, 47%)';
  return 'hsl(var(--success))';
}

/**
 * Page 4 of the Weekly Rundown carousel: "Ops & Projects".
 *
 * 100% Asana-backed. Source: portfolio 1211488283335033 via the
 * `briefing-operational` edge function (projects/tasks/milestones/statuses)
 * and `asana-proxy → portfolio_milestones` for the upcoming-milestones table.
 *
 * No CRM (`tasks`, `wf_tasks`, `deals`, `deal_milestones`) data feeds any
 * widget on this page.
 */
export function WeeklyRundownOpsProjectsPage() {
  const { data, isLoading, error, refetch } = useOperationalData(true);
  const team = useAsanaOpsTeamMetrics(data ?? null);
  const { data: asanaMilestones, isLoading: milestonesLoading, error: milestonesError } = useAsanaPortfolioMilestones();
  const [memberDrilldown, setMemberDrilldown] = useState<{ name: string; items: AsanaDrilldownItem[] } | null>(null);
  type MilestoneSortKey = 'title' | 'projectName' | 'assignee' | 'dueDate' | 'status';
  const [milestoneSort, setMilestoneSort] = useState<{ key: MilestoneSortKey; dir: 'asc' | 'desc' }>({ key: 'dueDate', dir: 'asc' });
  const [milestoneStatusFilter, setMilestoneStatusFilter] = useState<'All' | 'On Track' | 'At Risk' | 'Overdue'>('All');

  const statusRank: Record<'On Track' | 'At Risk' | 'Overdue', number> = { Overdue: 0, 'At Risk': 1, 'On Track': 2 };
  const visibleMilestones = useMemo(() => {
    if (!asanaMilestones) return [];
    const filtered = milestoneStatusFilter === 'All'
      ? asanaMilestones
      : asanaMilestones.filter(m => m.status === milestoneStatusFilter);
    const { key, dir } = milestoneSort;
    const mult = dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let av: string | number;
      let bv: string | number;
      if (key === 'status') { av = statusRank[a.status]; bv = statusRank[b.status]; }
      else if (key === 'dueDate') { av = a.dueDate; bv = b.dueDate; }
      else { av = (a[key] || '').toString().toLowerCase(); bv = (b[key] || '').toString().toLowerCase(); }
      if (av < bv) return -1 * mult;
      if (av > bv) return 1 * mult;
      return 0;
    });
  }, [asanaMilestones, milestoneSort, milestoneStatusFilter]);

  const toggleMilestoneSort = (key: MilestoneSortKey) => {
    setMilestoneSort(prev => prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: key === 'dueDate' ? 'asc' : 'asc' });
  };

  const opsError = (error as Error | null) || (data?.error ? new Error(data.error) : null);
  const showAsanaError = !!opsError && !data;

  // Build per-member task lists for drill-down (open + recently completed Asana tasks).
  const tasksByMember = (memberName: string): AsanaDrilldownItem[] => {
    if (!data) return [];
    const all = [...(data.overdue ?? []), ...(data.today ?? []), ...(data.upcoming ?? []), ...(data.recentlyCompleted ?? [])];
    const lower = memberName.toLowerCase();
    return all.filter((t: any) => (t.assignee || '').toLowerCase().includes(lower.split(' ')[0])) as AsanaDrilldownItem[];
  };

  return (
    <div className="px-4 py-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Ops & Projects</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Live from the Asana <span className="font-medium">Projects</span> portfolio
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
          className="text-xs gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {showAsanaError && (
        <div className={cn(GLASS_CARD, 'flex items-start gap-2 px-4 py-3 mb-4 border border-destructive/30')}>
          <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-xs text-foreground">
            Could not load Asana portfolio data. Check the Asana integration.
          </p>
        </div>
      )}

      {/* Capacity Alert */}
      {team.capacityAlert && (
        <div className={cn(GLASS_CARD, 'flex items-start gap-2 px-4 py-3 mb-4 border border-amber-400/30')}>
          <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-foreground">{team.capacityAlert}</p>
        </div>
      )}

      {/* Team Task Completion (Asana) */}
      <div className={cn(GLASS_CARD, 'p-4 mb-4')}>
        <h3 className="text-xs font-semibold text-foreground mb-3">Team Task Completion Rate — This Week</h3>
        <p className="text-[10px] text-muted-foreground/60 mb-2">
          Asana tasks due or completed in the current week, per team member.
        </p>
        {isLoading && !data ? (
          <div className="text-xs text-muted-foreground/60 py-4">Loading…</div>
        ) : (
          <div className="space-y-2.5">
            {team.members.map(m => {
              const pct = Math.round(m.rate * 100);
              const barWidth = Math.max(2, Math.min(100, pct));
              const color = rateColor(m.rate);
              return (
                <button
                  key={m.name}
                  type="button"
                  onClick={() => setMemberDrilldown({ name: m.name, items: tasksByMember(m.name) })}
                  className="w-full flex items-center gap-3 text-xs hover:bg-white/[0.03] rounded px-1 py-0.5 -mx-1 transition-colors text-left"
                >
                  <div className="w-28 truncate text-muted-foreground">{m.name}</div>
                  <div className="flex-1 h-3 rounded bg-white/[0.04] overflow-hidden">
                    <div
                      className="h-full rounded transition-all"
                      style={{ width: `${barWidth}%`, backgroundColor: color, opacity: 0.85 }}
                    />
                  </div>
                  <div className="w-32 text-right tabular-nums text-muted-foreground">
                    {m.completed}/{m.assigned}
                    <span className="ml-2 font-semibold" style={{ color }}>
                      {m.assigned > 0 ? `${pct}%` : '—'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Overdue Tasks by Asana Project */}
      <div className={cn(GLASS_CARD, 'p-4 mb-4')}>
        <h3 className="text-xs font-semibold text-foreground mb-3">Projects with Overdue Tasks</h3>
        {isLoading && !data ? (
          <div className="text-xs text-muted-foreground/60 py-4">Loading…</div>
        ) : team.overdueByProject.length === 0 ? (
          <div className="text-xs text-muted-foreground/60 py-4">No overdue tasks across portfolio projects 🎉</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] uppercase tracking-wider h-8">Project</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider h-8 text-right"># Overdue</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider h-8 text-right">Most Overdue</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider h-8">Assigned To</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {team.overdueByProject.map(row => {
                const project = data?.projects?.find((p: any) => p.gid === row.projectGid);
                const url = project?.permalink_url || null;
                return (
                  <TableRow
                    key={row.projectGid}
                    className={cn(url && 'cursor-pointer')}
                    onClick={() => url && window.open(url, '_blank', 'noopener,noreferrer')}
                  >
                    <TableCell className="py-2 text-xs font-medium">{row.projectName}</TableCell>
                    <TableCell className="py-2 text-xs text-right tabular-nums">{row.overdueCount}</TableCell>
                    <TableCell className="py-2 text-xs text-right tabular-nums">{row.mostOverdueDays}d</TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground">
                      {row.assignees.join(', ') || '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Upcoming Milestones (Asana portfolio milestone tasks) */}
      <div className={cn(GLASS_CARD, 'p-4 mb-6')}>
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h3 className="text-xs font-semibold text-foreground">Upcoming Milestones</h3>
          <div className="flex items-center gap-1">
            {(['All', 'On Track', 'At Risk', 'Overdue'] as const).map(s => {
              const active = milestoneStatusFilter === s;
              const count = s === 'All'
                ? (asanaMilestones?.length ?? 0)
                : (asanaMilestones?.filter(m => m.status === s).length ?? 0);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setMilestoneStatusFilter(s)}
                  className={cn(
                    'px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider transition-colors border',
                    active
                      ? 'bg-white/10 text-foreground border-white/20'
                      : 'bg-transparent text-muted-foreground border-white/5 hover:bg-white/5'
                  )}
                >
                  {s} <span className="opacity-60 ml-0.5">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
        {milestonesLoading ? (
          <div className="text-xs text-muted-foreground/60 py-4">Loading…</div>
        ) : milestonesError ? (
          <div className="text-xs text-destructive py-4">Could not load Asana portfolio milestones.</div>
        ) : !asanaMilestones || asanaMilestones.length === 0 ? (
          <div className="text-xs text-muted-foreground/60 py-4">No upcoming milestones in the Asana portfolio.</div>
        ) : visibleMilestones.length === 0 ? (
          <div className="text-xs text-muted-foreground/60 py-4">No milestones match the selected filter.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {([
                  { key: 'title', label: 'Milestone' },
                  { key: 'projectName', label: 'Project' },
                  { key: 'assignee', label: 'Assignee' },
                  { key: 'dueDate', label: 'Due' },
                  { key: 'status', label: 'Status' },
                ] as { key: MilestoneSortKey; label: string }[]).map(col => {
                  const active = milestoneSort.key === col.key;
                  return (
                    <TableHead key={col.key} className="text-[10px] uppercase tracking-wider h-8">
                      <button
                        type="button"
                        onClick={() => toggleMilestoneSort(col.key)}
                        className={cn(
                          'inline-flex items-center gap-1 hover:text-foreground transition-colors',
                          active ? 'text-foreground' : 'text-muted-foreground'
                        )}
                      >
                        {col.label}
                        {active && (milestoneSort.dir === 'asc'
                          ? <ArrowUp className="h-3 w-3" />
                          : <ArrowDown className="h-3 w-3" />)}
                      </button>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleMilestones.slice(0, 50).map(m => (
                <TableRow
                  key={m.id}
                  className={cn(m.url && 'cursor-pointer')}
                  onClick={() => m.url && window.open(m.url, '_blank', 'noopener,noreferrer')}
                >
                  <TableCell className="py-2 text-xs">{m.title}</TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground">{m.projectName}</TableCell>
                  <TableCell className="py-2 text-xs">
                    {m.assignee ? (
                      <span className="text-foreground">{m.assignee}</span>
                    ) : (
                      <span className="italic text-muted-foreground/60">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell className="py-2 text-xs tabular-nums">{format(parseISO(m.dueDate), 'MMM d')}</TableCell>
                  <TableCell className="py-2 text-xs">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusColor(m.status) }} />
                      <span style={{ color: statusColor(m.status) }}>{m.status}</span>
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <OperationalDashboard
        data={data ?? null}
        isLoading={isLoading}
        error={error as Error | null}
        onRefetch={refetch}
      />

      {memberDrilldown && (
        <AsanaDrilldownDialog
          open={!!memberDrilldown}
          onOpenChange={(v) => !v && setMemberDrilldown(null)}
          title={`Asana tasks — ${memberDrilldown.name}`}
          subtitle="Open + recently completed tasks across the portfolio"
          items={memberDrilldown.items}
          kind="task"
        />
      )}
    </div>
  );
}
