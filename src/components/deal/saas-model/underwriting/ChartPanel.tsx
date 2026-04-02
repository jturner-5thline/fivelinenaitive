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
  recurring: '#1e40af',
  nonRecurring: '#60a5fa',
  revenue: '#1e40af',
  expenses: '#dc2626',
  ebitda: '#1e40af',
  operating_income: '#059669',
  projected: '#93c5fd',
};

export function RevenueBreakdownChart({ title, data, height = 220 }: ChartPanelProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-sm p-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">{title}</h3>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={0} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="period" tick={{ fontSize: 8, fill: '#64748b' }} angle={-45} textAnchor="end" height={50} />
            <YAxis tick={{ fontSize: 9, fill: '#64748b' }} tickFormatter={v => fmtMM(v)} />
            <Tooltip
              formatter={(v: number, name: string) => [fmtMM(v), name]}
              contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 2, fontSize: 11 }}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar dataKey="recurring" name="Recurring" stackId="a" fill={COLORS.recurring}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.isProjected ? '#93c5fd' : COLORS.recurring} />
              ))}
            </Bar>
            <Bar dataKey="nonRecurring" name="Non-Recurring" stackId="a" fill={COLORS.nonRecurring}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.isProjected ? '#bfdbfe' : COLORS.nonRecurring} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function RevenueVsExpensesChart({ title, data, height = 220 }: ChartPanelProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-sm p-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">{title}</h3>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="period" tick={{ fontSize: 9, fill: '#64748b' }} angle={-45} textAnchor="end" height={50} />
            <YAxis tick={{ fontSize: 9, fill: '#64748b' }} tickFormatter={v => fmtMM(v)} />
            <Tooltip
              formatter={(v: number, name: string) => [fmtMM(v), name]}
              contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 2, fontSize: 11 }}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Line type="monotone" dataKey="revenue" name="Revenue" stroke={COLORS.revenue} strokeWidth={2} dot={{ r: 2 }} />
            <Line type="monotone" dataKey="expenses" name="Expenses" stroke={COLORS.expenses} strokeWidth={2} dot={{ r: 2 }} strokeDasharray="5 5" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function EbitdaChart({ title, data, height = 220 }: ChartPanelProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-sm p-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">{title}</h3>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="period" tick={{ fontSize: 9, fill: '#64748b' }} angle={-45} textAnchor="end" height={50} />
            <YAxis tick={{ fontSize: 9, fill: '#64748b' }} tickFormatter={v => fmtMM(v)} />
            <Tooltip
              formatter={(v: number, name: string) => [fmtMM(v), name]}
              contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 2, fontSize: 11 }}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
            <Bar dataKey="ebitda" name="EBITDA" radius={[2, 2, 0, 0]}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.isProjected ? '#93c5fd' : COLORS.ebitda} />
              ))}
            </Bar>
            <Line type="monotone" dataKey="operating_income" name="Op. Income" stroke={COLORS.operating_income} strokeWidth={2} dot={{ r: 2 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
