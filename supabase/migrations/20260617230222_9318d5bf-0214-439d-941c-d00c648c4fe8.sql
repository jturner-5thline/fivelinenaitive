
CREATE OR REPLACE FUNCTION public.admin_delete_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  user_email text;
  user_name text;
  r record;
  sql_stmt text;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can delete users';
  END IF;

  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete your own account';
  END IF;

  SELECT email, display_name INTO user_email, user_name
  FROM public.profiles WHERE user_id = _user_id;

  PERFORM public.log_admin_action(
    'user_deleted',
    'user',
    _user_id,
    COALESCE(user_name, user_email),
    jsonb_build_object('email', user_email)
  );

  -- Dynamically resolve all public.* FKs to auth.users with NO ACTION ('a') or RESTRICT ('r').
  -- For nullable columns: SET NULL. For NOT NULL columns: DELETE rows.
  -- CASCADE ('c') and SET NULL ('n') columns are handled automatically by the engine.
  FOR r IN
    SELECT n.nspname AS schema_name,
           c.relname AS table_name,
           a.attname AS column_name,
           a.attnotnull AS not_null
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
    JOIN pg_class fc ON fc.oid = con.confrelid
    JOIN pg_namespace fn ON fn.oid = fc.relnamespace
    WHERE con.contype = 'f'
      AND fn.nspname = 'auth'
      AND fc.relname = 'users'
      AND n.nspname = 'public'
      AND con.confdeltype IN ('a', 'r')
  LOOP
    IF r.not_null THEN
      sql_stmt := format('DELETE FROM %I.%I WHERE %I = $1',
                         r.schema_name, r.table_name, r.column_name);
    ELSE
      sql_stmt := format('UPDATE %I.%I SET %I = NULL WHERE %I = $1',
                         r.schema_name, r.table_name, r.column_name, r.column_name);
    END IF;
    BEGIN
      EXECUTE sql_stmt USING _user_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'admin_delete_user cleanup failed on %.% (%): %',
        r.table_name, r.column_name, SQLERRM, sql_stmt;
    END;
  END LOOP;

  DELETE FROM auth.users WHERE id = _user_id;
END;
$function$;
