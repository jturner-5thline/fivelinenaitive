
-- Add phase column so each weekly hours entry can be tagged Pre-Signing or Post-Signing.
ALTER TABLE public.weekly_time_entries
  ADD COLUMN IF NOT EXISTS phase text NOT NULL DEFAULT 'pre_signing';

ALTER TABLE public.weekly_time_entries
  DROP CONSTRAINT IF EXISTS weekly_time_entries_phase_check;
ALTER TABLE public.weekly_time_entries
  ADD CONSTRAINT weekly_time_entries_phase_check CHECK (phase IN ('pre_signing','post_signing'));

-- Replace unique key to include phase so a deal can have Pre and Post entries in the same week.
ALTER TABLE public.weekly_time_entries
  DROP CONSTRAINT IF EXISTS weekly_time_entries_deal_id_user_id_week_start_date_key;
DROP INDEX IF EXISTS public.weekly_time_entries_deal_id_user_id_week_start_date_key;

CREATE UNIQUE INDEX IF NOT EXISTS weekly_time_entries_deal_user_week_phase_key
  ON public.weekly_time_entries (deal_id, user_id, week_start_date, phase);

-- Keep deals.pre_signing_hours / post_signing_hours in sync as the sum of entries per phase.
CREATE OR REPLACE FUNCTION public.sync_deal_hours_from_entries()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_deal uuid;
BEGIN
  target_deal := COALESCE(NEW.deal_id, OLD.deal_id);
  IF target_deal IS NULL THEN RETURN NULL; END IF;

  UPDATE public.deals d
     SET pre_signing_hours = COALESCE((
           SELECT SUM(hours) FROM public.weekly_time_entries
            WHERE deal_id = target_deal AND phase = 'pre_signing'), 0),
         post_signing_hours = COALESCE((
           SELECT SUM(hours) FROM public.weekly_time_entries
            WHERE deal_id = target_deal AND phase = 'post_signing'), 0)
   WHERE d.id = target_deal;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_deal_hours_from_entries ON public.weekly_time_entries;
CREATE TRIGGER trg_sync_deal_hours_from_entries
AFTER INSERT OR UPDATE OR DELETE ON public.weekly_time_entries
FOR EACH ROW EXECUTE FUNCTION public.sync_deal_hours_from_entries();
