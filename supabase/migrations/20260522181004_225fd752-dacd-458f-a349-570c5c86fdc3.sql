
-- Make all QuickBooks data tables visible to every member of the connecting user's company,
-- matching the existing pattern used for quickbooks_tokens / quickbooks_invoices / quickbooks_expenses.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'quickbooks_accounts',
    'quickbooks_bank_transactions',
    'quickbooks_bills',
    'quickbooks_credit_memos',
    'quickbooks_customers',
    'quickbooks_estimates',
    'quickbooks_journal_entries',
    'quickbooks_payments',
    'quickbooks_purchase_orders',
    'quickbooks_reports',
    'quickbooks_sync_history',
    'quickbooks_vendors'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Users can view own QB %1$s" ON public.%2$I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Users can view their own QB %1$s" ON public.%2$I', t, t);
    EXECUTE format($f$
      CREATE POLICY "Company members can view QB %1$s"
        ON public.%2$I
        FOR SELECT
        USING (
          user_id IN (
            SELECT cm2.user_id
            FROM public.company_members cm1
            JOIN public.company_members cm2 ON cm1.company_id = cm2.company_id
            WHERE cm1.user_id = auth.uid()
          )
        )
    $f$, t, t);
  END LOOP;
END$$;

-- Drop the legacy duplicate names that the loop above didn't match by exact label
DROP POLICY IF EXISTS "Users can view their own QB customers" ON public.quickbooks_customers;
DROP POLICY IF EXISTS "Users can view their own QB payments" ON public.quickbooks_payments;
DROP POLICY IF EXISTS "Users can view their own QB sync history" ON public.quickbooks_sync_history;
