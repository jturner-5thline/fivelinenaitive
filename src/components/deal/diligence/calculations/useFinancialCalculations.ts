import { useMemo } from 'react';
import { DetectedStatement, FinancialMetric, DetectedLineItem } from '../types';

export interface CalculatedMetrics {
  leverage: FinancialMetric[];
  coverage: FinancialMetric[];
  growth: FinancialMetric[];
  margins: FinancialMetric[];
  cashFlow: FinancialMetric[];
  qoe: FinancialMetric[];
  all: FinancialMetric[];
}

export interface MetricExplanation {
  formula: string;
  inputs: { label: string; value: string; source?: string }[];
  timeSeries: { period: string; value: number | null }[];
  narrative: string;
}

function findLineItem(statements: DetectedStatement[], key: string): DetectedLineItem | undefined {
  for (const s of statements) {
    const item = s.lineItems.find(li => li.standardKey === key);
    if (item) return item;
  }
  return undefined;
}

function getLatestValue(item: DetectedLineItem | undefined): number | null {
  if (!item || item.values.length === 0) return null;
  const lastVal = item.values[item.values.length - 1];
  return lastVal?.value ?? null;
}

function getPriorValue(item: DetectedLineItem | undefined): number | null {
  if (!item || item.values.length < 2) return null;
  const priorVal = item.values[item.values.length - 2];
  return priorVal?.value ?? null;
}

