import { useMemo } from 'react';
import { useQuickBooksInvoices, useQuickBooksCustomers, useQuickBooksPayments } from '@/hooks/useQuickBooks';
import { format, subMonths, parseISO, startOfMonth, isAfter } from 'date-fns';

export function useQuickBooksMetrics(realmId?: string) {
  const { data: invoices = [], isLoading: invoicesLoading } = useQuickBooksInvoices(realmId);
  const { data: customers = [], isLoading: customersLoading } = useQuickBooksCustomers(realmId);
  const { data: payments = [], isLoading: paymentsLoading } = useQuickBooksPayments(realmId);

  const isLoading = invoicesLoading || customersLoading || paymentsLoading;

  const metrics = useMemo(() => {
    // Total revenue (sum of all invoice totals)
    const totalRevenue = invoices.reduce((sum, inv) => sum + (inv.total_amt || 0), 0);

    // Outstanding AR (sum of all invoice balances)
    const totalAR = invoices.reduce((sum, inv) => sum + (inv.balance || 0), 0);

    // Total payments received
    const totalPayments = payments.reduce((sum, p) => sum + (p.total_amt || 0), 0);

    // Active customers
    const activeCustomers = customers.filter(c => c.active).length;
    const totalCustomers = customers.length;

    // Average invoice size
    const avgInvoiceSize = invoices.length > 0 ? totalRevenue / invoices.length : 0;

    // Collection rate
    const collectionRate = totalRevenue > 0 ? ((totalRevenue - totalAR) / totalRevenue) * 100 : 0;

    // Overdue invoices (due_date < today and balance > 0)
    const now = new Date();
    const overdueInvoices = invoices.filter(inv => 
      inv.due_date && inv.balance && inv.balance > 0 && new Date(inv.due_date) < now
    );
    const overdueAmount = overdueInvoices.reduce((sum, inv) => sum + (inv.balance || 0), 0);

    // Monthly revenue trend (last 12 months)
    const monthlyRevenue: { month: string; revenue: number; payments: number; invoiceCount: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const monthDate = subMonths(now, i);
      const monthStr = format(monthDate, 'MMM-yy');
      const monthStart = startOfMonth(monthDate);
      const nextMonthStart = startOfMonth(subMonths(now, i - 1));

      const monthInvoices = invoices.filter(inv => {
        if (!inv.txn_date) return false;
        const d = new Date(inv.txn_date);
        return d >= monthStart && d < nextMonthStart;
      });

      const monthPayments = payments.filter(p => {
        if (!p.txn_date) return false;
        const d = new Date(p.txn_date);
        return d >= monthStart && d < nextMonthStart;
      });

      monthlyRevenue.push({
        month: monthStr,
        revenue: monthInvoices.reduce((s, inv) => s + (inv.total_amt || 0), 0),
        payments: monthPayments.reduce((s, p) => s + (p.total_amt || 0), 0),
        invoiceCount: monthInvoices.length,
      });
    }

    // Top customers by revenue
    const customerRevenue: Record<string, { name: string; revenue: number; balance: number; invoiceCount: number }> = {};
    invoices.forEach(inv => {
      const name = inv.customer_name || 'Unknown';
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

    // Invoice status breakdown
    const statusBreakdown: Record<string, { status: string; count: number; value: number }> = {};
    invoices.forEach(inv => {
      const status = inv.status || 'Unknown';
      if (!statusBreakdown[status]) {
        statusBreakdown[status] = { status, count: 0, value: 0 };
      }
      statusBreakdown[status].count += 1;
      statusBreakdown[status].value += inv.total_amt || 0;
    });

    // Payment methods breakdown
    const paymentMethods: Record<string, { method: string; count: number; value: number }> = {};
    payments.forEach(p => {
      const method = p.payment_method || 'Other';
      if (!paymentMethods[method]) {
        paymentMethods[method] = { method, count: 0, value: 0 };
      }
      paymentMethods[method].count += 1;
      paymentMethods[method].value += p.total_amt || 0;
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

    const arAgingData = Object.entries(agingBuckets).map(([bucket, value]) => ({
      bucket,
      value,
    }));

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
      monthlyRevenue,
      topCustomers,
      invoiceStatusBreakdown: Object.values(statusBreakdown),
      paymentMethodsBreakdown: Object.values(paymentMethods),
      arAgingData,
    };
  }, [invoices, customers, payments]);

  return { data: metrics, isLoading };
}
