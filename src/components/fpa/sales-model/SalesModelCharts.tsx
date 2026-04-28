import { useSalesModelStore } from './useSalesModelStore';
import { getMonthLabels } from './salesModelFormatters';
import { X } from 'lucide-react';
import { useMemo } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ChartCard {
  title: string;
  type: 'bar' | 'line';
  series: { key: string; color: string; name: string }[];
  data: Record<string, number | string>[];
}

function buildTeamCharts(teamData: any, labels: string[]): ChartCard[] {
  const makeData = (keys: string[], arrays: number[][]) =>
    labels.map((l, i) => {
      const obj: Record<string, any> = { month: l };
      keys.forEach((k, ki) => { obj[k] = arrays[ki][i] ?? 0; });
      return obj;
    });

  return [
    {
      title: 'Deals & Dollars Signed',
      type: 'bar',
      series: [
        { key: 'clients', color: '#5eead4', name: 'Clients Signed' },
        { key: 'dollars', color: '#0d9488', name: 'Dollars Signed' },
      ],
      data: makeData(['clients', 'dollars'], [teamData.plan.clients_signed, teamData.plan.dollars_signed]),
    },
    {
      title: 'Total Revenue — Plan vs Actual',
      type: 'line',
      series: [
        { key: 'plan', color: '#5eead4', name: 'Plan' },
        { key: 'actual', color: '#34d399', name: 'Actual/Forecast' },
      ],
      data: makeData(['plan', 'actual'], [teamData.revenue.total, teamData.actuals_forecast_section.total_revenue]),
    },
    {
      title: 'TTM Revenue',
      type: 'line',
      series: [
        { key: 'plan', color: '#5eead4', name: 'Plan TTM' },
        { key: 'actual', color: '#34d399', name: 'Actual TTM' },
      ],
      data: makeData(['plan', 'actual'], [teamData.ttm_revenue, teamData.ttm_revenue_row121]),
    },
    {
      title: 'YTD Revenue',
      type: 'line',
      series: [
        { key: 'plan', color: '#5eead4', name: 'Plan YTD' },
        { key: 'actual', color: '#fbbf24', name: 'Actual YTD' },
      ],
      data: makeData(['plan', 'actual'], [teamData.ytd_revenue, teamData.ytd_actual_revenue]),
    },
    {
      title: 'TTM ROI Multiple',
      type: 'line',
      series: [
        { key: 'plan', color: '#5eead4', name: 'Plan' },
        { key: 'actual', color: '#f87171', name: 'Actual' },
      ],
      data: makeData(['plan', 'actual'], [teamData.ttm_rep_roi_multiple, teamData.sales_team_roi.ttm_multiple]),
    },
    {
      title: 'Deals Closed & Dollars Funded',
      type: 'bar',
      series: [
        { key: 'closed', color: '#34d399', name: 'Deals Closed' },
        { key: 'funded', color: '#0d9488', name: 'Dollars Funded' },
      ],
      data: makeData(['closed', 'funded'], [teamData.plan.deals_closed, teamData.plan.dollars_funded]),
    },
    {
      title: 'Net Rep Profit',
      type: 'line',
      series: [
        { key: 'profit', color: '#34d399', name: 'Net Profit' },
      ],
      data: makeData(['profit'], [teamData.net_rep_profit]),
    },
    {
      title: 'Rep Cost vs Revenue',
      type: 'line',
      series: [
        { key: 'revenue', color: '#5eead4', name: 'Revenue' },
        { key: 'cost', color: '#f87171', name: 'Cost' },
      ],
      data: makeData(['revenue', 'cost'], [teamData.revenue.total, teamData.rep_cost.total]),
    },
  ];
}

export function SalesModelCharts() {
  const { chartsOpen, toggleCharts, activeTab, teamData, repsData } = useSalesModelStore();
  const labels = useMemo(() => getMonthLabels(), []);

  if (!chartsOpen) return null;

  const data = activeTab === 'TEAM' ? teamData : repsData[activeTab];
  if (!data) return null;

  const charts = buildTeamCharts(
    activeTab === 'TEAM' ? data : {
      ...data,
      revenue: {
        retainer: (data as any).revenue?.retainer_revenue ?? (data as any).revenue?.retainer,
        consulting_milestone: (data as any).revenue?.consulting__milestone_revenue ?? (data as any).revenue?.consulting_milestone,
        fee: (data as any).revenue?.fee_revenue ?? (data as any).revenue?.fee,
        total: (data as any).revenue?.total_revenue ?? (data as any).revenue?.total,
      },
      rep_cost: {
        ...data.rep_cost,
        total: (data as any).rep_cost?.total_rep_cost ?? (data as any).rep_cost?.total,
      },
    },
    labels,
  );

  return (
    <div className="h-full border-l flex flex-col" style={{
      width: 520, background: '#13151c', borderColor: 'rgba(255,255,255,0.06)',
    }}>
      <div className="flex items-center justify-between p-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <span className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>Charts — {activeTab}</span>
        <button onClick={toggleCharts} className="p-1 rounded hover:bg-white/10">
          <X className="h-4 w-4" style={{ color: '#94a3b8' }} />
        </button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {charts.map((chart, idx) => (
            <div key={idx} className="rounded-lg p-3 border" style={{
              background: '#1e2230', borderColor: 'rgba(255,255,255,0.06)',
            }}>
              <div className="text-[11px] font-semibold mb-3" style={{ color: '#e2e8f0' }}>{chart.title}</div>
              <ResponsiveContainer width="100%" height={180}>
                {chart.type === 'bar' ? (
                  <BarChart data={chart.data.filter((_, i) => i % 3 === 0)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 9, fill: '#64748b' }} />
                    <Tooltip
                      contentStyle={{ background: '#1e2230', border: '1px solid rgba(255,255,255,0.1)', fontSize: 11 }}
                      labelStyle={{ color: '#94a3b8' }}
                    />
                    {chart.series.map(s => (
                      <Bar key={s.key} dataKey={s.key} fill={s.color} name={s.name} radius={[3, 3, 0, 0]} maxBarSize={32} />
                    ))}
                  </BarChart>
                ) : (
                  <LineChart data={chart.data.filter((_, i) => i % 3 === 0)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 9, fill: '#64748b' }} />
                    <Tooltip
                      contentStyle={{ background: '#1e2230', border: '1px solid rgba(255,255,255,0.1)', fontSize: 11 }}
                      labelStyle={{ color: '#94a3b8' }}
                    />
                    {chart.series.map(s => (
                      <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} name={s.name} strokeWidth={1} dot={{ r: 2 }} />
                    ))}
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
