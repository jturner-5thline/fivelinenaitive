import { useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { QUARTERS_12 } from './bdRoiData';
import type { DashboardComputed } from './bdRoiFormulas';

const COLORS = {
  debt: '#60a5fa',
  finServ: '#34d399',
  other: '#94a3b8',
  revenue: '#60a5fa',
  costs: '#f87171',
  margin: '#34d399',
  marginPct: '#fbbf24',
  roi: '#60a5fa',
  runRate: '#f87171',
  chandler: '#fbbf24',
  dob: '#60a5fa',
  signed: '#34d399',
  closed: '#f87171',
  partner: '#60a5fa',
  bank: '#34d399',
  profit: '#34d399',
};

const GRID_STROKE = 'hsl(var(--border) / 0.3)';
const AXIS_TICK = { fontSize: 9, fill: 'hsl(var(--muted-foreground))' };
const LEGEND_STYLE = { fontSize: 10, color: 'hsl(var(--muted-foreground))' };

interface ChartGridProps {
  revenue: { debt: number[]; finServ: number[]; other: number[] };
  headcount: { debt: number[]; finServ: number[]; chandlerTyler: number[] };
  dealflow: { dobTotal: number[]; dsTotal: number[]; dcTotal: number[] };
  finPerf: { revPartner: number[]; revBank: number[] };
  computed: DashboardComputed;
  visibleQuarters?: Set<string>;
}

function buildData(quarters: string[], ...arrays: { key: string; data: (number | null)[] }[]) {
  return quarters.map((q, i) => {
    const obj: any = { quarter: q };
    arrays.forEach(a => { obj[a.key] = a.data[i]; });
    return obj;
  });
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-border/50 rounded-lg bg-card p-3">
      <h4 className="text-[12px] font-semibold text-foreground mb-2">{title}</h4>
      <div className="h-[200px]">{children}</div>
    </div>
  );
}

