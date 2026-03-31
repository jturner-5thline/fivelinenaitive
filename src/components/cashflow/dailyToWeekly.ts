import type { DailyData, WeeklyData } from './types';

/**
 * Aggregates daily cash flow data into weekly buckets.
 * Each week runs Mon–Sun. The first/last week may be partial.
 */
export function aggregateDailyToWeekly(daily: DailyData): WeeklyData {
  const weekly: WeeklyData = {};
  const dates = daily.dates;
  if (dates.length === 0) return weekly;

  let weekStart = 0;
  let weekNum = 1;

  while (weekStart < dates.length) {
    // Find end of week (Sunday) or end of data
    let weekEnd = weekStart;
    while (weekEnd < dates.length - 1) {
      const nextDate = new Date(dates[weekEnd + 1] + 'T00:00:00');
      if (nextDate.getDay() === 1) break; // Next Monday starts a new week
      weekEnd++;
    }

    const weekKey = dates[weekStart];
    const endDate = dates[Math.min(weekEnd, dates.length - 1)];

    // Sum a row's values across the days in this week
    const sumRange = (rowKey: string) => {
      const row = daily.rows[rowKey];
      if (!row) return 0;
      let sum = 0;
      for (let i = weekStart; i <= Math.min(weekEnd, dates.length - 1); i++) {
        sum += row.values[i] || 0;
      }
      return Math.round(sum * 100) / 100;
    };

    // Beginning cash = first day of this week's beginning balance
    const beginCash = Math.round((daily.rows.row_15?.values[weekStart] ?? 0) * 100) / 100;

    // Ending cash = last day of this week's ending balance
    const lastDayIdx = Math.min(weekEnd, dates.length - 1);
    const endCash = Math.round((daily.rows.row_72?.values[lastDayIdx] ?? 0) * 100) / 100;

    const totalReceipts = sumRange('row_38');
    const totalDisb = sumRange('row_59');
    const totalTransfers = sumRange('row_68');
    const netChange = sumRange('row_70');

    weekly[weekKey] = {
      week_num: weekNum,
      week_ending: endDate,
      "BEGINNING CASH": Math.round(beginCash),
      "ENDING CASH": Math.round(endCash),
      "Add'l Liquidity (Delayed Draw)": 250000,
      "TOTAL CASH ON HAND": Math.round(endCash) + 250000,
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
