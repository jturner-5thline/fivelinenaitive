import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function safeDivide(a: number, b: number): number {
  if (!b || !isFinite(b)) return 0;
  const result = a / b;
  return isFinite(result) ? result : 0;
}

interface FinRow {
  year_month: string;
  account_key: string;
  account_label: string;
  value: number;
}

interface MetricRow {
  deal_id: string;
  company_id: string | null;
  metric_key: string;
  metric_label: string;
  category: string;
  subcategory: string | null;
  period_type: string;
  period_label: string;
  period_start: string | null;
  period_end: string | null;
  fiscal_year: number | null;
  value: number | null;
  unit_type: string;
  is_actual: boolean;
  is_projection: boolean;
  trend_direction: string | null;
  trend_magnitude: string | null;
  is_outlier: boolean;
  is_missing: boolean;
  confidence: number;
  computed_at: string;
}

// Group financial rows by period
function groupByPeriod(rows: FinRow[]): Map<string, Map<string, number>> {
  const periods = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (!periods.has(r.year_month)) periods.set(r.year_month, new Map());
    periods.get(r.year_month)!.set(r.account_key, r.value);
  }
  return periods;
}

// Get value from period map, defaulting to 0
function pv(periodMap: Map<string, number> | undefined, key: string): number {
  return periodMap?.get(key) ?? 0;
}

// Compute trend direction
function trendDir(current: number, previous: number): string | null {
  if (previous === 0 && current === 0) return 'flat';
  const change = safeDivide(current - previous, Math.abs(previous)) * 100;
  if (Math.abs(change) < 2) return 'flat';
  return change > 0 ? 'up' : 'down';
}

function trendMag(current: number, previous: number): string | null {
  if (previous === 0) return null;
  const pctChange = Math.abs(safeDivide(current - previous, Math.abs(previous)) * 100);
  if (pctChange < 5) return 'minor';
  if (pctChange < 20) return 'moderate';
  return 'significant';
}

