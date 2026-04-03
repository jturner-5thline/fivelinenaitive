import { useMemo, useState } from 'react';
import { SaaSModelData } from './types';
import { fmtCurrency, fmtPct, fmtRatio, isNegative } from './formatters';
import { annualRollup } from './calculations';
import { CreditUnderwritingDashboard } from './underwriting/CreditUnderwritingDashboard';
import type { UnderwritingDealData } from './underwriting/types';
import { AnnotationBadge } from './AnnotationThread';
import type { Annotation } from '@/hooks/useModelAnnotations';

interface AnnotationHook {
  annotations: Annotation[];
  getAnnotationsForTarget: (targetType: string, targetRef: string) => Annotation[];
  addAnnotation: (targetType: Annotation['target_type'], targetRef: string, content: string, mentions?: string[]) => Promise<any>;
  resolveAnnotation: (id: string) => Promise<void>;
  deleteAnnotation: (id: string) => Promise<void>;
}

interface Props {
  model: SaaSModelData;
  annotations?: AnnotationHook;
}

function buildUnderwritingData(m: SaaSModelData): UnderwritingDealData {
  const last = m.months.length - 1;
  const annualData = annualRollup(m, [
    { key: 'recurring', source: m.revenue.recurring, type: 'sum' },
    { key: 'totalRevenue', source: m.totalRevenue, type: 'sum' },
    { key: 'grossMargin', source: m.grossMarginPct, type: 'avg' },
    { key: 'ebitda', source: m.ebitda, type: 'sum' },
    { key: 'operatingIncome', source: m.operatingIncome, type: 'sum' },
  ]);

  const fmtMM = (v: number) => {
    const abs = Math.abs(v);
    if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}MM`;
    if (abs >= 1_000) return `$${(abs / 1_000).toFixed(0)}K`;
    return `$${abs.toFixed(0)}`;
  };

  // Build annual P&L rows
  const recentYears = annualData.slice(-4);
  const recurringAnnual = recentYears.map((a, i) => ({
    year: String(a.year),
    amount: a.values.recurring,
    growth: i > 0 && recentYears[i - 1].values.recurring > 0
      ? ((a.values.recurring - recentYears[i - 1].values.recurring) / recentYears[i - 1].values.recurring) * 100
      : null,
  }));

  const totalRevAnnual = recentYears.map((a, i) => ({
    year: String(a.year),
    amount: a.values.totalRevenue,
    growth: i > 0 && recentYears[i - 1].values.totalRevenue > 0
      ? ((a.values.totalRevenue - recentYears[i - 1].values.totalRevenue) / recentYears[i - 1].values.totalRevenue) * 100
      : null,
  }));

  const marginAnnual = recentYears.map((a, i) => ({
    year: String(a.year),
    margin: a.values.grossMargin,
    delta: i > 0 ? a.values.grossMargin - recentYears[i - 1].values.grossMargin : null,
  }));

  const ebitdaAnnual = recentYears.map(a => ({
    year: String(a.year),
    amount: a.values.ebitda,
    margin: a.values.totalRevenue > 0 ? (a.values.ebitda / a.values.totalRevenue) * 100 : 0,
  }));

  // TTM values
  const ttmSlice = Math.max(0, last - 11);
  const ttmRecurring = m.revenue.recurring.slice(ttmSlice, last + 1).reduce((s, v) => s + v, 0);
  const priorTtmRecurring = ttmSlice >= 12
    ? m.revenue.recurring.slice(ttmSlice - 12, ttmSlice).reduce((s, v) => s + v, 0)
    : 0;
  const ttmTotalRev = m.totalRevenue.slice(ttmSlice, last + 1).reduce((s, v) => s + v, 0);
  const priorTtmTotalRev = ttmSlice >= 12
    ? m.totalRevenue.slice(ttmSlice - 12, ttmSlice).reduce((s, v) => s + v, 0)
    : 0;
  const ttmGrossProfit = m.grossProfit.slice(ttmSlice, last + 1).reduce((s, v) => s + v, 0);
  const ttmAvgMargin = m.grossMarginPct.slice(ttmSlice, last + 1).reduce((s, v) => s + v, 0) / Math.min(12, last + 1);
  const ttmEbitda = m.ebitda.slice(ttmSlice, last + 1).reduce((s, v) => s + v, 0);
  const ttmOpIncomePct = ttmTotalRev > 0
    ? (m.operatingIncome.slice(ttmSlice, last + 1).reduce((s, v) => s + v, 0) / ttmTotalRev) * 100 : 0;

  // Charts
  const chartStart = Math.max(0, last - 17);
  const revBreakdown = m.months.slice(chartStart, last + 1).map((mo, idx) => {
    const i = chartStart + idx;
    return {
      period: mo.label,
      recurring: m.revenue.recurring[i],
      nonRecurring: m.revenue.nonRecurring[i] + m.revenue.other[i],
      isProjected: !mo.isActual,
    };
  });

  const revExpStart = Math.max(0, last - 5);
  const revExpData = m.months.slice(revExpStart, last + 1).map((mo, idx) => {
    const i = revExpStart + idx;
    return {
      period: mo.label,
      revenue: m.totalRevenue[i],
      expenses: m.totalCOGS[i] + m.totalOpEx[i],
      isProjected: !mo.isActual,
    };
  });

  const ebitdaChartData = m.months.slice(revExpStart, last + 1).map((mo, idx) => {
    const i = revExpStart + idx;
    return {
      period: mo.label,
      ebitda: m.ebitda[i],
      operating_income: m.operatingIncome[i],
      isProjected: !mo.isActual,
    };
  });

  // BS snapshot
  const bsStart = Math.max(0, last - 4);
  const bsPeriods = m.months.slice(bsStart, last + 1).map(mo => mo.label.toUpperCase().replace("'", '-'));
  const bsRows = [
    { item: 'Cash', values: m.balanceSheet.cash.slice(bsStart, last + 1) },
    { item: 'Accounts Receivable', values: m.balanceSheet.ar.slice(bsStart, last + 1) },
    { item: 'Accounts Payable', values: m.balanceSheet.ap.slice(bsStart, last + 1) },
    { item: 'Deferred Revenue', values: m.balanceSheet.deferredRevenue.slice(bsStart, last + 1) },
    { item: 'Existing GTL Debt', values: m.balanceSheet.ltDebt.slice(bsStart, last + 1).map((v, i) => v + m.balanceSheet.stDebt[bsStart + i]) },
    { item: 'Total Assets', values: m.balanceSheet.totalAssets.slice(bsStart, last + 1) },
  ];

  // Ops metrics
  const monthlyBurn = m.ebitda[last] < 0 ? Math.abs(m.ebitda[last]) : 0;
  const cash = m.balanceSheet.cash[last];
  const runway = monthlyBurn > 0 ? cash / monthlyBurn : 999;
  const ebitdaMargin = m.totalRevenue[last] > 0 ? (m.ebitda[last] / m.totalRevenue[last]) * 100 : 0;
  const ruleOf40 = m.yoyRevGrowth + ebitdaMargin;
  const opexPct = m.totalRevenue[last] > 0 ? (m.totalOpEx[last] / m.totalRevenue[last]) * 100 : 0;
  const customerCount = 0; // Requires external customer data — not estimated
  const acv = 0; // Requires customer count data

  const deferredRevToday = m.balanceSheet.deferredRevenue[last] || 0;
  const growthRate = m.yoyRevGrowth > 0 ? m.yoyRevGrowth / 100 : 0;
  const borrowingCapacity6m = m.borrowingCapacity * (1 + growthRate * 0.5);

  // Annual P&L summary rows
  const summaryYears = recentYears.slice(-3);
  const annualPnlSummary = [
    {
      label: 'Recurring Rev.',
      values: Object.fromEntries(summaryYears.map((a, i) => {
        const growth = i > 0 && summaryYears[i - 1].values.recurring > 0
          ? ((a.values.recurring - summaryYears[i - 1].values.recurring) / summaryYears[i - 1].values.recurring) * 100 : null;
        return [String(a.year), `${fmtMM(a.values.recurring)}${growth !== null ? ` (${growth > 0 ? '+' : ''}${growth.toFixed(0)}%)` : ''}`];
      })),
    },
    {
      label: 'Total Revenue',
      values: Object.fromEntries(summaryYears.map((a, i) => {
        const growth = i > 0 && summaryYears[i - 1].values.totalRevenue > 0
          ? ((a.values.totalRevenue - summaryYears[i - 1].values.totalRevenue) / summaryYears[i - 1].values.totalRevenue) * 100 : null;
        return [String(a.year), `${fmtMM(a.values.totalRevenue)}${growth !== null ? ` (${growth > 0 ? '+' : ''}${growth.toFixed(0)}%)` : ''}`];
      })),
    },
    {
      label: 'Gross Margin %',
      values: Object.fromEntries(summaryYears.map((a, i) => {
        const delta = i > 0 ? a.values.grossMargin - summaryYears[i - 1].values.grossMargin : null;
        return [String(a.year), `${a.values.grossMargin.toFixed(1)}%${delta !== null ? ` (${delta > 0 ? '+' : ''}${delta.toFixed(1)}pp)` : ''}`];
      })),
    },
    {
      label: 'EBITDA',
      values: Object.fromEntries(summaryYears.map(a => [String(a.year), fmtMM(a.values.ebitda)])),
    },
    {
      label: 'EBITDA Margin',
      values: Object.fromEntries(summaryYears.map((a, i) => {
        const margin = a.values.totalRevenue > 0 ? (a.values.ebitda / a.values.totalRevenue) * 100 : 0;
        const prevMargin = i > 0 && summaryYears[i - 1].values.totalRevenue > 0
          ? (summaryYears[i - 1].values.ebitda / summaryYears[i - 1].values.totalRevenue) * 100 : null;
        const delta = prevMargin !== null ? margin - prevMargin : null;
        return [String(a.year), `${margin.toFixed(1)}%${delta !== null ? ` (${delta > 0 ? '+' : ''}${delta.toFixed(1)}pp)` : ''}`];
      })),
    },
  ];

  const currentMonth = m.months[last]?.fullLabel || '';

  return {
    company_profile: {
      name: m.settings.companyName,
      industry: `${m.settings.businessModel} · ${m.settings.customerBase}`,
      hq: '—',
    },
    header_meta: {
      actuals_through: m.settings.actualThruDate || currentMonth,
      prepared_by: '5th Line Capital',
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    },
    pnl: {
      recurring_revenue: {
        annual: recurringAnnual,
        ttm_revenue: ttmRecurring,
        prior_ttm: priorTtmRecurring,
        yoy_growth: priorTtmRecurring > 0 ? ((ttmRecurring - priorTtmRecurring) / priorTtmRecurring) * 100 : 0,
        flags: 0,
      },
      total_revenue: {
        annual: totalRevAnnual,
        ttm_revenue: ttmTotalRev,
        prior_ttm: priorTtmTotalRev,
        yoy_growth: priorTtmTotalRev > 0 ? ((ttmTotalRev - priorTtmTotalRev) / priorTtmTotalRev) * 100 : 0,
        flags: 0,
      },
      gross_margin: {
        annual: marginAnnual,
        ttm_gross_profit: ttmGrossProfit,
        ttm_avg_margin: ttmAvgMargin,
        flags: 0,
      },
      operating_income_ebitda: {
        annual: ebitdaAnnual,
        ttm_ebitda: ttmEbitda,
        ttm_op_income_pct: ttmOpIncomePct,
        flags: ttmEbitda < 0 ? 1 : 0,
      },
    },
    annual_pnl_summary: annualPnlSummary,
    charts: {
      current_month: currentMonth,
      revenue_breakdown: revBreakdown,
      revenue_vs_expenses: revExpData,
      ebitda_operating: ebitdaChartData,
    },
    summary: {
      business_model: m.settings.businessModel,
      customer_base: m.settings.customerBase,
      founded: '—',
      employees: '—',
      hq: '—',
      existing_gtl_debt: fmtCurrency(m.balanceSheet.ltDebt[last] + m.balanceSheet.stDebt[last], true),
    },
    saas_facility: {
      borrowing_capacity_today: m.borrowingCapacity,
      borrowing_capacity_6m: borrowingCapacity6m,
      deferred_revenue_today: deferredRevToday,
      deferred_revenue_6m: deferredRevToday * 1.1,
      facility_recommendation: m.facilityRecommendation,
    },
    materials_checklist: [
      { item: 'P&L', monthly: 'check', quarterly: 'check', annual: 'check' },
      { item: 'Balance Sheet', monthly: 'check', quarterly: 'check', annual: 'check' },
      { item: 'P&L Projections', monthly: 'dash', quarterly: 'check', annual: 'check' },
      { item: 'BS Projections', monthly: 'dash', quarterly: 'dash', annual: 'check' },
      { item: 'CF Projections', monthly: 'dash', quarterly: 'dash', annual: 'check' },
    ],
    financial_quality: {
      company_prepared: m.settings.financialQuality === 'Company Prepared' || true,
      cpa_reviewed: m.settings.financialQuality === 'CPA Reviewed',
      audited: m.settings.financialQuality === 'Audited',
    },
    operating_kpis: [
      { label: 'ARR TODAY', value: fmtCurrency(m.arrToday, true), delta: m.yoyRevGrowth > 0 ? `+${m.yoyRevGrowth.toFixed(0)}% YoY` : '', good: m.yoyRevGrowth > 0 },
      { label: 'MRR (3MO AVG)', value: fmtCurrency(m.mrrT3M, true), good: true },
      { label: 'GROSS MARGIN', value: fmtPct(m.latestGrossMargin), good: m.latestGrossMargin >= 60 },
      { label: 'YOY REV GROWTH', value: fmtPct(m.yoyRevGrowth), good: m.yoyRevGrowth > 20 },
      { label: 'NET REV RETENTION', value: m.netRevenueRetention > 0 ? fmtPct(m.netRevenueRetention) : '—', good: m.netRevenueRetention >= 100 },
      { label: 'TOTAL CUSTOMERS', value: customerCount > 0 ? customerCount.toLocaleString() : '—' },
      { label: 'RULE OF 40', value: `${ruleOf40.toFixed(0)}%`, good: ruleOf40 >= 40, icon: ruleOf40 >= 40 ? '✅' : '⚠️' },
      { label: 'MAGIC NUMBER', value: '—', good: true },
      { label: 'OPEX / REVENUE', value: `${opexPct.toFixed(1)}%`, good: opexPct < 80 },
      { label: 'MONTHLY BURN', value: monthlyBurn > 0 ? fmtCurrency(monthlyBurn, true) : 'Profitable', good: monthlyBurn === 0, icon: monthlyBurn === 0 ? '✅' : '' },
      { label: 'CASH RUNWAY', value: runway >= 999 ? '∞' : `${Math.round(runway)} mo`, good: runway >= 18 },
    ],
    saas_metrics: [
      { label: 'MRR (TTM AVG)', value: fmtCurrency(m.mrrT3M, true), sub: 'Trailing average' },
      { label: 'ARR TODAY', value: fmtCurrency(m.arrToday, true), sub: `As of ${currentMonth}` },
      { label: 'ARR IN 6 MONTHS', value: fmtCurrency(m.arrToday * (1 + growthRate * 0.5), true), sub: 'Projected' },
      { label: 'YOY GROSS RETENTION', value: '—', sub: 'Requires cohort data' },
      { label: 'NET RETENTION', value: m.netRevenueRetention > 0 ? fmtPct(m.netRevenueRetention) : '—' },
      { label: 'CHURN RATE', value: '—', sub: 'Requires cohort data' },
      { label: 'LARGEST CUSTOMER', value: '—', sub: '% of ARR' },
      { label: 'AVG CONTRACT VALUE', value: acv > 0 ? `$${Math.round(acv / 1000)}K` : '—', sub: acv > 0 ? 'Calculated' : 'Requires customer data' },
    ],
    analyst_notes: [
      {
        type: 'commentary' as const,
        text: m.ebitda[last] >= 0
          ? `Company is currently profitable with EBITDA of ${fmtCurrency(m.ebitda[last], true)}. Gross margins at ${fmtPct(m.latestGrossMargin)} with ${fmtPct(m.yoyRevGrowth)} YoY revenue growth. Current ratio: ${fmtRatio(m.currentRatio)}, AR/AP ratio: ${fmtRatio(m.arApRatio)}.`
          : `Company is pre-profit with negative EBITDA of ${fmtCurrency(m.ebitda[last], true)}. Monitor burn rate and runway closely. Current cash position: ${fmtCurrency(m.balanceSheet.cash[last], true)}.`,
      },
      {
        type: 'warning' as const,
        text: `⚠️ Financial statements are ${m.settings.financialQuality}. ${m.balanceSheet.bsCheck.filter(v => Math.abs(v) > 0.01).length > 0 ? `Balance sheet has ${m.balanceSheet.bsCheck.filter(v => Math.abs(v) > 0.01).length} period(s) with check imbalances.` : ''} ${m.currentRatio < 1.5 ? 'Current ratio below 1.5x target.' : ''}`,
      },
    ],
    balance_sheet: {
      flags: m.balanceSheet.bsCheck.filter(v => Math.abs(v) > 0.01).length,
      periods: bsPeriods,
      rows: bsRows,
    },
    ar_availability: {
      net_ar_availability: m.balanceSheet.ar[last] - m.balanceSheet.ap[last],
      total_ar: m.balanceSheet.ar[last],
      total_deferred_revenue: deferredRevToday,
      overdue_90_days: 0,
      net_ar_eligible: m.balanceSheet.ar[last] * 0.85,
    },
    flags: {
      pnl: ttmEbitda < 0 ? 1 : 0,
      balance_sheet: m.balanceSheet.bsCheck.filter(v => Math.abs(v) > 0.01).length,
      operating_kpis: 0,
      saas_metrics: 0,
    },
  };
}

export function SaaSModelDashboard({ model: m, annotations: ann }: Props) {
  const underwritingData = useMemo(() => buildUnderwritingData(m), [m]);

  return <CreditUnderwritingDashboard dealData={underwritingData} />;
}
