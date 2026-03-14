
-- QuickBooks Accounts (Chart of Accounts)
CREATE TABLE public.quickbooks_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  realm_id TEXT NOT NULL,
  qb_id TEXT NOT NULL,
  name TEXT,
  account_type TEXT,
  account_sub_type TEXT,
  classification TEXT,
  current_balance NUMERIC,
  currency_ref TEXT,
  active BOOLEAN DEFAULT true,
  fully_qualified_name TEXT,
  description TEXT,
  metadata JSONB,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(realm_id, qb_id)
);
ALTER TABLE public.quickbooks_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own QB accounts" ON public.quickbooks_accounts FOR SELECT TO authenticated USING (user_id = auth.uid());

-- QuickBooks Vendors
CREATE TABLE public.quickbooks_vendors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  realm_id TEXT NOT NULL,
  qb_id TEXT NOT NULL,
  display_name TEXT,
  company_name TEXT,
  given_name TEXT,
  family_name TEXT,
  email TEXT,
  phone TEXT,
  balance NUMERIC,
  active BOOLEAN DEFAULT true,
  metadata JSONB,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(realm_id, qb_id)
);
ALTER TABLE public.quickbooks_vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own QB vendors" ON public.quickbooks_vendors FOR SELECT TO authenticated USING (user_id = auth.uid());

-- QuickBooks Expenses (Purchase)
CREATE TABLE public.quickbooks_expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  realm_id TEXT NOT NULL,
  qb_id TEXT NOT NULL,
  txn_date TEXT,
  total_amt NUMERIC,
  account_ref_id TEXT,
  account_ref_name TEXT,
  vendor_ref_id TEXT,
  vendor_ref_name TEXT,
  payment_type TEXT,
  doc_number TEXT,
  private_note TEXT,
  line_items JSONB,
  metadata JSONB,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(realm_id, qb_id)
);
ALTER TABLE public.quickbooks_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own QB expenses" ON public.quickbooks_expenses FOR SELECT TO authenticated USING (user_id = auth.uid());

-- QuickBooks Bills
CREATE TABLE public.quickbooks_bills (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  realm_id TEXT NOT NULL,
  qb_id TEXT NOT NULL,
  vendor_ref_id TEXT,
  vendor_ref_name TEXT,
  txn_date TEXT,
  due_date TEXT,
  total_amt NUMERIC,
  balance NUMERIC,
  doc_number TEXT,
  private_note TEXT,
  line_items JSONB,
  metadata JSONB,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(realm_id, qb_id)
);
ALTER TABLE public.quickbooks_bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own QB bills" ON public.quickbooks_bills FOR SELECT TO authenticated USING (user_id = auth.uid());

-- QuickBooks Purchase Orders
CREATE TABLE public.quickbooks_purchase_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  realm_id TEXT NOT NULL,
  qb_id TEXT NOT NULL,
  vendor_ref_id TEXT,
  vendor_ref_name TEXT,
  txn_date TEXT,
  total_amt NUMERIC,
  doc_number TEXT,
  status TEXT,
  line_items JSONB,
  metadata JSONB,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(realm_id, qb_id)
);
ALTER TABLE public.quickbooks_purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own QB purchase orders" ON public.quickbooks_purchase_orders FOR SELECT TO authenticated USING (user_id = auth.uid());

-- QuickBooks Journal Entries
CREATE TABLE public.quickbooks_journal_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  realm_id TEXT NOT NULL,
  qb_id TEXT NOT NULL,
  txn_date TEXT,
  doc_number TEXT,
  total_amt NUMERIC,
  adjustment BOOLEAN DEFAULT false,
  private_note TEXT,
  line_items JSONB,
  metadata JSONB,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(realm_id, qb_id)
);
ALTER TABLE public.quickbooks_journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own QB journal entries" ON public.quickbooks_journal_entries FOR SELECT TO authenticated USING (user_id = auth.uid());

-- QuickBooks Estimates
CREATE TABLE public.quickbooks_estimates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  realm_id TEXT NOT NULL,
  qb_id TEXT NOT NULL,
  customer_ref_id TEXT,
  customer_ref_name TEXT,
  txn_date TEXT,
  expiration_date TEXT,
  total_amt NUMERIC,
  doc_number TEXT,
  txn_status TEXT,
  line_items JSONB,
  metadata JSONB,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(realm_id, qb_id)
);
ALTER TABLE public.quickbooks_estimates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own QB estimates" ON public.quickbooks_estimates FOR SELECT TO authenticated USING (user_id = auth.uid());

-- QuickBooks Credit Memos
CREATE TABLE public.quickbooks_credit_memos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  realm_id TEXT NOT NULL,
  qb_id TEXT NOT NULL,
  customer_ref_id TEXT,
  customer_ref_name TEXT,
  txn_date TEXT,
  total_amt NUMERIC,
  balance NUMERIC,
  doc_number TEXT,
  line_items JSONB,
  metadata JSONB,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(realm_id, qb_id)
);
ALTER TABLE public.quickbooks_credit_memos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own QB credit memos" ON public.quickbooks_credit_memos FOR SELECT TO authenticated USING (user_id = auth.uid());

-- QuickBooks Bank Transactions (Deposits + Transfers)
CREATE TABLE public.quickbooks_bank_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  realm_id TEXT NOT NULL,
  qb_id TEXT NOT NULL,
  txn_type TEXT NOT NULL,
  txn_date TEXT,
  total_amt NUMERIC,
  account_ref_id TEXT,
  account_ref_name TEXT,
  doc_number TEXT,
  private_note TEXT,
  line_items JSONB,
  metadata JSONB,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(realm_id, qb_id, txn_type)
);
ALTER TABLE public.quickbooks_bank_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own QB bank transactions" ON public.quickbooks_bank_transactions FOR SELECT TO authenticated USING (user_id = auth.uid());

-- QuickBooks Reports (P&L, Balance Sheet, AR/AP Aging snapshots)
CREATE TABLE public.quickbooks_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  realm_id TEXT NOT NULL,
  report_type TEXT NOT NULL,
  report_date TEXT,
  period_start TEXT,
  period_end TEXT,
  report_data JSONB NOT NULL,
  metadata JSONB,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.quickbooks_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own QB reports" ON public.quickbooks_reports FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE INDEX idx_qb_reports_type ON public.quickbooks_reports (user_id, realm_id, report_type);