function formatCurrency(v: number | null): string {
  if (v == null) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}MM`;
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function formatPct(v: number | null): string {
  if (v == null) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

function formatMultiple(v: number | null): string {
  if (v == null) return '—';
  return `${v.toFixed(1)}x`;
}

function calcGrowth(current: number | null, prior: number | null): number | null {
  if (current == null || prior == null || prior === 0) return null;
  return (current - prior) / Math.abs(prior);
}

export function useFinancialCalculations(statements: DetectedStatement[], rawMetrics: FinancialMetric[]) {
  return useMemo<CalculatedMetrics>(() => {
    // Try to derive from statement line items first, fall back to rawMetrics
    const revenue = findLineItem(statements, 'revenue');
    const ebitda = findLineItem(statements, 'ebitda');
    const ebitdaAdj = findLineItem(statements, 'adjusted_ebitda');
    const netIncome = findLineItem(statements, 'net_income');
    const totalDebt = findLineItem(statements, 'total_debt');
    const cash = findLineItem(statements, 'cash');
    const interestExp = findLineItem(statements, 'interest_expense');
    const capex = findLineItem(statements, 'capex');
    const grossProfit = findLineItem(statements, 'gross_profit');
    const cogs = findLineItem(statements, 'cogs');
    const fcf = findLineItem(statements, 'free_cash_flow');

    const revVal = getLatestValue(revenue);
    const ebitdaVal = getLatestValue(ebitdaAdj) ?? getLatestValue(ebitda);
    const debtVal = getLatestValue(totalDebt);
    const cashVal = getLatestValue(cash);
    const intExpVal = getLatestValue(interestExp);
    const capexVal = getLatestValue(capex);
    const gpVal = getLatestValue(grossProfit);
    const niVal = getLatestValue(netIncome);
    const fcfVal = getLatestValue(fcf);

    const revPrior = getPriorValue(revenue);
    const ebitdaPrior = getPriorValue(ebitdaAdj) ?? getPriorValue(ebitda);

    // Leverage
    const totalLeverage = debtVal != null && ebitdaVal != null && ebitdaVal !== 0 ? debtVal / ebitdaVal : null;
    const netDebt = debtVal != null && cashVal != null ? debtVal - cashVal : null;
    const netLeverage = netDebt != null && ebitdaVal != null && ebitdaVal !== 0 ? netDebt / ebitdaVal : null;

    const leverage: FinancialMetric[] = [
      { key: 'total_leverage', label: 'Total Debt / EBITDA', type: 'multiple', value: totalLeverage, formatted: formatMultiple(totalLeverage) },
      { key: 'net_leverage', label: 'Net Debt / EBITDA', type: 'multiple', value: netLeverage, formatted: formatMultiple(netLeverage) },
      { key: 'total_debt', label: 'Total Debt', type: 'currency', value: debtVal, formatted: formatCurrency(debtVal) },
      { key: 'net_debt', label: 'Net Debt', type: 'currency', value: netDebt, formatted: formatCurrency(netDebt) },
    ];

    // Coverage
    const interestCoverage = ebitdaVal != null && intExpVal != null && intExpVal !== 0 ? ebitdaVal / Math.abs(intExpVal) : null;
    const debtService = intExpVal != null ? Math.abs(intExpVal) : null;
    const fccr = ebitdaVal != null && capexVal != null && debtService != null && debtService !== 0
      ? (ebitdaVal - Math.abs(capexVal ?? 0)) / debtService : null;

    const coverage: FinancialMetric[] = [
      { key: 'interest_coverage', label: 'EBITDA / Interest', type: 'multiple', value: interestCoverage, formatted: formatMultiple(interestCoverage) },
      { key: 'fccr', label: '(EBITDA-CapEx) / Debt Service', type: 'multiple', value: fccr, formatted: formatMultiple(fccr) },
    ];

    // Growth
    const revGrowth = calcGrowth(revVal, revPrior);
    const ebitdaGrowth = calcGrowth(ebitdaVal, ebitdaPrior);

    const growth: FinancialMetric[] = [
      {
        key: 'revenue_growth', label: 'Revenue Growth YoY', type: 'percentage', value: revGrowth, formatted: formatPct(revGrowth),
        trend: revGrowth != null ? (revGrowth > 0.01 ? 'up' : revGrowth < -0.01 ? 'down' : 'flat') : undefined,
        trendPct: revGrowth != null ? Math.round(revGrowth * 100) : undefined,
      },
      {
        key: 'ebitda_growth', label: 'EBITDA Growth YoY', type: 'percentage', value: ebitdaGrowth, formatted: formatPct(ebitdaGrowth),
        trend: ebitdaGrowth != null ? (ebitdaGrowth > 0.01 ? 'up' : ebitdaGrowth < -0.01 ? 'down' : 'flat') : undefined,
        trendPct: ebitdaGrowth != null ? Math.round(ebitdaGrowth * 100) : undefined,
      },
      { key: 'revenue', label: 'Revenue (Latest)', type: 'currency', value: revVal, formatted: formatCurrency(revVal) },
      { key: 'ebitda_latest', label: 'EBITDA (Latest)', type: 'currency', value: ebitdaVal, formatted: formatCurrency(ebitdaVal) },
    ];

    // Margins
    const grossMargin = revVal != null && gpVal != null && revVal !== 0 ? gpVal / revVal : null;
    const ebitdaMargin = revVal != null && ebitdaVal != null && revVal !== 0 ? ebitdaVal / revVal : null;
    const netMargin = revVal != null && niVal != null && revVal !== 0 ? niVal / revVal : null;

    const margins: FinancialMetric[] = [
      { key: 'gross_margin', label: 'Gross Margin', type: 'percentage', value: grossMargin, formatted: formatPct(grossMargin) },
      { key: 'ebitda_margin', label: 'EBITDA Margin', type: 'percentage', value: ebitdaMargin, formatted: formatPct(ebitdaMargin) },
      { key: 'net_margin', label: 'Net Income Margin', type: 'percentage', value: netMargin, formatted: formatPct(netMargin) },
    ];

    // Cash Flow
    const cashFlowMetrics: FinancialMetric[] = [
      { key: 'capex', label: 'CapEx', type: 'currency', value: capexVal, formatted: formatCurrency(capexVal) },
      { key: 'fcf', label: 'Free Cash Flow', type: 'currency', value: fcfVal ?? (ebitdaVal != null && capexVal != null ? ebitdaVal - Math.abs(capexVal) : null), formatted: formatCurrency(fcfVal ?? (ebitdaVal != null && capexVal != null ? ebitdaVal - Math.abs(capexVal) : null)) },
    ];

    // QoE placeholder
    const qoe: FinancialMetric[] = [];

    // Merge computed + raw (raw fills gaps)
    const computed = [...leverage, ...coverage, ...growth, ...margins, ...cashFlowMetrics, ...qoe];
    const computedKeys = new Set(computed.map(m => m.key));
    const extras = rawMetrics.filter(m => !computedKeys.has(m.key));

    return {
      leverage,
      coverage,
      growth,
      margins,
      cashFlow: cashFlowMetrics,
      qoe,
      all: [...computed, ...extras],
    };
  }, [statements, rawMetrics]);
}

export function explainMetric(
  metricKey: string,
  statements: DetectedStatement[],
  calculatedMetrics: CalculatedMetrics
): MetricExplanation {
  const metric = calculatedMetrics.all.find(m => m.key === metricKey);

  const explanations: Record<string, () => MetricExplanation> = {
    total_leverage: () => {
      const debt = findLineItem(statements, 'total_debt');
      const ebitda = findLineItem(statements, 'ebitda') || findLineItem(statements, 'adjusted_ebitda');
      return {
        formula: 'Total Debt / EBITDA',
        inputs: [
          { label: 'Total Debt', value: formatCurrency(getLatestValue(debt)), source: debt?.values.at(-1)?.sourceCell },
          { label: 'EBITDA', value: formatCurrency(getLatestValue(ebitda)), source: ebitda?.values.at(-1)?.sourceCell },
        ],
        timeSeries: (ebitda?.values || []).map((v, i) => ({
          period: v.period,
          value: debt && debt.values[i] && v.value ? (debt.values[i].value ?? 0) / v.value : null,
        })),
        narrative: `Total leverage stands at ${metric?.formatted || '—'}, calculated as Total Debt divided by EBITDA.`,
      };
    },
    interest_coverage: () => {
      const ebitda = findLineItem(statements, 'ebitda') || findLineItem(statements, 'adjusted_ebitda');
      const interest = findLineItem(statements, 'interest_expense');
      return {
        formula: 'EBITDA / Interest Expense',
        inputs: [
          { label: 'EBITDA', value: formatCurrency(getLatestValue(ebitda)), source: ebitda?.values.at(-1)?.sourceCell },
          { label: 'Interest Expense', value: formatCurrency(getLatestValue(interest)), source: interest?.values.at(-1)?.sourceCell },
        ],
        timeSeries: (ebitda?.values || []).map((v, i) => ({
          period: v.period,
          value: interest && interest.values[i] && interest.values[i].value ? (v.value ?? 0) / Math.abs(interest.values[i].value!) : null,
        })),
        narrative: `Interest coverage is ${metric?.formatted || '—'}. Higher is better; below 1.5x is typically concerning.`,
      };
    },
  };

  const explainer = explanations[metricKey];
  if (explainer) return explainer();

  // Generic fallback
  return {
    formula: metric?.label || metricKey,
    inputs: [{ label: metric?.label || metricKey, value: metric?.formatted || '—' }],
    timeSeries: [],
    narrative: `${metric?.label || metricKey} is currently ${metric?.formatted || '—'}.`,
  };
}
