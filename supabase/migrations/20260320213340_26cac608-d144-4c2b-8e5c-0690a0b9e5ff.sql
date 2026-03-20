
CREATE TABLE public.vdr_irl_document_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  irl_request_id UUID NOT NULL REFERENCES public.vdr_irl_requests(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.vdr_documents(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL,
  match_type TEXT NOT NULL DEFAULT 'partial' CHECK (match_type IN ('full', 'partial', 'mislabeled')),
  confidence_score INTEGER NOT NULL DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100),
  explanation TEXT,
  flagged_mislabel BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (irl_request_id, document_id)
);

ALTER TABLE public.vdr_irl_document_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view matches for their company deals"
  ON public.vdr_irl_document_matches FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vdr_irl_requests r
      JOIN public.company_members cm ON cm.company_id = r.company_id
      WHERE r.id = vdr_irl_document_matches.irl_request_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert matches for their company deals"
  ON public.vdr_irl_document_matches FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vdr_irl_requests r
      JOIN public.company_members cm ON cm.company_id = r.company_id
      WHERE r.id = vdr_irl_document_matches.irl_request_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update matches for their company deals"
  ON public.vdr_irl_document_matches FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vdr_irl_requests r
      JOIN public.company_members cm ON cm.company_id = r.company_id
      WHERE r.id = vdr_irl_document_matches.irl_request_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete matches for their company deals"
  ON public.vdr_irl_document_matches FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vdr_irl_requests r
      JOIN public.company_members cm ON cm.company_id = r.company_id
      WHERE r.id = vdr_irl_document_matches.irl_request_id
        AND cm.user_id = auth.uid()
    )
  );
