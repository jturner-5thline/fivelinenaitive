
CREATE OR REPLACE FUNCTION public.notify_email_on_lender_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  deal_record record;
  changes jsonb := '{}'::jsonb;
  actor_name text;
BEGIN
  SELECT d.company, d.user_id, d.company_id INTO deal_record
  FROM deals d
  WHERE d.id = NEW.deal_id;

  IF deal_record.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO actor_name
  FROM public.profiles
  WHERE user_id = auth.uid();

  IF TG_OP = 'INSERT' THEN
    IF NEW.stage IS NOT NULL THEN
      changes := changes || jsonb_build_object('stage', jsonb_build_object('from', null, 'to', NEW.stage));
    END IF;
    IF NEW.tracking_status IS NOT NULL THEN
      changes := changes || jsonb_build_object('tracking_status', jsonb_build_object('from', null, 'to', NEW.tracking_status));
    END IF;
    IF NEW.notes IS NOT NULL AND NEW.notes != '' THEN
      changes := changes || jsonb_build_object('notes', jsonb_build_object('from', null, 'to', LEFT(NEW.notes, 200)));
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.stage IS DISTINCT FROM NEW.stage THEN
      changes := changes || jsonb_build_object('stage', jsonb_build_object('from', OLD.stage, 'to', NEW.stage));
    END IF;
    IF OLD.substage IS DISTINCT FROM NEW.substage THEN
      changes := changes || jsonb_build_object('substage', jsonb_build_object('from', OLD.substage, 'to', NEW.substage));
    END IF;
    IF OLD.tracking_status IS DISTINCT FROM NEW.tracking_status THEN
      changes := changes || jsonb_build_object('tracking_status', jsonb_build_object('from', OLD.tracking_status, 'to', NEW.tracking_status));
    END IF;
    IF OLD.notes IS DISTINCT FROM NEW.notes THEN
      changes := changes || jsonb_build_object('notes', jsonb_build_object('from', LEFT(COALESCE(OLD.notes, ''), 200), 'to', LEFT(COALESCE(NEW.notes, ''), 200)));
    END IF;
    IF OLD.pass_reason IS DISTINCT FROM NEW.pass_reason THEN
      changes := changes || jsonb_build_object('pass_reason', jsonb_build_object('from', OLD.pass_reason, 'to', NEW.pass_reason));
    END IF;
    IF OLD.quote_amount IS DISTINCT FROM NEW.quote_amount THEN
      changes := changes || jsonb_build_object('quote_amount', jsonb_build_object('from', OLD.quote_amount::text, 'to', NEW.quote_amount::text));
    END IF;
    IF OLD.quote_rate IS DISTINCT FROM NEW.quote_rate THEN
      changes := changes || jsonb_build_object('quote_rate', jsonb_build_object('from', OLD.quote_rate::text, 'to', NEW.quote_rate::text));
    END IF;
    IF OLD.quote_term IS DISTINCT FROM NEW.quote_term THEN
      changes := changes || jsonb_build_object('quote_term', jsonb_build_object('from', OLD.quote_term, 'to', NEW.quote_term));
    END IF;
    IF OLD.score IS DISTINCT FROM NEW.score THEN
      changes := changes || jsonb_build_object('score', jsonb_build_object('from', OLD.score::text, 'to', NEW.score::text));
    END IF;
  END IF;

  IF changes != '{}'::jsonb THEN
    INSERT INTO public.pending_lender_notifications (
      deal_id, company_id, lender_id, lender_name,
      change_summary, changed_by, changed_by_name
    ) VALUES (
      NEW.deal_id, deal_record.company_id, NEW.id, NEW.name,
      changes, auth.uid(), actor_name
    );
  END IF;

  RETURN NEW;
END;
$function$;
