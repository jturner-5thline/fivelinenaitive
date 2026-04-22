ALTER FUNCTION public.normalize_stage(text) SET search_path = public;

-- Store service-role key in vault for trigger use
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'followup_engine_service_key') THEN
    PERFORM vault.create_secret(
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRna2tzdmF6cnV6Ymdoc3NueGRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU2NDk4MzksImV4cCI6MjA4MTIyNTgzOX0.rKbLgDEfCdQO4hv2_69-Q4r3RiH7_6hsTuwcn6JJpL8',
      'followup_engine_service_key'
    );
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.fn_deal_followup_dispatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  fn_url text := 'https://tgkksvazruzbghssnxde.supabase.co/functions/v1/notification-engine';
  service_key text;
  trigger_key_v text;
  new_stage_norm text;
  recent_audit_count int;
  payload jsonb;
BEGIN
  SELECT decrypted_secret INTO service_key
  FROM vault.decrypted_secrets
  WHERE name = 'followup_engine_service_key'
  LIMIT 1;

  IF service_key IS NULL THEN
    RAISE WARNING 'fn_deal_followup_dispatch: missing vault secret followup_engine_service_key';
    RETURN NEW;
  END IF;

  -- INSERT: schedule a +3 day reminder
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.scheduled_followup_actions (trigger_key, deal_id, scheduled_for, context)
    VALUES (
      'deal.followup.created_3d',
      NEW.id,
      NEW.created_at + interval '3 days',
      jsonb_build_object('deal_name', NEW.company, 'created_at', NEW.created_at)
    );
    RETURN NEW;
  END IF;

  -- UPDATE: only react to stage changes mapping to our 2 keys
  IF TG_OP = 'UPDATE' AND NEW.stage IS DISTINCT FROM OLD.stage THEN
    new_stage_norm := public.normalize_stage(NEW.stage);

    IF new_stage_norm = 'proposal_issued' THEN
      trigger_key_v := 'deal.followup.proposal_issued';
    ELSIF new_stage_norm = 'agreement_pending' THEN
      trigger_key_v := 'deal.followup.agreement_pending';
    ELSE
      RETURN NEW;
    END IF;

    -- 24h dedup
    SELECT count(*) INTO recent_audit_count
    FROM public.notification_audit
    WHERE deal_id = NEW.id
      AND notification_audit.trigger_key = trigger_key_v
      AND created_at > now() - interval '24 hours';

    IF recent_audit_count > 0 THEN
      RAISE NOTICE 'fn_deal_followup_dispatch: dedup hit deal=% trigger=%', NEW.id, trigger_key_v;
      RETURN NEW;
    END IF;

    payload := jsonb_build_object(
      'triggerKey', trigger_key_v,
      'context', jsonb_build_object(
        'deal_id', NEW.id,
        'deal_name', NEW.company,
        'stage', NEW.stage,
        'previous_stage', OLD.stage,
        'company_id', NEW.company_id
      )
    );

    PERFORM net.http_post(
      url := fn_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := payload
    );
  END IF;

  RETURN NEW;
END;
$$;