CREATE TABLE public.deal_drive_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  folder_id TEXT NOT NULL,
  folder_name TEXT,
  folder_url TEXT,
  auto_matched BOOLEAN NOT NULL DEFAULT false,
  linked_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (deal_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.deal_drive_folders TO authenticated;
GRANT ALL ON public.deal_drive_folders TO service_role;

ALTER TABLE public.deal_drive_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deal members can view drive folder links"
ON public.deal_drive_folders FOR SELECT TO authenticated
USING (public.can_access_deal(auth.uid(), deal_id));

CREATE POLICY "Deal members can link drive folders"
ON public.deal_drive_folders FOR INSERT TO authenticated
WITH CHECK (public.can_access_deal(auth.uid(), deal_id));

CREATE POLICY "Deal members can update drive folder links"
ON public.deal_drive_folders FOR UPDATE TO authenticated
USING (public.can_access_deal(auth.uid(), deal_id))
WITH CHECK (public.can_access_deal(auth.uid(), deal_id));

CREATE POLICY "Deal members can remove drive folder links"
ON public.deal_drive_folders FOR DELETE TO authenticated
USING (public.can_access_deal(auth.uid(), deal_id));

CREATE TRIGGER update_deal_drive_folders_updated_at
BEFORE UPDATE ON public.deal_drive_folders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();