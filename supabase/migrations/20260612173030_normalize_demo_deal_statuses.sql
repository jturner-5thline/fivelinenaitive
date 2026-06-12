-- Normalize legacy raw enum statuses on demo-seeded deals so they render in
-- the deals grid view (which groups by the canonical UI status taxonomy).
UPDATE public.deals SET status = 'on-track'  WHERE status = 'active';
UPDATE public.deals SET status = 'on-hold'   WHERE status = 'on_hold';
UPDATE public.deals SET status = 'archived'  WHERE status IN ('closed_won','closed_lost');
