import { DetectedStatement, FinancialMetric, DataIssue } from '../types';

export interface ValidationResult {
  id: string;
  category: 'reconciliation' | 'completeness' | 'consistency' | 'confidence';
  severity: 'error' | 'warning' | 'info';
  title: string;
  description: string;
  metric?: string;
  expected?: string;
  actual?: string;
  confidence?: number;
  suggestions?: string[];
}

export interface ConfidenceScore {
  metric: string;
  label: string;
  score: number; // 0–100
  factors: ConfidenceFactor[];
}

export interface ConfidenceFactor {
  name: string;
  weight: number;
  score: number;
  detail: string;
}

/**
 * Run cross-statement reconciliation checks
 */
export function runReconciliationChecks(statements: DetectedStatement[]): ValidationResult[] {
  const results: ValidationResult[] = [];

  // Find income statement and balance sheet
  const incomeStmt = statements.find(s => s.type === 'income_statement');
  const balanceSheet = statements.find(s => s.type === 'balance_sheet');
  const cashFlow = statements.find(s => s.type === 'cash_flow');

  // Check: Net Income on IS should match Net Income on BS retained earnings change
  if (incomeStmt && balanceSheet) {
    const netIncome = incomeStmt.lineItems.find(li => li.standardKey === 'net_income');
    const retainedEarnings = balanceSheet.lineItems.find(li => li.standardKey === 'retained_earnings');

    if (netIncome && retainedEarnings && netIncome.values.length > 1 && retainedEarnings.values.length > 1) {
      const niValue = netIncome.values[0]?.value;
      const reCurrent = retainedEarnings.values[0]?.value;
      const rePrior = retainedEarnings.values[1]?.value;

      if (niValue != null && reCurrent != null && rePrior != null) {
        const reChange = reCurrent - rePrior;
        const diff = Math.abs(niValue - reChange);
        if (diff > Math.abs(niValue) * 0.05) {
          results.push({
            id: 'recon-ni-re',
            category: 'reconciliation',
            severity: 'warning',
            title: 'Net Income ≠ Retained Earnings Change',
            description: `Net income of ${formatCurrency(niValue)} doesn't reconcile with retained earnings change of ${formatCurrency(reChange)}. Difference: ${formatCurrency(diff)}.`,
            expected: formatCurrency(niValue),
            actual: formatCurrency(reChange),
            suggestions: ['Check for dividends or other equity adjustments', 'Verify period alignment between statements'],
          });
        }
      }
    }
  }

  // Check: Cash Flow ending balance should match BS cash
  if (cashFlow && balanceSheet) {
    const cfEndingCash = cashFlow.lineItems.find(li =>
      li.standardKey === 'ending_cash' || li.standardKey === 'cash_end_period'
    );
    const bsCash = balanceSheet.lineItems.find(li =>
      li.standardKey === 'cash' || li.standardKey === 'cash_equivalents'
    );

    if (cfEndingCash?.values[0]?.value != null && bsCash?.values[0]?.value != null) {
      const diff = Math.abs(cfEndingCash.values[0].value - bsCash.values[0].value);
      if (diff > 1000) {
        results.push({
          id: 'recon-cash-bs-cf',
          category: 'reconciliation',
          severity: 'error',
          title: 'Cash Flow ≠ Balance Sheet Cash',
          description: `Ending cash on cash flow statement (${formatCurrency(cfEndingCash.values[0].value)}) doesn't match balance sheet cash (${formatCurrency(bsCash.values[0].value)}).`,
          expected: formatCurrency(cfEndingCash.values[0].value),
          actual: formatCurrency(bsCash.values[0].value),
        });
      }
    }
  }

  // Check: Balance sheet balances (A = L + E)
  if (balanceSheet) {
    const totalAssets = balanceSheet.lineItems.find(li => li.standardKey === 'total_assets');
    const totalLiabilities = balanceSheet.lineItems.find(li => li.standardKey === 'total_liabilities');
    const totalEquity = balanceSheet.lineItems.find(li => li.standardKey === 'total_equity');

    if (totalAssets?.values[0]?.value != null && totalLiabilities?.values[0]?.value != null && totalEquity?.values[0]?.value != null) {
      const assets = totalAssets.values[0].value;
      const liabPlusEquity = totalLiabilities.values[0].value + totalEquity.values[0].value;
      const diff = Math.abs(assets - liabPlusEquity);
      if (diff > 1000) {
        results.push({
          id: 'recon-bs-balance',
          category: 'reconciliation',
          severity: 'error',
          title: 'Balance Sheet Does Not Balance',
          description: `Total Assets (${formatCurrency(assets)}) ≠ Total Liabilities + Equity (${formatCurrency(liabPlusEquity)}). Difference: ${formatCurrency(diff)}.`,
          expected: formatCurrency(assets),
          actual: formatCurrency(liabPlusEquity),
        });
      }
    }
  }

  // Check: EBITDA consistency (Revenue - COGS - OpEx + D&A)
  if (incomeStmt) {
    const revenue = incomeStmt.lineItems.find(li => li.standardKey === 'revenue');
    const ebitda = incomeStmt.lineItems.find(li => li.standardKey === 'ebitda');
    const cogs = incomeStmt.lineItems.find(li => li.standardKey === 'cogs' || li.standardKey === 'cost_of_revenue');

    if (revenue?.values[0]?.value && ebitda?.values[0]?.value) {
      const margin = ebitda.values[0].value / revenue.values[0].value;
      if (margin > 0.6 || margin < -0.1) {
        results.push({
          id: 'recon-ebitda-margin',
          category: 'consistency',
          severity: 'warning',
          title: 'Unusual EBITDA Margin',
          description: `EBITDA margin of ${(margin * 100).toFixed(1)}% appears unusual. Typical range is 5-50% for most industries.`,
          metric: 'ebitda_margin',
          suggestions: ['Verify EBITDA calculation includes all operating expenses', 'Check if add-backs are correctly applied'],
        });
      }
    }
  }

  return results;
}

