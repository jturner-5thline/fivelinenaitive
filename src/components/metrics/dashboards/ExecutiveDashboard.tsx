import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Lock } from 'lucide-react';
import { useExecutiveTopRowKpis } from '@/hooks/useExecutiveTopRowKpis';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Line, ComposedChart, Area, PieChart, Pie, Cell, Legend } from 'recharts';
import { createGlassBarShape } from '@/components/metrics/charts/LiquidGlassBar';
import { PieGlassDefs, GlassActiveShape } from '@/components/metrics/charts/LiquidGlassPie';
import { GlassCard, GlassCardHeader, GlassCardBody, GLASS_TOKENS } from '@/components/metrics/GlassCard';

// ── Shared chart primitives (axis/grid/tooltip) ──────────────────────────────
// Mirrors the Liquid Glass treatment used by Profit by Entity / Revenue
// Overview so every Executive Dashboard chart sits inside the same visual
// language as the rest of Weekly Rundown.
const AXIS_TICK = { fontSize: 10, fill: 'rgba(180, 210, 245, 0.55)' } as const;
const AXIS_LINE = { stroke: 'rgba(160, 200, 255, 0.12)' } as const;
const GRID_STROKE = 'rgba(160, 200, 255, 0.10)';
const TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: 'hsl(var(--popover) / 0.96)',
  border: '1px solid hsl(0 0% 100% / 0.14)',
  borderRadius: '8px',
  fontSize: '12px',
  color: 'hsl(0 0% 100%)',
  boxShadow: 'var(--shadow-xl)',
  backdropFilter: 'blur(16px)',
};
const LEGEND_STYLE: React.CSSProperties = {
  fontSize: 11,
  color: 'rgba(180, 210, 245, 0.7)',
  paddingTop: 4,
};

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
      <GlassCard>
        <GlassCardHeader>
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-48 mt-2" />
        </GlassCardHeader>
        <GlassCardBody><Skeleton className="h-[220px] w-full" /></GlassCardBody>
      </GlassCard>
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
    <GlassCard interactive>
      <GlassCardHeader
        title="Deals by Status"
        subtitle="By total fee · current pipeline"
        right={
          <div className="text-right">
            <p
              className="text-xl font-semibold tabular-nums leading-none tracking-tight"
              style={{ color: GLASS_TOKENS.valueColor }}
            >
              {formatCurrency(total)}
            </p>
            <p
              className="text-[10px] mt-1.5 uppercase tracking-wider"
              style={{ color: GLASS_TOKENS.metaColor }}
            >
              Total Fee
            </p>
          </div>
        }
      />
      <GlassCardBody>
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
                  <Cell key={i} fill={STATUS_COLORS[i]} fillOpacity={0.75} stroke={STATUS_COLORS[i]} strokeWidth={0.5} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number, name: string) => {
                  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
                  return [`${formatCurrencyFull(value)} (${pct}%)`, name];
                }}
                contentStyle={TOOLTIP_STYLE}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        {/* Below-chart legend — matches Outstanding A/R formatting */}
        <div className="mt-3 space-y-1.5">
          {legendItems.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: item.color, opacity: 0.75 }} />
              <span className="truncate flex-1" style={{ color: 'rgba(180, 210, 245, 0.7)' }} title={item.label}>{item.label}</span>
              <span className="font-medium tabular-nums flex-shrink-0" style={{ color: GLASS_TOKENS.valueColor }}>{item.value}</span>
            </div>
          ))}
        </div>
      </GlassCardBody>
    </GlassCard>
  );
}

/**
 * Executive KPI tile — uses the exact GlassCard header / value / meta
 * typography hierarchy as Weekly Rundown:
 *   • Header: uppercase tracked title + muted subtitle (in header slot, not body)
 *   • Body  : dominant numeric value (GLASS_TOKENS.valueClass / valueColor)
 *   • Meta  : small pill-style trend badge (matches KPISummaryCard.TrendBadge)
 */
function StatCard({
  title,
  value,
  subtitle,
  loading,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  loading?: boolean;
}) {
  return (
    <GlassCard interactive>
      <GlassCardHeader title={title} subtitle={subtitle} />
      <GlassCardBody className="pt-0 pb-5 space-y-2">
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <p
            className={GLASS_TOKENS.valueClass}
            style={{ color: GLASS_TOKENS.valueColor }}
          >
            {value}
          </p>
        )}
      </GlassCardBody>
    </GlassCard>
  );
}