const fmt = (v: number) => {
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v}`;
};

const tooltipStyle = {
  contentStyle: {
    backgroundColor: 'hsl(222 47% 11%)',
    border: '1px solid hsl(var(--border))',
    borderRadius: '8px',
    color: 'hsl(var(--foreground))',
    fontSize: 11,
  },
};

export function BDChartGrid({ revenue, headcount, dealflow, finPerf, computed, visibleQuarters }: ChartGridProps) {
  const q = visibleQuarters
    ? QUARTERS_12.filter(qt => visibleQuarters.has(qt))
    : QUARTERS_12;
  const vi = visibleQuarters
    ? QUARTERS_12.map((qt, i) => visibleQuarters.has(qt) ? i : -1).filter(i => i !== -1)
    : QUARTERS_12.map((_, i) => i);
  
  const filterArr = (arr: (number | null)[]) => vi.map(i => arr[i]);

  const revenueByChannel = useMemo(() => buildData(q,
    { key: 'Debt', data: filterArr(revenue.debt) },
    { key: 'FinServ', data: filterArr(revenue.finServ) },
    { key: 'Other', data: filterArr(revenue.other) },
  ), [revenue, q]);

  const revVsCosts = useMemo(() => buildData(q,
    { key: 'Revenue', data: filterArr(computed.totalRevenue) },
    { key: 'Costs', data: filterArr(computed.totalCosts) },
  ), [computed, q]);

  const marginData = useMemo(() => buildData(q,
    { key: 'Margin', data: filterArr(computed.margin) },
    { key: 'Margin %', data: filterArr(computed.marginPct.map(v => v !== null ? v * 100 : null)) },
  ), [computed, q]);

  const roiTrend = useMemo(() => buildData(q,
    { key: 'TTM ROI', data: filterArr(computed.ttmROI) },
  ), [computed, q]);

  const hcData = useMemo(() => buildData(q,
    { key: 'Debt', data: filterArr(headcount.debt) },
    { key: 'FinServ', data: filterArr(headcount.finServ) },
    { key: 'Chandler+Tyler', data: filterArr(headcount.chandlerTyler) },
  ), [headcount, q]);

  const cumProfit = useMemo(() => buildData(q,
    { key: 'Cumulative Profit', data: filterArr(computed.allTimeProfit) },
  ), [computed, q]);

  const dealflowData = useMemo(() => buildData(q,
    { key: 'DOB', data: filterArr(dealflow.dobTotal) },
    { key: 'Signed', data: filterArr(dealflow.dsTotal) },
    { key: 'Closed', data: filterArr(dealflow.dcTotal) },
  ), [dealflow, q]);

  const revGenerated = useMemo(() => buildData(q,
    { key: 'Partner', data: filterArr(finPerf.revPartner) },
    { key: 'Bank', data: filterArr(finPerf.revBank) },
  ), [finPerf, q]);

  const roiComparison = useMemo(() => buildData(q,
    { key: 'RunRate ROI', data: filterArr(computed.runRateROI) },
    { key: 'TTM ROI', data: filterArr(computed.ttmROIWBonus) },
  ), [computed, q]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
      <ChartCard title="Revenue by Channel">
        <ResponsiveContainer>
          <BarChart data={revenueByChannel}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="quarter" tick={AXIS_TICK} />
            <YAxis tickFormatter={fmt} tick={AXIS_TICK} />
            <Tooltip formatter={(v: number) => fmt(v)} {...tooltipStyle} />
            <Legend wrapperStyle={LEGEND_STYLE} />
            <Bar dataKey="Debt" stackId="a" fill={COLORS.debt} />
            <Bar dataKey="FinServ" stackId="a" fill={COLORS.finServ} />
            <Bar dataKey="Other" stackId="a" fill={COLORS.other} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Revenue vs Costs">
        <ResponsiveContainer>
          <LineChart data={revVsCosts}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="quarter" tick={AXIS_TICK} />
            <YAxis tickFormatter={fmt} tick={AXIS_TICK} />
            <Tooltip formatter={(v: number) => fmt(v)} {...tooltipStyle} />
            <Legend wrapperStyle={LEGEND_STYLE} />
            <Line type="monotone" dataKey="Revenue" stroke={COLORS.revenue} strokeWidth={1} dot={false} />
            <Line type="monotone" dataKey="Costs" stroke={COLORS.costs} strokeWidth={1} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Margin & Margin %">
        <ResponsiveContainer>
          <ComposedChart data={marginData}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="quarter" tick={AXIS_TICK} />
            <YAxis yAxisId="left" tickFormatter={fmt} tick={AXIS_TICK} />
            <YAxis yAxisId="right" orientation="right" tickFormatter={v => `${v}%`} tick={AXIS_TICK} />
            <Tooltip {...tooltipStyle} />
            <Legend wrapperStyle={LEGEND_STYLE} />
            <Bar yAxisId="left" dataKey="Margin" fill={COLORS.margin} />
            <Line yAxisId="right" type="monotone" dataKey="Margin %" stroke={COLORS.marginPct} strokeWidth={1} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="TTM ROI Trend">
        <ResponsiveContainer>
          <LineChart data={roiTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="quarter" tick={AXIS_TICK} />
            <YAxis tickFormatter={v => `${v?.toFixed(1)}x`} tick={AXIS_TICK} />
            <Tooltip formatter={(v: number) => `${v?.toFixed(2)}x`} {...tooltipStyle} />
            <Line type="monotone" dataKey="TTM ROI" stroke={COLORS.roi} strokeWidth={1} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Headcount by Role">
        <ResponsiveContainer>
          <BarChart data={hcData}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="quarter" tick={AXIS_TICK} />
            <YAxis tickFormatter={fmt} tick={AXIS_TICK} />
            <Tooltip formatter={(v: number) => fmt(v)} {...tooltipStyle} />
            <Legend wrapperStyle={LEGEND_STYLE} />
            <Bar dataKey="Debt" stackId="a" fill={COLORS.debt} />
            <Bar dataKey="FinServ" stackId="a" fill={COLORS.finServ} />
            <Bar dataKey="Chandler+Tyler" stackId="a" fill={COLORS.chandler} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Cumulative Profit">
        <ResponsiveContainer>
          <AreaChart data={cumProfit}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="quarter" tick={AXIS_TICK} />
            <YAxis tickFormatter={fmt} tick={AXIS_TICK} />
            <Tooltip formatter={(v: number) => fmt(v)} {...tooltipStyle} />
            <Area type="monotone" dataKey="Cumulative Profit" fill={COLORS.profit} fillOpacity={0.2} stroke={COLORS.profit} strokeWidth={1} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Dealflow Pipeline">
        <ResponsiveContainer>
          <BarChart data={dealflowData}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="quarter" tick={AXIS_TICK} />
            <YAxis tick={AXIS_TICK} />
            <Tooltip {...tooltipStyle} />
            <Legend wrapperStyle={LEGEND_STYLE} />
            <Bar dataKey="DOB" fill={COLORS.dob} />
            <Bar dataKey="Signed" fill={COLORS.signed} />
            <Bar dataKey="Closed" fill={COLORS.closed} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Revenue Generated">
        <ResponsiveContainer>
          <BarChart data={revGenerated}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="quarter" tick={AXIS_TICK} />
            <YAxis tickFormatter={fmt} tick={AXIS_TICK} />
            <Tooltip formatter={(v: number) => fmt(v)} {...tooltipStyle} />
            <Legend wrapperStyle={LEGEND_STYLE} />
            <Bar dataKey="Partner" stackId="a" fill={COLORS.partner} />
            <Bar dataKey="Bank" stackId="a" fill={COLORS.bank} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="RunRate ROI vs TTM ROI">
        <ResponsiveContainer>
          <LineChart data={roiComparison}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="quarter" tick={AXIS_TICK} />
            <YAxis tickFormatter={v => `${v?.toFixed(1)}x`} tick={AXIS_TICK} />
            <Tooltip formatter={(v: number) => `${v?.toFixed(2)}x`} {...tooltipStyle} />
            <Legend wrapperStyle={LEGEND_STYLE} />
            <Line type="monotone" dataKey="RunRate ROI" stroke={COLORS.runRate} strokeWidth={1} dot={false} />
            <Line type="monotone" dataKey="TTM ROI" stroke={COLORS.roi} strokeWidth={1} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
