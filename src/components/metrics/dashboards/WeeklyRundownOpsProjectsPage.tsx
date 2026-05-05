import { RefreshCw, AlertTriangle } from 'lucide-react';
import { useOperationalData } from '@/hooks/useDailyBriefingData';
import { OperationalDashboard } from '@/components/dashboard/operational/OperationalDashboard';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useTeamOpsAnalytics } from '@/hooks/useTeamOpsAnalytics';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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
 * Reuses the SAME OperationalDashboard component that powers the Daily
 * Briefing modal's "Operational" tab — same Asana data source (the
 * `briefing-operational` edge function via `useOperationalData`), same
 * KPI cards, charts, and section ordering.
 *
 * Team scope: the briefing modal passes `targetAssigneeName` to filter
 * Asana tasks down to a single user (e.g., "Niki Heikali" or
 * jturner-only views). This page intentionally calls
 * `useOperationalData(true)` with NO assignee, so the edge function
 * returns the entire team/company portfolio — overdue, due today,
 * upcoming, and recently completed across all assignees.
 */
export function WeeklyRundownOpsProjectsPage() {
  const { data, isLoading, error, refetch } = useOperationalData(true);
  const { data: team, isLoading: teamLoading } = useTeamOpsAnalytics();
  const navigate = useNavigate();

  return (
    <div className="px-4 py-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Ops & Projects</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Team-wide Asana portfolio · same layout as the Daily Briefing's Operational tab
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

      {/* Capacity Alert */}
      {team?.capacityAlert && (
        <div className={cn(GLASS_CARD, 'flex items-start gap-2 px-4 py-3 mb-4 border border-amber-400/30')}>
          <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-foreground">{team.capacityAlert}</p>
        </div>
      )}

      {/* Team Task Completion */}
      <div className={cn(GLASS_CARD, 'p-4 mb-4')}>
        <h3 className="text-xs font-semibold text-foreground mb-3">Team Task Completion Rate — This Week</h3>
        {teamLoading || !team ? (
          <div className="text-xs text-muted-foreground/60 py-4">Loading…</div>
        ) : (
          <div className="space-y-2.5">
            {team.members.map(m => {
              const pct = Math.round(m.rate * 100);
              const barWidth = Math.max(2, Math.min(100, pct));
              const color = rateColor(m.rate);
              return (
                <div key={m.name} className="flex items-center gap-3 text-xs">
                  <div className="w-24 truncate text-muted-foreground">{m.name}</div>
                  <div className="flex-1 h-3 rounded bg-white/[0.04] overflow-hidden">
                    <div className="h-full rounded transition-all" style={{ width: `${barWidth}%`, backgroundColor: color, opacity: 0.85 }} />
                  </div>
                  <div className="w-32 text-right tabular-nums text-muted-foreground">
                    {m.completed}/{m.assigned}
                    <span className="ml-2 font-semibold" style={{ color }}>{m.assigned > 0 ? `${pct}%` : '—'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Overdue Tasks by Deal */}
      <div className={cn(GLASS_CARD, 'p-4 mb-4')}>
        <h3 className="text-xs font-semibold text-foreground mb-3">Deals with Overdue Tasks</h3>
        {teamLoading || !team ? (
          <div className="text-xs text-muted-foreground/60 py-4">Loading…</div>
        ) : team.overdueByDeal.length === 0 ? (
          <div className="text-xs text-muted-foreground/60 py-4">No overdue tasks across active deals 🎉</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] uppercase tracking-wider h-8">Deal</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider h-8 text-right"># Overdue</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider h-8 text-right">Most Overdue</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider h-8">Assigned To</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {team.overdueByDeal.map(row => (
                <TableRow key={row.dealId} className="cursor-pointer" onClick={() => navigate(`/deals/${row.dealId}`)}>
                  <TableCell className="py-2 text-xs font-medium">{row.dealName}</TableCell>
                  <TableCell className="py-2 text-xs text-right tabular-nums">{row.overdueCount}</TableCell>
                  <TableCell className="py-2 text-xs text-right tabular-nums">{row.mostOverdueDays}d</TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground">{row.assignees.join(', ') || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Upcoming Milestones */}
      <div className={cn(GLASS_CARD, 'p-4 mb-6')}>
        <h3 className="text-xs font-semibold text-foreground mb-3">Upcoming Milestones</h3>
        {teamLoading || !team ? (
          <div className="text-xs text-muted-foreground/60 py-4">Loading…</div>
        ) : team.upcomingMilestones.length === 0 ? (
          <div className="text-xs text-muted-foreground/60 py-4">No milestones in the next 30 days.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] uppercase tracking-wider h-8">Milestone</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider h-8">Deal</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider h-8">Due</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider h-8">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {team.upcomingMilestones.slice(0, 50).map(m => (
                <TableRow key={m.id} className="cursor-pointer" onClick={() => navigate(`/deals/${m.dealId}`)}>
                  <TableCell className="py-2 text-xs">{m.title}</TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground">{m.dealName}</TableCell>
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
    </div>
  );
}
