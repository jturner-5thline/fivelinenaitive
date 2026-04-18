-- Cell comments for Cash Flow Weekly Report
CREATE TABLE public.cell_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_id uuid NULL,
  line_item_key text NOT NULL,
  line_item_label text NOT NULL,
  week_key date NOT NULL,
  week_num integer NULL,
  week_ending date NULL,
  cell_value_snapshot numeric NULL,
  content_html text NOT NULL DEFAULT '',
  content_json jsonb NULL,
  content_text text NOT NULL DEFAULT '',
  created_by uuid NOT NULL,
  parent_comment_id uuid NULL REFERENCES public.cell_comments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cell_comments_company_line_week
  ON public.cell_comments (company_id, line_item_key, week_key);

CREATE INDEX idx_cell_comments_company_created
  ON public.cell_comments (company_id, created_at DESC);

CREATE INDEX idx_cell_comments_parent
  ON public.cell_comments (parent_comment_id);

ALTER TABLE public.cell_comments ENABLE ROW LEVEL SECURITY;

-- View: any member of the company
CREATE POLICY "Company members can view cell comments"
ON public.cell_comments
FOR SELECT
TO authenticated
USING (public.is_company_member(auth.uid(), company_id));

-- Insert: any member of the company, must be themselves as author
CREATE POLICY "Company members can create cell comments"
ON public.cell_comments
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_company_member(auth.uid(), company_id)
  AND created_by = auth.uid()
);

-- Update: only author or company admin
CREATE POLICY "Author or company admin can update cell comments"
ON public.cell_comments
FOR UPDATE
TO authenticated
USING (
  created_by = auth.uid()
  OR public.is_company_admin(auth.uid(), company_id)
);

-- Delete: only author or company admin
CREATE POLICY "Author or company admin can delete cell comments"
ON public.cell_comments
FOR DELETE
TO authenticated
USING (
  created_by = auth.uid()
  OR public.is_company_admin(auth.uid(), company_id)
);

-- updated_at trigger
CREATE TRIGGER trg_cell_comments_updated_at
BEFORE UPDATE ON public.cell_comments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER TABLE public.cell_comments REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cell_comments;