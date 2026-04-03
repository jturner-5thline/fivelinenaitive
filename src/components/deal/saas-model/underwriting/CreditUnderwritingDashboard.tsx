import React from 'react';
import type { UnderwritingDealData } from './types';
import {
  SectionDivider, SubHeader, MetricCard, SummaryTile, ChecklistMatrix,
  KpiGrid, SaasMetricsGrid, NotesPanel, BalanceSheetTable, FinancialQuality,
  FacilityBox, fmtMM, PnlKpiCard, AnnualCard, currencyColor,
} from './components';
import { RevenueBreakdownChart, RevenueVsExpensesChart, EbitdaChart } from './ChartPanel';
import { FileText } from 'lucide-react';

interface Props {
  dealData?: UnderwritingDealData;
}

export function CreditUnderwritingDashboard({ dealData }: Props) {
  if (!dealData) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <FileText className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h2 className="text-lg font-semibold text-foreground mb-1">No Financial Data</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          Upload and map financial files in the Data Mapping tab to populate this dashboard with live underwriting data.
        </p>
      </div>
    );
  }

  const d = dealData;

  return (
    <div className="min-h-screen">
      <div className="max-w-[1380px] mx-auto px-4 pt-1 pb-4 space-y-0">

        {/* ═══ P&L ══════════════════════════════════════ */}
        <section>
          <SectionDivider title="P&L" flags={d.flags.pnl} className="mt-1 mb-3" />

          {/* KPI row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4">
            <PnlKpiCard
              label="Recurring revenue (TTM)"
              value={fmtMM(d.pnl.recurring_revenue.ttm_revenue)}
              sub={<>Prior TTM {fmtMM(d.pnl.recurring_revenue.prior_ttm)} · <span className={d.pnl.recurring_revenue.yoy_growth >= 0 ? "text-success" : "text-destructive"}>{d.pnl.recurring_revenue.yoy_growth.toFixed(1)}% YoY</span></>}
              ttmLabel="YoY growth"
              ttmValue={`${d.pnl.recurring_revenue.yoy_growth.toFixed(1)}%`}
              ttmColor={d.pnl.recurring_revenue.yoy_growth >= 0 ? "text-success" : "text-destructive"}
            />
            <PnlKpiCard
              label="Total revenue (TTM)"
              value={fmtMM(d.pnl.total_revenue.ttm_revenue)}
              sub={<>Prior TTM {fmtMM(d.pnl.total_revenue.prior_ttm)} · <span className={d.pnl.total_revenue.yoy_growth >= 0 ? "text-success" : "text-destructive"}>{d.pnl.total_revenue.yoy_growth.toFixed(1)}% YoY</span></>}
              ttmLabel="YoY growth"
              ttmValue={`${d.pnl.total_revenue.yoy_growth.toFixed(1)}%`}
              ttmColor={d.pnl.total_revenue.yoy_growth >= 0 ? "text-success" : "text-destructive"}
            />
            <PnlKpiCard
              label="Gross margin (TTM avg)"
              value={`${d.pnl.gross_margin.ttm_avg_margin.toFixed(1)}%`}
              sub={<>TTM gross profit {fmtMM(d.pnl.gross_margin.ttm_gross_profit)}</>}
              ttmLabel={`${d.pnl.gross_margin.annual[d.pnl.gross_margin.annual.length - 1]?.year || ''} annual`}
              ttmValue={`${d.pnl.gross_margin.annual[d.pnl.gross_margin.annual.length - 1]?.margin.toFixed(1) || '—'}%`}
            />
            <PnlKpiCard
              label="EBITDA (TTM)"
              value={fmtMM(d.pnl.operating_income_ebitda.ttm_ebitda)}
              sub={<>EBITDA margin <span className={d.pnl.operating_income_ebitda.ttm_op_income_pct >= 0 ? "text-success" : "text-destructive"}>{d.pnl.operating_income_ebitda.ttm_op_income_pct.toFixed(1)}%</span></>}
              ttmLabel={`${d.pnl.operating_income_ebitda.annual[d.pnl.operating_income_ebitda.annual.length - 1]?.year || ''} annual`}
              ttmValue={fmtMM(d.pnl.operating_income_ebitda.annual[d.pnl.operating_income_ebitda.annual.length - 1]?.amount || 0)}
            />
          </div>

          {/* Annual breakdown */}
          <SubHeader>Annual breakdown</SubHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4">
            <AnnualCard
              title="Recurring revenue"
              headers={['Year', 'Amount', 'Growth']}
              rows={d.pnl.recurring_revenue.annual.map(r => ({
                cells: [r.year, fmtMM(r.amount), r.growth !== null ? `${r.growth > 0 ? '+' : ''}${r.growth.toFixed(1)}%` : '—'],
              }))}
              footerLabel="TTM"
              footerValue={fmtMM(d.pnl.recurring_revenue.ttm_revenue)}
              footerSub={<span className={d.pnl.recurring_revenue.yoy_growth >= 0 ? "text-success" : "text-destructive"}>{d.pnl.recurring_revenue.yoy_growth.toFixed(1)}% YoY</span>}
            />
            <AnnualCard
              title="Total revenue"
              headers={['Year', 'Amount', 'Growth']}
              rows={d.pnl.total_revenue.annual.map(r => ({
                cells: [r.year, fmtMM(r.amount), r.growth !== null ? `${r.growth > 0 ? '+' : ''}${r.growth.toFixed(1)}%` : '—'],
              }))}
              footerLabel="TTM"
              footerValue={fmtMM(d.pnl.total_revenue.ttm_revenue)}
              footerSub={<span className={d.pnl.total_revenue.yoy_growth >= 0 ? "text-success" : "text-destructive"}>{d.pnl.total_revenue.yoy_growth.toFixed(1)}% YoY</span>}
            />
            <AnnualCard
              title="Gross margin (%)"
              headers={['Year', 'Margin', 'Δ']}
              rows={d.pnl.gross_margin.annual.map(r => ({
                cells: [r.year, `${r.margin.toFixed(1)}%`, r.delta !== null ? `${r.delta > 0 ? '+' : ''}${r.delta.toFixed(1)}pp` : '—'],
              }))}
              footerLabel="TTM gross profit"
              footerValue={fmtMM(d.pnl.gross_margin.ttm_gross_profit)}
              footerSub={<>Avg <span className="text-success">{d.pnl.gross_margin.ttm_avg_margin.toFixed(1)}%</span></>}
            />
            <AnnualCard
              title="Operating income / EBITDA"
              headers={['Year', 'Amount', 'Margin']}
              rows={d.pnl.operating_income_ebitda.annual.map(r => ({
                cells: [r.year, fmtMM(r.amount), `${r.margin.toFixed(1)}%`],
              }))}
              footerLabel="TTM EBITDA"
              footerValue={fmtMM(d.pnl.operating_income_ebitda.ttm_ebitda)}
              footerSub={<>Margin <span className="text-success">{d.pnl.operating_income_ebitda.ttm_op_income_pct.toFixed(1)}%</span></>}
            />
          </div>

          {/* Trends (Charts) */}
          <SubHeader>Trends</SubHeader>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5 mb-4">
            <RevenueBreakdownChart
              title="Revenue breakdown (18mo historical + 6mo projected)"
              data={d.charts.revenue_breakdown}
            />
            <RevenueVsExpensesChart
              title="Revenue vs. expenses (6mo historical + projected)"
              data={d.charts.revenue_vs_expenses}
            />
            <EbitdaChart
              title="EBITDA & operating income (6mo historical + projected)"
              data={d.charts.ebitda_operating}
            />
          </div>

          {/* Analyst notes & flags */}
          <SubHeader>Analyst notes & flags</SubHeader>
          <NotesPanel notes={d.analyst_notes} />
        </section>

        {/* ═══ BALANCE SHEET ═══════════════════════════ */}
        <section>
          <SectionDivider title="Balance sheet" flags={d.balance_sheet.flags} />

          <SubHeader>Current balances</SubHeader>
          <div className="bg-card border border-border rounded-xl overflow-hidden py-1 mb-4">
            <BalanceSheetTable periods={d.balance_sheet.periods} rows={d.balance_sheet.rows} />
          </div>

          <SubHeader>AR availability</SubHeader>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            <MetricCard label="Net AR availability" value={fmtMM(d.ar_availability.net_ar_availability)} />
            <MetricCard label="Total AR" value={fmtMM(d.ar_availability.total_ar)} />
            <MetricCard label="Total deferred revenue" value={fmtMM(d.ar_availability.total_deferred_revenue)} />
            <MetricCard label="Overdue (>90 days)" value={fmtMM(d.ar_availability.overdue_90_days)} />
            <MetricCard label="Net AR (eligible)" value={fmtMM(d.ar_availability.net_ar_eligible)} />
          </div>
        </section>

        {/* ═══ OPERATING & SAAS METRICS ═══════════════ */}
        <section>
          <SectionDivider title="Operating & SaaS metrics" flags={d.flags.operating_kpis} />
          <KpiGrid tiles={d.operating_kpis} />

          <SubHeader>SaaS detail</SubHeader>
          <SaasMetricsGrid tiles={d.saas_metrics} />
        </section>

        {/* ═══ SAAS FACILITY ══════════════════════════ */}
        <section>
          <SectionDivider title="SaaS facility" />
          <FacilityBox facility={d.saas_facility} />
        </section>

        {/* ═══ SUMMARY & QUALITY ═════════════════════ */}
        <section>
          <SectionDivider title="Summary & quality" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 mb-4">
            {/* Summary table */}
            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold mb-1">Summary</p>
              <SummaryTile label="Business model" value={d.summary.business_model} />
              <SummaryTile label="Customer base" value={d.summary.customer_base} />
              <SummaryTile label="Founded" value={d.summary.founded} />
              <SummaryTile label="Employees" value={d.summary.employees} />
              <SummaryTile label="HQ" value={d.summary.hq} />
              <SummaryTile label="Existing GTL debt" value={d.summary.existing_gtl_debt} />
            </div>

            {/* Financial quality + checklist */}
            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold mb-2">Financial quality</p>
              <FinancialQuality quality={d.financial_quality} />
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold mt-5 mb-1">Materials & checklist</p>
              <ChecklistMatrix rows={d.materials_checklist} />
            </div>
          </div>
        </section>

        {/* ═══ FOOTER ══════════════════════════════════ */}
        <footer className="border-t border-border pt-6 mt-9 text-center">
          <p className="text-[11px] text-muted-foreground/50">
            Prepared by {d.header_meta.prepared_by} · {d.header_meta.date} · Confidential
          </p>
        </footer>
      </div>
    </div>
  );
}