function isOutlierCheck(current: number, values: number[]): boolean {
  if (values.length < 4) return false;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const stdDev = Math.sqrt(values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length);
  if (stdDev === 0) return false;
  return Math.abs(current - mean) > 2.5 * stdDev;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { deal_id } = await req.json();
    if (!deal_id) {
      return new Response(JSON.stringify({ error: "deal_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get company_id
    const { data: deal } = await supabase.from("deals").select("company_id").eq("id", deal_id).single();
    const companyId = deal?.company_id || null;

    // Fetch all financial data for this deal
    const { data: finData, error: finError } = await supabase
      .from("deal_financial_data")
      .select("year_month, account_key, account_label, value")
      .eq("deal_id", deal_id)
      .order("year_month");

    if (finError) throw finError;
    if (!finData || finData.length === 0) {
      return new Response(JSON.stringify({ success: true, metrics_count: 0, message: "No financial data found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rows = finData as FinRow[];
    const periods = groupByPeriod(rows);
    const sortedPeriods = [...periods.keys()].sort();
    const now = new Date().toISOString();

    const metrics: MetricRow[] = [];

    // Helper to add a metric for each period
    function addMetric(
      key: string, label: string, category: string, subcategory: string | null,
      unit: string, computeFn: (pm: Map<string, number>, period: string, idx: number) => number | null
    ) {
      const values: number[] = [];
      for (let i = 0; i < sortedPeriods.length; i++) {
        const period = sortedPeriods[i];
        const pm = periods.get(period)!;
        const val = computeFn(pm, period, i);
        if (val !== null) values.push(val);

        const prevPeriod = i > 0 ? sortedPeriods[i - 1] : null;
        const prevVal = i > 0 && values.length > 1 ? values[values.length - 2] : null;

        // Parse period for fiscal year
        const [y, m] = period.split('-').map(Number);

        metrics.push({
          deal_id,
          company_id: companyId,
          metric_key: key,
          metric_label: label,
          category,
          subcategory,
          period_type: 'month',
          period_label: period,
          period_start: `${period}-01`,
          period_end: null,
          fiscal_year: y,
          value: val,
          unit_type: unit,
          is_actual: true,
          is_projection: false,
          trend_direction: prevVal !== null && val !== null ? trendDir(val, prevVal) : null,
          trend_magnitude: prevVal !== null && val !== null ? trendMag(val, prevVal) : null,
          is_outlier: val !== null ? isOutlierCheck(val, values) : false,
          is_missing: val === null,
          confidence: 1.0,
          computed_at: now,
        });
      }
    }

    // === INCOME STATEMENT METRICS ===
    addMetric('revenue', 'Revenue', 'income_statement', 'revenue', 'currency',
      (pm) => pv(pm, 'recurring_revenue') + pv(pm, 'non_recurring_revenue') + pv(pm, 'other_revenue'));

    addMetric('recurring_revenue', 'Recurring Revenue', 'income_statement', 'revenue', 'currency',
      (pm) => pv(pm, 'recurring_revenue'));

    addMetric('gross_profit', 'Gross Profit', 'income_statement', 'profitability', 'currency',
      (pm) => {
        const rev = pv(pm, 'recurring_revenue') + pv(pm, 'non_recurring_revenue') + pv(pm, 'other_revenue');
        const cogs = pv(pm, 'cogs_on_recurring') + pv(pm, 'cogs_on_non_recurring') + pv(pm, 'cogs_labor');
        return rev - cogs;
      });

    addMetric('gross_margin', 'Gross Margin', 'income_statement', 'profitability', 'percentage',
      (pm) => {
        const rev = pv(pm, 'recurring_revenue') + pv(pm, 'non_recurring_revenue') + pv(pm, 'other_revenue');
        const cogs = pv(pm, 'cogs_on_recurring') + pv(pm, 'cogs_on_non_recurring') + pv(pm, 'cogs_labor');
        return rev > 0 ? ((rev - cogs) / rev) * 100 : null;
      });

    addMetric('ebitda', 'EBITDA', 'income_statement', 'profitability', 'currency',
      (pm) => {
        const rev = pv(pm, 'recurring_revenue') + pv(pm, 'non_recurring_revenue') + pv(pm, 'other_revenue');
        const cogs = pv(pm, 'cogs_on_recurring') + pv(pm, 'cogs_on_non_recurring') + pv(pm, 'cogs_labor');
        const gp = rev - cogs;
        const opex = pv(pm, 'salaries_and_benefits') + pv(pm, 'sales_and_marketing') +
          pv(pm, 'research_and_development') + pv(pm, 'professional_fees') + pv(pm, 'general_and_administrative');
        const opIncome = gp - opex;
        return opIncome + pv(pm, 'depreciation_expense');
      });

    addMetric('ebitda_margin', 'EBITDA Margin', 'income_statement', 'profitability', 'percentage',
      (pm) => {
        const rev = pv(pm, 'recurring_revenue') + pv(pm, 'non_recurring_revenue') + pv(pm, 'other_revenue');
        const cogs = pv(pm, 'cogs_on_recurring') + pv(pm, 'cogs_on_non_recurring') + pv(pm, 'cogs_labor');
        const gp = rev - cogs;
        const opex = pv(pm, 'salaries_and_benefits') + pv(pm, 'sales_and_marketing') +
          pv(pm, 'research_and_development') + pv(pm, 'professional_fees') + pv(pm, 'general_and_administrative');
        const ebitda = gp - opex + pv(pm, 'depreciation_expense');
        return rev > 0 ? (ebitda / rev) * 100 : null;
      });

    addMetric('operating_income', 'Operating Income', 'income_statement', 'profitability', 'currency',
      (pm) => {
        const rev = pv(pm, 'recurring_revenue') + pv(pm, 'non_recurring_revenue') + pv(pm, 'other_revenue');
        const cogs = pv(pm, 'cogs_on_recurring') + pv(pm, 'cogs_on_non_recurring') + pv(pm, 'cogs_labor');
        const opex = pv(pm, 'salaries_and_benefits') + pv(pm, 'sales_and_marketing') +
          pv(pm, 'research_and_development') + pv(pm, 'professional_fees') + pv(pm, 'general_and_administrative');
        return (rev - cogs) - opex;
      });

    addMetric('net_income', 'Net Income', 'income_statement', 'profitability', 'currency',
      (pm) => {
        const rev = pv(pm, 'recurring_revenue') + pv(pm, 'non_recurring_revenue') + pv(pm, 'other_revenue');
        const cogs = pv(pm, 'cogs_on_recurring') + pv(pm, 'cogs_on_non_recurring') + pv(pm, 'cogs_labor');
        const opex = pv(pm, 'salaries_and_benefits') + pv(pm, 'sales_and_marketing') +
          pv(pm, 'research_and_development') + pv(pm, 'professional_fees') + pv(pm, 'general_and_administrative');
        const opIncome = (rev - cogs) - opex;
        const ebt = opIncome - pv(pm, 'interest_expense') + pv(pm, 'interest_income') - pv(pm, 'depreciation_expense') - pv(pm, 'other_expense');
        return ebt - pv(pm, 'tax_expense');
      });

    // === BALANCE SHEET METRICS ===
    addMetric('cash', 'Cash', 'balance_sheet', 'liquidity', 'currency',
      (pm) => pv(pm, 'cash_and_cash_equivalents'));

    addMetric('total_debt', 'Total Debt', 'balance_sheet', 'leverage', 'currency',
      (pm) => pv(pm, 'short_term_debt') + pv(pm, 'long_term_debt'));

    addMetric('net_debt', 'Net Debt', 'balance_sheet', 'leverage', 'currency',
      (pm) => pv(pm, 'short_term_debt') + pv(pm, 'long_term_debt') - pv(pm, 'cash_and_cash_equivalents'));

    addMetric('working_capital', 'Working Capital', 'balance_sheet', 'liquidity', 'currency',
      (pm) => {
        const ca = pv(pm, 'cash_and_cash_equivalents') + pv(pm, 'marketable_securities') +
          pv(pm, 'accounts_receivable') + pv(pm, 'prepaid_expenses') + pv(pm, 'inventory') + pv(pm, 'other_current_assets');
        const cl = pv(pm, 'accounts_payable') + pv(pm, 'credit_cards') + pv(pm, 'employee_accruals') +
          pv(pm, 'other_accrued_liabilities') + pv(pm, 'short_term_debt') + pv(pm, 'deferred_revenue') + pv(pm, 'other_short_term_liabilities');
        return ca - cl;
      });

    addMetric('current_ratio', 'Current Ratio', 'balance_sheet', 'liquidity', 'ratio',
      (pm) => {
        const ca = pv(pm, 'cash_and_cash_equivalents') + pv(pm, 'marketable_securities') +
          pv(pm, 'accounts_receivable') + pv(pm, 'prepaid_expenses') + pv(pm, 'inventory') + pv(pm, 'other_current_assets');
        const cl = pv(pm, 'accounts_payable') + pv(pm, 'credit_cards') + pv(pm, 'employee_accruals') +
          pv(pm, 'other_accrued_liabilities') + pv(pm, 'short_term_debt') + pv(pm, 'deferred_revenue') + pv(pm, 'other_short_term_liabilities');
        return cl > 0 ? ca / cl : null;
      });

    // === GROWTH METRICS (YoY) ===
    // Compute YoY revenue growth — requires 12-period lookback
    for (let i = 12; i < sortedPeriods.length; i++) {
      const current = sortedPeriods[i];
      const prior = sortedPeriods[i - 12];
      const curPm = periods.get(current)!;
      const priorPm = periods.get(prior)!;
      const curRev = pv(curPm, 'recurring_revenue') + pv(curPm, 'non_recurring_revenue') + pv(curPm, 'other_revenue');
      const priorRev = pv(priorPm, 'recurring_revenue') + pv(priorPm, 'non_recurring_revenue') + pv(priorPm, 'other_revenue');
      const [y] = current.split('-').map(Number);

      if (priorRev > 0) {
        metrics.push({
          deal_id, company_id: companyId,
          metric_key: 'revenue_growth_yoy', metric_label: 'Revenue Growth YoY',
          category: 'growth', subcategory: 'revenue', period_type: 'month', period_label: current,
          period_start: `${current}-01`, period_end: null, fiscal_year: y,
          value: ((curRev - priorRev) / priorRev) * 100,
          unit_type: 'percentage', is_actual: true, is_projection: false,
          trend_direction: null, trend_magnitude: null, is_outlier: false, is_missing: false,
          confidence: 1.0, computed_at: now,
        });
      }
    }

    // MoM revenue growth
    for (let i = 1; i < sortedPeriods.length; i++) {
      const current = sortedPeriods[i];
      const prior = sortedPeriods[i - 1];
      const curPm = periods.get(current)!;
      const priorPm = periods.get(prior)!;
      const curRev = pv(curPm, 'recurring_revenue') + pv(curPm, 'non_recurring_revenue') + pv(curPm, 'other_revenue');
      const priorRev = pv(priorPm, 'recurring_revenue') + pv(priorPm, 'non_recurring_revenue') + pv(priorPm, 'other_revenue');
      const [y] = current.split('-').map(Number);

      if (priorRev > 0) {
        metrics.push({
          deal_id, company_id: companyId,
          metric_key: 'revenue_growth_mom', metric_label: 'Revenue Growth MoM',
          category: 'growth', subcategory: 'revenue', period_type: 'month', period_label: current,
          period_start: `${current}-01`, period_end: null, fiscal_year: y,
          value: ((curRev - priorRev) / priorRev) * 100,
          unit_type: 'percentage', is_actual: true, is_projection: false,
          trend_direction: null, trend_magnitude: null, is_outlier: false, is_missing: false,
          confidence: 1.0, computed_at: now,
        });
      }
    }

    // === LEVERAGE RATIOS ===
    addMetric('leverage_ratio', 'Leverage Ratio', 'leverage', 'debt', 'multiple',
      (pm) => {
        const debt = pv(pm, 'short_term_debt') + pv(pm, 'long_term_debt');
        const rev = pv(pm, 'recurring_revenue') + pv(pm, 'non_recurring_revenue') + pv(pm, 'other_revenue');
        const cogs = pv(pm, 'cogs_on_recurring') + pv(pm, 'cogs_on_non_recurring') + pv(pm, 'cogs_labor');
        const opex = pv(pm, 'salaries_and_benefits') + pv(pm, 'sales_and_marketing') +
          pv(pm, 'research_and_development') + pv(pm, 'professional_fees') + pv(pm, 'general_and_administrative');
        const ebitda = (rev - cogs - opex) + pv(pm, 'depreciation_expense');
        // Annualize monthly EBITDA
        const annualizedEbitda = ebitda * 12;
        return annualizedEbitda > 0 ? debt / annualizedEbitda : null;
      });

    addMetric('interest_coverage', 'Interest Coverage', 'leverage', 'debt', 'multiple',
      (pm) => {
        const rev = pv(pm, 'recurring_revenue') + pv(pm, 'non_recurring_revenue') + pv(pm, 'other_revenue');
        const cogs = pv(pm, 'cogs_on_recurring') + pv(pm, 'cogs_on_non_recurring') + pv(pm, 'cogs_labor');
        const opex = pv(pm, 'salaries_and_benefits') + pv(pm, 'sales_and_marketing') +
          pv(pm, 'research_and_development') + pv(pm, 'professional_fees') + pv(pm, 'general_and_administrative');
        const ebitda = (rev - cogs - opex) + pv(pm, 'depreciation_expense');
        const interest = pv(pm, 'interest_expense');
        return interest > 0 ? ebitda / interest : null;
      });

    // === SaaS METRICS ===
    addMetric('arr', 'Annual Recurring Revenue', 'saas', 'revenue', 'currency',
      (pm) => pv(pm, 'recurring_revenue') * 12);

    addMetric('mrr', 'Monthly Recurring Revenue', 'saas', 'revenue', 'currency',
      (pm) => pv(pm, 'recurring_revenue'));

    // === BURN & RUNWAY ===
    addMetric('burn_rate', 'Monthly Burn Rate', 'operating', 'cash', 'currency',
      (pm) => {
        const rev = pv(pm, 'recurring_revenue') + pv(pm, 'non_recurring_revenue') + pv(pm, 'other_revenue');
        const cogs = pv(pm, 'cogs_on_recurring') + pv(pm, 'cogs_on_non_recurring') + pv(pm, 'cogs_labor');
        const opex = pv(pm, 'salaries_and_benefits') + pv(pm, 'sales_and_marketing') +
          pv(pm, 'research_and_development') + pv(pm, 'professional_fees') + pv(pm, 'general_and_administrative');
        const ebitda = (rev - cogs - opex) + pv(pm, 'depreciation_expense');
        return ebitda < 0 ? Math.abs(ebitda) : 0;
      });

    addMetric('runway_months', 'Cash Runway (Months)', 'operating', 'cash', 'number',
      (pm) => {
        const cash = pv(pm, 'cash_and_cash_equivalents');
        const rev = pv(pm, 'recurring_revenue') + pv(pm, 'non_recurring_revenue') + pv(pm, 'other_revenue');
        const cogs = pv(pm, 'cogs_on_recurring') + pv(pm, 'cogs_on_non_recurring') + pv(pm, 'cogs_labor');
        const opex = pv(pm, 'salaries_and_benefits') + pv(pm, 'sales_and_marketing') +
          pv(pm, 'research_and_development') + pv(pm, 'professional_fees') + pv(pm, 'general_and_administrative');
        const ebitda = (rev - cogs - opex) + pv(pm, 'depreciation_expense');
        const burn = ebitda < 0 ? Math.abs(ebitda) : 0;
        return burn > 0 ? cash / burn : 999;
      });

    // === RULE OF 40 ===
    // Only meaningful with YoY growth data available
    for (let i = 12; i < sortedPeriods.length; i++) {
      const current = sortedPeriods[i];
      const prior = sortedPeriods[i - 12];
      const curPm = periods.get(current)!;
      const priorPm = periods.get(prior)!;
      const curRev = pv(curPm, 'recurring_revenue') + pv(curPm, 'non_recurring_revenue') + pv(curPm, 'other_revenue');
      const priorRev = pv(priorPm, 'recurring_revenue') + pv(priorPm, 'non_recurring_revenue') + pv(priorPm, 'other_revenue');
      const cogs = pv(curPm, 'cogs_on_recurring') + pv(curPm, 'cogs_on_non_recurring') + pv(curPm, 'cogs_labor');
      const opex = pv(curPm, 'salaries_and_benefits') + pv(curPm, 'sales_and_marketing') +
        pv(curPm, 'research_and_development') + pv(curPm, 'professional_fees') + pv(curPm, 'general_and_administrative');
      const ebitda = (curRev - cogs - opex) + pv(curPm, 'depreciation_expense');
      const ebitdaMargin = curRev > 0 ? (ebitda / curRev) * 100 : 0;
      const yoyGrowth = priorRev > 0 ? ((curRev - priorRev) / priorRev) * 100 : 0;
      const [y] = current.split('-').map(Number);

      metrics.push({
        deal_id, company_id: companyId,
        metric_key: 'rule_of_40', metric_label: 'Rule of 40',
        category: 'saas', subcategory: 'efficiency', period_type: 'month', period_label: current,
        period_start: `${current}-01`, period_end: null, fiscal_year: y,
        value: yoyGrowth + ebitdaMargin,
        unit_type: 'percentage', is_actual: true, is_projection: false,
        trend_direction: null, trend_magnitude: null, is_outlier: false, is_missing: false,
        confidence: 1.0, computed_at: now,
      });
    }

    // === UPSERT METRICS ===
    // Delete existing metrics for this deal first (clean recompute)
    await supabase.from("deal_computed_metrics").delete().eq("deal_id", deal_id);

    // Batch insert
    const batchSize = 200;
    for (let i = 0; i < metrics.length; i += batchSize) {
      const batch = metrics.slice(i, i + batchSize);
      const { error } = await supabase.from("deal_computed_metrics").insert(batch as any);
      if (error) {
        console.error("Batch insert error:", error);
        throw error;
      }
    }

    // Mark any existing insights as stale
    await supabase.from("deal_financial_insights")
      .update({ is_stale: true, updated_at: now } as any)
      .eq("deal_id", deal_id);

    return new Response(JSON.stringify({
      success: true,
      metrics_count: metrics.length,
      periods: sortedPeriods.length,
      metric_keys: [...new Set(metrics.map(m => m.metric_key))],
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("compute-financial-metrics error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
