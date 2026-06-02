-- Backfill legacy rows to a valid month token before enforcing the format.
UPDATE public.insights_agenda
SET period_key = to_char(COALESCE(updated_at, now()), 'YYYY-MM'),
    period_type = 'month'
WHERE NOT (
  (period_type = 'month'   AND period_key ~ '^\d{4}-(0[1-9]|1[0-2])$') OR
  (period_type = 'quarter' AND period_key ~ '^\d{4}-Q[1-4]$')
);

ALTER TABLE public.insights_agenda
  ADD CONSTRAINT insights_agenda_period_key_format_chk
  CHECK (
    (period_type = 'month'   AND period_key ~ '^\d{4}-(0[1-9]|1[0-2])$') OR
    (period_type = 'quarter' AND period_key ~ '^\d{4}-Q[1-4]$')
  );