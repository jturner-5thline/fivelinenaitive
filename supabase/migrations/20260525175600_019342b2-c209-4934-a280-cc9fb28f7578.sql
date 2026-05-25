CREATE TABLE IF NOT EXISTS public._lender_merge_field_updates (
  canon_id uuid PRIMARY KEY,
  set_clause text NOT NULL
);
ALTER TABLE public._lender_merge_field_updates ENABLE ROW LEVEL SECURITY;
