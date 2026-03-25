// Seed cell configuration for BD Budget Modelling & Reporting
// This defines per-row defaults; each expands across all QUARTERS_12 columns.

export interface CellSeedEntry {
  row_key: string;
  cell_type: 'formula' | 'qbo_metric' | 'static';
  formula_string?: string;
  qbo_metric_id?: string;
  qbo_entity?: string;
  qbo_account?: string;
  qbo_aggregation?: string;
  col_keys?: string[]; // if omitted, applies to all QUARTERS_12
}

export const BD_CELL_SEED: CellSeedEntry[] = [
  // ── Key Stats (all formula) ──
  { row_key: 'ttmRoiPct', cell_type: 'formula', formula_string: 'TTM Net Profit / TTM Total Costs w/ Bonus' },
  { row_key: 'ttmRoiPctDelta', cell_type: 'formula', formula_string: 'ttmRoiPct[Q] - ttmRoiPct[Q-1]' },
  { row_key: 'runRateROI', cell_type: 'formula', formula_string: 'Forward 4Q Net Profit / Forward 4Q Costs' },
  { row_key: 'runRateROIDelta', cell_type: 'formula', formula_string: 'runRateROI[Q] - runRateROI[Q-1]' },
  { row_key: 'ttmCostDOB', cell_type: 'formula', formula_string: 'TTM Total Costs w/ Bonus / TTM DOB' },
  { row_key: 'ttmCostDOBDelta', cell_type: 'formula', formula_string: 'ttmCostDOB[Q] - ttmCostDOB[Q-1]' },
  { row_key: 'ttmCAC', cell_type: 'formula', formula_string: 'TTM Total Costs w/ Bonus / TTM Deals Signed' },
  { row_key: 'ttmCACDelta', cell_type: 'formula', formula_string: 'ttmCAC[Q] - ttmCAC[Q-1]' },

  // ── Revenue ──
  { row_key: 'revDebt', cell_type: 'qbo_metric', qbo_metric_id: 'revenue_debt', qbo_entity: '5th Line', qbo_account: 'Debt Advisory Revenue', qbo_aggregation: 'sum' },
  { row_key: 'revFinServ', cell_type: 'qbo_metric', qbo_metric_id: 'revenue_finserv', qbo_entity: '5th Line', qbo_account: 'Financial Services Revenue', qbo_aggregation: 'sum' },
  { row_key: 'revOther', cell_type: 'static' },
  { row_key: 'totalRevenue', cell_type: 'formula', formula_string: 'Revenue Debt + Revenue FinServ + Revenue Other' },
  { row_key: 'ttmRevenue', cell_type: 'formula', formula_string: 'ROLLING_SUM(totalRevenue, 4)' },

  // ── Costs ──
  { row_key: 'events', cell_type: 'static' },
  { row_key: 'te', cell_type: 'static' },
  { row_key: 'flights', cell_type: 'static' },
  { row_key: 'food', cell_type: 'static' },
  { row_key: 'otherTE', cell_type: 'static' },
  { row_key: 'software', cell_type: 'static' },
  { row_key: 'other2', cell_type: 'static' },
  { row_key: 'other3', cell_type: 'static' },
  { row_key: 'allOther', cell_type: 'static' },
  { row_key: 'otherCosts', cell_type: 'formula', formula_string: 'Software + Other2 + Other3 + AllOther' },
  { row_key: 'salesBD', cell_type: 'formula', formula_string: 'Events(offset for Q4-Q8) + T&E + Other Costs' },

  // ── P&L Calculations ──
  { row_key: 'margin', cell_type: 'formula', formula_string: 'Total Revenue − Sales & BD Costs' },
  { row_key: 'ytdMargin', cell_type: 'formula', formula_string: 'YTD_SUM(margin)' },
  { row_key: 'ttmMargin', cell_type: 'formula', formula_string: 'ROLLING_SUM(margin, 4)' },
  { row_key: 'allTimeMargin', cell_type: 'formula', formula_string: 'ALL_TIME_SUM(margin)' },
  { row_key: 'marginPct', cell_type: 'formula', formula_string: 'margin / totalRevenue' },
  { row_key: 'hcDebt', cell_type: 'qbo_metric', qbo_metric_id: 'headcount_debt', qbo_entity: '5th Line', qbo_account: 'Payroll — Debt Team', qbo_aggregation: 'sum' },
  { row_key: 'hcFinServ', cell_type: 'qbo_metric', qbo_metric_id: 'headcount_finserv', qbo_entity: '5th Line', qbo_account: 'Payroll — FinServ Team', qbo_aggregation: 'sum' },
  { row_key: 'hcCT', cell_type: 'static' },
  { row_key: 'headcount', cell_type: 'formula', formula_string: 'HC Debt + HC FinServ + HC Chandler+Tyler' },
  { row_key: 'totalCosts', cell_type: 'formula', formula_string: 'Sales & BD Costs + Headcount' },
  { row_key: 'opProfit', cell_type: 'formula', formula_string: 'Total Revenue − Total Costs' },
  { row_key: 'ytdOpProfit', cell_type: 'formula', formula_string: 'YTD_SUM(operatingProfit)' },
  { row_key: 'ttmOpProfit', cell_type: 'formula', formula_string: 'ROLLING_SUM(operatingProfit, 4)' },
  { row_key: 'allTimeOpProfit', cell_type: 'formula', formula_string: 'ALL_TIME_SUM(operatingProfit)' },
  { row_key: 'ttmROI', cell_type: 'formula', formula_string: 'ROLLING_SUM(totalRevenue, 4) / ROLLING_SUM(totalCosts, 4)' },
  { row_key: 'ttmROIDelta', cell_type: 'formula', formula_string: 'ttmROI[Q] - ttmROI[Q-1]' },
  { row_key: 'cmBonus', cell_type: 'static' },
  { row_key: 'totalCostsWBonus', cell_type: 'formula', formula_string: 'Total Costs + CM Bonus' },
  { row_key: 'netProfit', cell_type: 'formula', formula_string: 'Operating Profit − CM Bonus' },
  { row_key: 'ytdProfit', cell_type: 'formula', formula_string: 'YTD_SUM(netProfit)' },
  { row_key: 'ttmProfit', cell_type: 'formula', formula_string: 'ROLLING_SUM(netProfit, 4)' },
  { row_key: 'allTimeProfit', cell_type: 'formula', formula_string: 'ALL_TIME_SUM(netProfit)' },
  { row_key: 'ttmROIWBonus', cell_type: 'formula', formula_string: 'ROLLING_SUM(totalRevenue, 4) / ROLLING_SUM(totalCostsWBonus, 4)' },
  { row_key: 'ttmROIWBonusDelta', cell_type: 'formula', formula_string: 'ttmROIWBonus[Q] - ttmROIWBonus[Q-1]' },
  { row_key: 'salesBDPctRev', cell_type: 'formula', formula_string: 'salesBDCosts / totalRevenue' },

  // ── Dealflow Performance (all sourced from platform data) ──
  { row_key: 'dobTotal', cell_type: 'qbo_metric', qbo_metric_id: 'dealflow_dob', qbo_entity: '5th Line', qbo_account: 'Deals on Board (Platform)', qbo_aggregation: 'count' },
  { row_key: 'dobPartner', cell_type: 'qbo_metric', qbo_metric_id: 'dealflow_dob_partner', qbo_entity: '5th Line', qbo_account: 'DOB — Partner Channel', qbo_aggregation: 'count' },
  { row_key: 'dobBank', cell_type: 'qbo_metric', qbo_metric_id: 'dealflow_dob_bank', qbo_entity: '5th Line', qbo_account: 'DOB — Bank Channel', qbo_aggregation: 'count' },
  { row_key: 'dsTotal', cell_type: 'qbo_metric', qbo_metric_id: 'dealflow_ds', qbo_entity: '5th Line', qbo_account: 'Deals Signed (Platform)', qbo_aggregation: 'count' },
  { row_key: 'dsPartner', cell_type: 'qbo_metric', qbo_metric_id: 'dealflow_ds_partner', qbo_entity: '5th Line', qbo_account: 'DS — Partner Channel', qbo_aggregation: 'count' },
  { row_key: 'dsBank', cell_type: 'qbo_metric', qbo_metric_id: 'dealflow_ds_bank', qbo_entity: '5th Line', qbo_account: 'DS — Bank Channel', qbo_aggregation: 'count' },
  { row_key: 'dcTotal', cell_type: 'qbo_metric', qbo_metric_id: 'dealflow_dc', qbo_entity: '5th Line', qbo_account: 'Deals Closed (Platform)', qbo_aggregation: 'count' },
  { row_key: 'dcPartner', cell_type: 'qbo_metric', qbo_metric_id: 'dealflow_dc_partner', qbo_entity: '5th Line', qbo_account: 'DC — Partner Channel', qbo_aggregation: 'count' },
  { row_key: 'dcBank', cell_type: 'qbo_metric', qbo_metric_id: 'dealflow_dc_bank', qbo_entity: '5th Line', qbo_account: 'DC — Bank Channel', qbo_aggregation: 'count' },

  // ── Financial Performance ──
  { row_key: 'revGenerated', cell_type: 'qbo_metric', qbo_metric_id: 'fin_perf_rev', qbo_entity: '5th Line', qbo_account: 'Revenue Generated', qbo_aggregation: 'sum' },
  { row_key: 'revPartner', cell_type: 'qbo_metric', qbo_metric_id: 'fin_perf_rev_partner', qbo_entity: '5th Line', qbo_account: 'Revenue — Partner', qbo_aggregation: 'sum' },
  { row_key: 'revBank', cell_type: 'qbo_metric', qbo_metric_id: 'fin_perf_rev_bank', qbo_entity: '5th Line', qbo_account: 'Revenue — Bank', qbo_aggregation: 'sum' },
  { row_key: 'profit', cell_type: 'formula', formula_string: 'Revenue Generated − Total Costs' },
  { row_key: 'profitPartner', cell_type: 'formula', formula_string: 'Revenue Partner − Costs Partner' },
  { row_key: 'profitBank', cell_type: 'formula', formula_string: 'Revenue Bank − Costs Bank' },
];
