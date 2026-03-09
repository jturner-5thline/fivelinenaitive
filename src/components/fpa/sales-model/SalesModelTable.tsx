import { useMemo, useRef } from 'react';
import { useSalesModelStore } from './useSalesModelStore';
import { formatDollar, formatCount, formatPct, formatMultiple, getMonthLabels, getYears, getQuarters, getActualsForecast, aggregateToQuarterly, getQuarterLabels } from './salesModelFormatters';
import type { TeamData, RepData } from './salesModelTypes';
import { ScrollArea } from '@/components/ui/scroll-area';

type Fmt = 'dollar' | 'count' | 'pct' | 'multiple';

interface RowDef {
  label: string;
  data: number[];
  format: Fmt;
  bold?: boolean;
  indent?: boolean;
  colorCode?: 'variance' | 'performance';
  aggregation?: 'sum' | 'last';
}

interface SectionDef {
  id: string;
  title: string;
  rows: RowDef[];
}

function fmtValue(v: number, fmt: Fmt): string {
  if (fmt === 'dollar') return formatDollar(v);
  if (fmt === 'count') return formatCount(v);
  if (fmt === 'pct') return formatPct(v);
  if (fmt === 'multiple') return formatMultiple(v);
  return String(v);
}

function getVarianceColor(v: number): string {
  if (v > 0) return '#34d399';
  if (v < 0) return '#f87171';
  return '#64748b';
}

function getPerfColor(v: number): string {
  if (v > 1) return '#34d399';
  if (v >= 0.8) return '#fbbf24';
  if (v > 0 && v < 0.8) return '#f87171';
  return '#64748b';
}

