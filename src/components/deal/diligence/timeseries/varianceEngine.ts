import { DetectedStatement, DetectedLineItem } from '../types';

export interface PeriodVariance {
  metric: string;
  label: string;
  periods: string[];
  values: (number | null)[];
  changes: (number | null)[];     // absolute change
  changePcts: (number | null)[];  // percentage change
}

export interface WaterfallItem {
  name: string;
  value: number;
  cumulative: number;
  type: 'increase' | 'decrease' | 'total';
}

export interface DriverDecomposition {
  metric: string;
  label: string;
  fromPeriod: string;
  toPeriod: string;
  fromValue: number;
  toValue: number;
  totalChange: number;
  drivers: DriverItem[];
}

export interface DriverItem {
  label: string;
  contribution: number;
  pctOfChange: number;
  direction: 'positive' | 'negative';
}

export interface TrendNarrative {
  metric: string;
  narrative: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  highlights: string[];
}

const LABEL_MAP: Record<string, string> = {
  revenue: 'Revenue',
  cogs: 'COGS',
  gross_profit: 'Gross Profit',
  opex: 'Operating Expenses',
  ebitda: 'EBITDA',
  net_income: 'Net Income',
  total_assets: 'Total Assets',
  total_liabilities: 'Total Liabilities',
  total_equity: 'Total Equity',
  total_debt: 'Total Debt',
  cash: 'Cash & Equivalents',
  operating_cash_flow: 'Operating Cash Flow',
  capex: 'Capital Expenditures',
  free_cash_flow: 'Free Cash Flow',
  interest_expense: 'Interest Expense',
  depreciation: 'Depreciation & Amortization',
};

