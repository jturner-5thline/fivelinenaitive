ALTER TABLE public.master_lenders
  ADD COLUMN IF NOT EXISTS resp_emails_sent integer,
  ADD COLUMN IF NOT EXISTS resp_replies_received integer,
  ADD COLUMN IF NOT EXISTS resp_reply_rate numeric,
  ADD COLUMN IF NOT EXISTS resp_median_hours_to_reply numeric,
  ADD COLUMN IF NOT EXISTS resp_reply_rate_excl_mass numeric,
  ADD COLUMN IF NOT EXISTS resp_last_reply_date date,
  ADD COLUMN IF NOT EXISTS resp_rating text,
  ADD COLUMN IF NOT EXISTS resp_emails_sent_l12m integer,
  ADD COLUMN IF NOT EXISTS resp_reply_rate_l12m numeric,
  ADD COLUMN IF NOT EXISTS resp_window_label text,
  ADD COLUMN IF NOT EXISTS resp_updated_at timestamptz;