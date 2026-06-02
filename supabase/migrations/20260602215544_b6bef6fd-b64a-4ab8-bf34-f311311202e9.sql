CREATE OR REPLACE FUNCTION public.task_comments_populate_mentions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ids uuid[];
BEGIN
  SELECT COALESCE(array_agg(DISTINCT (m[1])::uuid), '{}'::uuid[])
    INTO ids
  FROM regexp_matches(COALESCE(NEW.body, ''),
                      '@\[[^\]]+\]\(([0-9a-fA-F-]{36})\)', 'g') AS m;
  NEW.mentions := ids;
  RETURN NEW;
END $$;
