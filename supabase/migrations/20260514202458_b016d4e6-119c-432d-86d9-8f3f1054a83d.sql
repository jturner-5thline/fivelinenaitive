CREATE OR REPLACE FUNCTION public.hard_delete_deal(_deal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _rec record;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.has_role(_caller, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only admins can permanently delete deals';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.deals WHERE id = _deal_id) THEN
    RAISE EXCEPTION 'Deal % not found', _deal_id;
  END IF;

  -- Iterate every public table that has a deal_id column and purge rows.
  -- Cast both sides to text so the delete works whether the column is uuid
  -- (most tables) or text (legacy tables like deal_attachments).
  FOR _rec IN
    SELECT c.table_schema, c.table_name, c.data_type
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'deal_id'
      AND t.table_type = 'BASE TABLE'
      AND c.table_name <> 'deals'
  LOOP
    IF _rec.data_type = 'uuid' THEN
      EXECUTE format('DELETE FROM %I.%I WHERE deal_id = $1', _rec.table_schema, _rec.table_name)
      USING _deal_id;
    ELSE
      EXECUTE format('DELETE FROM %I.%I WHERE deal_id::text = $1', _rec.table_schema, _rec.table_name)
      USING _deal_id::text;
    END IF;
  END LOOP;

  DELETE FROM public.deals WHERE id = _deal_id;
END;
$function$;