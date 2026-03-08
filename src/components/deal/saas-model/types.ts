// SaaS Financial Model Types

export interface MonthEntry {
  date: string; // ISO date
  label: string; // "Jan '24"
  fullLabel: string; // "January 2024"
  year: number;
  month: number;
  isActual: boolean;
}

export interface RevenueData {
  recurring: number[];
  nonRecurring: number[];
  other: number[];
}

export interface COGSData {
  onRecurring: number[];
  onNonRecurring: number[];
  labor: number[];
}

export interface OpExData {
  salaries: number[];
  salesMarketing: number[];
  rnd: number[];
  professionalFees: number[];
  gna: number[];
}

export interface BalanceSheetData {
  cash: number[];
  marketableSecurities: number[];
  ar: number[];
  prepaid: number[];
  inventory: number[];
  otherCurrentAssets: number[];
  totalCurrentAssets: number[];
  ppe: number[];
  fixedAssets: number[];
  capSoftware: number[];
  intangibles: number[];
  otherLTAssets: number[];
  totalLTAssets: number[];
  totalAssets: number[];
  ap: number[];
  creditCards: number[];
  employeeAccruals: number[];
  otherAccrued: number[];
  stDebt: number[];
  deferredRevenue: number[];
  otherSTLiabilities: number[];
  totalCurrentLiabilities: number[];
  ltDebt: number[];
  govLoan: number[];
  shareholderLoan: number[];
  convertibleNotes: number[];
  totalLTLiabilities: number[];
  totalLiabilities: number[];
  paidInCapital: number[];
  retainedEarnings: number[];
  netIncomeBs: number[];
  totalEquity: number[];
  totalLiabilitiesEquity: number[];
  bsCheck: number[];
}

export interface SaaSModelSettings {
  companyName: string;
  businessModel: 'SaaS' | 'Subscription' | 'Marketplace' | 'Usage-Based' | 'Hybrid';
  customerBase: 'B2B' | 'B2C' | 'B2B2C';
  actualThruDate: string;
  financialQuality: 'CPA Reviewed' | 'Audited' | 'Company Prepared';
}

export interface SaaSModelData {
  settings: SaaSModelSettings;
  months: MonthEntry[];
  revenue: RevenueData;
  totalRevenue: number[];
  cogs: COGSData;
  totalCOGS: number[];
  grossProfit: number[];
  grossMarginPct: number[];
  opex: OpExData;
  totalOpEx: number[];
  operatingIncome: number[];
  operatingMarginPct: number[];
  interestExpense: number[];
  interestIncome: number[];
  depreciation: number[];
  otherExpense: number[];
  ebt: number[];
  taxExpense: number[];
  netIncome: number[];
  ebitda: number[];
  balanceSheet: BalanceSheetData;
  // Computed KPIs
  arrToday: number;
  mrrT3M: number;
  latestGrossMargin: number;
  yoyRevGrowth: number;
  netRevenueRetention: number;
  borrowingCapacity: number;
  facilityRecommendation: number;
  currentRatio: number;
  arApRatio: number;
  cashTotalAssets: number;
  debtTotalLiabilities: number;
}

export interface SensitivityScenario {
  revenuePct: number;
  opexReduction: number;
  cogsReduction: number;
}

export interface LenderConfig {
  name: string;
  commitment: number;
  fundedAtClose: number;
  annualRate: number;
  termYears: number;
  firstPaymentDate: string;
  paymentFrequency: 'Monthly' | 'Quarterly' | 'Annual';
  ioPeriodYears: number;
  paymentType: 'End' | 'Beginning';
  commitmentFeePct: number;
  endOfTermFeePct: number;
  warrant: number;
  earlyPayoffYr1: number;
  earlyPayoffYr2: number;
  earlyPayoffYr3: number;
}

export interface AmortizationRow {
  period: number;
  date: string;
  startingBalance: number;
  payment: number;
  interest: number;
  principal: number;
  endingBalance: number;
}

export interface LenderComputedResults {
  periodicRate: number;
  ioPayment: number;
  paymentAfterIO: number;
  totalInterest: number;
  endOfTermFee: number;
  commitmentFee: number;
  totalPayments: number;
  costOfCapital: number;
  costOfCapitalPct: number;
  annualizedCoC: number;
  schedule: AmortizationRow[];
}

// Mapping target fields
export const IS_FIELDS = [
  'Recurring Revenue', 'Non-Recurring Revenue', 'Other Revenue',
  'COGS on Recurring Revenue', 'COGS on Non-Recurring Revenue', 'COGS - Labor',
  'Salaries and Benefits', 'Sales and Marketing', 'Research and Development',
  'Professional Fees', 'General and Administrative',
  'Interest Expense', 'Interest Income', 'Depreciation Expense', 'Other Expense', 'Tax Expense',
] as const;

export const BS_FIELDS = [
  'Cash and Cash Equivalents', 'Marketable Securities', 'Accounts Receivable',
  'Prepaid Expenses', 'Inventory', 'Other Current Assets',
  'Property Plant & Equipment', 'Fixed Assets', 'Capitalized Software',
  'Intangible Assets', 'Other LT Assets',
  'Accounts Payable', 'Credit Cards', 'Employee Accruals',
  'Other Accrued Liabilities', 'Short-Term Debt', 'Deferred Revenue',
  'Other Short-Term Liabilities', 'Long-Term Debt', 'Government Loan',
  'Shareholder Loan', 'Convertible Notes', 'Paid in Capital', 'Retained Earnings',
] as const;

export type ISFieldName = typeof IS_FIELDS[number];
export type BSFieldName = typeof BS_FIELDS[number];
export type MappingFieldName = ISFieldName | BSFieldName;

export interface FieldMapping {
  sheet: string;
  rowIdx: number;
  label: string;
}

export interface FileAnalysisResult {
  status: 'mappable' | 'partial' | 'unrecognized' | 'error';
  type: 'Income Statement' | 'Balance Sheet' | 'IS + BS' | 'Unknown';
  totalMatches: number;
  isMatches: number;
  bsMatches: number;
  matchedFields: string[];
}
