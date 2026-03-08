import { SaaSModelData, MonthEntry, LenderConfig, LenderComputedResults, AmortizationRow } from './types';

const MONTH_COUNT = 24;

function zeros(n = MONTH_COUNT): number[] {
  return new Array(n).fill(0);
}

function safeDivide(a: number, b: number): number {
  if (!b || !isFinite(b)) return 0;
  const result = a / b;
  return isFinite(result) ? result : 0;
}

function average(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

export function generateMonths(startYear = 2024): MonthEntry[] {
  const names = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const short = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const months: MonthEntry[] = [];
  for (let i = 0; i < MONTH_COUNT; i++) {
    const year = startYear + Math.floor(i / 12);
    const month = i % 12;
    months.push({
      date: new Date(year, month, 1).toISOString(),
      label: `${short[month]} '${String(year).slice(2)}`,
      fullLabel: `${names[month]} ${year}`,
      year,
      month: month + 1,
      isActual: true,
    });
  }
  return months;
}

export function createEmptyModel(): SaaSModelData {
  return {
    settings: {
      companyName: 'Company Name',
      businessModel: 'SaaS',
      customerBase: 'B2B',
      actualThruDate: '',
      financialQuality: 'Company Prepared',
    },
    months: generateMonths(),
    revenue: { recurring: zeros(), nonRecurring: zeros(), other: zeros() },
    totalRevenue: zeros(),
    cogs: { onRecurring: zeros(), onNonRecurring: zeros(), labor: zeros() },
    totalCOGS: zeros(),
    grossProfit: zeros(),
    grossMarginPct: zeros(),
    opex: { salaries: zeros(), salesMarketing: zeros(), rnd: zeros(), professionalFees: zeros(), gna: zeros() },
    totalOpEx: zeros(),
    operatingIncome: zeros(),
    operatingMarginPct: zeros(),
    interestExpense: zeros(),
    interestIncome: zeros(),
    depreciation: zeros(),
    otherExpense: zeros(),
    ebt: zeros(),
    taxExpense: zeros(),
    netIncome: zeros(),
    ebitda: zeros(),
    balanceSheet: {
      cash: zeros(), marketableSecurities: zeros(), ar: zeros(), prepaid: zeros(),
      inventory: zeros(), otherCurrentAssets: zeros(), totalCurrentAssets: zeros(),
      ppe: zeros(), fixedAssets: zeros(), capSoftware: zeros(),
      intangibles: zeros(), otherLTAssets: zeros(), totalLTAssets: zeros(),
      totalAssets: zeros(),
      ap: zeros(), creditCards: zeros(), employeeAccruals: zeros(),
      otherAccrued: zeros(), stDebt: zeros(), deferredRevenue: zeros(),
      otherSTLiabilities: zeros(), totalCurrentLiabilities: zeros(),
      ltDebt: zeros(), govLoan: zeros(), shareholderLoan: zeros(),
      convertibleNotes: zeros(), totalLTLiabilities: zeros(), totalLiabilities: zeros(),
      paidInCapital: zeros(), retainedEarnings: zeros(), netIncomeBs: zeros(),
      totalEquity: zeros(), totalLiabilitiesEquity: zeros(), bsCheck: zeros(),
    },
    arrToday: 0, mrrT3M: 0, latestGrossMargin: 0, yoyRevGrowth: 0,
    netRevenueRetention: 0, borrowingCapacity: 0, facilityRecommendation: 0,
    currentRatio: 0, arApRatio: 0, cashTotalAssets: 0, debtTotalLiabilities: 0,
  };
}

export function recalculateModel(data: SaaSModelData): SaaSModelData {
  const d = { ...data };
  const n = d.months.length;

  // Income Statement derived
  d.totalRevenue = Array.from({ length: n }, (_, i) =>
    d.revenue.recurring[i] + d.revenue.nonRecurring[i] + d.revenue.other[i]
  );
  d.totalCOGS = Array.from({ length: n }, (_, i) =>
    d.cogs.onRecurring[i] + d.cogs.onNonRecurring[i] + d.cogs.labor[i]
  );
  d.grossProfit = Array.from({ length: n }, (_, i) => d.totalRevenue[i] - d.totalCOGS[i]);
  d.grossMarginPct = Array.from({ length: n }, (_, i) => safeDivide(d.grossProfit[i], d.totalRevenue[i]) * 100);
  d.totalOpEx = Array.from({ length: n }, (_, i) =>
    d.opex.salaries[i] + d.opex.salesMarketing[i] + d.opex.rnd[i] + d.opex.professionalFees[i] + d.opex.gna[i]
  );
  d.operatingIncome = Array.from({ length: n }, (_, i) => d.grossProfit[i] - d.totalOpEx[i]);
  d.operatingMarginPct = Array.from({ length: n }, (_, i) => safeDivide(d.operatingIncome[i], d.totalRevenue[i]) * 100);
  d.ebt = Array.from({ length: n }, (_, i) =>
    d.operatingIncome[i] - d.interestExpense[i] + d.interestIncome[i] - d.depreciation[i] - d.otherExpense[i]
  );
  d.netIncome = Array.from({ length: n }, (_, i) => d.ebt[i] - d.taxExpense[i]);
  d.ebitda = Array.from({ length: n }, (_, i) => d.operatingIncome[i] + d.depreciation[i]);

  // Balance Sheet derived
  const bs = d.balanceSheet;
  bs.totalCurrentAssets = Array.from({ length: n }, (_, i) =>
    bs.cash[i] + bs.marketableSecurities[i] + bs.ar[i] + bs.prepaid[i] + bs.inventory[i] + bs.otherCurrentAssets[i]
  );
  bs.totalLTAssets = Array.from({ length: n }, (_, i) =>
    bs.ppe[i] + bs.fixedAssets[i] + bs.capSoftware[i] + bs.intangibles[i] + bs.otherLTAssets[i]
  );
  bs.totalAssets = Array.from({ length: n }, (_, i) => bs.totalCurrentAssets[i] + bs.totalLTAssets[i]);
  bs.totalCurrentLiabilities = Array.from({ length: n }, (_, i) =>
    bs.ap[i] + bs.creditCards[i] + bs.employeeAccruals[i] + bs.otherAccrued[i] + bs.stDebt[i] + bs.deferredRevenue[i] + bs.otherSTLiabilities[i]
  );
  bs.totalLTLiabilities = Array.from({ length: n }, (_, i) =>
    bs.ltDebt[i] + bs.govLoan[i] + bs.shareholderLoan[i] + bs.convertibleNotes[i]
  );
  bs.totalLiabilities = Array.from({ length: n }, (_, i) => bs.totalCurrentLiabilities[i] + bs.totalLTLiabilities[i]);
  bs.netIncomeBs = [...d.netIncome];
  bs.totalEquity = Array.from({ length: n }, (_, i) =>
    bs.paidInCapital[i] + bs.retainedEarnings[i] + bs.netIncomeBs[i]
  );
  bs.totalLiabilitiesEquity = Array.from({ length: n }, (_, i) => bs.totalLiabilities[i] + bs.totalEquity[i]);
  bs.bsCheck = Array.from({ length: n }, (_, i) => bs.totalAssets[i] - bs.totalLiabilitiesEquity[i]);

  // KPIs
  const last = n - 1;
  d.arrToday = d.totalRevenue[last] * 12;
  d.mrrT3M = average(d.revenue.recurring.slice(Math.max(0, last - 2)));
  d.latestGrossMargin = d.grossMarginPct[last];
  d.yoyRevGrowth = last >= 12 ? safeDivide(d.totalRevenue[last] - d.totalRevenue[last - 12], Math.abs(d.totalRevenue[last - 12])) * 100 : 0;
  d.netRevenueRetention = 0; // requires cohort data
  d.borrowingCapacity = d.mrrT3M * 6 - bs.deferredRevenue[last] * 0.15;
  d.facilityRecommendation = d.borrowingCapacity * 1.12;
  d.currentRatio = safeDivide(bs.totalCurrentAssets[last], bs.totalCurrentLiabilities[last]);
  d.arApRatio = safeDivide(bs.ar[last], bs.ap[last]);
  d.cashTotalAssets = safeDivide(bs.cash[last], bs.totalAssets[last]) * 100;
  d.debtTotalLiabilities = safeDivide(bs.stDebt[last] + bs.ltDebt[last], bs.totalLiabilities[last]) * 100;

  return d;
}

// Annual rollup
export interface AnnualRollup {
  year: number;
  values: { [key: string]: number };
}

export function annualRollup(
  data: SaaSModelData,
  fields: { key: string; source: number[]; type: 'sum' | 'avg' | 'last' }[]
): AnnualRollup[] {
  const years = [...new Set(data.months.map(m => m.year))];
  return years.map(year => {
    const indices = data.months.map((m, i) => m.year === year ? i : -1).filter(i => i >= 0);
    const values: { [key: string]: number } = {};
    fields.forEach(f => {
      const vals = indices.map(i => f.source[i]);
      if (f.type === 'sum') values[f.key] = vals.reduce((s, v) => s + v, 0);
      else if (f.type === 'avg') values[f.key] = average(vals);
      else values[f.key] = vals[vals.length - 1] ?? 0;
    });
    return { year, values };
  });
}

// Sensitivity calculations
export function calculateSensitivity(
  data: SaaSModelData,
  revenuePct: number,
  opexReduction: number,
  cogsReduction: number,
  monthCount = 18
): { revenue: number[]; cogs: number[]; grossProfit: number[]; opex: number[]; operatingIncome: number[] } {
  const n = Math.min(monthCount, data.months.length);
  const revenue = data.totalRevenue.slice(0, n).map(v => v * (revenuePct / 100));
  const cogs = data.totalCOGS.slice(0, n).map(v => v * (1 - opexReduction / 100));
  const grossProfit = revenue.map((r, i) => r - cogs[i]);
  const opex = data.totalOpEx.slice(0, n).map(v => v * (1 - opexReduction / 100));
  const operatingIncome = grossProfit.map((gp, i) => gp - opex[i]);
  return { revenue, cogs, grossProfit, opex, operatingIncome };
}

// PMT function
function PMT(rate: number, nper: number, pv: number): number {
  if (rate === 0) return -pv / nper;
  return -pv * (rate * Math.pow(1 + rate, nper)) / (Math.pow(1 + rate, nper) - 1);
}

// Debt servicing calculations
export function calculateLenderResults(config: LenderConfig): LenderComputedResults {
  const periodsPerYear = config.paymentFrequency === 'Monthly' ? 12 : config.paymentFrequency === 'Quarterly' ? 4 : 1;
  const periodicRate = config.annualRate / 100 / periodsPerYear;
  const totalPeriods = config.termYears * periodsPerYear;
  const ioPeriods = config.ioPeriodYears * periodsPerYear;
  const amortPeriods = totalPeriods - ioPeriods;

  const balance = config.fundedAtClose;
  const ioPayment = balance * periodicRate;
  const paymentAfterIO = amortPeriods > 0 ? -PMT(periodicRate, amortPeriods, balance) : 0;

  const schedule: AmortizationRow[] = [];
  let currentBalance = balance;
  let totalInterest = 0;
  let totalPayments = 0;

  const startDate = config.firstPaymentDate ? new Date(config.firstPaymentDate) : new Date();

  for (let i = 0; i < totalPeriods; i++) {
    const isIO = i < ioPeriods;
    const interest = currentBalance * periodicRate;
    const payment = isIO ? interest : paymentAfterIO;
    const principal = payment - interest;
    const endingBalance = currentBalance - principal;

    const periodDate = new Date(startDate);
    if (config.paymentFrequency === 'Monthly') periodDate.setMonth(periodDate.getMonth() + i);
    else if (config.paymentFrequency === 'Quarterly') periodDate.setMonth(periodDate.getMonth() + i * 3);
    else periodDate.setFullYear(periodDate.getFullYear() + i);

    schedule.push({
      period: i + 1,
      date: periodDate.toISOString().slice(0, 10),
      startingBalance: currentBalance,
      payment,
      interest,
      principal,
      endingBalance: Math.max(0, endingBalance),
    });

    totalInterest += interest;
    totalPayments += payment;
    currentBalance = Math.max(0, endingBalance);
  }

  const endOfTermFee = config.fundedAtClose * (config.endOfTermFeePct / 100);
  const commitmentFee = config.commitment * (config.commitmentFeePct / 100);
  const costOfCapital = totalInterest + endOfTermFee + commitmentFee + config.warrant;
  const costOfCapitalPct = safeDivide(costOfCapital, config.fundedAtClose) * 100;
  const annualizedCoC = safeDivide(costOfCapitalPct, config.termYears);

  return {
    periodicRate: periodicRate * 100,
    ioPayment,
    paymentAfterIO,
    totalInterest,
    endOfTermFee,
    commitmentFee,
    totalPayments,
    costOfCapital,
    costOfCapitalPct,
    annualizedCoC,
    schedule,
  };
}

export function createDefaultLenderConfig(): LenderConfig {
  return {
    name: 'Lender',
    commitment: 0,
    fundedAtClose: 0,
    annualRate: 0,
    termYears: 3,
    firstPaymentDate: new Date().toISOString().slice(0, 10),
    paymentFrequency: 'Monthly',
    ioPeriodYears: 0,
    paymentType: 'End',
    commitmentFeePct: 0,
    endOfTermFeePct: 0,
    warrant: 0,
    earlyPayoffYr1: 0,
    earlyPayoffYr2: 0,
    earlyPayoffYr3: 0,
  };
}
