import { useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { QUARTERS_12 } from './bdRoiData';
import type { DashboardComputed } from './bdRoiFormulas';

const COLORS = {
  debt: '#0070C0',
  finServ: '#198754',
  other: '#6C757D',
  revenue: '#0070C0',
  costs: '#DC3545',
  margin: '#198754',
  marginPct: '#FFC107',
  roi: '#0070C0',
  runRate: '#DC3545',
  chandler: '#FFC107',
  dob: '#0070C0',
  signed: '#198754',
  closed: '#DC3545',
  partner: '#0070C0',
  bank: '#198754',
  profit: '#198754',
};

interface ChartGridProps {
  revenue: { debt: number[]; finServ: number[]; other: number[] };
  headcount: { debt: number[]; finServ: number[]; chandlerTyler: number[] };
  dealflow: { dobTotal: number[]; dsTotal: number[]; dcTotal: number[] };
  finPerf: { revPartner: number[]; revBank: number[] };
  computed: DashboardComputed;
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
    <div className="border border-[#CED4DA] rounded-lg bg-white p-3">
      <h4 className="text-[12px] font-semibold text-[#212529] mb-2">{title}</h4>
      <div className="h-[200px]">{children}</div>
    </div>
  );
}

const fmt = (v: number) => {
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v}`;
};

export function BDChartGrid({ revenue, headcount, dealflow, finPerf, computed }: ChartGridProps) {
  const q = QUARTERS_12;

  const revenueByChannel = useMemo(() => buildData(q,
    { key: 'Debt', data: revenue.debt },
    { key: 'FinServ', data: revenue.finServ },
    { key: 'Other', data: revenue.other },
  ), [revenue]);

  const revVsCosts = useMemo(() => buildData(q,
    { key: 'Revenue', data: computed.totalRevenue },
    { key: 'Costs', data: computed.totalCosts },
  ), [computed]);

  const marginData = useMemo(() => buildData(q,
    { key: 'Margin', data: computed.margin },
    { key: 'Margin %', data: computed.marginPct.map(v => v !== null ? v * 100 : null) },
  ), [computed]);

  const roiTrend = useMemo(() => buildData(q,
    { key: 'TTM ROI', data: computed.ttmROI },
  ), [computed]);

  const hcData = useMemo(() => buildData(q,
    { key: 'Debt', data: headcount.debt },
    { key: 'FinServ', data: headcount.finServ },
    { key: 'Chandler+Tyler', data: headcount.chandlerTyler },
  ), [headcount]);

  const cumProfit = useMemo(() => buildData(q,
    { key: 'Cumulative Profit', data: computed.allTimeProfit },
  ), [computed]);

  const dealflowData = useMemo(() => buildData(q,
    { key: 'DOB', data: dealflow.dobTotal },
    { key: 'Signed', data: dealflow.dsTotal },
    { key: 'Closed', data: dealflow.dcTotal },
  ), [dealflow]);

  const revGenerated = useMemo(() => buildData(q,
    { key: 'Partner', data: finPerf.revPartner },
    { key: 'Bank', data: finPerf.revBank },
  ), [finPerf]);

  const roiComparison = useMemo(() => buildData(q,
    { key: 'RunRate ROI', data: computed.runRateROI },
    { key: 'TTM ROI', data: computed.ttmROIWBonus },
  ), [computed]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
      <ChartCard title="Revenue by Channel">
        <ResponsiveContainer>
          <BarChart data={revenueByChannel}>
            <CartesianGrid strokeDasharray="3 3" stroke="#DEE2E6" />
            <XAxis dataKey="quarter" tick={{ fontSize: 9 }} />
            <YAxis tickFormatter={fmt} tick={{ fontSize: 9 }} />
            <Tooltip formatter={(v: number) => fmt(v)} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar dataKey="Debt" stackId="a" fill={COLORS.debt} />
            <Bar dataKey="FinServ" stackId="a" fill={COLORS.finServ} />
            <Bar dataKey="Other" stackId="a" fill={COLORS.other} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Revenue vs Costs">
        <ResponsiveContainer>
          <LineChart data={revVsCosts}>
            <CartesianGrid strokeDasharray="3 3" stroke="#DEE2E6" />
            <XAxis dataKey="quarter" tick={{ fontSize: 9 }} />
            <YAxis tickFormatter={fmt} tick={{ fontSize: 9 }} />
            <Tooltip formatter={(v: number) => fmt(v)} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Line type="monotone" dataKey="Revenue" stroke={COLORS.revenue} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Costs" stroke={COLORS.costs} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Margin & Margin %">
        <ResponsiveContainer>
          <ComposedChart data={marginData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#DEE2E6" />
            <XAxis dataKey="quarter" tick={{ fontSize: 9 }} />
            <YAxis yAxisId="left" tickFormatter={fmt} tick={{ fontSize: 9 }} />
            <YAxis yAxisId="right" orientation="right" tickFormatter={v => `${v}%`} tick={{ fontSize: 9 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar yAxisId="left" dataKey="Margin" fill={COLORS.margin} />
            <Line yAxisId="right" type="monotone" dataKey="Margin %" stroke={COLORS.marginPct} strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="TTM ROI Trend">
        <ResponsiveContainer>
          <LineChart data={roiTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#DEE2E6" />
            <XAxis dataKey="quarter" tick={{ fontSize: 9 }} />
            <YAxis tickFormatter={v => `${v?.toFixed(1)}x`} tick={{ fontSize: 9 }} />
            <Tooltip formatter={(v: number) => `${v?.toFixed(2)}x`} />
            <Line type="monotone" dataKey="TTM ROI" stroke={COLORS.roi} strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Headcount by Role">
        <ResponsiveContainer>
          <BarChart data={hcData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#DEE2E6" />
            <XAxis dataKey="quarter" tick={{ fontSize: 9 }} />
            <YAxis tickFormatter={fmt} tick={{ fontSize: 9 }} />
            <Tooltip formatter={(v: number) => fmt(v)} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar dataKey="Debt" stackId="a" fill={COLORS.debt} />
            <Bar dataKey="FinServ" stackId="a" fill={COLORS.finServ} />
            <Bar dataKey="Chandler+Tyler" stackId="a" fill={COLORS.chandler} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Cumulative Profit">
        <ResponsiveContainer>
          <AreaChart data={cumProfit}>
            <CartesianGrid strokeDasharray="3 3" stroke="#DEE2E6" />
            <XAxis dataKey="quarter" tick={{ fontSize: 9 }} />
            <YAxis tickFormatter={fmt} tick={{ fontSize: 9 }} />
            <Tooltip formatter={(v: number) => fmt(v)} />
            <Area type="monotone" dataKey="Cumulative Profit" fill={COLORS.profit} fillOpacity={0.3} stroke={COLORS.profit} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Dealflow Pipeline">
        <ResponsiveContainer>
          <BarChart data={dealflowData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#DEE2E6" />
            <XAxis dataKey="quarter" tick={{ fontSize: 9 }} />
            <YAxis tick={{ fontSize: 9 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar dataKey="DOB" fill={COLORS.dob} />
            <Bar dataKey="Signed" fill={COLORS.signed} />
            <Bar dataKey="Closed" fill={COLORS.closed} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Revenue Generated">
        <ResponsiveContainer>
          <BarChart data={revGenerated}>
            <CartesianGrid strokeDasharray="3 3" stroke="#DEE2E6" />
            <XAxis dataKey="quarter" tick={{ fontSize: 9 }} />
            <YAxis tickFormatter={fmt} tick={{ fontSize: 9 }} />
            <Tooltip formatter={(v: number) => fmt(v)} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar dataKey="Partner" stackId="a" fill={COLORS.partner} />
            <Bar dataKey="Bank" stackId="a" fill={COLORS.bank} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="RunRate ROI vs TTM ROI">
        <ResponsiveContainer>
          <LineChart data={roiComparison}>
            <CartesianGrid strokeDasharray="3 3" stroke="#DEE2E6" />
            <XAxis dataKey="quarter" tick={{ fontSize: 9 }} />
            <YAxis tickFormatter={v => `${v?.toFixed(1)}x`} tick={{ fontSize: 9 }} />
            <Tooltip formatter={(v: number) => `${v?.toFixed(2)}x`} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Line type="monotone" dataKey="RunRate ROI" stroke={COLORS.runRate} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="TTM ROI" stroke={COLORS.roi} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
