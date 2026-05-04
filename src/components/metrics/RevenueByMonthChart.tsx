import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { GlassCard, GlassCardHeader, GlassCardBody } from '@/components/metrics/GlassCard';

// Shared axis / tooltip / legend tokens — mirrors ExecutiveDashboard so the
// chart looks identical after the move.
const AXIS_TICK = { fontSize: 10, fill: 'rgba(200, 220, 250, 0.78)' } as const;
const AXIS_LINE = { stroke: 'rgba(160, 200, 255, 0.20)' } as const;
const GRID_STROKE = 'rgba(160, 200, 255, 0.14)';
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
  color: 'rgba(200, 220, 250, 0.88)',
  paddingTop: 4,
};

const formatCurrency = (value: number) => {
  if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
};

// Identical sample dataset previously rendered inside ExecutiveDashboard.
// Data bindings are preserved verbatim — only the placement moves.
const revenueByMonthData = [
  { month: 'Aug-25', revenue: 250000 },
  { month: 'Sep-25', revenue: 320000 },
  { month: 'Oct-25', revenue: 280000 },
  { month: 'Nov-25', revenue: 350000 },
  { month: 'Dec-25', revenue: 420000 },
  { month: 'Jan-26', revenue: 180000 },
];

export function RevenueByMonthChart({ height = 240 }: { height?: number }) {
  return (
    <GlassCard interactive className="h-full">
      <GlassCardHeader title="Revenue by Month" subtitle="Last 6 Months" />
      <GlassCardBody>
        <div style={{ height }} role="img" aria-label="Revenue by month, last 6 months">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={revenueByMonthData} margin={{ top: 8, right: 8, left: -6, bottom: 4 }}>
              <CartesianGrid strokeDasharray="2 4" stroke={GRID_STROKE} vertical={false} />
              <XAxis dataKey="month" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
              <YAxis tickFormatter={formatCurrency} tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={false} />
              <Tooltip formatter={(value: number) => [formatCurrency(value), 'Revenue']} contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={LEGEND_STYLE} iconType="circle" iconSize={8} />
              <Area type="monotone" dataKey="revenue" name="Revenue" fill="hsl(var(--primary) / 0.22)" stroke="transparent" legendType="none" />
              <Line type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(var(--primary))" strokeWidth={1.75} dot={{ r: 3, fill: 'hsl(var(--primary))', strokeWidth: 0 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </GlassCardBody>
    </GlassCard>
  );
}