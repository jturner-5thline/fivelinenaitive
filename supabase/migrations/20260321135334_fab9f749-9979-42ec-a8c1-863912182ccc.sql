
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

  -- ─── 1. Company Settings (with default analytics widgets) ───
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
        {"id":"prospect","label":"Prospect","color":"bg-slate-500"},
        {"id":"qualification","label":"Qualification","color":"bg-blue-500"},
        {"id":"proposal","label":"Proposal","color":"bg-violet-500"},
        {"id":"negotiation","label":"Negotiation","color":"bg-amber-500"},
        {"id":"closed-won","label":"Closed Won","color":"bg-green-500"},
        {"id":"closed-lost","label":"Closed Lost","color":"bg-red-500"}
      ]'::jsonb,
      '[
        {"id":"debt-financing","label":"Debt Financing"},
        {"id":"equity-raise","label":"Equity Raise"},
        {"id":"refinancing","label":"Refinancing"}
      ]'::jsonb,
      '{
        "version": 2,
        "configs": [
          {
            "id": "default-generic",
            "dealTypeMatchString": "",
            "rounds": [
              {
                "id": "round-generic-1",
                "title": "Initial Documents",
                "order": 0,
                "items": [
                  {"id":"dr-1","label":"Company Overview / Pitch Deck","order":0,"required":true},
                  {"id":"dr-2","label":"Financial Statements (2 years)","order":1,"required":true},
                  {"id":"dr-3","label":"Financial Projections","order":2,"required":true},
                  {"id":"dr-4","label":"Cap Table","order":3,"required":false},
                  {"id":"dr-5","label":"Management Team Bios","order":4,"required":false}
                ]
              }
            ]
          }
        ]
      }'::jsonb,
      '{
        "metrics_widgets": [
          {"id":"stat-1","title":"Active Pipeline","type":"stat","dataSource":"active-pipeline","size":"small","color":"hsl(var(--primary))","createdAt":"2026-01-01T00:00:00.000Z"},
          {"id":"stat-2","title":"Closed Won (All Time)","type":"stat","dataSource":"closed-won","size":"small","color":"hsl(var(--success))","createdAt":"2026-01-01T00:00:00.000Z"},
          {"id":"stat-3","title":"Total Fees Earned","type":"stat","dataSource":"total-fees","size":"small","color":"hsl(var(--chart-2))","createdAt":"2026-01-01T00:00:00.000Z"},
          {"id":"stat-4","title":"Avg Deal Size","type":"stat","dataSource":"avg-deal-size","size":"small","color":"hsl(var(--chart-4))","createdAt":"2026-01-01T00:00:00.000Z"},
          {"id":"chart-1","title":"Pipeline by Stage","type":"chart","chartType":"bar","dataSource":"pipeline-by-stage","size":"medium","color":"hsl(var(--primary))","createdAt":"2026-01-01T00:00:00.000Z"},
          {"id":"chart-2","title":"Deal Activity: Rolling 12 Months","type":"chart","chartType":"bar","dataSource":"deal-activity-12m","size":"medium","color":"hsl(var(--chart-3))","createdAt":"2026-01-01T00:00:00.000Z"}
        ]
      }'::jsonb
    );
  END IF;

  -- ─── 2. Default Pipeline ───
  SELECT EXISTS (
    SELECT 1 FROM public.deal_pipelines WHERE company_id = _company_id
  ) INTO has_pipeline;

  IF NOT has_pipeline THEN
    INSERT INTO public.deal_pipelines (company_id, name, is_default, position, stages)
    VALUES (
      _company_id,
      'Deal Pipeline',
      true,
      0,
      '[
        {"id":"prospect","label":"Prospect","color":"bg-slate-500"},
        {"id":"qualification","label":"Qualification","color":"bg-blue-500"},
        {"id":"proposal","label":"Proposal","color":"bg-violet-500"},
        {"id":"negotiation","label":"Negotiation","color":"bg-amber-500"},
        {"id":"closed-won","label":"Closed Won","color":"bg-green-500"},
        {"id":"closed-lost","label":"Closed Lost","color":"bg-red-500"}
      ]'::jsonb
    );
  END IF;

  -- ─── 3. Default Deal Milestones ───
  SELECT EXISTS (
    SELECT 1 FROM public.default_milestones WHERE company_id = _company_id
  ) INTO has_milestones;

  IF NOT has_milestones THEN
    INSERT INTO public.default_milestones (company_id, title, position, timing_type, days_from_creation) VALUES
      (_company_id, 'Kickoff Call Completed',       0, 'from_creation', 3),
      (_company_id, 'Documents Received',           1, 'from_creation', 14),
      (_company_id, 'Proposal Sent',                2, 'from_creation', 21),
      (_company_id, 'Deal Closed',                  3, 'from_creation', 60);
  END IF;

  -- ─── 4. Lender Stage Config ───
  IF first_user_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.lender_stage_configs WHERE company_id = _company_id
    ) INTO has_lender_config;

    IF NOT has_lender_config THEN
      INSERT INTO public.lender_stage_configs (company_id, user_id, stages, tracking_statuses, substages, pass_reasons)
      VALUES (
        _company_id,
        first_user_id,
        '[
          {"id":"outreach","label":"Outreach"},
          {"id":"in-review","label":"In Review"},
          {"id":"terms-received","label":"Terms Received"},
          {"id":"selected","label":"Selected"},
          {"id":"passed","label":"Passed"}
        ]'::jsonb,
        '[
          {"id":"active","label":"Active","color":"bg-green-500"},
          {"id":"on-hold","label":"On Hold","color":"bg-yellow-500"},
          {"id":"passed","label":"Passed","color":"bg-muted"}
        ]'::jsonb,
        '[]'::jsonb,
        '[
          {"id":"deal-size","label":"Deal Size Mismatch"},
          {"id":"industry-fit","label":"Industry Not a Fit"},
          {"id":"timing","label":"Timing / Capacity"},
          {"id":"terms","label":"Terms Not Competitive"},
          {"id":"other","label":"Other"}
        ]'::jsonb
      );
    END IF;
  END IF;
END;
$function$;
