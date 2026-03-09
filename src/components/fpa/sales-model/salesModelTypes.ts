export interface SalesModelAssumptions {
  time_months: {
    email_to_call: number;
    on_board_to_proposal: number;
    proposal_to_engage: number;
    terms_to_funded: number;
    engage_to_terms_signed: number;
    engage_to_terms_received: number;
  };
  probability: {
    on_board_to_proposal: number;
    proposal_to_engage: number;
    clients_receiving_terms: number;
    engaged_to_terms_signed: number;
    terms_to_funded: number;
  };
  revenue_cost: {
    retainer: number;
    milestone_payments: number;
    closing_fee: number;
    commission: number;
  };
}

export interface PlanData {
  deals_on_board: number[];
  dollars_on_board: number[];
  proposals_issued: number[];
  dollars_proposed: number[];
  clients_signed: number[];
  dollars_signed: number[];
  clients_receiving_terms: number[];
  terms_signed: number[];
  volume_terms_signed: number[];
  deals_closed: number[];
  dollars_funded: number[];
}

export interface PipelineSnapshot {
  deals_in_dev: number[];
  dollars_in_dev: number[];
  active_deals: number[];
  active_deal_volume: number[];
  deals_in_diligence: number[];
  dollars_in_diligence: number[];
}

export interface RevenueData {
  retainer: number[];
  consulting_milestone: number[];
  fee: number[];
  total: number[];
}

export interface RepCostData {
  salary: number[];
  burden_rate: number[];
  four01k: number[];
  t_and_e: number[];
  commissions: number[];
  bonus_pool: number[];
  total: number[];
}

export interface ActualsInputData {
  deals_on_board: number[];
  dollars_on_board: number[];
  proposals_issued: number[];
  dollars_proposed: number[];
  clients_signed: number[];
  dollars_signed: number[];
  clients_receiving_terms: number[];
  terms_signed: number[];
  volume_terms_signed: number[];
  deals_closed: number[];
  dollars_funded: number[];
  retainer: number[];
  consulting_milestone: number[];
  fee: number[];
  total_revenue: number[];
}

export interface VarianceData {
  deals_on_board: number[];
  dollars_on_board: number[];
  proposals_issued: number[];
  dollars_proposed: number[];
  clients_signed: number[];
  dollars_signed: number[];
  clients_receiving_terms: number[];
  terms_signed: number[];
  volume_terms_signed: number[];
  deals_closed: number[];
  dollars_funded: number[];
  retainer: number[];
  consulting_milestone: number[];
  fee: number[];
  total_revenue: number[];
}

export interface RoiSection {
  profit: number[];
  ytd_profit: number[];
  ttm_profit: number[];
  all_time_profit: number[];
  ttm_roi: number[];
  all_time_roi: number[];
  ttm_multiple: number[];
  all_time_multiple: number[];
}

export interface PerfToPlan {
  deals_on_board: number[];
  dollars_on_board: number[];
  proposals_issued: number[];
  dollars_proposed: number[];
  clients_signed: number[];
  dollars_signed: number[];
  clients_receiving_terms: number[];
  terms_signed: number[];
  volume_terms_signed: number[];
  deals_closed: number[];
  dollars_funded: number[];
  retainer: number[];
  consulting_milestone: number[];
  fee: number[];
  total_revenue: number[];
}

export interface TeamData {
  plan: PlanData;
  pipeline_snapshot: PipelineSnapshot;
  revenue: RevenueData;
  ttm_revenue: number[];
  ytd_revenue: number[];
  msql: number[];
  revenue_signed_up: number[];
  rep_cost: RepCostData;
  next_12_bonus: number[];
  net_rep_profit: number[];
  all_time_rep_revenue: number[];
  all_time_rep_cost: number[];
  all_time_rep_profit: number[];
  all_time_rep_roi_pct: number[];
  all_time_rep_roi_multiple: number[];
  ttm_revenue_row63: number[];
  ttm_cost: number[];
  ttm_rep_profit: number[];
  ttm_rep_roi_pct: number[];
  ttm_rep_roi_multiple: number[];
  actuals_input: ActualsInputData;
  actuals_forecast_section: ActualsInputData;
  total_sales_pipeline_count: number[];
  total_sales_pipeline_dollars: number[];
  msql_row115: number[];
  revenue_signed_up_row117: number[];
  ytd_actual_revenue: number[];
  all_time_actual_revenue: number[];
  ttm_revenue_row121: number[];
  actuals_pipeline: PipelineSnapshot;
  variance_dollar: VarianceData;
  variance_pct: VarianceData;
  total_costs: number[];
  sales_team_roi: RoiSection;
  perf_to_plan: PerfToPlan;
  sidebar: SalesModelAssumptions;
}

export interface RepData {
  plan: PlanData;
  pipeline_snapshot: PipelineSnapshot;
  revenue: {
    retainer_revenue: number[];
    consulting__milestone_revenue: number[];
    fee_revenue: number[];
    total_revenue: number[];
  };
  ttm_revenue: number[];
  ytd_revenue: number[];
  msql: number[];
  revenue_signed_up: number[];
  rep_cost: {
    salary: number[];
    burden_rate: number[];
    '401k': number[];
    tande: number[];
    commissions: number[];
    bonus_pool: number[];
    total_rep_cost: number[];
  };
  next_12_bonus: number[];
  net_rep_profit: number[];
  all_time_rep_revenue: number[];
  all_time_rep_cost: number[];
  all_time_rep_profit: number[];
  all_time_rep_roi_pct: number[];
  all_time_rep_roi_multiple: number[];
  ttm_revenue_row63: number[];
  ttm_cost: number[];
  ttm_rep_profit: number[];
  ttm_rep_roi_pct: number[];
  ttm_rep_roi_multiple: number[];
  actuals_input: ActualsInputData;
  actuals_forecast_section: ActualsInputData;
  total_sales_pipeline_count: number[];
  total_sales_pipeline_dollars: number[];
  msql_row115: number[];
  revenue_signed_up_row117: number[];
  ytd_actual_revenue: number[];
  all_time_actual_revenue: number[];
  ttm_revenue_row121: number[];
  actuals_pipeline: PipelineSnapshot;
  variance_dollar: VarianceData;
  variance_pct: VarianceData;
  total_costs: number[];
  sales_rep_roi: RoiSection;
  perf_to_plan: PerfToPlan;
  sidebar: SalesModelAssumptions;
}

export type ViewMode = 'monthly' | 'quarterly';

export interface CustomMember {
  name: string;
  includeInTeam: boolean;
  data: RepData;
}

export type TabName = 'TEAM' | 'Teresa' | 'Niki' | 'Paz' | 'Flor' | 'EMPLOYEE2' | string;

export interface ChartDefinition {
  title: string;
  type: 'line' | 'bar';
  series: { label: string; data: number[]; color: string }[];
  yFormat: 'dollar' | 'count' | 'percent' | 'multiple';
}
