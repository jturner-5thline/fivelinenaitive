
-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can view their own QB invoices" ON public.quickbooks_invoices;
DROP POLICY IF EXISTS "Users can view own QB expenses" ON public.quickbooks_expenses;

-- Create company-scoped SELECT policies for QB invoices
CREATE POLICY "Company members can view QB invoices"
ON public.quickbooks_invoices FOR SELECT
TO authenticated
USING (
  user_id IN (
    SELECT cm2.user_id FROM company_members cm1
    JOIN company_members cm2 ON cm1.company_id = cm2.company_id
    WHERE cm1.user_id = auth.uid()
  )
);

-- Create company-scoped SELECT policies for QB expenses
CREATE POLICY "Company members can view QB expenses"
ON public.quickbooks_expenses FOR SELECT
TO authenticated
USING (
  user_id IN (
    SELECT cm2.user_id FROM company_members cm1
    JOIN company_members cm2 ON cm1.company_id = cm2.company_id
    WHERE cm1.user_id = auth.uid()
  )
);

-- Also update quickbooks_tokens so company members can see connection status
DROP POLICY IF EXISTS "Users can manage their own QB tokens" ON public.quickbooks_tokens;

CREATE POLICY "Company members can view QB tokens"
ON public.quickbooks_tokens FOR SELECT
TO authenticated
USING (
  user_id IN (
    SELECT cm2.user_id FROM company_members cm1
    JOIN company_members cm2 ON cm1.company_id = cm2.company_id
    WHERE cm1.user_id = auth.uid()
  )
);

-- Keep write policies restricted to the syncing user
CREATE POLICY "Users can manage their own QB tokens write"
ON public.quickbooks_tokens
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