/**
 * Run completeness checks — verify expected line items exist
 */
export function runCompletenessChecks(statements: DetectedStatement[]): ValidationResult[] {
  const results: ValidationResult[] = [];

  const expectedIS = ['revenue', 'cogs', 'gross_profit', 'ebitda', 'net_income'];
  const expectedBS = ['total_assets', 'total_liabilities', 'total_equity', 'cash'];
  const expectedCF = ['operating_cash_flow', 'investing_cash_flow', 'financing_cash_flow'];

  const is = statements.find(s => s.type === 'income_statement');
  const bs = statements.find(s => s.type === 'balance_sheet');
  const cf = statements.find(s => s.type === 'cash_flow');

  if (!is) {
    results.push({
      id: 'complete-no-is',
      category: 'completeness',
      severity: 'warning',
      title: 'No Income Statement Detected',
      description: 'An income statement was not found in the uploaded files. Revenue, margins, and profitability analysis will be limited.',
    });
  } else {
    const keys = is.lineItems.map(li => li.standardKey);
    const missing = expectedIS.filter(k => !keys.includes(k));
    if (missing.length > 0) {
      results.push({
        id: 'complete-is-missing',
        category: 'completeness',
        severity: 'info',
        title: `Income Statement Missing ${missing.length} Line Items`,
        description: `Expected items not found: ${missing.join(', ')}. These may need manual mapping.`,
        suggestions: missing.map(m => `Map or add "${m}" from source data`),
      });
    }
  }

  if (!bs) {
    results.push({
      id: 'complete-no-bs',
      category: 'completeness',
      severity: 'warning',
      title: 'No Balance Sheet Detected',
      description: 'A balance sheet was not found. Leverage, working capital, and asset analysis will be limited.',
    });
  }

  if (!cf) {
    results.push({
      id: 'complete-no-cf',
      category: 'completeness',
      severity: 'info',
      title: 'No Cash Flow Statement Detected',
      description: 'A cash flow statement was not found. Free cash flow and liquidity analysis will be estimated.',
    });
  }

  return results;
}

/**
 * Calculate confidence scores for extracted metrics
 */
export function calculateConfidenceScores(
  statements: DetectedStatement[],
  metrics: FinancialMetric[]
): ConfidenceScore[] {
  return metrics.map(metric => {
    const factors: ConfidenceFactor[] = [];

    // Factor 1: Source extraction confidence
    const sourceStatement = statements.find(s =>
      s.lineItems.some(li => li.standardKey === metric.key)
    );
    const sourceItem = sourceStatement?.lineItems.find(li => li.standardKey === metric.key);
    const extractionConf = sourceItem?.confidence ?? 0.5;
    factors.push({
      name: 'Extraction Accuracy',
      weight: 0.35,
      score: extractionConf * 100,
      detail: sourceItem
        ? `AI matched "${sourceItem.label}" with ${(extractionConf * 100).toFixed(0)}% confidence`
        : 'No direct source mapping found — value may be estimated',
    });

    // Factor 2: Data completeness (how many periods have values)
    const valueCount = sourceItem?.values.filter(v => v.value != null).length ?? 0;
    const totalPeriods = sourceItem?.values.length ?? 1;
    const completenessPct = totalPeriods > 0 ? (valueCount / totalPeriods) * 100 : 0;
    factors.push({
      name: 'Data Completeness',
      weight: 0.25,
      score: completenessPct,
      detail: `${valueCount}/${totalPeriods} periods have values`,
    });

    // Factor 3: Cross-reference validation
    const hasReconciliation = sourceStatement != null;
    factors.push({
      name: 'Cross-Reference',
      weight: 0.2,
      score: hasReconciliation ? 80 : 30,
      detail: hasReconciliation
        ? 'Value found in structured financial statement'
        : 'No cross-reference available — single source only',
    });

    // Factor 4: Reasonableness check
    let reasonableScore = 75;
    if (metric.type === 'percentage' && metric.value != null) {
      if (metric.value > 100 || metric.value < -100) reasonableScore = 20;
      else if (metric.value > 60 || metric.value < -30) reasonableScore = 50;
    }
    if (metric.type === 'multiple' && metric.value != null) {
      if (metric.value > 20 || metric.value < 0) reasonableScore = 30;
    }
    factors.push({
      name: 'Reasonableness',
      weight: 0.2,
      score: reasonableScore,
      detail: reasonableScore >= 70
        ? 'Value within expected range for metric type'
        : 'Value outside typical range — manual review recommended',
    });

    const overallScore = factors.reduce((sum, f) => sum + f.score * f.weight, 0);

    return {
      metric: metric.key,
      label: metric.label,
      score: Math.round(overallScore),
      factors,
    };
  });
}

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(1)}MM`;
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}
