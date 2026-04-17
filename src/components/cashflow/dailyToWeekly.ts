import type { DailyData, WeeklyData } from './types';

/**
 * Find a row key by matching its label against a regex pattern.
 */
function findRowKey(rows: DailyData['rows'] | null | undefined, pattern: RegExp): string | null {
  for (const [key, row] of Object.entries(rows || {})) {
    if (pattern.test(row.label)) return key;
  }
  return null;
}

/**
 * Find all row keys matching a pattern.
 */
function findRowKeys(rows: DailyData['rows'] | null | undefined, pattern: RegExp): string[] {
  return Object.entries(rows || {})
    .filter(([, row]) => pattern.test(row.label))
    .map(([key]) => key);
}

/**
 * Aggregates daily cash flow data into weekly buckets.
 * Finds rows by label pattern instead of hardcoded row keys.
 */
export function aggregateDailyToWeekly(daily: DailyData | null | undefined): WeeklyData {
  const safeDaily: DailyData = {
    dates: Array.isArray(daily?.dates) ? daily.dates : [],
    rows: daily?.rows && typeof daily.rows === 'object' ? daily.rows : {},
  };
  const weekly: WeeklyData = {};
  const dates = safeDaily.dates;
  if (dates.length === 0) return weekly;

  const rows = safeDaily.rows;

  // Identify key rows by label
  const beginCashKey = findRowKey(rows, /BEGINNING.*BANK.*BALANCE|BEGINNING.*CASH.*ON.*HAND/i);
  const endCashKey = findRowKey(rows, /ENDING.*(?:BANK.*BALANCE|CASH.*(?:Net\s*Balance)?)/i);
  const mtBalanceBeginKey = findRowKey(rows, /M&T\s*Bank\s*Balance/i);
  const totalReceiptsKey = findRowKey(rows, /TOTAL\s*CASH\s*RECEIPTS|^TOTAL\s*RECEIPTS$/i);
  const totalDisbKey = findRowKey(rows, /TOTAL\s*(?:CASH\s*)?DISBURSEMENTS/i);
  const totalTransfersKey = findRowKey(rows, /TOTAL\s*TRANSFERS/i);
  const netChangeKey = findRowKey(rows, /NET\s*CASH\s*CHANGE/i);

  // Receipt line items
  const revenueKeys = findRowKeys(rows, /^Revenue\s*Deposits$/i);
  const customerPayKey = findRowKey(rows, /Customer\s*Payment/i);
  const consultingKey = findRowKey(rows, /Consulting\s*Fee/i);
  const loanProceedsKey = findRowKey(rows, /Loan\s*Proceeds/i);
  const otherReceiptsKey = findRowKey(rows, /Other\s*Receipts/i);

  // Disbursement line items
  const advKey = findRowKey(rows, /Advertising.*Marketing/i);
  const insKey = findRowKey(rows, /^Insurance$/i);
  const salaryKey = findRowKey(rows, /Payroll.*Salaries/i);
  const taxBenKey = findRowKey(rows, /Payroll.*Taxes.*Benefits/i);
  const contractorKey = findRowKey(rows, /Contractors.*Consultants/i);
  const rentKey = findRowKey(rows, /Rent.*Occupancy/i);
  const softKey = findRowKey(rows, /Software.*Technology/i);
  const legalKey = findRowKey(rows, /Legal.*Professional/i);
  const travelKey = findRowKey(rows, /Travel.*Entertainment/i);
  const officeKey = findRowKey(rows, /Office.*Admin/i);
  const loanPayKey = findRowKey(rows, /Loan\s*Payments/i);
  const otherDisbKey = findRowKey(rows, /Other\s*Disbursements/i);

  // Transfer line items
  const transferKeys = findRowKeys(rows, /Transfer$/i).filter(k => k !== totalTransfersKey);

  let weekStart = 0;
  let weekNum = 1;

  while (weekStart < dates.length) {
    let weekEnd = weekStart;
    while (weekEnd < dates.length - 1) {
      const nextDate = new Date(dates[weekEnd + 1] + 'T00:00:00');
      if (nextDate.getDay() === 1) break;
      weekEnd++;
    }

    const weekKey = dates[weekStart];
    const endDate = dates[Math.min(weekEnd, dates.length - 1)];
    const lastIdx = Math.min(weekEnd, dates.length - 1);

    const sumRange = (key: string | null) => {
      if (!key || !rows[key]) return 0;
      let sum = 0;
      for (let i = weekStart; i <= lastIdx; i++) {
        sum += rows[key].values[i] || 0;
      }
      return Math.round(sum * 100) / 100;
    };

    const sumKeys = (keys: string[]) => {
      let total = 0;
      for (const k of keys) total += sumRange(k);
      return Math.round(total * 100) / 100;
    };

    // Beginning Cash = value from first day of week
    const beginCash = beginCashKey ? Math.round(rows[beginCashKey]?.values?.[weekStart] || 0) : 0;

    // Ending Cash = value from last day of week
    const endCash = endCashKey ? Math.round(rows[endCashKey]?.values?.[lastIdx] || 0) : 0;

    // Receipts - sum individual items
    const revDeposits = sumKeys(revenueKeys);
    const custPay = sumRange(customerPayKey);
    const consulting = sumRange(consultingKey);
    const loanProceeds = sumRange(loanProceedsKey);
    const otherReceipts = sumRange(otherReceiptsKey);

    // Use the total row if available, otherwise compute from items
    let totalReceipts = sumRange(totalReceiptsKey);
    if (totalReceipts === 0 && !totalReceiptsKey) {
      totalReceipts = revDeposits + custPay + consulting + loanProceeds + otherReceipts;
    }

    // Disbursements - sum individual items
    const adv = Math.abs(sumRange(advKey));
    const ins = Math.abs(sumRange(insKey));
    const salary = Math.abs(sumRange(salaryKey));
    const taxBen = Math.abs(sumRange(taxBenKey));
    const contractors = Math.abs(sumRange(contractorKey));
    const rent = Math.abs(sumRange(rentKey));
    const soft = Math.abs(sumRange(softKey));
    const legal = Math.abs(sumRange(legalKey));
    const travel = Math.abs(sumRange(travelKey));
    const office = Math.abs(sumRange(officeKey));
    const loanPay = Math.abs(sumRange(loanPayKey));
    const otherDisb = Math.abs(sumRange(otherDisbKey));

    let totalDisb = Math.abs(sumRange(totalDisbKey));
    if (totalDisb === 0 && !totalDisbKey) {
      totalDisb = adv + ins + salary + taxBen + contractors + rent + soft + legal + travel + office + loanPay + otherDisb;
    }

    const totalTransfers = sumRange(totalTransfersKey);

    // Net change from daily total row, or compute
    let netChange = sumRange(netChangeKey);
    if (netChange === 0 && !netChangeKey) {
      netChange = totalReceipts - totalDisb + totalTransfers;
    }

    // Ending Cash = Beginning Cash + Net Change (enforced)
    const computedEndCash = Math.round(beginCash + netChange);
    const addlLiquidity = mtBalanceBeginKey ? Math.round(rows[mtBalanceBeginKey]?.values?.[weekStart] || 0) : 0;

    weekly[weekKey] = {
      week_num: weekNum,
      week_ending: endDate,
      "BEGINNING CASH": beginCash,
      "ENDING CASH": computedEndCash,
      "Add'l Liquidity (Delayed Draw)": addlLiquidity,
      "TOTAL CASH ON HAND": computedEndCash + addlLiquidity,
      "Revenue Deposits": Math.round(revDeposits),
      "Customer Payments": Math.round(custPay),
      "Consulting Fees": Math.round(consulting),
      "Loan Proceeds": Math.round(loanProceeds),
      "Other Receipts": Math.round(otherReceipts),
      "TOTAL RECEIPTS": Math.round(totalReceipts),
      "Advertising & Marketing": Math.round(adv),
      "Insurance": Math.round(ins),
      "Payroll - Salaries": Math.round(salary),
      "Payroll - Taxes & Benefits": Math.round(taxBen),
      "Contractors & Consultants": Math.round(contractors),
      "Rent & Occupancy": Math.round(rent),
      "Software & Technology": Math.round(soft),
      "Legal & Professional": Math.round(legal),
      "Travel & Entertainment": Math.round(travel),
      "Office & Admin": Math.round(office),
      "Loan Payments": Math.round(loanPay),
      "Other Disbursements": Math.round(otherDisb),
      "TOTAL DISBURSEMENTS": Math.round(totalDisb),
      "Internal Transfers": Math.round(totalTransfers),
      "NET CHANGE": Math.round(netChange),
    };

    weekStart = weekEnd + 1;
    weekNum++;
  }

  return weekly;
}
