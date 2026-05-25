CREATE TABLE IF NOT EXISTS public._lender_merge_dup_map (
  dup_id uuid PRIMARY KEY,
  canon_id uuid NOT NULL
);
CREATE TABLE IF NOT EXISTS public._lender_merge_name_map (
  dup_name text PRIMARY KEY,
  canon_name text NOT NULL
);
ALTER TABLE public._lender_merge_dup_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._lender_merge_name_map ENABLE ROW LEVEL SECURITY;
-- No policies: only service role / admins (migrations) access these transient staging tables.
