
CREATE OR REPLACE FUNCTION public.trigger_seed_new_company_on_member()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  member_count int;
BEGIN
  -- Only seed when this is the FIRST member added to the company
  SELECT count(*) INTO member_count
  FROM public.company_members
  WHERE company_id = NEW.company_id;
  
  -- count includes the just-inserted row, so first member = 1
  IF member_count = 1 THEN
    PERFORM public.seed_new_company_defaults(NEW.company_id);
    
    -- Fire edge function to seed sample deal (async via net.http_post)
    PERFORM net.http_post(
      url := 'https://tgkksvazruzbghssnxde.supabase.co/functions/v1/seed-sample-deal',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object(
        'company_id', NEW.company_id,
        'user_id', NEW.user_id
      )
    );
  END IF;
  
  RETURN NEW;
END;
$function$;
