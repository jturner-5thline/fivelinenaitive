-- QuickBooks OAuth tokens storage
CREATE TABLE public.quickbooks_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  realm_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  token_type TEXT DEFAULT 'Bearer',
  scope TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, realm_id)
);

ALTER TABLE public.quickbooks_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own QB tokens"
ON public.quickbooks_tokens FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_quickbooks_tokens_updated_at
BEFORE UPDATE ON public.quickbooks_tokens
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- QuickBooks Customers synced data
CREATE TABLE public.quickbooks_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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
  synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(realm_id, qb_id)
);

ALTER TABLE public.quickbooks_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own QB customers"
ON public.quickbooks_customers FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own QB customers"
ON public.quickbooks_customers FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- QuickBooks Invoices synced data
CREATE TABLE public.quickbooks_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  realm_id TEXT NOT NULL,
  qb_id TEXT NOT NULL,
  doc_number TEXT,
  customer_id TEXT,
  customer_name TEXT,
  txn_date DATE,
  due_date DATE,
  total_amt NUMERIC,
  balance NUMERIC,
  status TEXT,
  email_status TEXT,
  metadata JSONB,
  synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(realm_id, qb_id)
);

ALTER TABLE public.quickbooks_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own QB invoices"
ON public.quickbooks_invoices FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own QB invoices"
ON public.quickbooks_invoices FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- QuickBooks Payments synced data
CREATE TABLE public.quickbooks_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  realm_id TEXT NOT NULL,
  qb_id TEXT NOT NULL,
  customer_id TEXT,
  customer_name TEXT,
  txn_date DATE,
  total_amt NUMERIC,
  payment_method TEXT,
  metadata JSONB,
  synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(realm_id, qb_id)
);

ALTER TABLE public.quickbooks_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own QB payments"
ON public.quickbooks_payments FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own QB payments"
ON public.quickbooks_payments FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- QuickBooks Sync History
CREATE TABLE public.quickbooks_sync_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  realm_id TEXT NOT NULL,
  sync_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  records_synced INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.quickbooks_sync_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own QB sync history"
ON public.quickbooks_sync_history FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own QB sync history"
ON public.quickbooks_sync_history FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX idx_qb_customers_realm ON public.quickbooks_customers(realm_id);
CREATE INDEX idx_qb_invoices_realm ON public.quickbooks_invoices(realm_id);
CREATE INDEX idx_qb_invoices_customer ON public.quickbooks_invoices(customer_id);
CREATE INDEX idx_qb_payments_realm ON public.quickbooks_payments(realm_id);
CREATE INDEX idx_qb_sync_history_user ON public.quickbooks_sync_history(user_id, started_at DESC);