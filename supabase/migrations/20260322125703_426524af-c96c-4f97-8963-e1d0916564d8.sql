
-- Update ensure_user_workspace to use proper deal stages
CREATE OR REPLACE FUNCTION public.ensure_user_workspace(
  _company_name text DEFAULT NULL::text,
  _company_url text DEFAULT NULL::text,
  _company_size text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _user_id uuid := auth.uid();
  _existing_company_id uuid;
  _resolved_company_name text;
  _profile_company_name text;
  _profile_email text;
  _new_company_id uuid;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT cm.company_id
  INTO _existing_company_id
  FROM public.company_members cm
  WHERE cm.user_id = _user_id
  ORDER BY cm.created_at ASC
  LIMIT 1;

  IF _existing_company_id IS NOT NULL THEN
    RETURN _existing_company_id;
  END IF;

  SELECT p.company_name, p.email
  INTO _profile_company_name, _profile_email
  FROM public.profiles p
  WHERE p.user_id = _user_id;

  _resolved_company_name := NULLIF(trim(COALESCE(_company_name, _profile_company_name)), '');

  IF _resolved_company_name IS NULL THEN
    _resolved_company_name := COALESCE(
      NULLIF(initcap(split_part(COALESCE(_profile_email, ''), '@', 1)), ''),
      'My Workspace'
    ) || ' Workspace';
  END IF;

  INSERT INTO public.companies (
    name,
    website_url,
    employee_size
  )
  VALUES (
    _resolved_company_name,
    NULLIF(trim(_company_url), ''),
    NULLIF(trim(_company_size), '')
  )
  RETURNING id INTO _new_company_id;

  INSERT INTO public.company_members (
    company_id,
    user_id,
    role
  )
  VALUES (
    _new_company_id,
    _user_id,
    'owner'
  );

  INSERT INTO public.deal_pipelines (
    company_id,
    name,
    is_default,
    position,
    stages
  )
  SELECT
    _new_company_id,
    'Active Pipeline',
    true,
    0,
    jsonb_build_array(
      jsonb_build_object('id', 'qualification', 'label', 'Qualification', 'color', 'bg-blue-500'),
      jsonb_build_object('id', 'due-diligence', 'label', 'Due Diligence', 'color', 'bg-indigo-500'),
      jsonb_build_object('id', 'term-sheet', 'label', 'Term Sheet', 'color', 'bg-violet-500'),
      jsonb_build_object('id', 'closing', 'label', 'Closing', 'color', 'bg-amber-500'),
      jsonb_build_object('id', 'closed-won', 'label', 'Won', 'color', 'bg-green-500'),
      jsonb_build_object('id', 'closed-lost', 'label', 'Lost', 'color', 'bg-red-500')
    )
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.deal_pipelines dp
    WHERE dp.company_id = _new_company_id
  );

  RETURN _new_company_id;
END;
$function$;

-- Update seed_new_company_defaults to use the same stages
CREATE OR REPLACE FUNCTION public.seed_new_company_defaults(_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  has_settings boolean;
  has_pipeline boolean;
  has_milestones boolean;
  has_lender_config boolean;
  first_user_id uuid;
BEGIN
  SELECT user_id INTO first_user_id
  FROM public.company_members
  WHERE company_id = _company_id
  LIMIT 1;

  SELECT EXISTS (
    SELECT 1 FROM public.company_settings WHERE company_id = _company_id
  ) INTO has_settings;

  IF NOT has_settings THEN
    INSERT INTO public.company_settings (
      company_id,
      deal_stages,
      deal_types,
      data_room_default_checklists,
      fpa_dashboard_config
    ) VALUES (
      _company_id,
      '[
        {"id":"qualification","label":"Qualification","color":"bg-blue-500"},
        {"id":"due-diligence","label":"Due Diligence","color":"bg-indigo-500"},
        {"id":"term-sheet","label":"Term Sheet","color":"bg-violet-500"},
        {"id":"closing","label":"Closing","color":"bg-amber-500"},
        {"id":"closed-won","label":"Won","color":"bg-green-500"},
        {"id":"closed-lost","label":"Lost","color":"bg-red-500"}
      ]'::jsonb,
      '["Debt Financing", "Growth Capital", "Working Capital"]'::jsonb,
      '[
        {"id":"corporate-docs","title":"Corporate Documents","items":["Certificate of incorporation","Cap table","Board consents"]},
        {"id":"financials","title":"Financials","items":["Historical financials","Current budget","Revenue by customer"]}
      ]'::jsonb,
      '{
        "widgets": [
          {"id":"total-hours","type":"metric","title":"Total Hours"},
          {"id":"total-fees","type":"metric","title":"Total Fees"},
          {"id":"revenue-per-hour","type":"metric","title":"Revenue per Hour"},
          {"id":"avg-hours-per-deal","type":"metric","title":"Avg Hours per Deal"}
        ],
        "charts": [
          {"id":"deals-by-stage","type":"bar","title":"Deals by Stage"},
          {"id":"monthly-deal-value","type":"line","title":"Monthly Deal Value"}
        ]
      }'::jsonb
    );
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.deal_pipelines WHERE company_id = _company_id
  ) INTO has_pipeline;

  IF NOT has_pipeline THEN
    INSERT INTO public.deal_pipelines (
      company_id,
      name,
      is_default,
      position,
      stages
    ) VALUES (
      _company_id,
      'Active Pipeline',
      true,
      0,
      '[
        {"id":"qualification","label":"Qualification","color":"bg-blue-500"},
        {"id":"due-diligence","label":"Due Diligence","color":"bg-indigo-500"},
        {"id":"term-sheet","label":"Term Sheet","color":"bg-violet-500"},
        {"id":"closing","label":"Closing","color":"bg-amber-500"},
        {"id":"closed-won","label":"Won","color":"bg-green-500"},
        {"id":"closed-lost","label":"Lost","color":"bg-red-500"}
      ]'::jsonb
    );
  END IF;
END;
$function$;