function buildTeamSections(data: TeamData): SectionDef[] {
  const p = data.plan;
  const ps = data.pipeline_snapshot;
  const r = data.revenue;
  const rc = data.rep_cost;
  const af = data.actuals_forecast_section;
  const vd = data.variance_dollar;
  const vp = data.variance_pct;
  const roi = data.sales_team_roi;
  const ptp = data.perf_to_plan;

  return [
    {
      id: 'plan', title: 'PLAN', rows: [
        { label: 'Deals on Board', data: p.deals_on_board, format: 'count' },
        { label: 'Dollars on Board', data: p.dollars_on_board, format: 'dollar' },
        { label: 'Proposals Issued', data: p.proposals_issued, format: 'count' },
        { label: 'Dollars Proposed', data: p.dollars_proposed, format: 'dollar' },
        { label: 'Clients Signed', data: p.clients_signed, format: 'count' },
        { label: 'Dollars Signed', data: p.dollars_signed, format: 'dollar' },
        { label: 'Clients Receiving Terms', data: p.clients_receiving_terms, format: 'count' },
        { label: 'Terms Signed', data: p.terms_signed, format: 'count' },
        { label: 'Volume Terms Signed', data: p.volume_terms_signed, format: 'dollar' },
        { label: 'Deals Closed', data: p.deals_closed, format: 'count' },
        { label: 'Dollars Funded', data: p.dollars_funded, format: 'dollar' },
      ],
    },
    {
      id: 'pipeline-snapshot', title: 'PIPELINE SNAPSHOT', rows: [
        { label: 'Deals in Dev', data: ps.deals_in_dev, format: 'count' },
        { label: 'Dollars in Dev', data: ps.dollars_in_dev, format: 'dollar' },
        { label: 'Active Deals', data: ps.active_deals, format: 'count' },
        { label: 'Active Deal Volume', data: ps.active_deal_volume, format: 'dollar' },
        { label: 'Deals in Diligence', data: ps.deals_in_diligence, format: 'count' },
        { label: 'Dollars in Diligence', data: ps.dollars_in_diligence, format: 'dollar' },
      ],
    },
    {
      id: 'revenue', title: 'REVENUE', rows: [
        { label: 'Retainer', data: r.retainer, format: 'dollar' },
        { label: 'Consulting / Milestone', data: r.consulting_milestone, format: 'dollar' },
        { label: 'Fee', data: r.fee, format: 'dollar' },
        { label: 'Total Revenue', data: r.total, format: 'dollar', bold: true },
      ],
    },
    {
      id: 'ttm-revenue', title: 'TTM REVENUE', rows: [
        { label: 'TTM Revenue', data: data.ttm_revenue, format: 'dollar', aggregation: 'last' },
      ],
    },
    {
      id: 'ytd-revenue', title: 'YTD REVENUE', rows: [
        { label: 'YTD Revenue', data: data.ytd_revenue, format: 'dollar', aggregation: 'last' },
      ],
    },
    {
      id: 'msql', title: 'MSQL', rows: [
        { label: 'MSQL', data: data.msql, format: 'count' },
      ],
    },
    {
      id: 'revenue-signed-up', title: 'REVENUE SIGNED UP', rows: [
        { label: 'Revenue Signed Up', data: data.revenue_signed_up, format: 'dollar' },
      ],
    },
    {
      id: 'rep-cost', title: 'REP COST', rows: [
        { label: 'Salary', data: rc.salary, format: 'dollar' },
        { label: 'Burden Rate', data: rc.burden_rate, format: 'dollar' },
        { label: '401(k)', data: rc.four01k, format: 'dollar' },
        { label: 'T&E', data: rc.t_and_e, format: 'dollar' },
        { label: 'Commissions', data: rc.commissions, format: 'dollar' },
        { label: 'Bonus Pool', data: rc.bonus_pool, format: 'dollar' },
        { label: 'Total Rep Cost', data: rc.total, format: 'dollar', bold: true },
      ],
    },
    {
      id: 'net-rep-profit', title: 'NET REP PROFIT', rows: [
        { label: 'Next 12 Bonus', data: data.next_12_bonus, format: 'dollar', aggregation: 'last' },
        { label: 'Net Rep Profit', data: data.net_rep_profit, format: 'dollar', bold: true },
      ],
    },
    {
      id: 'all-time-metrics', title: 'ALL-TIME REP METRICS', rows: [
        { label: 'All-Time Revenue', data: data.all_time_rep_revenue, format: 'dollar', aggregation: 'last' },
        { label: 'All-Time Cost', data: data.all_time_rep_cost, format: 'dollar', aggregation: 'last' },
        { label: 'All-Time Profit', data: data.all_time_rep_profit, format: 'dollar', aggregation: 'last' },
        { label: 'All-Time ROI %', data: data.all_time_rep_roi_pct, format: 'pct', aggregation: 'last' },
        { label: 'All-Time ROI Multiple', data: data.all_time_rep_roi_multiple, format: 'multiple', aggregation: 'last' },
      ],
    },
    {
      id: 'ttm-metrics', title: 'TTM METRICS', rows: [
        { label: 'TTM Revenue', data: data.ttm_revenue_row63, format: 'dollar', aggregation: 'last' },
        { label: 'TTM Cost', data: data.ttm_cost, format: 'dollar', aggregation: 'last' },
        { label: 'TTM Rep Profit', data: data.ttm_rep_profit, format: 'dollar', aggregation: 'last' },
        { label: 'TTM ROI %', data: data.ttm_rep_roi_pct, format: 'pct', aggregation: 'last' },
        { label: 'TTM ROI Multiple', data: data.ttm_rep_roi_multiple, format: 'multiple', aggregation: 'last' },
      ],
    },
    {
      id: 'actuals-input', title: 'ACTUALS INPUT', rows: [
        { label: 'Deals on Board', data: data.actuals_input.deals_on_board, format: 'count' },
        { label: 'Dollars on Board', data: data.actuals_input.dollars_on_board, format: 'dollar' },
        { label: 'Proposals Issued', data: data.actuals_input.proposals_issued, format: 'count' },
        { label: 'Dollars Proposed', data: data.actuals_input.dollars_proposed, format: 'dollar' },
        { label: 'Clients Signed', data: data.actuals_input.clients_signed, format: 'count' },
        { label: 'Dollars Signed', data: data.actuals_input.dollars_signed, format: 'dollar' },
        { label: 'Clients Rec. Terms', data: data.actuals_input.clients_receiving_terms, format: 'count' },
        { label: 'Terms Signed', data: data.actuals_input.terms_signed, format: 'count' },
        { label: 'Vol. Terms Signed', data: data.actuals_input.volume_terms_signed, format: 'dollar' },
        { label: 'Deals Closed', data: data.actuals_input.deals_closed, format: 'count' },
        { label: 'Dollars Funded', data: data.actuals_input.dollars_funded, format: 'dollar' },
        { label: 'Retainer', data: data.actuals_input.retainer, format: 'dollar' },
        { label: 'Consulting / Milestone', data: data.actuals_input.consulting_milestone, format: 'dollar' },
        { label: 'Fee', data: data.actuals_input.fee, format: 'dollar' },
        { label: 'Total Revenue', data: data.actuals_input.total_revenue, format: 'dollar', bold: true },
      ],
    },
    {
      id: 'actuals-forecast', title: 'ACTUALS / FORECAST', rows: [
        { label: 'Deals on Board', data: af.deals_on_board, format: 'count' },
        { label: 'Dollars on Board', data: af.dollars_on_board, format: 'dollar' },
        { label: 'Proposals Issued', data: af.proposals_issued, format: 'count' },
        { label: 'Dollars Proposed', data: af.dollars_proposed, format: 'dollar' },
        { label: 'Clients Signed', data: af.clients_signed, format: 'count' },
        { label: 'Dollars Signed', data: af.dollars_signed, format: 'dollar' },
        { label: 'Clients Rec. Terms', data: af.clients_receiving_terms, format: 'count' },
        { label: 'Terms Signed', data: af.terms_signed, format: 'count' },
        { label: 'Vol. Terms Signed', data: af.volume_terms_signed, format: 'dollar' },
        { label: 'Deals Closed', data: af.deals_closed, format: 'count' },
        { label: 'Dollars Funded', data: af.dollars_funded, format: 'dollar' },
        { label: 'Retainer', data: af.retainer, format: 'dollar' },
        { label: 'Consulting / Milestone', data: af.consulting_milestone, format: 'dollar' },
        { label: 'Fee', data: af.fee, format: 'dollar' },
        { label: 'Total Revenue', data: af.total_revenue, format: 'dollar', bold: true },
        { label: 'Total Pipeline Count', data: data.total_sales_pipeline_count, format: 'count' },
        { label: 'Total Pipeline $', data: data.total_sales_pipeline_dollars, format: 'dollar' },
        { label: 'MSQL', data: data.msql_row115, format: 'count' },
        { label: 'Revenue Signed Up', data: data.revenue_signed_up_row117, format: 'dollar' },
        { label: 'YTD Actual Revenue', data: data.ytd_actual_revenue, format: 'dollar', aggregation: 'last' },
        { label: 'All-Time Actual Rev', data: data.all_time_actual_revenue, format: 'dollar', aggregation: 'last' },
        { label: 'TTM Revenue', data: data.ttm_revenue_row121, format: 'dollar', aggregation: 'last' },
      ],
    },
    {
      id: 'actuals-pipeline', title: 'PIPELINE (ACTUALS)', rows: [
        { label: 'Deals in Dev', data: data.actuals_pipeline.deals_in_dev, format: 'count' },
        { label: 'Dollars in Dev', data: data.actuals_pipeline.dollars_in_dev, format: 'dollar' },
        { label: 'Active Deals', data: data.actuals_pipeline.active_deals, format: 'count' },
        { label: 'Active Deal Volume', data: data.actuals_pipeline.active_deal_volume, format: 'dollar' },
        { label: 'Deals in Diligence', data: data.actuals_pipeline.deals_in_diligence, format: 'count' },
        { label: 'Dollars in Diligence', data: data.actuals_pipeline.dollars_in_diligence, format: 'dollar' },
      ],
    },
    {
      id: 'variance-$', title: 'VARIANCE $', rows: Object.entries(vd).map(([key, arr]) => ({
        label: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        data: arr,
        format: key.includes('dollar') || key.includes('revenue') || key.includes('fee') || key.includes('retainer') || key.includes('consulting') || key.includes('volume') || key.includes('funded') || key.includes('signed') && key.includes('dollar') ? 'dollar' as Fmt : 'count' as Fmt,
        colorCode: 'variance' as const,
      })),
    },
    {
      id: 'variance-%', title: 'VARIANCE %', rows: Object.entries(vp).map(([key, arr]) => ({
        label: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        data: arr,
        format: 'pct' as Fmt,
        colorCode: 'variance' as const,
      })),
    },
    {
      id: 'total-costs', title: 'TOTAL COSTS', rows: [
        { label: 'Total Costs', data: data.total_costs, format: 'dollar', bold: true },
      ],
    },
    {
      id: 'sales-team-roi', title: 'SALES TEAM ROI', rows: [
        { label: 'Profit', data: roi.profit, format: 'dollar' },
        { label: 'YTD Profit', data: roi.ytd_profit, format: 'dollar', aggregation: 'last' },
        { label: 'TTM Profit', data: roi.ttm_profit, format: 'dollar', aggregation: 'last' },
        { label: 'All-Time Profit', data: roi.all_time_profit, format: 'dollar', aggregation: 'last' },
        { label: 'TTM ROI', data: roi.ttm_roi, format: 'pct', aggregation: 'last' },
        { label: 'All-Time ROI', data: roi.all_time_roi, format: 'pct', aggregation: 'last' },
        { label: 'TTM Multiple', data: roi.ttm_multiple, format: 'multiple', aggregation: 'last' },
        { label: 'All-Time Multiple', data: roi.all_time_multiple, format: 'multiple', aggregation: 'last' },
      ],
    },
    {
      id: 'performance-to-plan', title: 'PERFORMANCE TO PLAN', rows: Object.entries(ptp).map(([key, arr]) => ({
        label: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        data: arr,
        format: 'pct' as Fmt,
        colorCode: 'performance' as const,
      })),
    },
  ];
}

