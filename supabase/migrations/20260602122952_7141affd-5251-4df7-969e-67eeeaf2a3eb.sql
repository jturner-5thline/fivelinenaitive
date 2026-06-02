CREATE TABLE public.insights_agenda (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  company_id uuid NOT NULL,
  content_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.insights_agenda TO authenticated;
GRANT ALL ON public.insights_agenda TO service_role;

ALTER TABLE public.insights_agenda ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own agenda in their company"
ON public.insights_agenda
FOR SELECT
TO authenticated
USING (auth.uid() = user_id AND public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Users can insert their own agenda in their company"
ON public.insights_agenda
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Users can update their own agenda in their company"
ON public.insights_agenda
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id AND public.is_company_member(auth.uid(), company_id))
WITH CHECK (auth.uid() = user_id AND public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Users can delete their own agenda in their company"
ON public.insights_agenda
FOR DELETE
TO authenticated
USING (auth.uid() = user_id AND public.is_company_member(auth.uid(), company_id));

CREATE TRIGGER update_insights_agenda_updated_at
BEFORE UPDATE ON public.insights_agenda
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();