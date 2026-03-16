-- Enrich lender notification trigger with change details and actor
CREATE OR REPLACE FUNCTION public.notify_email_on_lender_event()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  deal_record record;
  changes jsonb := '[]'::jsonb;
  actor_name text;
BEGIN
  SELECT d.company, d.user_id INTO deal_record
  FROM deals d
  WHERE d.id = NEW.deal_id;

  SELECT display_name INTO actor_name
  FROM public.profiles
  WHERE user_id = auth.uid();

  IF TG_OP = 'INSERT' THEN
    changes := jsonb_build_array(
      jsonb_build_object('field', 'Stage', 'new', COALESCE(NEW.stage, 'N/A')),
      jsonb_build_object('field', 'Tracking Status', 'new', COALESCE(NEW.tracking_status, 'N/A'))
    );
    IF NEW.notes IS NOT NULL AND NEW.notes != '' THEN
      changes := changes || jsonb_build_array(jsonb_build_object('field', 'Notes', 'new', NEW.notes));
    END IF;

    PERFORM net.http_post(
      url := 'https://tgkksvazruzbghssnxde.supabase.co/functions/v1/send-notification-email',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object(
        'type', 'lender_added',
        'user_id', deal_record.user_id::text,
        'deal_id', NEW.deal_id::text,
        'deal_name', deal_record.company,
        'lender_name', NEW.name,
        'changed_by', COALESCE(actor_name, 'System'),
        'changes', changes
      )
    );
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.stage IS DISTINCT FROM NEW.stage THEN
      changes := changes || jsonb_build_array(jsonb_build_object('field', 'Stage', 'old', COALESCE(OLD.stage, 'N/A'), 'new', COALESCE(NEW.stage, 'N/A')));
    END IF;
    IF OLD.substage IS DISTINCT FROM NEW.substage THEN
      changes := changes || jsonb_build_array(jsonb_build_object('field', 'Substage', 'old', COALESCE(OLD.substage, 'N/A'), 'new', COALESCE(NEW.substage, 'N/A')));
    END IF;
    IF OLD.tracking_status IS DISTINCT FROM NEW.tracking_status THEN
      changes := changes || jsonb_build_array(jsonb_build_object('field', 'Tracking Status', 'old', COALESCE(OLD.tracking_status, 'N/A'), 'new', COALESCE(NEW.tracking_status, 'N/A')));
    END IF;
    IF OLD.notes IS DISTINCT FROM NEW.notes THEN
      changes := changes || jsonb_build_array(jsonb_build_object('field', 'Notes', 'old', COALESCE(LEFT(OLD.notes, 200), '(empty)'), 'new', COALESCE(LEFT(NEW.notes, 200), '(empty)')));
    END IF;
    IF OLD.pass_reason IS DISTINCT FROM NEW.pass_reason THEN
      changes := changes || jsonb_build_array(jsonb_build_object('field', 'Pass Reason', 'old', COALESCE(OLD.pass_reason, 'N/A'), 'new', COALESCE(NEW.pass_reason, 'N/A')));
    END IF;
    IF OLD.quote_amount IS DISTINCT FROM NEW.quote_amount THEN
      changes := changes || jsonb_build_array(jsonb_build_object('field', 'Quote Amount', 'old', COALESCE(OLD.quote_amount::text, 'N/A'), 'new', COALESCE(NEW.quote_amount::text, 'N/A')));
    END IF;
    IF OLD.quote_rate IS DISTINCT FROM NEW.quote_rate THEN
      changes := changes || jsonb_build_array(jsonb_build_object('field', 'Quote Rate', 'old', COALESCE(OLD.quote_rate::text, 'N/A'), 'new', COALESCE(NEW.quote_rate::text, 'N/A')));
    END IF;
    IF OLD.quote_term IS DISTINCT FROM NEW.quote_term THEN
      changes := changes || jsonb_build_array(jsonb_build_object('field', 'Quote Term', 'old', COALESCE(OLD.quote_term, 'N/A'), 'new', COALESCE(NEW.quote_term, 'N/A')));
    END IF;
    IF OLD.score IS DISTINCT FROM NEW.score THEN
      changes := changes || jsonb_build_array(jsonb_build_object('field', 'Score', 'old', COALESCE(OLD.score::text, 'N/A'), 'new', COALESCE(NEW.score::text, 'N/A')));
    END IF;

    IF jsonb_array_length(changes) > 0 THEN
      PERFORM net.http_post(
        url := 'https://tgkksvazruzbghssnxde.supabase.co/functions/v1/send-notification-email',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := jsonb_build_object(
          'type', 'lender_updated',
          'user_id', deal_record.user_id::text,
          'deal_id', NEW.deal_id::text,
          'deal_name', deal_record.company,
          'lender_name', NEW.name,
          'changed_by', COALESCE(actor_name, 'System'),
          'changes', changes
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Enrich deal notification trigger with change details and actor
CREATE OR REPLACE FUNCTION public.notify_email_on_deal_event()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  notification_type text;
  deal_name text;
  old_stage text;
  new_stage text;
  changes jsonb := '[]'::jsonb;
  actor_name text;
BEGIN
  SELECT display_name INTO actor_name
  FROM public.profiles
  WHERE user_id = auth.uid();

  IF TG_OP = 'INSERT' THEN
    notification_type := 'deal_created';
    deal_name := NEW.company;
    changes := jsonb_build_array(
      jsonb_build_object('field', 'Deal', 'new', COALESCE(NEW.company, 'Unnamed')),
      jsonb_build_object('field', 'Stage', 'new', COALESCE(NEW.stage, 'N/A'))
    );
  ELSIF TG_OP = 'UPDATE' THEN
    deal_name := NEW.company;
    IF OLD.stage IS DISTINCT FROM NEW.stage THEN
      notification_type := 'stage_changed';
      old_stage := OLD.stage;
      new_stage := NEW.stage;
      changes := changes || jsonb_build_array(jsonb_build_object('field', 'Stage', 'old', COALESCE(OLD.stage, 'N/A'), 'new', COALESCE(NEW.stage, 'N/A')));
    ELSE
      notification_type := 'deal_updated';
    END IF;
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      changes := changes || jsonb_build_array(jsonb_build_object('field', 'Status', 'old', COALESCE(OLD.status, 'N/A'), 'new', COALESCE(NEW.status, 'N/A')));
    END IF;
    IF OLD.value IS DISTINCT FROM NEW.value THEN
      changes := changes || jsonb_build_array(jsonb_build_object('field', 'Deal Value', 'old', COALESCE(OLD.value::text, 'N/A'), 'new', COALESCE(NEW.value::text, 'N/A')));
    END IF;
  END IF;

  PERFORM net.http_post(
    url := 'https://tgkksvazruzbghssnxde.supabase.co/functions/v1/send-notification-email',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'type', notification_type,
      'user_id', COALESCE(NEW.user_id, OLD.user_id)::text,
      'deal_id', NEW.id::text,
      'deal_name', deal_name,
      'old_value', old_stage,
      'new_value', new_stage,
      'changed_by', COALESCE(actor_name, 'System'),
      'changes', changes
    )
  );

  RETURN COALESCE(NEW, OLD);
END;
$function$;