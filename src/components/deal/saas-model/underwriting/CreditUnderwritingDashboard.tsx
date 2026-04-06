import React from 'react';
import type { UnderwritingDealData } from './types';
import {
  SectionDivider, SubHeader, MetricCard, SummaryTile, ChecklistMatrix,
  KpiGrid, SaasMetricsGrid, NotesPanel, BalanceSheetTable, FinancialQuality,
  FacilityBox, fmtMM, PnlKpiCard, AnnualCard, currencyColor,
} from './components';
import { RevenueBreakdownChart, RevenueVsExpensesChart, EbitdaChart } from './ChartPanel';
import { FileText } from 'lucide-react';
import { useFinancialComments } from '@/hooks/useFinancialComments';
import { CommentableWidget } from './CommentableWidget';

interface Props {
  dealData?: UnderwritingDealData;
  dealId?: string;
}

export function CreditUnderwritingDashboard({ dealData, dealId }: Props) {
  const { comments, addComment, deleteComment, getCommentsForAnchor } = useFinancialComments(dealId || '');

  // Helper to wrap any widget with commenting
  function W({ anchorKey, label, stmt, wtype, children }: {
    anchorKey: string; label: string; stmt: 'income_statement' | 'balance_sheet';
    wtype: React.ComponentProps<typeof CommentableWidget>['widgetType']; children: React.ReactNode;
  }) {
    if (!dealId) return <>{children}</>;
    return (
      <CommentableWidget
        anchorKey={anchorKey}
        targetLabel={label}
        statementType={stmt}
        widgetType={wtype}
        lineItemKey={anchorKey}
        existingComments={getCommentsForAnchor(anchorKey)}
        onAdd={addComment}
        onDelete={deleteComment}
      >
        {children}
      </CommentableWidget>
    );
  }

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
            <W anchorKey="pnl_recurring_revenue_ttm" label="Recurring Revenue (TTM)" stmt="income_statement" wtype="kpi_card">
              <PnlKpiCard
                label="Recurring revenue (TTM)"
                value={fmtMM(d.pnl.recurring_revenue.ttm_revenue)}
                sub={<>Prior TTM {fmtMM(d.pnl.recurring_revenue.prior_ttm)} · <span className={d.pnl.recurring_revenue.yoy_growth >= 0 ? "text-success" : "text-destructive"}>{d.pnl.recurring_revenue.yoy_growth.toFixed(1)}% YoY</span></>}
                ttmLabel="YoY growth"
                ttmValue={`${d.pnl.recurring_revenue.yoy_growth.toFixed(1)}%`}
                ttmColor={d.pnl.recurring_revenue.yoy_growth >= 0 ? "text-success" : "text-destructive"}
              />
            </W>
            <W anchorKey="pnl_total_revenue_ttm" label="Total Revenue (TTM)" stmt="income_statement" wtype="kpi_card">
              <PnlKpiCard
                label="Total revenue (TTM)"
                value={fmtMM(d.pnl.total_revenue.ttm_revenue)}
                sub={<>Prior TTM {fmtMM(d.pnl.total_revenue.prior_ttm)} · <span className={d.pnl.total_revenue.yoy_growth >= 0 ? "text-success" : "text-destructive"}>{d.pnl.total_revenue.yoy_growth.toFixed(1)}% YoY</span></>}
                ttmLabel="YoY growth"
                ttmValue={`${d.pnl.total_revenue.yoy_growth.toFixed(1)}%`}
                ttmColor={d.pnl.total_revenue.yoy_growth >= 0 ? "text-success" : "text-destructive"}
              />
            </W>
            <W anchorKey="pnl_gross_margin_ttm" label="Gross Margin (TTM Avg)" stmt="income_statement" wtype="kpi_card">
              <PnlKpiCard
                label="Gross margin (TTM avg)"
                value={`${d.pnl.gross_margin.ttm_avg_margin.toFixed(1)}%`}
                sub={<>TTM gross profit {fmtMM(d.pnl.gross_margin.ttm_gross_profit)}</>}
                ttmLabel={`${d.pnl.gross_margin.annual[d.pnl.gross_margin.annual.length - 1]?.year || ''} annual`}
                ttmValue={`${d.pnl.gross_margin.annual[d.pnl.gross_margin.annual.length - 1]?.margin.toFixed(1) || '—'}%`}
              />
            </W>
            <W anchorKey="pnl_ebitda_ttm" label="EBITDA (TTM)" stmt="income_statement" wtype="kpi_card">
              <PnlKpiCard
                label="EBITDA (TTM)"
                value={fmtMM(d.pnl.operating_income_ebitda.ttm_ebitda)}
                sub={<>EBITDA margin <span className={d.pnl.operating_income_ebitda.ttm_op_income_pct >= 0 ? "text-success" : "text-destructive"}>{d.pnl.operating_income_ebitda.ttm_op_income_pct.toFixed(1)}%</span></>}
                ttmLabel={`${d.pnl.operating_income_ebitda.annual[d.pnl.operating_income_ebitda.annual.length - 1]?.year || ''} annual`}
                ttmValue={fmtMM(d.pnl.operating_income_ebitda.annual[d.pnl.operating_income_ebitda.annual.length - 1]?.amount || 0)}
              />
            </W>
          </div>

          {/* Annual breakdown */}
          <SubHeader>Annual breakdown</SubHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4">
            <W anchorKey="annual_recurring_revenue" label="Recurring Revenue (Annual)" stmt="income_statement" wtype="annual_card">
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
            </W>
            <W anchorKey="annual_total_revenue" label="Total Revenue (Annual)" stmt="income_statement" wtype="annual_card">
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
            </W>
            <W anchorKey="annual_gross_margin" label="Gross Margin (Annual)" stmt="income_statement" wtype="annual_card">
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
            </W>
            <W anchorKey="annual_ebitda" label="Operating Income / EBITDA (Annual)" stmt="income_statement" wtype="annual_card">
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
            </W>
          </div>

          {/* Trends (Charts) */}
          <SubHeader>Trends</SubHeader>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5 mb-4">
            <W anchorKey="chart_revenue_breakdown" label="Revenue Breakdown (18Mo Historical + 6Mo Projected)" stmt="income_statement" wtype="chart">
              <RevenueBreakdownChart
                title="Revenue breakdown (18mo historical + 6mo projected)"
                data={d.charts.revenue_breakdown}
              />
            </W>
            <W anchorKey="chart_revenue_vs_expenses" label="Revenue vs. Expenses (6Mo Historical + Projected)" stmt="income_statement" wtype="chart">
              <RevenueVsExpensesChart
                title="Revenue vs. expenses (6mo historical + projected)"
                data={d.charts.revenue_vs_expenses}
              />
            </W>
            <W anchorKey="chart_ebitda_operating" label="EBITDA & Operating Income (6Mo Historical + Projected)" stmt="income_statement" wtype="chart">
              <EbitdaChart
                title="EBITDA & operating income (6mo historical + projected)"
                data={d.charts.ebitda_operating}
              />
            </W>
          </div>

          {/* Analyst notes & flags */}
          <SubHeader>Analyst notes & flags</SubHeader>
          <W anchorKey="analyst_commentary" label="Analyst Commentary" stmt="income_statement" wtype="commentary">
            <NotesPanel notes={d.analyst_notes} />
          </W>
        </section>

        {/* ═══ BALANCE SHEET ═══════════════════════════ */}
        <section>
          <SectionDivider title="Balance sheet" flags={d.balance_sheet.flags} />

          <SubHeader>Current balances</SubHeader>
          <W anchorKey="balance_sheet_table" label="Balance Sheet — Current Balances" stmt="balance_sheet" wtype="balance_sheet">
            <div className="bg-card border border-border rounded-xl overflow-hidden py-1 mb-4">
              <BalanceSheetTable periods={d.balance_sheet.periods} rows={d.balance_sheet.rows} />
            </div>
          </W>

          <SubHeader>AR availability</SubHeader>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            <W anchorKey="ar_net_availability" label="Net AR Availability" stmt="balance_sheet" wtype="metric_card">
              <MetricCard label="Net AR availability" value={fmtMM(d.ar_availability.net_ar_availability)} />
            </W>
            <W anchorKey="ar_total" label="Total AR" stmt="balance_sheet" wtype="metric_card">
              <MetricCard label="Total AR" value={fmtMM(d.ar_availability.total_ar)} />
            </W>
            <W anchorKey="ar_deferred_revenue" label="Total Deferred Revenue" stmt="balance_sheet" wtype="metric_card">
              <MetricCard label="Total deferred revenue" value={fmtMM(d.ar_availability.total_deferred_revenue)} />
            </W>
            <W anchorKey="ar_overdue_90" label="Overdue (>90 Days)" stmt="balance_sheet" wtype="metric_card">
              <MetricCard label="Overdue (>90 days)" value={fmtMM(d.ar_availability.overdue_90_days)} />
            </W>
            <W anchorKey="ar_net_eligible" label="Net AR (Eligible)" stmt="balance_sheet" wtype="metric_card">
              <MetricCard label="Net AR (eligible)" value={fmtMM(d.ar_availability.net_ar_eligible)} />
            </W>
          </div>
        </section>

        {/* ═══ OPERATING & SAAS METRICS ═══════════════ */}
        <section>
          <SectionDivider title="Operating & SaaS metrics" flags={d.flags.operating_kpis} />
          <W anchorKey="operating_kpis" label="Operating & SaaS KPIs" stmt="income_statement" wtype="kpi_grid">
            <KpiGrid tiles={d.operating_kpis} />
          </W>

          <SubHeader>SaaS detail</SubHeader>
          <W anchorKey="saas_metrics" label="SaaS Metrics Detail" stmt="income_statement" wtype="saas_metric">
            <SaasMetricsGrid tiles={d.saas_metrics} />
          </W>
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
            <W anchorKey="company_summary" label="Company Summary" stmt="income_statement" wtype="summary_field">
              <div className="bg-card border border-border rounded-xl p-5">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold mb-1">Summary</p>
                <SummaryTile label="Business model" value={d.summary.business_model} />
                <SummaryTile label="Customer base" value={d.summary.customer_base} />
                <SummaryTile label="Founded" value={d.summary.founded} />
                <SummaryTile label="Employees" value={d.summary.employees} />
                <SummaryTile label="HQ" value={d.summary.hq} />
                <SummaryTile label="Existing GTL debt" value={d.summary.existing_gtl_debt} />
              </div>
            </W>

            {/* Financial quality + checklist */}
            <W anchorKey="financial_quality_checklist" label="Financial Quality & Checklist" stmt="income_statement" wtype="financial_quality">
              <div className="bg-card border border-border rounded-xl p-5">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold mb-2">Financial quality</p>
                <FinancialQuality quality={d.financial_quality} />
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold mt-5 mb-1">Materials & checklist</p>
                <ChecklistMatrix rows={d.materials_checklist} />
              </div>
            </W>
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
