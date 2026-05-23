import { useMemo } from 'react';
import { useQuickBooksInvoices, useQuickBooksCustomers, useQuickBooksPayments } from '@/hooks/useQuickBooks';
import { useQuickBooksExpanded } from '@/hooks/useQuickBooksExpanded';
import { format, subMonths, startOfMonth } from 'date-fns';
import { resolveQboClientLabel } from '@/lib/qboClientName';

export interface QuickBooksMetricsPeriod {
  /** Inclusive ymd start. */
  start: string;
  /** Inclusive ymd end. */
  end: string;
}

export function useQuickBooksMetrics(realmId?: string, period?: QuickBooksMetricsPeriod) {
  const { data: invoices = [], isLoading: invoicesLoading } = useQuickBooksInvoices(realmId);
  const { data: customers = [], isLoading: customersLoading } = useQuickBooksCustomers(realmId);
  const { data: payments = [], isLoading: paymentsLoading } = useQuickBooksPayments(realmId);
  const {
    expenses, bills, vendors, accounts, estimates, creditMemos,
    isLoading: expandedLoading,
  } = useQuickBooksExpanded(realmId);

  const isLoading = invoicesLoading || customersLoading || paymentsLoading || expandedLoading;

  const metrics = useMemo(() => {
    // When a period is provided, scope flow-based facts (revenue, payments,
    // expenses, bills, customer aggregates) to invoices/payments/expenses/bills
    // whose txn_date sits inside [start,end]. Stock metrics (current A/R, open
    // bills, active customers, aging buckets) remain "as of today" snapshots —
    // QBO doesn't keep balance history per row.
    const inPeriod = (dateStr: string | null | undefined) => {
      if (!period) return true;
      if (!dateStr) return false;
      return dateStr >= period.start && dateStr <= period.end;
    };
    const periodInvoices = period ? invoices.filter(i => inPeriod(i.txn_date)) : invoices;
    const periodPayments = period ? payments.filter(p => inPeriod(p.txn_date)) : payments;
    const periodExpenses = period ? expenses.filter(e => inPeriod(e.txn_date)) : expenses;
    const periodBills    = period ? bills.filter(b => inPeriod(b.txn_date)) : bills;

    // Total revenue (sum of all invoice totals)
    const totalRevenue = periodInvoices.reduce((sum, inv) => sum + (inv.total_amt || 0), 0);

    // Outstanding A/R — always evaluated against current balance, not period.
    const totalAR = invoices.reduce((sum, inv) => sum + (inv.balance || 0), 0);

    // Total payments received (in period)
    const totalPayments = periodPayments.reduce((sum, p) => sum + (p.total_amt || 0), 0);

    // Active customers
    const activeCustomers = customers.filter(c => c.active).length;
    const totalCustomers = customers.length;

    // Average invoice size (in period)
    const avgInvoiceSize = periodInvoices.length > 0 ? totalRevenue / periodInvoices.length : 0;

    // Collection rate
    const collectionRate = totalRevenue > 0 ? ((totalRevenue - totalAR) / totalRevenue) * 100 : 0;

    // Overdue invoices (due_date < today and balance > 0) — current snapshot.
    const now = new Date();
    const overdueInvoices = invoices.filter(inv => 
      inv.due_date && inv.balance && inv.balance > 0 && new Date(inv.due_date) < now
    );
    const overdueAmount = overdueInvoices.reduce((sum, inv) => sum + (inv.balance || 0), 0);

    // --- Expanded metrics ---

    // Total expenses (in period)
    const totalExpenses = periodExpenses.reduce((sum, e) => sum + (e.total_amt || 0), 0);

    // Total bills (in period)
    const totalBills = periodBills.reduce((sum, b) => sum + (b.total_amt || 0), 0);

    // Outstanding A/P — current snapshot.
    const totalAP = bills.reduce((sum, b) => sum + (b.balance || 0), 0);

    // Total estimates
    const totalEstimates = estimates.reduce((sum, e) => sum + (e.total_amt || 0), 0);

    // Total credit memos
    const totalCreditMemos = creditMemos.reduce((sum, c) => sum + (c.total_amt || 0), 0);

    // Active vendors
    const activeVendors = vendors.filter(v => v.active).length;
    const totalVendors = vendors.length;

    // Net income proxy (revenue - expenses)
    const netIncome = totalRevenue - totalExpenses;

    // Monthly revenue trend — buckets the active period when one is supplied,
    // otherwise falls back to the legacy "rolling 12 months from today" view.
    const monthlyRevenue: { month: string; revenue: number; payments: number; expenses: number; invoiceCount: number }[] = [];
    const trendEnd = period ? new Date(period.end + 'T00:00:00') : now;
    const trendStart = period
      ? new Date(period.start + 'T00:00:00')
      : subMonths(now, 11);
    const monthsToRender = Math.max(
      1,
      (trendEnd.getFullYear() - trendStart.getFullYear()) * 12 +
        (trendEnd.getMonth() - trendStart.getMonth()) + 1,
    );
    for (let i = monthsToRender - 1; i >= 0; i--) {
      const monthDate = subMonths(trendEnd, i);
      const monthStr = format(monthDate, 'MMM-yy');
      const monthStart = startOfMonth(monthDate);
      const nextMonthStart = startOfMonth(subMonths(trendEnd, i - 1));

      const inRange = (dateStr: string | null) => {
        if (!dateStr) return false;
        const d = new Date(dateStr);
        return d >= monthStart && d < nextMonthStart;
      };

      const monthInvoices = invoices.filter(inv => inRange(inv.txn_date));
      const monthPayments = payments.filter(p => inRange(p.txn_date));
      const monthExpenses = expenses.filter(e => inRange(e.txn_date));

      monthlyRevenue.push({
        month: monthStr,
        revenue: monthInvoices.reduce((s, inv) => s + (inv.total_amt || 0), 0),
        payments: monthPayments.reduce((s, p) => s + (p.total_amt || 0), 0),
        expenses: monthExpenses.reduce((s, e) => s + (e.total_amt || 0), 0),
        invoiceCount: monthInvoices.length,
      });
    }

    // Top customers by revenue — bucket by COMPANY name (falls back to display
    // name only when QBO has no company set). Period-aware. See src/lib/qboClientName.ts.
    const customerById = new Map<string, { company_name: string | null; display_name: string | null }>();
    customers.forEach((c: any) => {
      if (!c.qb_id) return;
      customerById.set(c.qb_id, { company_name: c.company_name ?? null, display_name: c.display_name ?? null });
    });
    const customerRevenue: Record<string, { name: string; revenue: number; balance: number; invoiceCount: number }> = {};
    periodInvoices.forEach((inv: any) => {
      const name = resolveQboClientLabel(
        inv.customer_name,
        inv.customer_id ? customerById.get(inv.customer_id) : undefined,
      );
      if (!customerRevenue[name]) {
        customerRevenue[name] = { name, revenue: 0, balance: 0, invoiceCount: 0 };
      }
      customerRevenue[name].revenue += inv.total_amt || 0;
      customerRevenue[name].balance += inv.balance || 0;
      customerRevenue[name].invoiceCount += 1;
    });
    const topCustomers = Object.values(customerRevenue)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // Top vendors by spend (in period)
    const vendorSpend: Record<string, { name: string; spend: number; count: number }> = {};
    periodExpenses.forEach(e => {
      const name = e.vendor_ref_name || 'Unknown';
      if (!vendorSpend[name]) vendorSpend[name] = { name, spend: 0, count: 0 };
      vendorSpend[name].spend += e.total_amt || 0;
      vendorSpend[name].count += 1;
    });
    periodBills.forEach(b => {
      const name = b.vendor_ref_name || 'Unknown';
      if (!vendorSpend[name]) vendorSpend[name] = { name, spend: 0, count: 0 };
      vendorSpend[name].spend += b.total_amt || 0;
      vendorSpend[name].count += 1;
    });
    const topVendors = Object.values(vendorSpend)
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 10);

    // Invoice status breakdown (in period)
    const statusBreakdown: Record<string, { status: string; count: number; value: number }> = {};
    periodInvoices.forEach(inv => {
      const status = inv.status || 'Unknown';
      if (!statusBreakdown[status]) {
        statusBreakdown[status] = { status, count: 0, value: 0 };
      }
      statusBreakdown[status].count += 1;
      statusBreakdown[status].value += inv.total_amt || 0;
    });

    // Payment methods breakdown (in period)
    const paymentMethods: Record<string, { method: string; count: number; value: number }> = {};
    periodPayments.forEach(p => {
      const method = p.payment_method || 'Other';
      if (!paymentMethods[method]) {
        paymentMethods[method] = { method, count: 0, value: 0 };
      }
      paymentMethods[method].count += 1;
      paymentMethods[method].value += p.total_amt || 0;
    });

    // Expense by category (in period)
    const expenseByCategory: Record<string, { category: string; amount: number; count: number }> = {};
    periodExpenses.forEach(e => {
      const cat = e.account_ref_name || 'Uncategorized';
      if (!expenseByCategory[cat]) expenseByCategory[cat] = { category: cat, amount: 0, count: 0 };
      expenseByCategory[cat].amount += e.total_amt || 0;
      expenseByCategory[cat].count += 1;
    });

    // AR aging buckets
    const agingBuckets = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    invoices.forEach(inv => {
      if (!inv.balance || inv.balance <= 0) return;
      if (!inv.due_date) { agingBuckets.current += inv.balance; return; }
      const dueDate = new Date(inv.due_date);
      const daysPast = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysPast <= 0) agingBuckets.current += inv.balance;
      else if (daysPast <= 30) agingBuckets['1-30'] += inv.balance;
      else if (daysPast <= 60) agingBuckets['31-60'] += inv.balance;
      else if (daysPast <= 90) agingBuckets['61-90'] += inv.balance;
      else agingBuckets['90+'] += inv.balance;
    });

    // AP aging buckets
    const apAgingBuckets = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    bills.forEach(b => {
      if (!b.balance || b.balance <= 0) return;
      if (!b.due_date) { apAgingBuckets.current += b.balance; return; }
      const dueDate = new Date(b.due_date);
      const daysPast = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysPast <= 0) apAgingBuckets.current += b.balance;
      else if (daysPast <= 30) apAgingBuckets['1-30'] += b.balance;
      else if (daysPast <= 60) apAgingBuckets['31-60'] += b.balance;
      else if (daysPast <= 90) apAgingBuckets['61-90'] += b.balance;
      else apAgingBuckets['90+'] += b.balance;
    });

    const arAgingData = Object.entries(agingBuckets).map(([bucket, value]) => ({ bucket, value }));
    const apAgingData = Object.entries(apAgingBuckets).map(([bucket, value]) => ({ bucket, value }));

    // Account type breakdown from chart of accounts
    const accountTypes: Record<string, { type: string; count: number; balance: number }> = {};
    accounts.forEach(a => {
      const t = a.account_type || 'Other';
      if (!accountTypes[t]) accountTypes[t] = { type: t, count: 0, balance: 0 };
      accountTypes[t].count += 1;
      accountTypes[t].balance += a.current_balance || 0;
    });

    return {
      totalRevenue,
      totalAR,
      totalPayments,
      activeCustomers,
      totalCustomers,
      avgInvoiceSize,
      collectionRate,
      overdueAmount,
      overdueCount: overdueInvoices.length,
      totalInvoices: invoices.length,
      // Expanded
      totalExpenses,
      totalBills,
      totalAP,
      totalEstimates,
      totalCreditMemos,
      activeVendors,
      totalVendors,
      netIncome,
      // Charts
      monthlyRevenue,
      topCustomers,
      topVendors,
      invoiceStatusBreakdown: Object.values(statusBreakdown),
      paymentMethodsBreakdown: Object.values(paymentMethods),
      expenseByCategoryData: Object.values(expenseByCategory).sort((a, b) => b.amount - a.amount).slice(0, 10),
      arAgingData,
      apAgingData,
      accountTypeData: Object.values(accountTypes).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance)),
    };
  }, [invoices, customers, payments, expenses, bills, vendors, accounts, estimates, creditMemos, period?.start, period?.end]);

  return { data: metrics, isLoading, rawInvoices: invoices, rawPayments: payments, rawExpenses: expenses };
}
