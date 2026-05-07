-- Create financial_comments table for deal financial statement comments
CREATE TABLE IF NOT EXISTS public.financial_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  company_id uuid,
  statement_type text NOT NULL,
  anchor_type text NOT NULL,
  anchor_key text NOT NULL,
  target_label text,
  line_item_key text,
  line_item_label text,
  period_key text,
  period_label text,
  comment_text text NOT NULL,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financial_comments_deal_id ON public.financial_comments(deal_id);
CREATE INDEX IF NOT EXISTS idx_financial_comments_anchor_key ON public.financial_comments(anchor_key);

-- Auto-set company_id from deal owner via existing trigger pattern
CREATE OR REPLACE FUNCTION public.set_financial_comment_company_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.company_id IS NULL AND NEW.deal_id IS NOT NULL THEN
    SELECT company_id INTO NEW.company_id FROM public.deals WHERE id = NEW.deal_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_financial_comments_set_company ON public.financial_comments;
CREATE TRIGGER trg_financial_comments_set_company
  BEFORE INSERT ON public.financial_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_financial_comment_company_id();

ALTER TABLE public.financial_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view financial comments for accessible deals" ON public.financial_comments;
CREATE POLICY "Users can view financial comments for accessible deals"
  ON public.financial_comments FOR SELECT
  USING (public.user_has_deal_access(auth.uid(), deal_id));

DROP POLICY IF EXISTS "Users can insert financial comments on accessible deals" ON public.financial_comments;
CREATE POLICY "Users can insert financial comments on accessible deals"
  ON public.financial_comments FOR INSERT
  WITH CHECK (
    auth.uid() = created_by_user_id
    AND public.user_has_deal_access(auth.uid(), deal_id)
  );

DROP POLICY IF EXISTS "Users can delete their own financial comments" ON public.financial_comments;
CREATE POLICY "Users can delete their own financial comments"
  ON public.financial_comments FOR DELETE
  USING (auth.uid() = created_by_user_id);
