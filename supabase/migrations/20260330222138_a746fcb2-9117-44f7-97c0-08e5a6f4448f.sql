
CREATE TABLE public.data_room_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  deal_id UUID REFERENCES public.deals(id) ON DELETE CASCADE NOT NULL,
  data_room_type TEXT NOT NULL CHECK (data_room_type IN ('external', 'internal')),
  file_count INTEGER NOT NULL DEFAULT 0,
  exported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.data_room_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own exports"
ON public.data_room_exports FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view their own exports"
ON public.data_room_exports FOR SELECT TO authenticated
USING (user_id = auth.uid());
