import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronRight, MoreHorizontal, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import {
  Bar, BarChart, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, PieChart, Pie, Legend,
} from 'recharts';
import { createGlassBarShape } from '@/components/metrics/charts/LiquidGlassBar';
import { PieGlassDefs, pieGlassFill, GlassActiveShape } from '@/components/metrics/charts/LiquidGlassPie';
import { differenceInDays, parseISO, isAfter, isBefore, addDays, startOfDay, endOfDay, startOfWeek, endOfWeek } from 'date-fns';
import { AsanaDrilldownDialog, type AsanaDrilldownItem } from './AsanaDrilldownDialog';

// ── Glass surface tokens ───────────────────────────────────────
const GLASS_CARD = 'bg-white/[0.03] backdrop-blur-xl glass-border-soft rounded-lg';

const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

const STATUS_COLORS: Record<string, string> = {
  'On track': 'hsl(var(--success))',
  'At risk': 'hsl(45, 93%, 47%)',
  'Off track': 'hsl(var(--destructive))',
  'On hold': 'hsl(var(--muted-foreground))',
};

const TOOLTIP_STYLE = {
  background: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 8,
  fontSize: 11,
};

// Approx average glyph width (px) at a given font size for our UI font.
// 0.55em is a reasonable average for proportional sans-serif labels.
const AVG_CHAR_PX_PER_FONT_PX = 0.55;

/** Compute a max label length that fits within a YAxis label gutter. */
function maxLabelChars(axisWidthPx: number, fontSizePx: number, paddingPx = 12): number {
  const usable = Math.max(0, axisWidthPx - paddingPx);
  return Math.max(6, Math.floor(usable / (fontSizePx * AVG_CHAR_PX_PER_FONT_PX)));
}

/** Truncate with an ellipsis if value exceeds maxChars. */
function truncateLabel(v: string, maxChars: number): string {
  if (!v) return v;
  return v.length > maxChars ? v.slice(0, Math.max(1, maxChars - 1)) + '…' : v;
}

const Y_AXIS_WIDTH = 180;
const Y_AXIS_FONT = 11;

// ── Types ──────────────────────────────────────────────────────
interface OperationalData {
  counts: { projects: number; overdue: number; today: number; upcoming: number };
  projects: Array<any>;
  overdue: Array<any>;
  today: Array<any>;
  upcoming: Array<any>;
  recentlyCompleted?: Array<any>;
  error?: string;
  partial?: boolean;
}

interface OperationalDashboardProps {
  data: OperationalData | null;
  isLoading: boolean;
  error?: Error | null;
  onRefetch?: () => void;
}

// ── KPI Card ───────────────────────────────────────────────────
function KPICard({ label, value, description, onClick }: { label: string; value: string; description: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        GLASS_CARD,
        'p-4 flex flex-col justify-between min-h-[88px] transition-all text-left',
        onClick ? 'hover:border-white/[0.18] hover:bg-white/[0.05] cursor-pointer' : 'cursor-default',
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 leading-tight">
        {label}
      </p>
      <p className="text-2xl font-bold text-foreground tabular-nums mt-1 leading-none">
        {value}
      </p>
      <p className="text-[10px] text-muted-foreground/50 mt-1">{description}</p>
    </button>
  );
}

