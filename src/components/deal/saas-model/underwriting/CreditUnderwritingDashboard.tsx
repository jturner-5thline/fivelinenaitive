import React from 'react';
import { MOCK_DEAL_DATA } from './mockData';
import type { UnderwritingDealData } from './types';
import {
  SectionHeader, MetricCard, PnlBlock, SummaryTile, ChecklistMatrix,
  KpiGrid, SaasMetricsGrid, NotesPanel, BalanceSheetTable, FinancialQuality,
  FacilityBox, fmtMM,
} from './components';
import { RevenueBreakdownChart, RevenueVsExpensesChart, EbitdaChart } from './ChartPanel';

interface Props {
  dealData?: UnderwritingDealData;
}

export function CreditUnderwritingDashboard({ dealData }: Props) {
  const d = dealData || MOCK_DEAL_DATA;

  return (
    <div className="min-h-screen">
      <div className="max-w-[1400px] mx-auto px-4 py-4 space-y-5">

        {/* ═══ HEADER ═══════════════════════════════════ */}
        <header className="border-b border-border pb-4">
          <h1 className="text-xl font-bold text-foreground tracking-tight">{d.company_profile.name}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Credit Underwriting Dashboard · {d.company_profile.industry} · {d.company_profile.hq}
          </p>
          <div className="flex gap-8 mt-3">
            <div>
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Actuals Through</span>
              <p className="text-xs font-semibold text-foreground">{d.header_meta.actuals_through}</p>
            </div>
            <div>
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Prepared By</span>
              <p className="text-xs font-semibold text-foreground">{d.header_meta.prepared_by}</p>
            </div>
            <div>
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Date</span>
              <p className="text-xs font-semibold text-foreground">{d.header_meta.date}</p>
            </div>
          </div>
        </header>

        {/* ═══ P&L ══════════════════════════════════════ */}
        <section>
          <SectionHeader title="P&L" flags={d.flags.pnl} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <PnlBlock
              title="RECURRING REVENUE"
              table={{
                headers: ['YEAR', 'AMOUNT', 'GROWTH'],
                rows: d.pnl.recurring_revenue.annual.map(r => [
                  r.year,
                  fmtMM(r.amount),
                  r.growth !== null ? `${r.growth > 0 ? '+' : ''}${r.growth.toFixed(1)}%` : '—',
                ]),
              }}
              summaryMetrics={[
                { label: 'TTM Revenue', value: fmtMM(d.pnl.recurring_revenue.ttm_revenue) },
                { label: 'Prior TTM', value: fmtMM(d.pnl.recurring_revenue.prior_ttm) },
                { label: 'YoY Growth', value: `+${d.pnl.recurring_revenue.yoy_growth.toFixed(1)}%` },
              ]}
              flags={d.pnl.recurring_revenue.flags}
            />
            <PnlBlock
              title="TOTAL REVENUE"
              table={{
                headers: ['YEAR', 'AMOUNT', 'GROWTH'],
                rows: d.pnl.total_revenue.annual.map(r => [
                  r.year,
                  fmtMM(r.amount),
                  r.growth !== null ? `${r.growth > 0 ? '+' : ''}${r.growth.toFixed(1)}%` : '—',
                ]),
              }}
              summaryMetrics={[
                { label: 'TTM Revenue', value: fmtMM(d.pnl.total_revenue.ttm_revenue) },
                { label: 'Prior Period', value: fmtMM(d.pnl.total_revenue.prior_ttm) },
                { label: 'YoY Growth', value: `+${d.pnl.total_revenue.yoy_growth.toFixed(1)}%` },
              ]}
              flags={d.pnl.total_revenue.flags}
            />
            <PnlBlock
              title="GROSS MARGIN (%)"
              table={{
                headers: ['YEAR', 'MARGIN', 'Δ'],
                rows: d.pnl.gross_margin.annual.map(r => [
                  r.year,
                  `${r.margin.toFixed(1)}%`,
                  r.delta !== null ? `${r.delta > 0 ? '+' : ''}${r.delta.toFixed(1)}pp` : '—',
                ]),
              }}
              summaryMetrics={[
                { label: 'TTM Gross Profit', value: fmtMM(d.pnl.gross_margin.ttm_gross_profit) },
                { label: 'TTM Avg Margin', value: `${d.pnl.gross_margin.ttm_avg_margin.toFixed(1)}%` },
              ]}
              flags={d.pnl.gross_margin.flags}
            />
            <PnlBlock
              title="OPERATING INCOME / EBITDA"
              table={{
                headers: ['YEAR', 'AMOUNT', 'MARGIN'],
                rows: d.pnl.operating_income_ebitda.annual.map(r => [
                  r.year,
                  fmtMM(r.amount),
                  `${r.margin > 0 ? '' : ''}${r.margin.toFixed(1)}%`,
                ]),
              }}
              summaryMetrics={[
                { label: 'TTM EBITDA', value: fmtMM(d.pnl.operating_income_ebitda.ttm_ebitda) },
                { label: 'TTM Op. Income %', value: `${d.pnl.operating_income_ebitda.ttm_op_income_pct.toFixed(1)}%` },
              ]}
              flags={d.pnl.operating_income_ebitda.flags}
            />
          </div>
        </section>

        {/* ═══ ANNUAL P&L SUMMARY ══════════════════════ */}
        <section>
          <SectionHeader title="Annual P&L Summary" />
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="py-2 px-3 text-left font-bold text-[10px] uppercase tracking-wider text-muted-foreground">Metric</th>
                  {Object.keys(d.annual_pnl_summary[0]?.values || {}).map(yr => (
                    <th key={yr} className="py-2 px-3 text-right font-bold text-[10px] uppercase tracking-wider text-muted-foreground">{yr}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.annual_pnl_summary.map((row) => (
                  <tr key={row.label} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2 px-3 font-semibold text-foreground">{row.label}</td>
                    {Object.values(row.values).map((val, i) => (
                      <td key={i} className="py-2 px-3 text-right font-mono tabular-nums text-foreground">{val}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ═══ CHARTS ═══════════════════════════════════ */}
        <section>
          <SectionHeader title="Charts" />
          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-3">Current Month: {d.charts.current_month}</p>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <RevenueBreakdownChart
              title="Revenue Breakdown (18mo Historical + 6mo Projected)"
              data={d.charts.revenue_breakdown}
            />
            <RevenueVsExpensesChart
              title="Revenue vs. Expenses (6mo Historical + Projected)"
              data={d.charts.revenue_vs_expenses}
            />
            <EbitdaChart
              title="EBITDA & Operating Income (6mo Historical + Projected)"
              data={d.charts.ebitda_operating}
            />
          </div>
        </section>

        {/* ═══ SUMMARY + SAAS FACILITY ═════════════════ */}
        <section>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <SectionHeader title="Summary" />
              <div className="bg-card border border-border rounded-lg p-4">
                <SummaryTile label="Business Model" value={d.summary.business_model} />
                <SummaryTile label="Customer Base" value={d.summary.customer_base} />
                <SummaryTile label="Founded" value={d.summary.founded} />
                <SummaryTile label="Employees" value={d.summary.employees} />
                <SummaryTile label="HQ" value={d.summary.hq} />
                <SummaryTile label="Existing GTL Debt" value={d.summary.existing_gtl_debt} />
              </div>
            </div>
            <div>
              <SectionHeader title="SaaS Facility" />
              <FacilityBox facility={d.saas_facility} />
            </div>
          </div>
        </section>

        {/* ═══ MATERIALS & CHECKLIST + FINANCIAL QUALITY */}
        <section>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <SectionHeader title="Materials & Checklist" />
              <div className="bg-card border border-border rounded-lg p-4">
                <ChecklistMatrix rows={d.materials_checklist} />
              </div>
            </div>
            <div>
              <SectionHeader title="Financial Quality" />
              <div className="bg-card border border-border rounded-lg p-4">
                <FinancialQuality quality={d.financial_quality} />
              </div>
            </div>
          </div>
        </section>

        {/* ═══ OPERATING KPIS ══════════════════════════ */}
        <section>
          <SectionHeader title="Operating Metrics" flags={d.flags.operating_kpis} />
          <KpiGrid tiles={d.operating_kpis} />
        </section>

        {/* ═══ SAAS METRICS ════════════════════════════ */}
        <section>
          <SectionHeader title="SaaS Metrics" flags={d.flags.saas_metrics} />
          <SaasMetricsGrid tiles={d.saas_metrics} />
        </section>

        {/* ═══ ANALYST NOTES ═══════════════════════════ */}
        <section>
          <SectionHeader title="Analyst Notes" />
          <NotesPanel notes={d.analyst_notes} />
        </section>

        {/* ═══ BALANCE SHEET ═══════════════════════════ */}
        <section>
          <SectionHeader title="Balance Sheet" flags={d.balance_sheet.flags} />
          <div className="bg-card border border-border rounded-lg p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground mb-3">Current Balances</h3>
            <BalanceSheetTable periods={d.balance_sheet.periods} rows={d.balance_sheet.rows} />
          </div>
        </section>

        {/* ═══ AR AVAILABILITY ═════════════════════════ */}
        <section>
          <SectionHeader title="AR Availability" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            <MetricCard label="NET AR AVAILABILITY" value={fmtMM(d.ar_availability.net_ar_availability)} />
            <MetricCard label="TOTAL AR" value={fmtMM(d.ar_availability.total_ar)} />
            <MetricCard label="TOTAL DEFERRED REVENUE" value={fmtMM(d.ar_availability.total_deferred_revenue)} />
            <MetricCard label="OVERDUE (>90 DAYS)" value={fmtMM(d.ar_availability.overdue_90_days)} />
            <MetricCard label="NET AR (ELIGIBLE)" value={fmtMM(d.ar_availability.net_ar_eligible)} />
          </div>
        </section>

        {/* ═══ FOOTER ══════════════════════════════════ */}
        <footer className="border-t border-border pt-3 text-center">
          <p className="text-[10px] text-muted-foreground">
            Prepared by {d.header_meta.prepared_by} · {d.header_meta.date} · Confidential
          </p>
        </footer>
      </div>
    </div>
  );
}
