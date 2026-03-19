import { useMemo } from 'react';
import { useBDRoiStore } from './useBDRoiStore';
import { QUARTERS_12, COVER_META } from './bdRoiData';
import { computeDashboard } from './bdRoiFormulas';
import { formatBDCurrency, formatBDMultiple, formatBDDelta, formatBDPct } from './bdRoiFormatters';
import { BDChartGrid } from './BDCharts';
import { BDFinancialTable, type TableSection } from './BDFinancialTable';
import { TrendingUp, TrendingDown, DollarSign, BarChart3 } from 'lucide-react';
import { getVisibleIndices } from './QuarterFilter';

export function BDDashboardTab() {
  const { revenue, costs, headcount, cmBonus, dealflow, finPerf } = useBDRoiStore();
  const store = useBDRoiStore();

  const c = useMemo(() => computeDashboard(revenue, costs, headcount, cmBonus, dealflow), [revenue, costs, headcount, cmBonus, dealflow]);

  const Q = 12;
  const last = Q - 1;

  // KPI Cards
  const kpis = [
    {
      label: 'TTM Revenue', value: formatBDCurrency(c.ttmRevenue[last]),
      delta: formatBDDelta(c.ttmRevenue[last], c.ttmRevenue[last - 1]),
      icon: DollarSign, color: '#60a5fa',
    },
    {
      label: 'TTM Margin', value: formatBDCurrency(c.ttmMargin[last]),
      delta: formatBDDelta(c.ttmMargin[last], c.ttmMargin[last - 1]),
      icon: TrendingUp, color: '#34d399',
    },
    {
      label: 'TTM ROI', value: formatBDMultiple(c.ttmROI[last]),
      delta: formatBDDelta(c.ttmROI[last], c.ttmROI[last - 1]),
      icon: BarChart3, color: '#60a5fa',
    },
    {
      label: 'Net Profit', value: formatBDCurrency(c.netProfit[last]),
      delta: formatBDDelta(c.netProfit[last], c.netProfit[last - 1]),
      icon: c.netProfit[last] >= 0 ? TrendingUp : TrendingDown, color: c.netProfit[last] >= 0 ? '#34d399' : '#f87171',
    },
  ];

  // Build table sections
  const makeEditFn = (category: string, key: string) => (index: number, value: number) => {
    store.updateNestedArray(category, key, index, value, QUARTERS_12[index], 'Dashboard');
  };
  const makeFlatEditFn = (category: string) => (index: number, value: number) => {
    store.updateFlatArray(category, index, value, QUARTERS_12[index], 'Dashboard');
  };

  const keyStatsSection: TableSection = {
    key: 'keyStats', label: 'Key Stats',
    rows: [
      { key: 'ttmRoiPct', label: 'TTM ROI', values: c.ttmROIPct, format: 'percent', formulaDesc: 'TTM Net Profit / TTM Total Costs w/ Bonus' },
      { key: 'ttmRoiPctDelta', label: 'QoQ Change', values: c.ttmROIPct.map((v, i) => i > 0 ? (v !== null && c.ttmROIPct[i-1] !== null ? v - (c.ttmROIPct[i-1] as number) : null) : null), format: 'percent', isDelta: true },
      { key: 'runRateROI', label: 'RunRate ROI', values: c.runRateROI, format: 'multiple', formulaDesc: 'Forward 4Q Net Profit / Forward 4Q Costs' },
      { key: 'runRateROIDelta', label: 'QoQ Change', values: c.runRateROI.map((v, i) => i > 0 ? (v !== null && c.runRateROI[i-1] !== null ? v - (c.runRateROI[i-1] as number) : null) : null), format: 'multiple', isDelta: true },
      { key: 'ttmCostDOB', label: 'TTM Cost/DOB', values: c.ttmCostPerDOB, format: 'dollar', formulaDesc: 'TTM Total Costs w/ Bonus / TTM DOB' },
      { key: 'ttmCostDOBDelta', label: 'QoQ Change', values: c.ttmCostPerDOB.map((v, i) => i > 0 ? (v !== null && c.ttmCostPerDOB[i-1] !== null ? v - (c.ttmCostPerDOB[i-1] as number) : null) : null), format: 'dollar', isDelta: true },
      { key: 'ttmCAC', label: 'TTM CAC', values: c.ttmCAC, format: 'dollar', formulaDesc: 'TTM Total Costs w/ Bonus / TTM Deals Signed' },
      { key: 'ttmCACDelta', label: 'QoQ Change', values: c.ttmCAC.map((v, i) => i > 0 ? (v !== null && c.ttmCAC[i-1] !== null ? v - (c.ttmCAC[i-1] as number) : null) : null), format: 'dollar', isDelta: true },
    ],
  };

  const revenueSection: TableSection = {
    key: 'revenue', label: 'Revenue',
    rows: [
      { key: 'revDebt', label: 'Revenue: Debt', values: revenue.debt, format: 'dollar', editable: true, onEdit: makeEditFn('revenue', 'debt') },
      { key: 'revFinServ', label: 'Revenue: FinServ', values: revenue.finServ, format: 'dollar', editable: true, onEdit: makeEditFn('revenue', 'finServ') },
      { key: 'revOther', label: 'Revenue: Other', values: revenue.other, format: 'dollar', editable: true, onEdit: makeEditFn('revenue', 'other') },
      { key: 'totalRevenue', label: 'Total Revenue', values: c.totalRevenue, format: 'dollar', isTotal: true, formulaDesc: 'Debt + FinServ + Other' },
      { key: 'ttmRevenue', label: 'TTM Revenue', values: c.ttmRevenue, format: 'dollar', formulaDesc: 'Rolling 4Q sum of Total Revenue' },
    ],
  };

  const costsSection: TableSection = {
    key: 'costs', label: 'Costs',
    rows: [
      { key: 'events', label: 'Events & Sponsorships', values: costs.events, format: 'dollar', editable: true, onEdit: makeEditFn('costs', 'events') },
      { key: 'te', label: 'T&E', values: costs.te, format: 'dollar', editable: true, onEdit: makeEditFn('costs', 'te') },
      { key: 'flights', label: 'Flights & Hotel', values: costs.flights, format: 'dollar', editable: true, indented: true, onEdit: makeEditFn('costs', 'flights') },
      { key: 'food', label: 'Food & Entertainment', values: costs.food, format: 'dollar', editable: true, indented: true, onEdit: makeEditFn('costs', 'food') },
      { key: 'otherTE', label: 'Other T&E', values: costs.otherTE, format: 'dollar', editable: true, indented: true, onEdit: makeEditFn('costs', 'otherTE') },
      { key: 'software', label: 'Software', values: costs.software, format: 'dollar', editable: true, onEdit: makeEditFn('costs', 'software') },
      { key: 'other2', label: 'Other 2', values: costs.other2, format: 'dollar', editable: true, onEdit: makeEditFn('costs', 'other2') },
      { key: 'other3', label: 'Other 3', values: costs.other3, format: 'dollar', editable: true, onEdit: makeEditFn('costs', 'other3') },
      { key: 'allOther', label: 'All Other', values: costs.allOther, format: 'dollar', editable: true, onEdit: makeEditFn('costs', 'allOther') },
      { key: 'otherCosts', label: 'Other', values: c.otherCosts, format: 'dollar', isSubtotal: true, formulaDesc: 'Software + Other2 + Other3 + AllOther' },
      { key: 'salesBD', label: 'Sales & BD Costs', values: c.salesBDCosts, format: 'dollar', isTotal: true, formulaDesc: 'Events + T&E + Other Costs' },
    ],
  };

  const plSection: TableSection = {
    key: 'pl', label: 'P&L Calculations',
    rows: [
      { key: 'margin', label: 'Margin', values: c.margin, format: 'dollar', isTotal: true, formulaDesc: 'Total Revenue − Sales & BD Costs' },
      { key: 'ytdMargin', label: 'YTD Margin', values: c.ytdMargin, format: 'dollar' },
      { key: 'ttmMargin', label: 'TTM Margin', values: c.ttmMargin, format: 'dollar' },
      { key: 'allTimeMargin', label: 'All-Time Margin', values: c.allTimeMargin, format: 'dollar' },
      { key: 'marginPct', label: 'Margin %', values: c.marginPct, format: 'percent' },
      { key: 'hcDebt', label: 'Headcount — Debt', values: headcount.debt, format: 'dollar', editable: true, onEdit: makeEditFn('headcount', 'debt') },
      { key: 'hcFinServ', label: 'Headcount — FinServ', values: headcount.finServ, format: 'dollar', editable: true, onEdit: makeEditFn('headcount', 'finServ') },
      { key: 'hcCT', label: 'Headcount — Chandler+Tyler', values: headcount.chandlerTyler, format: 'dollar', editable: true, onEdit: makeEditFn('headcount', 'chandlerTyler') },
      { key: 'headcount', label: 'Headcount', values: c.headcount, format: 'dollar', isTotal: true, formulaDesc: 'Debt + FinServ + Chandler+Tyler' },
      { key: 'totalCosts', label: 'Total Costs', values: c.totalCosts, format: 'dollar', isTotal: true, formulaDesc: 'Sales & BD + Headcount' },
      { key: 'opProfit', label: 'Operating Profit', values: c.operatingProfit, format: 'dollar', isTotal: true, formulaDesc: 'Revenue − Total Costs' },
      { key: 'ytdOpProfit', label: 'YTD Op. Profit', values: c.ytdOpProfit, format: 'dollar' },
      { key: 'ttmOpProfit', label: 'TTM Op. Profit', values: c.ttmOpProfit, format: 'dollar' },
      { key: 'allTimeOpProfit', label: 'All-Time Op. Profit', values: c.allTimeOpProfit, format: 'dollar' },
      { key: 'ttmROI', label: 'TTM ROI', values: c.ttmROI, format: 'multiple' },
      { key: 'ttmROIDelta', label: 'QoQ Change', values: c.ttmROI.map((v, i) => i > 0 ? (v !== null && c.ttmROI[i-1] !== null ? v - (c.ttmROI[i-1] as number) : null) : null), format: 'multiple', isDelta: true },
      { key: 'cmBonus', label: 'CM Bonus', values: cmBonus, format: 'dollar', editable: true, onEdit: makeFlatEditFn('cmBonus') },
      { key: 'totalCostsWBonus', label: 'Total Costs (w/ Bonus)', values: c.totalCostsWBonus, format: 'dollar', isTotal: true },
      { key: 'netProfit', label: 'Net Profit', values: c.netProfit, format: 'dollar', isTotal: true, formulaDesc: 'Operating Profit − CM Bonus' },
      { key: 'ytdProfit', label: 'YTD Profit', values: c.ytdProfit, format: 'dollar' },
      { key: 'ttmProfit', label: 'TTM Profit', values: c.ttmProfit, format: 'dollar' },
      { key: 'allTimeProfit', label: 'All-Time Profit', values: c.allTimeProfit, format: 'dollar' },
      { key: 'ttmROIWBonus', label: 'TTM ROI (w/ Bonus)', values: c.ttmROIWBonus, format: 'multiple' },
      { key: 'ttmROIWBonusDelta', label: 'QoQ Change', values: c.ttmROIWBonus.map((v, i) => i > 0 ? (v !== null && c.ttmROIWBonus[i-1] !== null ? v - (c.ttmROIWBonus[i-1] as number) : null) : null), format: 'multiple', isDelta: true },
      { key: 'salesBDPctRev', label: 'Sales & BD as % Rev', values: c.salesBDPctRev, format: 'percent' },
    ],
  };

  const dealflowSection: TableSection = {
    key: 'dealflow', label: 'Dealflow Performance',
    rows: [
      { key: 'dobTotal', label: 'Deals on Board', values: dealflow.dobTotal, format: 'number', editable: true, isDatarails: true, onEdit: makeEditFn('dealflow', 'dobTotal') },
      { key: 'dobPartner', label: 'DOB — Partner', values: dealflow.dobPartner, format: 'number', editable: true, isDatarails: true, indented: true, onEdit: makeEditFn('dealflow', 'dobPartner') },
      { key: 'dobBank', label: 'DOB — Bank', values: dealflow.dobBank, format: 'number', editable: true, isDatarails: true, indented: true, onEdit: makeEditFn('dealflow', 'dobBank') },
      { key: 'dsTotal', label: 'Deals Signed', values: dealflow.dsTotal, format: 'number', editable: true, isDatarails: true, onEdit: makeEditFn('dealflow', 'dsTotal') },
      { key: 'dsPartner', label: 'DS — Partner', values: dealflow.dsPartner, format: 'number', editable: true, isDatarails: true, indented: true, onEdit: makeEditFn('dealflow', 'dsPartner') },
      { key: 'dsBank', label: 'DS — Bank', values: dealflow.dsBank, format: 'number', editable: true, isDatarails: true, indented: true, onEdit: makeEditFn('dealflow', 'dsBank') },
      { key: 'dcTotal', label: 'Deals Closed', values: dealflow.dcTotal, format: 'number', editable: true, isDatarails: true, onEdit: makeEditFn('dealflow', 'dcTotal') },
      { key: 'dcPartner', label: 'DC — Partner', values: dealflow.dcPartner, format: 'number', editable: true, isDatarails: true, indented: true, onEdit: makeEditFn('dealflow', 'dcPartner') },
      { key: 'dcBank', label: 'DC — Bank', values: dealflow.dcBank, format: 'number', editable: true, isDatarails: true, indented: true, onEdit: makeEditFn('dealflow', 'dcBank') },
    ],
  };

  const finPerfSection: TableSection = {
    key: 'finPerf', label: 'Financial Performance',
    rows: [
      { key: 'revGenerated', label: 'Revenue Generated', values: finPerf.revGenerated, format: 'dollar', editable: true, onEdit: makeEditFn('finPerf', 'revGenerated') },
      { key: 'revPartner', label: 'Rev — Partner', values: finPerf.revPartner, format: 'dollar', editable: true, indented: true, onEdit: makeEditFn('finPerf', 'revPartner') },
      { key: 'revBank', label: 'Rev — Bank', values: finPerf.revBank, format: 'dollar', editable: true, indented: true, onEdit: makeEditFn('finPerf', 'revBank') },
      { key: 'profit', label: 'Profit', values: finPerf.profit, format: 'dollar', editable: true, onEdit: makeEditFn('finPerf', 'profit') },
      { key: 'profitPartner', label: 'Profit — Partner', values: finPerf.profitPartner, format: 'dollar', editable: true, indented: true, onEdit: makeEditFn('finPerf', 'profitPartner') },
      { key: 'profitBank', label: 'Profit — Bank', values: finPerf.profitBank, format: 'dollar', editable: true, indented: true, onEdit: makeEditFn('finPerf', 'profitBank') },
    ],
  };

  const allSections = [keyStatsSection, revenueSection, costsSection, plSection, dealflowSection, finPerfSection];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-card border border-border/50 rounded-lg p-4">
        <h2 className="text-lg font-bold text-foreground">{COVER_META.title}</h2>
        <div className="flex flex-wrap gap-4 mt-1 text-[11px] text-muted-foreground">
          <span>Last Update: <strong className="text-foreground">{COVER_META.lastUpdate}</strong></span>
          <span>Actuals Through: <strong className="text-foreground">{COVER_META.actualsThrough}</strong></span>
          <span>ROI Target: <strong className="text-primary">{COVER_META.roiTarget}x</strong></span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map(kpi => (
          <div key={kpi.label} className="bg-card border border-border/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <kpi.icon className="h-4 w-4" style={{ color: kpi.color }} />
              <span className="text-[11px] text-muted-foreground font-medium">{kpi.label}</span>
            </div>
            <div className="text-xl font-bold text-foreground">{kpi.value}</div>
            <div className="text-[10px] mt-0.5" style={{ color: kpi.delta.color || undefined }}>
              <span className={!kpi.delta.color ? 'text-muted-foreground' : ''}>{kpi.delta.text}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <BDChartGrid
        revenue={revenue}
        headcount={headcount}
        dealflow={dealflow}
        finPerf={finPerf}
        computed={c}
      />

      {/* Data Tables */}
      <BDFinancialTable sections={allSections} quarters={QUARTERS_12} />
    </div>
  );
}
