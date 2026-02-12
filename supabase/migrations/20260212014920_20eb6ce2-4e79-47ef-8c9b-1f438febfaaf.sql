
-- Add pin, folder, tag, linked lender, permissions, and template support to deal_space_notes
ALTER TABLE public.deal_space_notes 
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS folder text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS linked_lender_id uuid REFERENCES public.deal_lenders(id) ON DELETE SET NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_shared boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS template_name text DEFAULT NULL;

-- Create note versions table for version history
CREATE TABLE public.deal_space_note_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL REFERENCES public.deal_space_notes(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.deal_space_note_versions ENABLE ROW LEVEL SECURITY;

-- Create note comments table
CREATE TABLE public.deal_space_note_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL REFERENCES public.deal_space_notes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  quote_text text DEFAULT NULL,
  resolved boolean NOT NULL DEFAULT false,
  resolved_by uuid DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.deal_space_note_comments ENABLE ROW LEVEL SECURITY;

-- RLS for note_versions - same company access
CREATE POLICY "Users can view note versions for their company deals"
  ON public.deal_space_note_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.deal_space_notes n
      JOIN public.deals d ON d.id = n.deal_id
      WHERE n.id = note_id
        AND public.is_same_company_as_user(auth.uid(), d.user_id)
    )
  );

CREATE POLICY "Users can create note versions"
  ON public.deal_space_note_versions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS for note_comments - same company access
CREATE POLICY "Users can view comments for their company deals"
  ON public.deal_space_note_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.deal_space_notes n
      JOIN public.deals d ON d.id = n.deal_id
      WHERE n.id = note_id
        AND public.is_same_company_as_user(auth.uid(), d.user_id)
    )
  );

CREATE POLICY "Users can create comments"
  ON public.deal_space_note_comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own comments"
  ON public.deal_space_note_comments FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comments"
  ON public.deal_space_note_comments FOR DELETE
  USING (auth.uid() = user_id);

-- Updated_at trigger for comments
CREATE TRIGGER update_deal_space_note_comments_updated_at
  BEFORE UPDATE ON public.deal_space_note_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to auto-save version on significant update
CREATE OR REPLACE FUNCTION public.save_note_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only create version if content actually changed
  IF OLD.content IS DISTINCT FROM NEW.content THEN
    INSERT INTO public.deal_space_note_versions (note_id, content, title, user_id)
    VALUES (OLD.id, OLD.content, OLD.title, COALESCE(auth.uid(), OLD.user_id));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER save_note_version_on_update
  BEFORE UPDATE ON public.deal_space_notes
  FOR EACH ROW EXECUTE FUNCTION public.save_note_version();
