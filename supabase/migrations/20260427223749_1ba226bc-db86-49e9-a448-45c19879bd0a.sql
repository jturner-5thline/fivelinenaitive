CREATE TABLE IF NOT EXISTS public.page_access_allowlist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  page_key TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (page_key, email)
);

CREATE INDEX IF NOT EXISTS idx_page_access_allowlist_page_email
  ON public.page_access_allowlist (page_key, lower(email));

ALTER TABLE public.page_access_allowlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view page allowlist"
  ON public.page_access_allowlist
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert page allowlist"
  ON public.page_access_allowlist
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update page allowlist"
  ON public.page_access_allowlist
  FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete page allowlist"
  ON public.page_access_allowlist
  FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TRIGGER set_page_access_allowlist_updated_at
  BEFORE UPDATE ON public.page_access_allowlist
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.is_email_allowed_for_page(_page_key TEXT, _email TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.page_access_allowlist
    WHERE page_key = _page_key
      AND lower(email) = lower(_email)
  )
$$;

INSERT INTO public.page_access_allowlist (page_key, email) VALUES
  ('insights', 'jturner@5thline.co'),
  ('insights', 'jmoffitt@5thline.co'),
  ('insights', 'swilliams@5thline.co'),
  ('insights', 'mclark@5thline.co')
ON CONFLICT (page_key, email) DO NOTHING;