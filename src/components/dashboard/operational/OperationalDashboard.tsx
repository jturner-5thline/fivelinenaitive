import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronRight, ExternalLink, MoreHorizontal } from 'lucide-react';
import {
  Bar, BarChart, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, PieChart, Pie, Legend,
} from 'recharts';
import { createGlassBarShape } from '@/components/metrics/charts/LiquidGlassBar';
import { PieGlassDefs, pieGlassFill, GlassActiveShape } from '@/components/metrics/charts/LiquidGlassPie';
import {
  MOCK_KPIS,
  MOCK_MILESTONE_OWNERSHIP,
  MOCK_OVERDUE_BUCKETS,
  MOCK_PROJECT_OVERVIEW,
  MOCK_PROJECT_STATUS,
  MOCK_PROJECTS_DUE,
} from './operationalMockData';

// ── Glass surface tokens ───────────────────────────────────────
const GLASS_CARD = 'bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-lg';

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

// ── KPI Card ───────────────────────────────────────────────────
function KPICard({ label, value, description }: { label: string; value: string; description: string }) {
  return (
    <div className={cn(GLASS_CARD, 'p-4 flex flex-col justify-between min-h-[88px] transition-all hover:border-white/[0.12]')}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 leading-tight">
        {label}
      </p>
      <p className="text-2xl font-bold text-foreground tabular-nums mt-1 leading-none">
        {value}
      </p>
      <p className="text-[10px] text-muted-foreground/50 mt-1">{description}</p>
    </div>
  );
}

// ── Chart Card wrapper ─────────────────────────────────────────
function ChartCard({
  title,
  filterCount,
  onSeeAll,
  children,
}: {
  title: string;
  filterCount?: number;
  onSeeAll?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(GLASS_CARD, 'flex flex-col overflow-hidden')}>
      {/* Header */}
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
      {/* Chart body */}
      <div className="flex-1 px-2 pb-1">{children}</div>
      {/* Footer */}
      {onSeeAll && (
        <button
          onClick={onSeeAll}
          className="flex items-center justify-center gap-1 text-[10px] font-medium text-primary/80 hover:text-primary py-2 border-t border-white/[0.04] transition-colors"
        >
          See all <ChevronRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

// ── Custom pie legend ──────────────────────────────────────────
function PieLegend({ items }: { items: { label: string; color: string; count: number }[] }) {
  return (
    <div className="flex flex-col gap-1.5 pl-2">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2 text-[10px]">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
          <span className="text-muted-foreground truncate">{item.label}</span>
          <span className="font-semibold text-foreground tabular-nums ml-auto">{item.count}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────
export function OperationalDashboard() {
  // Future: replace mock data with live Naitive data hooks
  const kpis = MOCK_KPIS;
  const milestoneOwnership = MOCK_MILESTONE_OWNERSHIP;
  const overdueBuckets = MOCK_OVERDUE_BUCKETS;
  const projectOverview = MOCK_PROJECT_OVERVIEW;
  const projectStatus = MOCK_PROJECT_STATUS;
  const projectsDue = MOCK_PROJECTS_DUE;

  const handleSeeAll = () => {
    // Future: open drilldown or navigate
  };

  return (
    <div className="space-y-4">
      {/* ── Row 1: KPI Summary Cards ──────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {kpis.map((kpi) => (
          <KPICard key={kpi.label} {...kpi} />
        ))}
      </div>

      {/* ── Row 2: Charts grid ────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {/* Chart 1: This Week's Milestones (pie) */}
        <ChartCard title="This Week's Milestones" filterCount={2} onSeeAll={handleSeeAll}>
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
                >
                  {milestoneOwnership.map((_, i) => (
                    <Cell key={i} fill={pieGlassFill(i)} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={0.5} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
            <PieLegend
              items={milestoneOwnership.map((m, i) => ({
                label: m.assignee,
                color: CHART_COLORS[i % CHART_COLORS.length],
                count: m.count,
              }))}
            />
          </div>
        </ChartCard>

        {/* Chart 2: Overdue Milestones (bar) */}
        <ChartCard title="Overdue Milestones" onSeeAll={handleSeeAll}>
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={overdueBuckets} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="project" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} interval={0} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} width={28} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="count" shape={createGlassBarShape({ radius: 3 })} name="Overdue">
                {overdueBuckets.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Chart 3: Projects Overview (grouped bar) */}
        <ChartCard title="Projects Overview" filterCount={3} onSeeAll={handleSeeAll}>
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={projectOverview} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="bucket" tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} interval={0} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} width={28} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 9 }} />
              <Bar dataKey="onTrack" name="On track" fill={STATUS_COLORS['On track']} radius={[3, 3, 0, 0]} barSize={14} />
              <Bar dataKey="atRisk" name="At risk" fill={STATUS_COLORS['At risk']} radius={[3, 3, 0, 0]} barSize={14} />
              <Bar dataKey="offTrack" name="Off track" fill={STATUS_COLORS['Off track']} radius={[3, 3, 0, 0]} barSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Chart 4: Projects by Status (pie) */}
        <ChartCard title="Projects by Status" onSeeAll={handleSeeAll}>
          <div className="flex items-center gap-2 py-2">
            <ResponsiveContainer width="55%" height={160}>
              <PieChart>
                <PieGlassDefs colors={projectStatus.map((s) => s.color)} />
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
                >
                  {projectStatus.map((entry, i) => (
                    <Cell key={i} fill={pieGlassFill(i)} stroke={entry.color} strokeWidth={0.5} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
            <PieLegend
              items={projectStatus.map((s) => ({
                label: s.status,
                color: s.color,
                count: s.count,
              }))}
            />
          </div>
        </ChartCard>

        {/* Chart 5: Projects Due within Next 2 Weeks (bar) */}
        <ChartCard title="Projects Due within Next 2 Weeks" onSeeAll={handleSeeAll}>
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={projectsDue} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="bucket" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} interval={0} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} width={28} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="count" shape={createGlassBarShape({ radius: 3 })} name="Projects Due">
                {projectsDue.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