// ── Chart Card wrapper ─────────────────────────────────────────
function ChartCard({
  title,
  filterCount,
  onSeeAll,
  children,
  className,
}: {
  title: string;
  filterCount?: number;
  onSeeAll?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(GLASS_CARD, 'flex flex-col overflow-hidden', className)}>
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-xs font-semibold text-foreground truncate">{title}</h3>
          {filterCount !== undefined && (
            <span className="text-[9px] text-muted-foreground/50 bg-white/[0.05] rounded px-1.5 py-0.5 shrink-0">
              {filterCount} filter{filterCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <button className="text-muted-foreground/40 hover:text-muted-foreground transition-colors">
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex-1 px-2 pb-1">{children}</div>
      {onSeeAll && (
        <button
          onClick={onSeeAll}
          className="flex items-center justify-center gap-1 text-[10px] font-medium text-primary/80 hover:text-primary py-2 border-t glass-border-softer transition-colors"
        >
          See all <ChevronRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

// ── Custom pie legend ──────────────────────────────────────────
function PieLegend({
  items,
  onItemClick,
}: {
  items: { label: string; color: string; count: number }[];
  onItemClick?: (label: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 pl-2">
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          onClick={onItemClick ? () => onItemClick(item.label) : undefined}
          disabled={!onItemClick}
          className={cn(
            'flex items-center gap-2 text-[10px] text-left rounded px-1 -mx-1 transition-colors',
            onItemClick ? 'hover:bg-white/[0.05] cursor-pointer' : 'cursor-default',
          )}
        >
          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
          <span className="text-muted-foreground truncate">{item.label}</span>
          <span className="font-semibold text-foreground tabular-nums ml-auto">{item.count}</span>
        </button>
      ))}
    </div>
  );
}

// ── Derived metrics from real data ─────────────────────────────
function useDerivedMetrics(data: OperationalData | null, projectFilters: string[]) {
  return useMemo(() => {
    if (!data) return null;

    const now = new Date();
    const twoWeeksOut = addDays(now, 14);
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

    // Apply project filter (OR logic across selected projects) to task lists.
    // Project-level lists stay unfiltered so the project widgets keep their
    // portfolio-wide context.
    const filterSet = new Set(projectFilters);
    const matchesProject = (t: any) =>
      filterSet.size === 0 || filterSet.has(t.project_name || 'Unknown');
    const overdueRaw = (data.overdue ?? []).filter(matchesProject);
    const todayRaw = (data.today ?? []).filter(matchesProject);
    const upcomingRaw = (data.upcoming ?? []).filter(matchesProject);
    const completedRaw = (data.recentlyCompleted ?? []).filter(matchesProject);

    // All tasks combined (filtered)
    const allTasks = [...overdueRaw, ...todayRaw, ...upcomingRaw];
    const completedTasks = completedRaw;

    // KPI 1: Milestones due in next 2 weeks (from today + upcoming, filter milestones with due_on in range)
    const milestonesNext2WeeksItems = allTasks.filter(t => {
      if (t.completed) return false;
      if (!t.due_on) return false;
      const due = parseISO(t.due_on);
      return (isAfter(due, startOfDay(now)) || t.due_on === now.toISOString().slice(0, 10)) &&
        isBefore(due, endOfDay(twoWeeksOut)) && t.is_milestone;
    });
    const milestonesNext2Weeks = milestonesNext2WeeksItems.length;

    // KPI 2: Overdue milestones
    const overdueMilestonesItems = (data.overdue ?? []).filter((t: any) => t.is_milestone);
    const overdueMilestones = overdueMilestonesItems.length;

    // KPI 3: Avg time to complete milestone (from recently completed milestones)
    const completedMilestones = completedTasks.filter((t: any) => t.is_milestone && t.completed_at);
    let avgTimeToComplete = 0;
    if (completedMilestones.length > 0) {
      const totalDays = completedMilestones.reduce((sum: number, t: any) => {
        // Use last_activity_at as created proxy if no created_at available
        const created = t.created_at ? parseISO(t.created_at) : (t.last_activity_at ? parseISO(t.last_activity_at) : null);
        const completed = parseISO(t.completed_at);
        if (!created) return sum;
        return sum + Math.max(0, differenceInDays(completed, created));
      }, 0);
      avgTimeToComplete = totalDays / completedMilestones.length;
    }

    // KPI 4: Completed projects
    const completedProjectsItems = (data.projects ?? []).filter((p: any) =>
      p.status_type === 'complete' || p.status_type === 'achieved'
    );
    const completedProjects = completedProjectsItems.length;

    // Chart 1: This week's milestones by assignee
    const thisWeekMilestonesItems = allTasks.filter(t => {
      if (t.completed) return false;
      if (!t.due_on) return false;
      const due = parseISO(t.due_on);
      return !isBefore(due, startOfDay(weekStart)) && !isAfter(due, endOfDay(weekEnd));
    });
    const milestoneByAssignee = new Map<string, any[]>();
    thisWeekMilestonesItems.forEach(t => {
      const name = t.assignee || 'Unassigned';
      if (!milestoneByAssignee.has(name)) milestoneByAssignee.set(name, []);
      milestoneByAssignee.get(name)!.push(t);
    });
    const milestoneOwnership = Array.from(milestoneByAssignee.entries())
      .map(([assignee, items]) => ({ assignee, count: items.length, items }))
      .sort((a, b) => b.count - a.count);

    // Chart 2: Overdue tasks by project — always derived from the unfiltered
    // overdue list so the legend/filter source stays stable.
    const overdueByProject = new Map<string, any[]>();
    (data.overdue ?? []).forEach((t: any) => {
      const proj = t.project_name || 'Unknown';
      if (!overdueByProject.has(proj)) overdueByProject.set(proj, []);
      overdueByProject.get(proj)!.push(t);
    });
    const overdueBuckets = Array.from(overdueByProject.entries())
      .map(([project, items]) => ({ project, count: items.length, items }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // Chart 3: Projects overview by status groups
    const statusGroups = new Map<string, { onTrack: number; atRisk: number; offTrack: number }>();
    (data.projects ?? []).forEach((p: any) => {
      // Use the full project name as the bucket key so labels stay readable.
      const bucket = (p.name && String(p.name).trim()) || 'Untitled project';
      if (!statusGroups.has(bucket)) statusGroups.set(bucket, { onTrack: 0, atRisk: 0, offTrack: 0 });
      const g = statusGroups.get(bucket)!;
      const st = (p.status_type || '').toLowerCase();
      if (st === 'on_track' || st === 'on track' || st === 'green') g.onTrack++;
      else if (st === 'at_risk' || st === 'at risk' || st === 'yellow') g.atRisk++;
      else if (st === 'off_track' || st === 'off track' || st === 'red') g.offTrack++;
      else g.onTrack++; // default to on track if no status
    });
    const projectOverview = Array.from(statusGroups.entries())
      .map(([bucket, v]) => ({ bucket, ...v, total: v.onTrack + v.atRisk + v.offTrack }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);

    // Chart 4: Projects by status (pie)
    const statusCounts = { onTrack: 0, atRisk: 0, offTrack: 0, onHold: 0 };
    (data.projects ?? []).forEach((p: any) => {
      const st = (p.status_type || '').toLowerCase();
      if (st === 'on_track' || st === 'on track' || st === 'green') statusCounts.onTrack++;
      else if (st === 'at_risk' || st === 'at risk' || st === 'yellow') statusCounts.atRisk++;
      else if (st === 'off_track' || st === 'off track' || st === 'red') statusCounts.offTrack++;
      else if (st === 'on_hold' || st === 'on hold') statusCounts.onHold++;
      else statusCounts.onTrack++;
    });
    const projectStatus = [
      { status: 'On track', count: statusCounts.onTrack, color: STATUS_COLORS['On track'] },
      { status: 'At risk', count: statusCounts.atRisk, color: STATUS_COLORS['At risk'] },
      { status: 'Off track', count: statusCounts.offTrack, color: STATUS_COLORS['Off track'] },
      { status: 'On hold', count: statusCounts.onHold, color: STATUS_COLORS['On hold'] },
    ].filter(s => s.count > 0);

    // Chart 5: Projects due within next 2 weeks
    const projectsDueNext2 = (data.projects ?? []).filter((p: any) => {
      if (!p.due_on) return false;
      const due = parseISO(p.due_on);
      return isAfter(due, startOfDay(now)) && isBefore(due, endOfDay(twoWeeksOut));
    });
    const projectsDueBuckets = [{ bucket: 'Due in 2 weeks', count: projectsDueNext2.length, items: projectsDueNext2 }];

    return {
      kpis: [
        { label: 'Milestones Next 2 Weeks', value: String(milestonesNext2Weeks), description: 'Open milestones due within 14 days', items: milestonesNext2WeeksItems, kind: 'task' as const },
        { label: 'Overdue Milestones', value: String(overdueMilestones), description: 'Incomplete milestones past due', items: overdueMilestonesItems, kind: 'task' as const },
        { label: 'Avg. Time to Comp. Milestone', value: completedMilestones.length > 0 ? `${avgTimeToComplete.toFixed(2)} d` : '— d', description: 'Avg duration open → completed', items: completedMilestones, kind: 'task' as const },
        { label: 'Completed Projects', value: String(completedProjects), description: 'Projects with completed status', items: completedProjectsItems, kind: 'project' as const },
      ],
      milestoneOwnership,
      overdueBuckets,
      projectOverview,
      projectStatus,
      projectsDueBuckets,
      projectsAll: data.projects ?? [],
    };
  }, [data, projectFilters]);
}

// ── Main Dashboard ─────────────────────────────────────────────
export function OperationalDashboard({ data, isLoading, error, onRefetch }: OperationalDashboardProps) {
  const [projectFilters, setProjectFilters] = useState<string[]>([]);
  const toggleProjectFilter = (project: string | undefined | null) => {
    if (!project) return;
    setProjectFilters((prev) =>
      prev.includes(project) ? prev.filter((p) => p !== project) : [...prev, project],
    );
  };
  const clearProjectFilters = () => setProjectFilters([]);
  const isProjectSelected = (project: string) => projectFilters.includes(project);
  const hasProjectFilter = projectFilters.length > 0;
  const metrics = useDerivedMetrics(data, projectFilters);
  const [drilldown, setDrilldown] = useState<{
    title: string;
    subtitle?: string;
    items: AsanaDrilldownItem[];
    kind: 'task' | 'project';
  } | null>(null);

  const openDrilldown = (
    title: string,
    items: any[],
    kind: 'task' | 'project',
    subtitle?: string,
  ) => {
    setDrilldown({ title, subtitle, items: items as AsanaDrilldownItem[], kind });
  };

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className={cn(GLASS_CARD, 'p-4 min-h-[88px] animate-pulse')}>
              <div className="h-2 w-20 bg-white/[0.06] rounded mb-3" />
              <div className="h-6 w-12 bg-white/[0.08] rounded" />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const hasData = data.counts && (data.counts.projects > 0 || data.counts.overdue > 0 || data.counts.today > 0 || data.counts.upcoming > 0);
  if ((error || data.error) && !hasData) {
    const rawMsg = data.error || (error instanceof Error ? error.message : 'Unable to load operational data');
    const isRateLimit = rawMsg.includes('429') || rawMsg.toLowerCase().includes('rate limit');
    const msg = isRateLimit
      ? 'Asana data is temporarily unavailable due to rate limits. Please try again in a moment.'
      : rawMsg;
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <AlertCircle className="w-8 h-8 text-destructive/60" />
        <p className="text-sm text-muted-foreground text-center max-w-xs">{msg}</p>
        {onRefetch && (
          <button onClick={onRefetch} className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        )}
      </div>
    );
  }

  if (!metrics) return null;

  const { kpis, milestoneOwnership, overdueBuckets, projectOverview, projectStatus, projectsDueBuckets } = metrics;
  const projectsByStatus = (status: string) => {
    const want = status.toLowerCase().replace(' ', '_');
    return (metrics.projectsAll ?? []).filter((p: any) => {
      const st = (p.status_type || '').toLowerCase().replace(' ', '_');
      if (status === 'On track') return !st || st === 'on_track' || st === 'green';
      if (status === 'At risk') return st === 'at_risk' || st === 'yellow';
      if (status === 'Off track') return st === 'off_track' || st === 'red';
      if (status === 'On hold') return st === 'on_hold';
      return st === want;
    });
  };

  return (
    <div className="space-y-4">
      {/* Partial data warning */}
      {data.partial && (
        <div className="text-[10px] text-amber-400/70 bg-amber-400/[0.06] rounded px-3 py-1.5 border border-amber-400/10">
          Some projects could not be loaded due to rate limits. Showing partial data.
        </div>
      )}

      {/* Active project filters banner */}
      {hasProjectFilter && (
        <div className="flex items-center flex-wrap gap-2 text-[11px] text-foreground/85 bg-primary/[0.08] border border-primary/20 rounded px-3 py-1.5">
          <span className="text-muted-foreground">
            Filtering by {projectFilters.length === 1 ? 'project' : `${projectFilters.length} projects`}:
          </span>
          {projectFilters.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => toggleProjectFilter(p)}
              className="inline-flex items-center gap-1 rounded bg-primary/[0.15] border border-primary/30 px-1.5 py-0.5 hover:bg-primary/[0.22]"
              title={`Remove ${p}`}
            >
              <span className="font-semibold truncate max-w-[200px]">{p}</span>
              <span className="text-primary">×</span>
            </button>
          ))}
          <button
            type="button"
            onClick={clearProjectFilters}
            className="ml-auto inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
          >
            Clear all
          </button>
        </div>
      )}

      {/* ── Row 1: KPI Summary Cards ──────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {kpis.map((kpi) => (
          <KPICard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            description={kpi.description}
            onClick={
              (kpi as any).items && (kpi as any).items.length > 0
                ? () => openDrilldown(kpi.label, (kpi as any).items, (kpi as any).kind, kpi.description)
                : undefined
            }
          />
        ))}
      </div>

      {/* ── Row 2: Charts grid ────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {/* Chart 1: This Week's Milestones (pie) */}
        <ChartCard
          title="This Week's Milestones"
          filterCount={milestoneOwnership.length}
          onSeeAll={() =>
            openDrilldown(
              "This Week's Milestones",
              milestoneOwnership.flatMap((m: any) => m.items),
              'task',
              'All milestones due in the current week',
            )
          }
        >
          {milestoneOwnership.length === 0 ? (
            <div className="flex items-center justify-center h-[160px] text-xs text-muted-foreground/60">No milestones this week</div>
          ) : (
            <div className="flex items-center gap-2 py-2">
              <ResponsiveContainer width="55%" height={160}>
                <PieChart>
                  <PieGlassDefs colors={milestoneOwnership.map((_, i) => CHART_COLORS[i % CHART_COLORS.length])} />
                  <Pie
                    data={milestoneOwnership}
                    dataKey="count"
                    nameKey="assignee"
                    cx="50%"
                    cy="50%"
                    innerRadius={32}
                    outerRadius={60}
                    paddingAngle={3}
                    activeShape={GlassActiveShape}
                    onClick={(entry: any) =>
                      openDrilldown(
                        `This Week's Milestones — ${entry?.assignee || 'Unassigned'}`,
                        (entry?.items || []) as any[],
                        'task',
                      )
                    }
                    style={{ cursor: 'pointer' }}
                  >
                    {milestoneOwnership.map((_, i) => (
                      <Cell key={i} fill={pieGlassFill(i)} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={0.25} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
              <PieLegend
                items={milestoneOwnership.map((m, i) => ({ label: m.assignee, color: CHART_COLORS[i % CHART_COLORS.length], count: m.count }))}
                onItemClick={(label) => {
                  const slice = milestoneOwnership.find(m => m.assignee === label);
                  openDrilldown(
                    `This Week's Milestones — ${label}`,
                    (slice?.items || []) as any[],
                    'task',
                  );
                }}
              />
            </div>
          )}
        </ChartCard>

        {/* Chart 2: Overdue Milestones (bar) */}
        <ChartCard
          title="Overdue Tasks by Project"
          onSeeAll={() =>
            openDrilldown(
              'Overdue Tasks',
              overdueBuckets.flatMap((b: any) => b.items),
              'task',
              'All overdue tasks across portfolio projects',
            )
          }
        >
          {overdueBuckets.length === 0 ? (
            <div className="flex items-center justify-center h-[170px] text-xs text-muted-foreground/60">No overdue items</div>
          ) : (
            <>
              <div className="flex items-center justify-between px-2 pt-1 pb-1">
                <span className="text-[10px] text-muted-foreground/70">
                  {projectFilter ? 'Filtering dashboard by project' : 'Click a bar or project to filter the dashboard'}
                </span>
                {projectFilter && (
                  <button
                    type="button"
                    onClick={() => setProjectFilter(null)}
                    className="text-[10px] text-primary hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
              <ResponsiveContainer width="100%" height={Math.max(170, overdueBuckets.length * 28 + 16)}>
                <BarChart
                  data={overdueBuckets}
                  layout="vertical"
                  margin={{ left: 4, right: 16, top: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="project"
                    tick={{ fontSize: Y_AXIS_FONT, fill: 'hsl(var(--muted-foreground))', cursor: 'pointer' }}
                    interval={0}
                    width={Y_AXIS_WIDTH}
                    tickFormatter={(v: string) => truncateLabel(v, maxLabelChars(Y_AXIS_WIDTH, Y_AXIS_FONT))}
                    onClick={(o: any) => {
                      const v = o?.value;
                      if (v) setProjectFilter(projectFilter === v ? null : v);
                    }}
                  />
                  <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(label) => String(label)} />
                  <Bar
                    dataKey="count"
                    shape={createGlassBarShape({ radius: 3 })}
                    name="Overdue"
                    onClick={(entry: any) => {
                      const v = entry?.project;
                      if (v) setProjectFilter(projectFilter === v ? null : v);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {overdueBuckets.map((b, i) => (
                      <Cell
                        key={i}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                        fillOpacity={!projectFilter || projectFilter === b.project ? 1 : 0.3}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-1 px-2 pt-2 pb-1">
                {overdueBuckets.map((b: any, i: number) => {
                  const active = projectFilter === b.project;
                  return (
                    <button
                      key={b.project}
                      type="button"
                      onClick={() => setProjectFilter(active ? null : b.project)}
                      title={`${b.project} (${b.count} overdue)`}
                      className={cn(
                        'flex items-center gap-1.5 text-[10px] rounded px-1.5 py-0.5 border transition-colors max-w-[180px]',
                        active
                          ? 'border-primary/40 bg-primary/[0.12] text-foreground'
                          : 'border-white/10 bg-white/[0.03] text-muted-foreground hover:text-foreground hover:bg-white/[0.06]',
                      )}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                      />
                      <span className="truncate">{b.project}</span>
                      <span className="tabular-nums text-foreground/80">{b.count}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </ChartCard>

        {/* Chart 3: Projects Overview (grouped bar) */}
        <ChartCard
          title="Projects Overview"
          filterCount={projectOverview.length}
          onSeeAll={() =>
            openDrilldown('All Projects', metrics.projectsAll ?? [], 'project', 'Every project in the portfolio')
          }
        >
          {projectOverview.length === 0 ? (
            <div className="flex items-center justify-center h-[170px] text-xs text-muted-foreground/60">No projects</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, projectOverview.length * 32 + 32)}>
              <BarChart
                data={projectOverview}
                layout="vertical"
                margin={{ left: 4, right: 16, top: 4, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="bucket"
                  tick={{ fontSize: Y_AXIS_FONT, fill: 'hsl(var(--muted-foreground))' }}
                  interval={0}
                  width={Y_AXIS_WIDTH}
                  tickFormatter={(v: string) => truncateLabel(v, maxLabelChars(Y_AXIS_WIDTH, Y_AXIS_FONT))}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(label) => String(label)} />
                <Legend
                  wrapperStyle={{ fontSize: 9, cursor: 'pointer' }}
                  onClick={(entry: any) => {
                    const map: Record<string, string> = { 'On track': 'On track', 'At risk': 'At risk', 'Off track': 'Off track' };
                    const label = map[entry?.value] || entry?.value;
                    if (label) openDrilldown(`Projects — ${label}`, projectsByStatus(label), 'project');
                  }}
                />
                <Bar
                  dataKey="onTrack"
                  name="On track"
                  fill={STATUS_COLORS['On track']}
                  radius={[0, 3, 3, 0]}
                  barSize={10}
                  stackId="status"
                  style={{ cursor: 'pointer' }}
                  onClick={(entry: any) =>
                    openDrilldown(
                      `On track — ${entry?.bucket || ''}`,
                      (metrics.projectsAll ?? []).filter((p: any) => {
                        const st = (p.status_type || '').toLowerCase();
                        const bucket = (p.name && String(p.name).trim()) || 'Untitled project';
                        return bucket === entry?.bucket && (!st || st === 'on_track' || st === 'on track' || st === 'green');
                      }),
                      'project',
                    )
                  }
                />
                <Bar
                  dataKey="atRisk"
                  name="At risk"
                  fill={STATUS_COLORS['At risk']}
                  radius={[0, 3, 3, 0]}
                  barSize={10}
                  stackId="status"
                  style={{ cursor: 'pointer' }}
                  onClick={(entry: any) =>
                    openDrilldown(
                      `At risk — ${entry?.bucket || ''}`,
                      (metrics.projectsAll ?? []).filter((p: any) => {
                        const st = (p.status_type || '').toLowerCase();
                        const bucket = (p.name && String(p.name).trim()) || 'Untitled project';
                        return bucket === entry?.bucket && (st === 'at_risk' || st === 'at risk' || st === 'yellow');
                      }),
                      'project',
                    )
                  }
                />
                <Bar
                  dataKey="offTrack"
                  name="Off track"
                  fill={STATUS_COLORS['Off track']}
                  radius={[0, 3, 3, 0]}
                  barSize={10}
                  stackId="status"
                  style={{ cursor: 'pointer' }}
                  onClick={(entry: any) =>
                    openDrilldown(
                      `Off track — ${entry?.bucket || ''}`,
                      (metrics.projectsAll ?? []).filter((p: any) => {
                        const st = (p.status_type || '').toLowerCase();
                        const bucket = (p.name && String(p.name).trim()) || 'Untitled project';
                        return bucket === entry?.bucket && (st === 'off_track' || st === 'off track' || st === 'red');
                      }),
                      'project',
                    )
                  }
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Chart 4: Projects by Status (pie) */}
        <ChartCard
          title="Projects by Status"
          onSeeAll={() =>
            openDrilldown('All Projects', metrics.projectsAll ?? [], 'project')
          }
        >
          {projectStatus.length === 0 ? (
            <div className="flex items-center justify-center h-[160px] text-xs text-muted-foreground/60">No project data</div>
          ) : (
            <div className="flex items-center gap-2 py-2">
              <ResponsiveContainer width="55%" height={160}>
                <PieChart>
                  <PieGlassDefs colors={projectStatus.map(s => s.color)} />
                  <Pie
                    data={projectStatus}
                    dataKey="count"
                    nameKey="status"
                    cx="50%"
                    cy="50%"
                    innerRadius={32}
                    outerRadius={60}
                    paddingAngle={3}
                    activeShape={GlassActiveShape}
                    onClick={(entry: any) =>
                      openDrilldown(
                        `Projects — ${entry?.status || ''}`,
                        projectsByStatus(entry?.status || ''),
                        'project',
                      )
                    }
                    style={{ cursor: 'pointer' }}
                  >
                    {projectStatus.map((entry, i) => (
                      <Cell key={i} fill={pieGlassFill(i)} stroke={entry.color} strokeWidth={0.25} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
              <PieLegend
                items={projectStatus.map(s => ({ label: s.status, color: s.color, count: s.count }))}
                onItemClick={(label) =>
                  openDrilldown(`Projects — ${label}`, projectsByStatus(label), 'project')
                }
              />
            </div>
          )}
        </ChartCard>

        {/* Chart 5: Projects Due within Next 2 Weeks (bar) */}
        <ChartCard
          title="Projects Due within Next 2 Weeks"
          className="md:col-span-2 lg:col-span-2"
          onSeeAll={() =>
            openDrilldown(
              'Projects Due within Next 2 Weeks',
              (projectsDueBuckets[0] as any)?.items || [],
              'project',
            )
          }
        >
          <div className="flex gap-3 py-1">
            <div className="w-2/5 max-w-[260px] min-w-0 border-r glass-border-softer pr-3 flex flex-col">
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground/60 mb-1.5">
                Projects ({(projectsDueBuckets[0] as any)?.items?.length || 0})
              </div>
              {((projectsDueBuckets[0] as any)?.items?.length || 0) === 0 ? (
                <div className="flex-1 flex items-center justify-center text-[10px] text-muted-foreground/60 text-center px-2">
                  No projects due in the next 14 days
                </div>
              ) : (
                <ul className="flex-1 overflow-y-auto space-y-1 pr-1" style={{ maxHeight: 160 }}>
                  {((projectsDueBuckets[0] as any).items as any[]).map((p, i) => (
                    <li
                      key={p.gid || p.id || i}
                      onClick={() =>
                        openDrilldown(
                          'Projects Due within Next 2 Weeks',
                          (projectsDueBuckets[0] as any)?.items || [],
                          'project',
                        )
                      }
                      className="text-[10px] text-foreground/85 hover:text-foreground truncate cursor-pointer flex items-center gap-1.5"
                      title={p.name}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                      />
                      <span className="truncate">{p.name || 'Untitled project'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <ResponsiveContainer width="100%" height={170}>
                <BarChart data={projectsDueBuckets} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="bucket" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} interval={0} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} width={28} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar
                    dataKey="count"
                    shape={createGlassBarShape({ radius: 3 })}
                    name="Projects Due"
                    onClick={(entry: any) =>
                      openDrilldown(
                        'Projects Due within Next 2 Weeks',
                        (entry?.items || []) as any[],
                        'project',
                      )
                    }
                    style={{ cursor: 'pointer' }}
                  >
                    {projectsDueBuckets.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </ChartCard>
      </div>

      {drilldown && (
        <AsanaDrilldownDialog
          open={!!drilldown}
          onOpenChange={(v) => !v && setDrilldown(null)}
          title={drilldown.title}
          subtitle={drilldown.subtitle}
          items={drilldown.items}
          kind={drilldown.kind}
        />
      )}
    </div>
  );
}
