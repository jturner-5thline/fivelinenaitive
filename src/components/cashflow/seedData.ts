import type { DailyData, WeeklyData, SidebarData, WeeklySummary, DailyRowStructure } from './types';

// Generate dates from Jan 1 to Apr 26, 2026
function generateDates(): string[] {
  const dates: string[] = [];
  const start = new Date(2026, 0, 1);
  const end = new Date(2026, 3, 26);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

// Deterministic pseudo-random based on seed
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function generateDailyData(): DailyData {
  const dates = generateDates();
  const numDays = dates.length;
  const rand = seededRandom(42);

  const makeValues = (base: number, variance: number, weekdayOnly = false): number[] => {
    return dates.map((d, i) => {
      const dow = new Date(d).getDay();
      if (weekdayOnly && (dow === 0 || dow === 6)) return 0;
      const v = base + (rand() - 0.5) * variance * 2;
      return Math.round(v * 100) / 100;
    });
  };

  const zeroValues = (): number[] => new Array(numDays).fill(0);

  // Bank accounts - beginning balances
  const chase8630Begin = makeValues(52000, 8000);
  const chase2681Begin = makeValues(148000, 15000);
  const chase0661Begin = makeValues(285000, 30000);
  const chase3965Begin = makeValues(18000, 5000);

  // Receipts
  const revenueDeposits5LC = makeValues(3500, 3500, true);
  const revenueDeposits5LCA = makeValues(8500, 6000, true);
  const customerPayments5LFS = makeValues(12000, 10000, true);
  const consultingFees = makeValues(2000, 2000, true);
  const loanProceeds = dates.map((_, i) => (i % 30 === 15 ? 25000 + rand() * 50000 : 0));
  const otherReceipts = makeValues(500, 500, true);

  // Disbursements
  const advertising = makeValues(800, 400, true);
  const insurance = dates.map((_, i) => (i % 30 === 1 ? 4500 + rand() * 1000 : 0));
  const payrollSalaries = dates.map((d, i) => {
    const day = new Date(d).getDate();
    return (day === 1 || day === 15) ? 28000 + rand() * 5000 : 0;
  });
  const payrollTaxes = dates.map((d, i) => {
    const day = new Date(d).getDate();
    return (day === 1 || day === 15) ? 8500 + rand() * 2000 : 0;
  });
  const contractors = makeValues(2200, 1800, true);
  const rent = dates.map((_, i) => (i % 30 === 0 ? 12500 : 0));
  const software = makeValues(450, 300, true);
  const legal = makeValues(1200, 1000, true);
  const travel = makeValues(600, 600, true);
  const officeAdmin = makeValues(350, 250, true);
  const loanPayments = dates.map((_, i) => (i % 30 === 10 ? 15000 + rand() * 5000 : 0));
  const otherDisb = makeValues(400, 400, true);

  // Transfers
  const transfer5LCto5LCA = dates.map((_, i) => (i % 14 === 7 ? 5000 + rand() * 10000 : 0));
  const transfer5LCAto5LFS = dates.map((_, i) => (i % 14 === 0 ? 8000 + rand() * 12000 : 0));
  const transfer5LFSto5LC = dates.map((_, i) => (i % 21 === 10 ? -(3000 + rand() * 8000) : 0));

  // Calculate totals
  const totalReceipts = dates.map((_, i) =>
    revenueDeposits5LC[i] + revenueDeposits5LCA[i] + customerPayments5LFS[i] +
    consultingFees[i] + loanProceeds[i] + otherReceipts[i]
  );

  const totalDisbursements = dates.map((_, i) =>
    -(advertising[i] + insurance[i] + payrollSalaries[i] + payrollTaxes[i] +
    contractors[i] + rent[i] + software[i] + legal[i] + travel[i] +
    officeAdmin[i] + loanPayments[i] + otherDisb[i])
  );

  const totalTransfers = dates.map((_, i) =>
    transfer5LCto5LCA[i] + transfer5LCAto5LFS[i] + transfer5LFSto5LC[i]
  );

  const netCashChange = dates.map((_, i) =>
    totalReceipts[i] + totalDisbursements[i] + totalTransfers[i]
  );

  // Beginning balance total — cascaded: day 0 uses seed, subsequent days carry forward
  const mtBankBalance = 46000;
  const seedBeginBalance = chase8630Begin[0] + chase2681Begin[0] + chase0661Begin[0] + chase3965Begin[0] + mtBankBalance;
  const beginBalance: number[] = new Array(dates.length);
  const endBalance: number[] = new Array(dates.length);
  for (let i = 0; i < dates.length; i++) {
    beginBalance[i] = i === 0 ? seedBeginBalance : endBalance[i - 1];
    endBalance[i] = beginBalance[i] + netCashChange[i];
  }

  // Ending bank balances (distributed proportionally)
  const chase8630End = dates.map((_, i) => chase8630Begin[i] + netCashChange[i] * 0.1);
  const chase2681End = dates.map((_, i) => chase2681Begin[i] + netCashChange[i] * 0.3);
  const chase0661End = dates.map((_, i) => chase0661Begin[i] + netCashChange[i] * 0.5);
  const chase3965End = dates.map((_, i) => chase3965Begin[i] + netCashChange[i] * 0.1);

  return {
    dates,
    rows: {
      row_15: { label: 'BEGINNING BANK BALANCE | CASH ON HAND', entity: 'ALL', values: beginBalance },
      row_16: { label: 'Chase 8630-5LC', entity: '5LC', values: chase8630Begin },
      row_17: { label: 'Chase 2681-5LCA', entity: '5LCA', values: chase2681Begin },
      row_19: { label: 'Chase 0661-5LFS', entity: '5LFS', values: chase0661Begin },
      row_20: { label: 'Chase 3965-5LT', entity: '5LT', values: chase3965Begin },
      row_20b: { label: 'M&T Bank Balance', entity: 'ALL', values: dates.map(() => 46000) },
      row_21: { label: 'ENDING BANK BALANCE | CASH ON HAND', entity: 'ALL', values: endBalance },
      row_22: { label: 'Chase 8630-5LC', entity: '5LC', values: chase8630End },
      row_23: { label: 'Chase 2681-5LCA', entity: '5LCA', values: chase2681End },
      row_24: { label: 'Chase 0661-5LFS', entity: '5LFS', values: chase0661End },
      row_25: { label: 'Chase 3965-5LT', entity: '5LT', values: chase3965End },
      row_25b: { label: 'M&T Bank Balance', entity: 'ALL', values: dates.map(() => 46000) },
      // Receipts
      row_27: { label: 'Revenue Deposits', entity: '5LC', values: revenueDeposits5LC },
      row_28: { label: 'Revenue Deposits', entity: '5LCA', values: revenueDeposits5LCA },
      row_29: { label: 'Customer Payments', entity: '5LFS', values: customerPayments5LFS },
      row_30: { label: 'Consulting Fees', entity: '5LC', values: consultingFees },
      row_31: { label: 'Loan Proceeds', entity: '5LFS', values: loanProceeds },
      row_32: { label: 'Other Receipts', entity: '5LC', values: otherReceipts },
      row_38: { label: 'TOTAL CASH RECEIPTS', entity: 'ALL', values: totalReceipts },
      // Disbursements
      row_40: { label: 'Advertising & Marketing', entity: '5LC', values: advertising },
      row_41: { label: 'Insurance', entity: '5LC', values: insurance },
      row_42: { label: 'Payroll - Salaries', entity: 'ALL', values: payrollSalaries },
      row_43: { label: 'Payroll - Taxes & Benefits', entity: 'ALL', values: payrollTaxes },
      row_44: { label: 'Contractors & Consultants', entity: '5LCA', values: contractors },
      row_45: { label: 'Rent & Occupancy', entity: '5LC', values: rent },
      row_46: { label: 'Software & Technology', entity: 'ALL', values: software },
      row_47: { label: 'Legal & Professional', entity: '5LCA', values: legal },
      row_48: { label: 'Travel & Entertainment', entity: '5LC', values: travel },
      row_49: { label: 'Office & Admin', entity: '5LC', values: officeAdmin },
      row_50: { label: 'Loan Payments', entity: '5LFS', values: loanPayments },
      row_51: { label: 'Other Disbursements', entity: '5LC', values: otherDisb },
      row_59: { label: 'TOTAL CASH DISBURSEMENTS', entity: 'ALL', values: totalDisbursements },
      // Transfers
      row_61: { label: '5LC → 5LCA Transfer', entity: '5LC', values: transfer5LCto5LCA },
      row_62: { label: '5LCA → 5LFS Transfer', entity: '5LCA', values: transfer5LCAto5LFS },
      row_63: { label: '5LFS → 5LC Transfer', entity: '5LFS', values: transfer5LFSto5LC },
      row_68: { label: 'TOTAL TRANSFERS', entity: 'ALL', values: totalTransfers },
      // Summary
      row_70: { label: 'NET CASH CHANGE', entity: 'ALL', values: netCashChange },
      row_72: { label: 'ENDING CASH (Net Balance)', entity: 'ALL', values: endBalance },
    },
  };
}

function generateWeeklyData(daily: DailyData): WeeklyData {
  const weekly: WeeklyData = {};
  const dates = daily.dates;

  // Group dates into weeks (Mon-Sun)
  let weekStart = 0;
  let weekNum = 1;
  let carryBeginCash: number | null = null;

  while (weekStart < dates.length) {
    const startDate = new Date(dates[weekStart]);
    // Find end of week (Sunday) or end of data
    let weekEnd = weekStart;
    while (weekEnd < dates.length - 1) {
      const nextDate = new Date(dates[weekEnd + 1]);
      if (nextDate.getDay() === 1) break; // Next Monday
      weekEnd++;
    }

    const weekKey = dates[weekStart];
    const endDate = dates[Math.min(weekEnd, dates.length - 1)];

    // Aggregate daily values for this week
    const sumRange = (rowKey: string) => {
      const row = daily.rows[rowKey];
      if (!row) return 0;
      let sum = 0;
      for (let i = weekStart; i <= Math.min(weekEnd, dates.length - 1); i++) {
        sum += row.values[i] || 0;
      }
      return Math.round(sum * 100) / 100;
    };

    const totalReceipts = sumRange('row_38');
    const totalDisb = sumRange('row_59');
    const totalTransfers = sumRange('row_68');
    const netChange = sumRange('row_70');

    const beginCash = carryBeginCash !== null
      ? carryBeginCash
      : Math.round(daily.rows.row_15?.values[weekStart] || 0);
    const roundedNetChange = Math.round(netChange);
    const endCash = beginCash + roundedNetChange;
    carryBeginCash = endCash;

    weekly[weekKey] = {
      week_num: weekNum,
      week_ending: endDate,
      "BEGINNING CASH": beginCash,
      "ENDING CASH": endCash,
      "Add'l Liquidity (Delayed Draw)": 250000,
      "TOTAL CASH ON HAND": endCash + 250000,
      "Revenue Deposits": sumRange('row_27') + sumRange('row_28'),
      "Customer Payments": sumRange('row_29'),
      "Consulting Fees": sumRange('row_30'),
      "Loan Proceeds": sumRange('row_31'),
      "Other Receipts": sumRange('row_32'),
      "TOTAL RECEIPTS": Math.round(totalReceipts),
      "Advertising & Marketing": Math.abs(sumRange('row_40')),
      "Insurance": Math.abs(sumRange('row_41')),
      "Payroll - Salaries": Math.abs(sumRange('row_42')),
      "Payroll - Taxes & Benefits": Math.abs(sumRange('row_43')),
      "Contractors & Consultants": Math.abs(sumRange('row_44')),
      "Rent & Occupancy": Math.abs(sumRange('row_45')),
      "Software & Technology": Math.abs(sumRange('row_46')),
      "Legal & Professional": Math.abs(sumRange('row_47')),
      "Travel & Entertainment": Math.abs(sumRange('row_48')),
      "Office & Admin": Math.abs(sumRange('row_49')),
      "Loan Payments": Math.abs(sumRange('row_50')),
      "Other Disbursements": Math.abs(sumRange('row_51')),
      "TOTAL DISBURSEMENTS": Math.round(Math.abs(totalDisb)),
      "Internal Transfers": Math.round(totalTransfers),
      "NET CHANGE": Math.round(netChange),
    };

    weekStart = weekEnd + 1;
    weekNum++;
  }

  return weekly;
}

function generateSidebarData(): SidebarData {
  return {
    cash_in_next_8_weeks: [
      { name: 'Gabb Retainer', amount: 23000, date: '2026-03-16' },
      { name: 'OpConnect Milestone', amount: 45000, date: '2026-03-28' },
      { name: 'SNA Closing', amount: 75000, date: '2026-03-26' },
      { name: 'BBP', amount: 17500, date: '2026-03-07' },
      { name: 'Breaktime Closing', amount: 10000, date: '2026-03-14' },
      { name: 'PBI Closing', amount: 92500, date: '2026-04-30' },
    ],
    notes: [
      '1. 5LFS — $85k invoices paid, awaiting clearance',
      '2. 5LCA — $148k revenue recognized this period',
      '3. Insurance renewal due end of Q1',
      '4. Delayed draw facility: $250K available',
      '5. Payroll timing shift for March',
    ],
  };
}

function generateWeeklySummary(weekly: WeeklyData): WeeklySummary {
  const entries = Object.values(weekly || {});
  if (entries.length === 0) {
    return {
      total_cash_in: 0,
      total_cash_out: 0,
      net_change: 0,
      avg_ending_cash: 0,
      min_ending_cash: 0,
      max_ending_cash: 0,
    };
  }
  const cashIns = entries.map(e => e["TOTAL RECEIPTS"] as number || 0);
  const cashOuts = entries.map(e => e["TOTAL DISBURSEMENTS"] as number || 0);
  const endings = entries.map(e => e["ENDING CASH"] as number || 0);

  return {
    total_cash_in: cashIns.reduce((a, b) => a + b, 0),
    total_cash_out: cashOuts.reduce((a, b) => a + b, 0),
    net_change: cashIns.reduce((a, b) => a + b, 0) - cashOuts.reduce((a, b) => a + b, 0),
    avg_ending_cash: endings.reduce((a, b) => a + b, 0) / endings.length,
    min_ending_cash: Math.min(...endings),
    max_ending_cash: Math.max(...endings),
  };
}

function generateDailyRowStructure(): DailyRowStructure {
  return {
    rows: [
      { row_num: 15, label: 'BEGINNING BANK BALANCE | CASH ON HAND', entity: 'ALL', section: 'balance_begin', is_total: true, is_protected: true, indent: false },
      { row_num: 16, label: 'Chase 8630-5LC', entity: '5LC', section: 'balance_begin', is_total: false, is_protected: false, indent: true },
      { row_num: 17, label: 'Chase 2681-5LCA', entity: '5LCA', section: 'balance_begin', is_total: false, is_protected: false, indent: true },
      { row_num: 19, label: 'Chase 0661-5LFS', entity: '5LFS', section: 'balance_begin', is_total: false, is_protected: false, indent: true },
      { row_num: 20, label: 'Chase 3965-5LT', entity: '5LT', section: 'balance_begin', is_total: false, is_protected: false, indent: true },
      // M&T Bank Balance uses string key "20b" — rowStructure uses row_num for ordering only; the DailySourceTab maps via `row_${row_num}`
      { row_num: '20b', label: 'M&T Bank Balance', entity: 'ALL', section: 'balance_begin', is_total: false, is_protected: false, indent: true },
      { row_num: 21, label: 'ENDING BANK BALANCE | CASH ON HAND', entity: 'ALL', section: 'balance_end', is_total: true, is_protected: true, indent: false },
      { row_num: 22, label: 'Chase 8630-5LC', entity: '5LC', section: 'balance_end', is_total: false, is_protected: false, indent: true },
      { row_num: 23, label: 'Chase 2681-5LCA', entity: '5LCA', section: 'balance_end', is_total: false, is_protected: false, indent: true },
      { row_num: 24, label: 'Chase 0661-5LFS', entity: '5LFS', section: 'balance_end', is_total: false, is_protected: false, indent: true },
      { row_num: 25, label: 'Chase 3965-5LT', entity: '5LT', section: 'balance_end', is_total: false, is_protected: false, indent: true },
      { row_num: '25b', label: 'M&T Bank Balance', entity: 'ALL', section: 'balance_end', is_total: false, is_protected: false, indent: true },
      { row_num: 27, label: 'Revenue Deposits', entity: '5LC', section: 'receipts', is_total: false, is_protected: false, indent: true },
      { row_num: 28, label: 'Revenue Deposits', entity: '5LCA', section: 'receipts', is_total: false, is_protected: false, indent: true },
      { row_num: 29, label: 'Customer Payments', entity: '5LFS', section: 'receipts', is_total: false, is_protected: false, indent: true },
      { row_num: 30, label: 'Consulting Fees', entity: '5LC', section: 'receipts', is_total: false, is_protected: false, indent: true },
      { row_num: 31, label: 'Loan Proceeds', entity: '5LFS', section: 'receipts', is_total: false, is_protected: false, indent: true },
      { row_num: 32, label: 'Other Receipts', entity: '5LC', section: 'receipts', is_total: false, is_protected: false, indent: true },
      { row_num: 38, label: 'TOTAL CASH RECEIPTS', entity: 'ALL', section: 'receipts', is_total: true, is_protected: true, indent: false },
      { row_num: 40, label: 'Advertising & Marketing', entity: '5LC', section: 'disbursements', is_total: false, is_protected: false, indent: true },
      { row_num: 41, label: 'Insurance', entity: '5LC', section: 'disbursements', is_total: false, is_protected: false, indent: true },
      { row_num: 42, label: 'Payroll - Salaries', entity: 'ALL', section: 'disbursements', is_total: false, is_protected: false, indent: true },
      { row_num: 43, label: 'Payroll - Taxes & Benefits', entity: 'ALL', section: 'disbursements', is_total: false, is_protected: false, indent: true },
      { row_num: 44, label: 'Contractors & Consultants', entity: '5LCA', section: 'disbursements', is_total: false, is_protected: false, indent: true },
      { row_num: 45, label: 'Rent & Occupancy', entity: '5LC', section: 'disbursements', is_total: false, is_protected: false, indent: true },
      { row_num: 46, label: 'Software & Technology', entity: 'ALL', section: 'disbursements', is_total: false, is_protected: false, indent: true },
      { row_num: 47, label: 'Legal & Professional', entity: '5LCA', section: 'disbursements', is_total: false, is_protected: false, indent: true },
      { row_num: 48, label: 'Travel & Entertainment', entity: '5LC', section: 'disbursements', is_total: false, is_protected: false, indent: true },
      { row_num: 49, label: 'Office & Admin', entity: '5LC', section: 'disbursements', is_total: false, is_protected: false, indent: true },
      { row_num: 50, label: 'Loan Payments', entity: '5LFS', section: 'disbursements', is_total: false, is_protected: false, indent: true },
      { row_num: 51, label: 'Other Disbursements', entity: '5LC', section: 'disbursements', is_total: false, is_protected: false, indent: true },
      { row_num: 59, label: 'TOTAL CASH DISBURSEMENTS', entity: 'ALL', section: 'disbursements', is_total: true, is_protected: true, indent: false },
      { row_num: 61, label: '5LC → 5LCA Transfer', entity: '5LC', section: 'transfers', is_total: false, is_protected: false, indent: true },
      { row_num: 62, label: '5LCA → 5LFS Transfer', entity: '5LCA', section: 'transfers', is_total: false, is_protected: false, indent: true },
      { row_num: 63, label: '5LFS → 5LC Transfer', entity: '5LFS', section: 'transfers', is_total: false, is_protected: false, indent: true },
      { row_num: 68, label: 'TOTAL TRANSFERS', entity: 'ALL', section: 'transfers', is_total: true, is_protected: true, indent: false },
      { row_num: 70, label: 'NET CASH CHANGE', entity: 'ALL', section: 'summary', is_total: true, is_protected: true, indent: false },
      { row_num: 72, label: 'ENDING CASH (Net Balance)', entity: 'ALL', section: 'summary', is_total: true, is_protected: true, indent: false },
    ],
  };
}

// Generate and export all seed data
const dailyData = generateDailyData();
const weeklyData = generateWeeklyData(dailyData);
const sidebarData = generateSidebarData();
const weeklySummary = generateWeeklySummary(weeklyData);
const dailyRowStructure = generateDailyRowStructure();

export {
  dailyData as SEED_DAILY_DATA,
  weeklyData as SEED_WEEKLY_DATA,
  sidebarData as SEED_SIDEBAR_DATA,
  weeklySummary as SEED_WEEKLY_SUMMARY,
  dailyRowStructure as SEED_ROW_STRUCTURE,
};
