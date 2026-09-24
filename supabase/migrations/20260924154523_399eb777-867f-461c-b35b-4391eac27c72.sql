
CREATE TABLE public.deal_email_backfill_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  grant_id text NOT NULL,
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  linked_count int NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, deal_id)
);
GRANT ALL ON public.deal_email_backfill_jobs TO service_role;
ALTER TABLE public.deal_email_backfill_jobs ENABLE ROW LEVEL SECURITY;
CREATE INDEX deal_email_backfill_jobs_pending_idx ON public.deal_email_backfill_jobs (status, next_attempt_at);

-- Enqueue one job per (connected mailbox, deal with contacts or a website) in that mailbox owner's workspace
CREATE OR REPLACE FUNCTION public.enqueue_deal_email_backfill()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  WITH mailboxes AS (
    SELECT DISTINCT ON (user_id) user_id, grant_id
    FROM gmail_tokens
    WHERE grant_id IS NOT NULL AND grant_id <> 'demo-seed' AND NOT is_demo_seed
    ORDER BY user_id, updated_at DESC
  ),
  team AS (
    SELECT DISTINCT m.user_id AS mailbox_user, cm2.user_id AS member
    FROM mailboxes m
    JOIN company_members cm1 ON cm1.user_id = m.user_id
    JOIN company_members cm2 ON cm2.company_id = cm1.company_id
    UNION SELECT user_id, user_id FROM mailboxes
  ),
  ins AS (
    INSERT INTO deal_email_backfill_jobs (user_id, grant_id, deal_id)
    SELECT m.user_id, m.grant_id, d.id
    FROM mailboxes m
    JOIN team t ON t.mailbox_user = m.user_id
    JOIN deals d ON d.user_id = t.member
    WHERE d.company_url IS NOT NULL OR EXISTS (SELECT 1 FROM contact_deals cd WHERE cd.deal_id = d.id)
    ON CONFLICT (user_id, deal_id) DO UPDATE
      SET status = 'pending', attempts = 0, next_attempt_at = now(), last_error = NULL, updated_at = now()
    RETURNING 1
  )
  SELECT count(*) INTO n FROM ins;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_deal_email_backfill() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_deal_email_backfill() TO service_role;

-- Atomically claim a small batch
CREATE OR REPLACE FUNCTION public.claim_deal_email_backfill_jobs(_limit int)
RETURNS SETOF public.deal_email_backfill_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE deal_email_backfill_jobs j
  SET status = 'running', attempts = j.attempts + 1, updated_at = now()
  WHERE j.id IN (
    SELECT id FROM deal_email_backfill_jobs
    WHERE (status = 'pending' AND next_attempt_at <= now())
       OR (status = 'running' AND updated_at < now() - interval '10 minutes')
    ORDER BY next_attempt_at
    LIMIT _limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING j.*;
$$;
REVOKE ALL ON FUNCTION public.claim_deal_email_backfill_jobs(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_deal_email_backfill_jobs(int) TO service_role;
