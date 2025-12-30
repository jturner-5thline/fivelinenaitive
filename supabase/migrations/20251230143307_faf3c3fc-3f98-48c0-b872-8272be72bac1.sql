-- Create function to send notification via edge function
CREATE OR REPLACE FUNCTION public.notify_email_on_deal_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  notification_type text;
  deal_name text;
  old_stage text;
  new_stage text;
BEGIN
  -- Determine notification type based on trigger operation
  IF TG_OP = 'INSERT' THEN
    notification_type := 'deal_created';
    deal_name := NEW.company;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Check if stage changed
    IF OLD.stage IS DISTINCT FROM NEW.stage THEN
      notification_type := 'stage_changed';
      old_stage := OLD.stage;
      new_stage := NEW.stage;
    ELSE
      notification_type := 'deal_updated';
    END IF;
    deal_name := NEW.company;
  END IF;

  -- Call edge function asynchronously using pg_net
  PERFORM net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-notification-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object(
      'type', notification_type,
      'user_id', COALESCE(NEW.user_id, OLD.user_id)::text,
      'deal_id', NEW.id::text,
      'deal_name', deal_name,
      'old_value', old_stage,
      'new_value', new_stage
    )
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create function to send notification on lender events
CREATE OR REPLACE FUNCTION public.notify_email_on_lender_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  notification_type text;
  deal_record record;
BEGIN
  -- Get deal info
  SELECT d.company, d.user_id INTO deal_record
  FROM deals d
  WHERE d.id = NEW.deal_id;

  IF TG_OP = 'INSERT' THEN
    notification_type := 'lender_added';
  ELSIF TG_OP = 'UPDATE' THEN
    notification_type := 'lender_updated';
  END IF;

  PERFORM net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-notification-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object(
      'type', notification_type,
      'user_id', deal_record.user_id::text,
      'deal_id', NEW.deal_id::text,
      'deal_name', deal_record.company,
      'lender_name', NEW.name
    )
  );

  RETURN NEW;
END;
$$;

-- Create function to send notification on milestone events
CREATE OR REPLACE FUNCTION public.notify_email_on_milestone_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  notification_type text;
  deal_record record;
BEGIN
  -- Get deal info
  SELECT d.company, d.user_id INTO deal_record
  FROM deals d
  WHERE d.id = NEW.deal_id;

  IF TG_OP = 'INSERT' THEN
    notification_type := 'milestone_added';
  ELSIF TG_OP = 'UPDATE' THEN
    -- Check if just completed
    IF OLD.completed = false AND NEW.completed = true THEN
      notification_type := 'milestone_completed';
    ELSE
      RETURN NEW; -- Don't notify for other updates
    END IF;
  END IF;

  PERFORM net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-notification-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object(
      'type', notification_type,
      'user_id', deal_record.user_id::text,
      'deal_id', NEW.deal_id::text,
      'deal_name', deal_record.company,
      'milestone_title', NEW.title
    )
  );

  RETURN NEW;
END;
$$;

-- Create triggers
CREATE TRIGGER on_deal_change_notify_email
  AFTER INSERT OR UPDATE ON public.deals
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_email_on_deal_event();

CREATE TRIGGER on_lender_change_notify_email
  AFTER INSERT OR UPDATE ON public.deal_lenders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_email_on_lender_event();

CREATE TRIGGER on_milestone_change_notify_email
  AFTER INSERT OR UPDATE ON public.deal_milestones
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_email_on_milestone_event();