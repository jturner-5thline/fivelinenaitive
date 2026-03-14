import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface QBExpense {
  id: string;
  qb_id: string;
  realm_id: string;
  txn_date: string | null;
  total_amt: number | null;
  account_ref_id: string | null;
  account_ref_name: string | null;
  vendor_ref_id: string | null;
  vendor_ref_name: string | null;
  payment_type: string | null;
  doc_number: string | null;
}

export interface QBBill {
  id: string;
  qb_id: string;
  realm_id: string;
  vendor_ref_id: string | null;
  vendor_ref_name: string | null;
  txn_date: string | null;
  due_date: string | null;
  total_amt: number | null;
  balance: number | null;
  doc_number: string | null;
}

export interface QBVendor {
  id: string;
  qb_id: string;
  realm_id: string;
  display_name: string | null;
  company_name: string | null;
  email: string | null;
  balance: number | null;
  active: boolean;
}

export interface QBAccount {
  id: string;
  qb_id: string;
  realm_id: string;
  name: string | null;
  account_type: string | null;
  account_sub_type: string | null;
  classification: string | null;
  current_balance: number | null;
  active: boolean;
}

export interface QBEstimate {
  id: string;
  qb_id: string;
  realm_id: string;
  customer_ref_name: string | null;
  txn_date: string | null;
  total_amt: number | null;
  txn_status: string | null;
}

export interface QBCreditMemo {
  id: string;
  qb_id: string;
  realm_id: string;
  customer_ref_name: string | null;
  txn_date: string | null;
  total_amt: number | null;
  balance: number | null;
}

function useQBTable<T>(table: string, realmId?: string, orderBy?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [`qb-${table}`, user?.id, realmId],
    queryFn: async () => {
      let query = (supabase.from(table as any) as any).select('*');
      if (realmId) query = query.eq('realm_id', realmId);
      if (orderBy) query = query.order(orderBy, { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as T[];
    },
    enabled: !!user,
  });
}

export function useQuickBooksExpanded(realmId?: string) {
  const { data: expenses = [], isLoading: expLoading } = useQBTable<QBExpense>('quickbooks_expenses', realmId, 'txn_date');
  const { data: bills = [], isLoading: billsLoading } = useQBTable<QBBill>('quickbooks_bills', realmId, 'txn_date');
  const { data: vendors = [], isLoading: vendorsLoading } = useQBTable<QBVendor>('quickbooks_vendors', realmId, 'display_name');
  const { data: accounts = [], isLoading: accLoading } = useQBTable<QBAccount>('quickbooks_accounts', realmId, 'name');
  const { data: estimates = [], isLoading: estLoading } = useQBTable<QBEstimate>('quickbooks_estimates', realmId, 'txn_date');
  const { data: creditMemos = [], isLoading: cmLoading } = useQBTable<QBCreditMemo>('quickbooks_credit_memos', realmId, 'txn_date');

  return {
    expenses,
    bills,
    vendors,
    accounts,
    estimates,
    creditMemos,
    isLoading: expLoading || billsLoading || vendorsLoading || accLoading || estLoading || cmLoading,
  };
}
