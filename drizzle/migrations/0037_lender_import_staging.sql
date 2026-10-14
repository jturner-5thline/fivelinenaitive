CREATE TABLE public.lender_import_staging (
  id bigserial PRIMARY KEY,
  batch text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.lender_import_staging TO service_role;
ALTER TABLE public.lender_import_staging ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.lender_import_staging IS 'Internal staging for one-off admin spreadsheet imports; no client access.';