function getLabel(key: string): string {
  return LABEL_MAP[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function buildVarianceTable(statements: DetectedStatement[]): PeriodVariance[] {
  const metricMap = new Map<string, Map<string, number | null>>();

  for (const s of statements) {
    for (const li of s.lineItems) {
      if (!metricMap.has(li.standardKey)) metricMap.set(li.standardKey, new Map());
      const pm = metricMap.get(li.standardKey)!;
      for (const v of li.values) {
        pm.set(v.period, v.value);
      }
    }
  }

  const allPeriods = new Set<string>();
  metricMap.forEach(pm => pm.forEach((_, p) => allPeriods.add(p)));
  const sortedPeriods = Array.from(allPeriods).sort();

  const results: PeriodVariance[] = [];

  metricMap.forEach((periodValues, key) => {
    const values = sortedPeriods.map(p => periodValues.get(p) ?? null);
    const changes: (number | null)[] = [null];
    const changePcts: (number | null)[] = [null];

    for (let i = 1; i < values.length; i++) {
      const prev = values[i - 1];
      const curr = values[i];
      if (prev != null && curr != null) {
        changes.push(curr - prev);
        changePcts.push(prev !== 0 ? ((curr - prev) / Math.abs(prev)) * 100 : null);
      } else {
        changes.push(null);
        changePcts.push(null);
      }
    }

    results.push({
      metric: key,
      label: getLabel(key),
      periods: sortedPeriods,
      values,
      changes,
      changePcts,
    });
  });

  return results;
}

export function buildWaterfallBridge(
  statements: DetectedStatement[],
  fromPeriod: string,
  toPeriod: string
): WaterfallItem[] {
  const lineItems = new Map<string, { from: number; to: number }>();

  const incomeStatements = statements.filter(s => s.type === 'income_statement');
  for (const s of incomeStatements) {
    for (const li of s.lineItems) {
      const fromVal = li.values.find(v => v.period === fromPeriod)?.value;
      const toVal = li.values.find(v => v.period === toPeriod)?.value;
      if (fromVal != null && toVal != null) {
        lineItems.set(li.standardKey, { from: fromVal, to: toVal });
      }
    }
  }

  const rev = lineItems.get('revenue');
  if (!rev) return [];

  const items: WaterfallItem[] = [];
  let cumulative = rev.from;

  items.push({ name: `Revenue (${fromPeriod})`, value: rev.from, cumulative, type: 'total' });

  const revenueChange = rev.to - rev.from;
  cumulative += revenueChange;
  items.push({
    name: 'Revenue Δ',
    value: revenueChange,
    cumulative,
    type: revenueChange >= 0 ? 'increase' : 'decrease',
  });

  const bridgeKeys = ['cogs', 'opex', 'interest_expense', 'depreciation'];
  for (const key of bridgeKeys) {
    const item = lineItems.get(key);
    if (item) {
      const change = -(item.to - item.from); // costs are inverted for bridge
      cumulative += change;
      items.push({
        name: `${getLabel(key)} Δ`,
        value: change,
        cumulative,
        type: change >= 0 ? 'increase' : 'decrease',
      });
    }
  }

  const ebitda = lineItems.get('ebitda') || lineItems.get('net_income');
  if (ebitda) {
    items.push({ name: `EBITDA (${toPeriod})`, value: ebitda.to, cumulative: ebitda.to, type: 'total' });
  }

  return items;
}

export function buildDriverDecomposition(
  statements: DetectedStatement[],
  metricKey: string,
  fromPeriod: string,
  toPeriod: string
): DriverDecomposition | null {
  const incomeStatements = statements.filter(s => s.type === 'income_statement');
  const allItems = incomeStatements.flatMap(s => s.lineItems);

  const target = allItems.find(li => li.standardKey === metricKey);
  if (!target) return null;

  const fromVal = target.values.find(v => v.period === fromPeriod)?.value;
  const toVal = target.values.find(v => v.period === toPeriod)?.value;
  if (fromVal == null || toVal == null) return null;

  const totalChange = toVal - fromVal;
  const drivers: DriverItem[] = [];

  // For EBITDA: decompose into revenue change, COGS change, OpEx change
  if (metricKey === 'ebitda' || metricKey === 'net_income') {
    const components = ['revenue', 'cogs', 'opex', 'interest_expense'];
    for (const key of components) {
      const item = allItems.find(li => li.standardKey === key);
      if (item) {
        const f = item.values.find(v => v.period === fromPeriod)?.value;
        const t = item.values.find(v => v.period === toPeriod)?.value;
        if (f != null && t != null) {
          const change = key === 'revenue' ? (t - f) : -(t - f);
          drivers.push({
            label: getLabel(key),
            contribution: change,
            pctOfChange: totalChange !== 0 ? (change / Math.abs(totalChange)) * 100 : 0,
            direction: change >= 0 ? 'positive' : 'negative',
          });
        }
      }
    }
  }

  // For revenue: just show total change
  if (drivers.length === 0) {
    drivers.push({
      label: `${getLabel(metricKey)} Change`,
      contribution: totalChange,
      pctOfChange: 100,
      direction: totalChange >= 0 ? 'positive' : 'negative',
    });
  }

  return {
    metric: metricKey,
    label: getLabel(metricKey),
    fromPeriod,
    toPeriod,
    fromValue: fromVal,
    toValue: toVal,
    totalChange,
    drivers,
  };
}

export function generateTrendNarratives(variances: PeriodVariance[]): TrendNarrative[] {
  const narratives: TrendNarrative[] = [];

  for (const v of variances) {
    const validChanges = v.changePcts.filter((c): c is number => c != null);
    if (validChanges.length === 0) continue;

    const avgChange = validChanges.reduce((a, b) => a + b, 0) / validChanges.length;
    const latestChange = validChanges[validChanges.length - 1];
    const latestValue = v.values.filter((val): val is number => val != null).pop();

    const highlights: string[] = [];
    let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
    const parts: string[] = [];

    // Determine trend direction
    const isGrowthMetric = ['revenue', 'ebitda', 'net_income', 'gross_profit', 'free_cash_flow'].includes(v.metric);
    const isCostMetric = ['cogs', 'opex', 'interest_expense', 'total_debt'].includes(v.metric);

    if (isGrowthMetric) {
      sentiment = latestChange > 2 ? 'positive' : latestChange < -2 ? 'negative' : 'neutral';
    } else if (isCostMetric) {
      sentiment = latestChange < -2 ? 'positive' : latestChange > 2 ? 'negative' : 'neutral';
    }

    // Build narrative
    const trendWord = latestChange > 5 ? 'strong growth' :
                      latestChange > 0 ? 'modest increase' :
                      latestChange > -5 ? 'slight decline' : 'significant decline';

    parts.push(`${v.label} showed ${trendWord} of ${Math.abs(latestChange).toFixed(1)}% in the most recent period.`);

    if (latestValue != null) {
      const formatted = latestValue >= 1e6 ? `$${(latestValue / 1e6).toFixed(1)}M` :
                        latestValue >= 1e3 ? `$${(latestValue / 1e3).toFixed(0)}K` :
                        `$${latestValue.toFixed(0)}`;
      parts.push(`Current value stands at ${formatted}.`);
      highlights.push(`Latest: ${formatted}`);
    }

    if (validChanges.length >= 2) {
      const isAccelerating = validChanges[validChanges.length - 1] > validChanges[validChanges.length - 2];
      parts.push(isAccelerating ? 'The rate of change is accelerating.' : 'The rate of change is decelerating.');
      highlights.push(isAccelerating ? 'Accelerating' : 'Decelerating');
    }

    highlights.push(`${latestChange >= 0 ? '+' : ''}${latestChange.toFixed(1)}% PoP`);

    narratives.push({
      metric: v.metric,
      narrative: parts.join(' '),
      sentiment,
      highlights,
    });
  }

  return narratives;
}
