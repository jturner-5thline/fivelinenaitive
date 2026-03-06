-- Allow platform admins to SELECT company_settings for any company
CREATE POLICY "Platform admins can view all company settings"
  ON public.company_settings FOR SELECT
  USING (public.is_admin(auth.uid()));

-- Allow platform admins to INSERT company_settings for any company
CREATE POLICY "Platform admins can insert company settings"
  ON public.company_settings FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));

-- Allow platform admins to UPDATE company_settings for any company
CREATE POLICY "Platform admins can update company settings"
  ON public.company_settings FOR UPDATE
  USING (public.is_admin(auth.uid()));