
-- Fix the check_agent_triggers function to correctly reference deals table columns
CREATE OR REPLACE FUNCTION public.check_agent_triggers()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  trigger_record RECORD;
  event_type TEXT;
  deal_id_value UUID;
  user_id_value UUID;
BEGIN
  -- Determine event type and extract deal_id based on table and operation
  IF TG_TABLE_NAME = 'deals' THEN
    deal_id_value := NEW.id;
    user_id_value := NEW.user_id;
    
    IF TG_OP = 'INSERT' THEN
      event_type := 'deal_created';
    ELSIF TG_OP = 'UPDATE' THEN
      IF OLD.stage IS DISTINCT FROM NEW.stage THEN
        event_type := 'deal_stage_change';
      ELSIF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('won', 'lost', 'closed') THEN
        event_type := 'deal_closed';
      ELSE
        RETURN COALESCE(NEW, OLD);
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'deal_lenders' THEN
    deal_id_value := NEW.deal_id;
    -- Get user_id from the parent deal
    SELECT user_id INTO user_id_value FROM deals WHERE id = NEW.deal_id LIMIT 1;
    
    IF TG_OP = 'INSERT' THEN
      event_type := 'lender_added';
    ELSIF TG_OP = 'UPDATE' AND OLD.stage IS DISTINCT FROM NEW.stage THEN
      event_type := 'lender_stage_change';
    ELSE
      RETURN COALESCE(NEW, OLD);
    END IF;
  ELSIF TG_TABLE_NAME = 'deal_milestones' THEN
    deal_id_value := NEW.deal_id;
    -- Get user_id from the parent deal
    SELECT user_id INTO user_id_value FROM deals WHERE id = NEW.deal_id LIMIT 1;
    
    IF TG_OP = 'UPDATE' AND OLD.completed = false AND NEW.completed = true THEN
      event_type := 'milestone_completed';
    ELSE
      RETURN COALESCE(NEW, OLD);
    END IF;
  END IF;

  -- Find matching active triggers for this user
  FOR trigger_record IN
    SELECT t.*, a.system_prompt, a.personality, a.temperature,
           a.can_access_deals, a.can_access_lenders, a.can_access_activities, a.can_access_milestones
    FROM public.agent_triggers t
    JOIN public.agents a ON a.id = t.agent_id
    WHERE t.is_active = true
      AND t.trigger_type = event_type
      AND t.user_id = user_id_value
  LOOP
    -- Create a pending run record
    INSERT INTO public.agent_runs (
      agent_id,
      trigger_id,
      user_id,
      deal_id,
      status,
      trigger_event,
      input_context
    ) VALUES (
      trigger_record.agent_id,
      trigger_record.id,
      trigger_record.user_id,
      deal_id_value,
      'pending',
      event_type,
      jsonb_build_object(
        'trigger_type', event_type,
        'table', TG_TABLE_NAME,
        'operation', TG_OP,
        'new_data', to_jsonb(NEW),
        'old_data', CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END
      )
    );

    -- Update trigger stats
    UPDATE public.agent_triggers
    SET last_triggered_at = now(), trigger_count = trigger_count + 1
    WHERE id = trigger_record.id;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$function$;