function buildRepSections(data: RepData): SectionDef[] {
  const rev = data.revenue;
  const rc = data.rep_cost;
  const roi = data.sales_rep_roi;

  // Reuse team section builder pattern with rep-specific keys
  const sections = buildTeamSections({
    ...data as any,
    revenue: {
      retainer: rev.retainer_revenue,
      consulting_milestone: rev.consulting__milestone_revenue,
      fee: rev.fee_revenue,
      total: rev.total_revenue,
    },
    rep_cost: {
      salary: rc.salary,
      burden_rate: rc.burden_rate,
      four01k: rc['401k'],
      t_and_e: rc.tande,
      commissions: rc.commissions,
      bonus_pool: rc.bonus_pool,
      total: rc.total_rep_cost,
    },
    sales_team_roi: roi,
  } as TeamData);

  // Rename ROI section
  const roiIdx = sections.findIndex(s => s.id === 'sales-team-roi');
  if (roiIdx >= 0) sections[roiIdx].title = 'SALES REP ROI';

  return sections;
}

export function SalesModelTable() {
  const { activeTab, viewMode, activeYears, activeQuarters, teamData, repsData } = useSalesModelStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  const monthLabels = useMemo(() => getMonthLabels(), []);
  const quarterLabels = useMemo(() => getQuarterLabels(), []);
  const years = useMemo(() => getYears(), []);
  const quarters = useMemo(() => getQuarters(), []);
  const actualsForecasts = useMemo(() => getActualsForecast(), []);

  const sections = useMemo(() => {
    if (activeTab === 'TEAM') return buildTeamSections(teamData);
    const repData = repsData[activeTab];
    if (repData) return buildRepSections(repData);
    return buildTeamSections(teamData);
  }, [activeTab, teamData, repsData]);

  // Determine visible column indices
  const visibleIndices = useMemo(() => {
    if (viewMode === 'monthly') {
      return Array.from({ length: 36 }, (_, i) => i).filter(i => {
        const y = years[i];
        const q = quarters[i].split('-')[0]; // "Q1"
        return activeYears.has(y) && activeQuarters.has(q);
      });
    }
    // Quarterly: 15 columns (5 per year)
    return Array.from({ length: 15 }, (_, i) => i).filter(i => {
      const yearIdx = Math.floor(i / 5);
      const y = 2025 + yearIdx;
      const qIdx = i % 5;
      if (qIdx === 4) return activeYears.has(y); // Full Year always shows if year active
      const q = `Q${qIdx + 1}`;
      return activeYears.has(y) && activeQuarters.has(q);
    });
  }, [viewMode, activeYears, activeQuarters, years, quarters]);

  const colWidth = viewMode === 'monthly' ? 80 : 100;

  return (
    <div ref={scrollRef} className="flex-1 overflow-auto" style={{ background: '#0f1117' }}>
      <div style={{ minWidth: 200 + visibleIndices.length * colWidth }}>
        {/* Header rows */}
        <div className="sticky top-0" style={{ zIndex: 10 }}>
          {/* Year row */}
          {viewMode === 'monthly' && (
            <div className="flex" style={{ background: '#181b24' }}>
              <div className="shrink-0 sticky left-0" style={{ width: 200, zIndex: 11, background: '#181b24', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="h-7" />
              </div>
              {[2025, 2026, 2027].map(y => {
                const count = visibleIndices.filter(i => years[i] === y).length;
                if (count === 0) return null;
                return (
                  <div key={y} className="text-center text-[10px] font-semibold h-7 flex items-center justify-center border-b" style={{
                    width: count * colWidth, color: '#94a3b8', borderColor: 'rgba(255,255,255,0.06)',
                  }}>
                    {y}
                  </div>
                );
              })}
            </div>
          )}

          {/* Actuals/Forecast row */}
          {viewMode === 'monthly' && (
            <div className="flex" style={{ background: '#181b24' }}>
              <div className="shrink-0 sticky left-0" style={{ width: 200, zIndex: 11, background: '#181b24', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="h-6" />
              </div>
              {visibleIndices.map(i => (
                <div key={i} className="text-center text-[9px] h-6 flex items-center justify-center" style={{
                  width: colWidth,
                  color: actualsForecasts[i] === 'Actuals' ? '#5eead4' : '#64748b',
                }}>
                  {actualsForecasts[i]}
                </div>
              ))}
            </div>
          )}

          {/* Month/Quarter labels */}
          <div className="flex border-b" style={{ background: '#181b24', borderColor: 'rgba(255,255,255,0.1)' }}>
            <div className="shrink-0 sticky left-0 flex items-center px-3 text-[11px] font-semibold h-8" style={{
              width: 200, zIndex: 11, background: '#181b24', color: '#94a3b8',
              borderRight: '1px solid rgba(255,255,255,0.06)',
            }}>
              Metric
            </div>
            {visibleIndices.map(i => (
              <div key={i} className="text-center text-[10px] font-medium h-8 flex items-center justify-center" style={{
                width: colWidth, color: '#94a3b8',
              }}>
                {viewMode === 'monthly' ? monthLabels[i] : quarterLabels[i]}
              </div>
            ))}
          </div>
        </div>

        {/* Sections */}
        {sections.map(section => (
          <div key={section.id} id={`section-${section.id}`}>
            {/* Section header */}
            <div className="flex" style={{ borderTop: '2px solid rgba(94,234,212,0.3)', background: 'rgba(94,234,212,0.06)' }}>
              <div className="sticky left-0 px-3 flex items-center text-[11px] font-bold uppercase tracking-wider h-[38px]" style={{
                width: 200, color: '#5eead4', background: 'rgba(94,234,212,0.06)',
                borderRight: '1px solid rgba(255,255,255,0.06)', zIndex: 5,
              }}>
                {section.title}
              </div>
              <div style={{ width: visibleIndices.length * colWidth }} />
            </div>

            {/* Data rows */}
            {section.rows.map((row, rIdx) => {
              const displayData = viewMode === 'quarterly'
                ? aggregateToQuarterly(row.data, row.aggregation || 'sum')
                : row.data;

              return (
                <div key={rIdx} className="flex group hover:bg-white/[0.03] transition-colors" style={{
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}>
                  <div className="shrink-0 sticky left-0 px-3 flex items-center text-[11px] h-8" style={{
                    width: 200, zIndex: 5,
                    background: '#0f1117',
                    borderRight: '1px solid rgba(255,255,255,0.06)',
                    color: row.bold ? '#e2e8f0' : '#94a3b8',
                    fontWeight: row.bold ? 600 : 400,
                    paddingLeft: row.indent ? 28 : 12,
                  }}>
                    {row.label}
                  </div>
                  {visibleIndices.map(i => {
                    const v = displayData[i] ?? 0;
                    let cellColor = '#e2e8f0';
                    if (row.colorCode === 'variance') cellColor = getVarianceColor(v);
                    else if (row.colorCode === 'performance') cellColor = getPerfColor(v);
                    else if (v === 0) cellColor = '#64748b';

                    const isActual = viewMode === 'monthly' && actualsForecasts[i] === 'Actuals';

                    return (
                      <div key={i} className="text-right text-[11px] font-mono h-8 flex items-center justify-end px-2" style={{
                        width: colWidth,
                        color: cellColor,
                        fontWeight: row.bold ? 600 : 400,
                        background: isActual ? 'rgba(94,234,212,0.03)' : 'transparent',
                        fontVariantNumeric: 'tabular-nums lining-nums',
                      }}>
                        {fmtValue(v, row.format)}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Spacer */}
            <div style={{ height: 12, background: '#0f1117' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
