-- Per-deal custom Data Room folders. These appear in the Data Room column
-- of the deal's Documents/Data Room workspace alongside the company-wide
-- checklist categories (Materials, Financials, Agreements, Other, etc.),
-- but are scoped to a single deal so they don't pollute the company taxonomy.

CREATE TABLE IF NOT EXISTS public.deal_data_room_custom_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  icon text NOT NULL DEFAULT 'folder',
  color text NOT NULL DEFAULT 'gray',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deal_data_room_custom_folders_name_per_deal UNIQUE (deal_id, name)
);

CREATE INDEX IF NOT EXISTS idx_ddrcf_deal_id ON public.deal_data_room_custom_folders(deal_id);

ALTER TABLE public.deal_data_room_custom_folders ENABLE ROW LEVEL SECURITY;

-- Any member of the deal's company can read/write (mirrors vdr_documents
-- visibility model: deal_id -> deals.company_id -> company_members).
CREATE POLICY "Company members can view deal custom folders"
  ON public.deal_data_room_custom_folders
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_data_room_custom_folders.deal_id
        AND public.is_company_member(auth.uid(), d.company_id)
    )
  );

CREATE POLICY "Company members can insert deal custom folders"
  ON public.deal_data_room_custom_folders
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_data_room_custom_folders.deal_id
        AND public.is_company_member(auth.uid(), d.company_id)
    )
  );

CREATE POLICY "Company members can update deal custom folders"
  ON public.deal_data_room_custom_folders
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_data_room_custom_folders.deal_id
        AND public.is_company_member(auth.uid(), d.company_id)
    )
  );

CREATE POLICY "Company members can delete deal custom folders"
  ON public.deal_data_room_custom_folders
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_data_room_custom_folders.deal_id
        AND public.is_company_member(auth.uid(), d.company_id)
    )
  );

CREATE TRIGGER trg_ddrcf_updated_at
  BEFORE UPDATE ON public.deal_data_room_custom_folders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime so all viewers of the deal see new folders instantly
ALTER PUBLICATION supabase_realtime ADD TABLE public.deal_data_room_custom_folders;