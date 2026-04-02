// Credit Underwriting Dashboard — Data Model

export interface UnderwritingDealData {
  company_profile: {
    name: string;
    industry: string;
    hq: string;
  };
  header_meta: {
    actuals_through: string;
    prepared_by: string;
    date: string;
  };
  pnl: {
    recurring_revenue: PnlBlock;
    total_revenue: PnlBlock;
    gross_margin: PnlMarginBlock;
    operating_income_ebitda: PnlEbitdaBlock;
  };
  annual_pnl_summary: AnnualPnlRow[];
  charts: {
    current_month: string;
    revenue_breakdown: ChartPoint[];
    revenue_vs_expenses: ChartPoint[];
    ebitda_operating: ChartPoint[];
  };
  summary: {
    business_model: string;
    customer_base: string;
    founded: string;
    employees: string;
    hq: string;
    existing_gtl_debt: string;
  };
  saas_facility: {
    borrowing_capacity_today: number;
    borrowing_capacity_6m: number;
    deferred_revenue_today: number;
    deferred_revenue_6m: number;
    facility_recommendation: number;
  };
  materials_checklist: ChecklistRow[];
  financial_quality: {
    company_prepared: boolean;
    cpa_reviewed: boolean;
    audited: boolean;
  };
  operating_kpis: KpiTile[];
  saas_metrics: SaasMetricTile[];
  analyst_notes: AnalystNote[];
  balance_sheet: {
    flags: number;
    periods: string[];
    rows: BalanceSheetRow[];
  };
  ar_availability: {
    net_ar_availability: number;
    total_ar: number;
    total_deferred_revenue: number;
    overdue_90_days: number;
    net_ar_eligible: number;
  };
  flags: { [section: string]: number };
}

export interface PnlBlock {
  annual: { year: string; amount: number; growth: number | null }[];
  ttm_revenue: number;
  prior_ttm: number;
  yoy_growth: number;
  flags?: number;
}

export interface PnlMarginBlock {
  annual: { year: string; margin: number; delta: number | null }[];
  ttm_gross_profit: number;
  ttm_avg_margin: number;
  flags?: number;
}

export interface PnlEbitdaBlock {
  annual: { year: string; amount: number; margin: number }[];
  ttm_ebitda: number;
  ttm_op_income_pct: number;
  flags?: number;
}

export interface AnnualPnlRow {
  label: string;
  values: { [year: string]: string };
}

export interface ChartPoint {
  period: string;
  actual?: number;
  projected?: number;
  recurring?: number;
  nonRecurring?: number;
  revenue?: number;
  expenses?: number;
  ebitda?: number;
  operating_income?: number;
  isProjected?: boolean;
}

export interface ChecklistRow {
  item: string;
  monthly: 'check' | 'blank' | 'dash';
  quarterly: 'check' | 'blank' | 'dash';
  annual: 'check' | 'blank' | 'dash';
}

export interface KpiTile {
  label: string;
  value: string;
  delta?: string;
  icon?: string;
  good?: boolean;
}

export interface SaasMetricTile {
  label: string;
  value: string;
  sub?: string;
}

export interface AnalystNote {
  type: 'commentary' | 'warning';
  text: string;
}

export interface BalanceSheetRow {
  item: string;
  values: number[];
}