function NoDataCard({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <GlassCard>
      <GlassCardHeader title={title} subtitle={subtitle} />
      <GlassCardBody className="flex flex-col items-center justify-center py-10">
        <Lock className="h-8 w-8 mb-2" style={{ color: 'rgba(160, 200, 255, 0.30)' }} />
        <p
          className="text-[11px] uppercase tracking-wider"
          style={{ color: GLASS_TOKENS.metaColor }}
        >
          No Data Available
        </p>
      </GlassCardBody>
    </GlassCard>
  );
}

/** Shared header bundle for chart cards — matches Profit by Entity / Revenue Overview. */
function ChartCardHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return <GlassCardHeader title={title} subtitle={subtitle} />;
}

export function ExecutiveDashboard() {
  const kpis = useExecutiveTopRowKpis();

  const fmtMoney = (v: number | null) =>
    v === null || !Number.isFinite(v) ? '—' : formatCurrency(v);
  const fmtCount = (v: number | null) =>
    v === null || !Number.isFinite(v) ? '—' : v.toLocaleString();

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

  const cashFlowData = [
    { month: 'Aug-25', inflow: 300000, outflow: 250000 },
    { month: 'Sep-25', inflow: 280000, outflow: 260000 },
    { month: 'Oct-25', inflow: 350000, outflow: 280000 },
    { month: 'Nov-25', inflow: 400000, outflow: 300000 },
    { month: 'Dec-25', inflow: 320000, outflow: 310000 },
    { month: 'Jan-26', inflow: 180000, outflow: 200000 },
  ];

  return (
    <div className="space-y-6">
      {/* Row 1: Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Active Deal Volume"
          value={fmtMoney(kpis.totalActiveDealVolume.value)}
          subtitle="Final Credit Items → In Due Diligence"
          loading={kpis.totalActiveDealVolume.loading}
        />
        <StatCard
          title="Deals Closed (QTD)"
          value={fmtCount(kpis.dealsClosedQTD.value)}
          subtitle="Entered Funded / Invoiced this quarter"
          loading={kpis.dealsClosedQTD.loading}
        />
        <StatCard
          title="Revenue (QTD)"
          value={fmtMoney(kpis.revenueQTD.value)}
          subtitle="5th Line Capital Advisors · QBO"
          loading={kpis.revenueQTD.loading}
        />
        <StatCard
          title="Avg. Deal Size"
          value={fmtMoney(kpis.avgDealSize.value)}
          subtitle="Entered Final Credit Items · Trailing 12 mo."
          loading={kpis.avgDealSize.loading}
        />
      </div>

      {/* Row 2: Revenue & Pipeline */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <GlassCard interactive>
          <ChartCardHeader title="Revenue by Month" subtitle="Last 6 Months" />
          <GlassCardBody>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={revenueByMonthData} margin={{ top: 8, right: 8, left: -10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={GRID_STROKE} vertical={false} />
                  <XAxis dataKey="month" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                  <YAxis tickFormatter={formatCurrency} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={TOOLTIP_STYLE} />
                  <Area type="monotone" dataKey="revenue" fill="hsl(var(--primary) / 0.18)" stroke="transparent" />
                  <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={1} dot={{ r: 3, fill: 'hsl(var(--primary))', strokeWidth: 0 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </GlassCardBody>
        </GlassCard>

        <GlassCard interactive>
          <ChartCardHeader title="Pipeline by Stage" subtitle="Current" />
          <GlassCardBody>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pipelineByStageData} layout="vertical" margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={GRID_STROKE} horizontal={false} />
                  <XAxis type="number" tickFormatter={formatCurrency} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                  <YAxis dataKey="stage" type="category" width={96} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(160,200,255,0.06)' }} />
                  <Bar dataKey="value" fill="hsl(var(--primary))" shape={createGlassBarShape({ radius: 4 })} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCardBody>
        </GlassCard>
      </div>

      {/* Row 3: Deal Types & Cash Flow */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DealsByStatusPieChart />

        <GlassCard interactive>
          <ChartCardHeader title="Cash Flow" subtitle="Last 6 Months" />
          <GlassCardBody>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cashFlowData} margin={{ top: 8, right: 8, left: -10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={GRID_STROKE} vertical={false} />
                  <XAxis dataKey="month" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                  <YAxis tickFormatter={formatCurrency} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(160,200,255,0.06)' }} />
                  <Legend wrapperStyle={LEGEND_STYLE} iconType="circle" iconSize={8} />
                  <Bar dataKey="inflow" fill="hsl(152, 58%, 52%)" name="Inflow" shape={createGlassBarShape({ radius: 4 })} />
                  <Bar dataKey="outflow" fill="hsl(354, 62%, 56%)" name="Outflow" shape={createGlassBarShape({ radius: 4 })} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCardBody>
        </GlassCard>
      </div>
    </div>
  );
}
