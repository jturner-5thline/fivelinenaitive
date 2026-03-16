
-- Security-definer function so any company member can save dashboard config
CREATE OR REPLACE FUNCTION public.save_fpa_dashboard_config(
  _company_id uuid,
  _config_key text,
  _config_value jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  existing_config jsonb;
BEGIN
  -- Verify caller is a member of this company
  IF NOT public.is_company_member(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'Access denied: not a company member';
  END IF;

  -- Read current config
  SELECT fpa_dashboard_config INTO existing_config
  FROM public.company_settings
  WHERE company_id = _company_id;

  IF NOT FOUND THEN
    -- Insert new row
    INSERT INTO public.company_settings (company_id, fpa_dashboard_config)
    VALUES (_company_id, jsonb_build_object(_config_key, _config_value));
  ELSE
    -- Merge into existing config
    existing_config := COALESCE(existing_config, '{}'::jsonb);
    UPDATE public.company_settings
    SET fpa_dashboard_config = existing_config || jsonb_build_object(_config_key, _config_value),
        updated_at = now()
    WHERE company_id = _company_id;
  END IF;
END;
$$;
