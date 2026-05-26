
CREATE OR REPLACE FUNCTION public.create_task_inapp_notification(
  _task_id uuid,
  _recipient_user_id uuid,
  _trigger_key text,
  _title text,
  _body text,
  _context jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.can_access_task(_task_id) THEN
    RAISE EXCEPTION 'access_denied';
  END IF;

  -- Skip self-notifications quietly
  IF _recipient_user_id = auth.uid() THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.notification_instances (
    trigger_key,
    recipient_user_id,
    channel_type,
    status,
    title,
    body,
    rendered_data,
    context,
    actor_user_id,
    sent_at
  ) VALUES (
    _trigger_key,
    _recipient_user_id,
    'in_app'::notification_channel_type,
    'sent'::notification_instance_status,
    _title,
    _body,
    '{}'::jsonb,
    COALESCE(_context, '{}'::jsonb) || jsonb_build_object('task_id', _task_id),
    auth.uid(),
    now()
  )
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_task_inapp_notification(uuid, uuid, text, text, text, jsonb) TO authenticated;
