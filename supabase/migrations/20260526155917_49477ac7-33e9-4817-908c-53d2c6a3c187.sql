CREATE TABLE public.email_suppression_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intended_recipient text NOT NULL,
  reason text NOT NULL,
  template text,
  function_name text,
  deal_id uuid,
  subject text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.email_suppression_log TO authenticated;
GRANT ALL ON public.email_suppression_log TO service_role;

ALTER TABLE public.email_suppression_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can read suppression log"
ON public.email_suppression_log
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND lower(p.email) LIKE '%@5thline.co'
  )
);

CREATE INDEX idx_email_suppression_log_created_at ON public.email_suppression_log (created_at DESC);
CREATE INDEX idx_email_suppression_log_recipient ON public.email_suppression_log (intended_recipient);
