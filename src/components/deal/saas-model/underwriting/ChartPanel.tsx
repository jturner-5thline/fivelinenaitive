import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine, Cell, BarChart, Area, AreaChart,
} from 'recharts';
import type { ChartPoint } from './types';
import { fmtMM } from './components';

interface ChartPanelProps {
  title: string;
  data: ChartPoint[];
  height?: number;
}

const COLORS = {
  recurring: 'hsl(213, 90%, 70%)',
  nonRecurring: 'hsl(213, 60%, 50%)',
  revenue: 'hsl(213, 90%, 70%)',
  expenses: 'hsl(0, 72%, 60%)',
  ebitda: 'hsl(213, 90%, 70%)',
  operating_income: 'hsl(142, 71%, 55%)',
  projected: 'hsl(213, 50%, 40%)',
};

const AXIS_STYLE = { fontSize: 9, fill: 'hsl(0, 0%, 35%)' };
const GRID_COLOR = 'hsl(0, 0%, 100%, 0.04)';
const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(230, 20%, 12%)',
  border: '1px solid hsl(0, 0%, 100%, 0.1)',
  borderRadius: 6,
  fontSize: 11,
  color: 'hsl(0, 0%, 85%)',
};

const LEGEND_STYLE = { fontSize: 10, color: 'hsl(0, 0%, 55%)', paddingTop: 4 };

export function RevenueBreakdownChart({ title, data, height = 180 }: ChartPanelProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold mb-3 leading-snug">{title}</h3>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={0} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
            <XAxis dataKey="period" tick={AXIS_STYLE} angle={-45} textAnchor="end" height={50} />
            <YAxis tick={AXIS_STYLE} tickFormatter={v => fmtMM(v)} />
            <Tooltip formatter={(v: number, name: string) => [fmtMM(v), name]} contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={LEGEND_STYLE} />
            <Bar dataKey="recurring" name="Recurring" stackId="a" fill={COLORS.recurring}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.isProjected ? COLORS.projected : COLORS.recurring} />
              ))}
            </Bar>
            <Bar dataKey="nonRecurring" name="Non-Recurring" stackId="a" fill={COLORS.nonRecurring}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.isProjected ? 'hsl(213, 40%, 30%)' : COLORS.nonRecurring} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function RevenueVsExpensesChart({ title, data, height = 180 }: ChartPanelProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold mb-3 leading-snug">{title}</h3>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
            <XAxis dataKey="period" tick={AXIS_STYLE} angle={-45} textAnchor="end" height={50} />
            <YAxis tick={AXIS_STYLE} tickFormatter={v => fmtMM(v)} />
            <Tooltip formatter={(v: number, name: string) => [fmtMM(v), name]} contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={LEGEND_STYLE} />
            <Line type="monotone" dataKey="revenue" name="Revenue" stroke={COLORS.revenue} strokeWidth={1} dot={{ r: 2, fill: COLORS.revenue }} />
            <Line type="monotone" dataKey="expenses" name="Expenses" stroke={COLORS.expenses} strokeWidth={1} dot={{ r: 2, fill: COLORS.expenses }} strokeDasharray="5 5" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function EbitdaChart({ title, data, height = 180 }: ChartPanelProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold mb-3 leading-snug">{title}</h3>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
            <XAxis dataKey="period" tick={AXIS_STYLE} angle={-45} textAnchor="end" height={50} />
            <YAxis tick={AXIS_STYLE} tickFormatter={v => fmtMM(v)} />
            <Tooltip formatter={(v: number, name: string) => [fmtMM(v), name]} contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={LEGEND_STYLE} />
            <ReferenceLine y={0} stroke="hsl(0, 0%, 30%)" strokeDasharray="3 3" />
            <Bar dataKey="ebitda" name="EBITDA" radius={[2, 2, 0, 0]}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.isProjected ? COLORS.projected : COLORS.ebitda} />
              ))}
            </Bar>
            <Line type="monotone" dataKey="operating_income" name="Op. Income" stroke={COLORS.operating_income} strokeWidth={1} dot={{ r: 2, fill: COLORS.operating_income }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
