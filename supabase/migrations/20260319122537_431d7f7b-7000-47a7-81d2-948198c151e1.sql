
-- Move seeding trigger from companies to company_members
-- This ensures the user_id is available for lender_stage_configs
DROP TRIGGER IF EXISTS trg_seed_new_company ON public.companies;

-- New trigger function that fires on first member insert
CREATE OR REPLACE FUNCTION public.trigger_seed_new_company_on_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  END IF;
  
  RETURN NEW;
END;
$$;

-- Update the seed function to accept optional user_id for lender config
CREATE OR REPLACE FUNCTION public.seed_new_company_defaults(_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  has_settings boolean;
  has_pipeline boolean;
  has_milestones boolean;
  has_lender_config boolean;
  first_user_id uuid;
BEGIN
  -- Get the first member's user_id for lender_stage_configs
  SELECT user_id INTO first_user_id
  FROM public.company_members
  WHERE company_id = _company_id
  LIMIT 1;

  -- ─── 1. Company Settings (deal stages, data room checklists) ───────────
  SELECT EXISTS (
    SELECT 1 FROM public.company_settings WHERE company_id = _company_id
  ) INTO has_settings;

  IF NOT has_settings THEN
    INSERT INTO public.company_settings (
      company_id,
      deal_stages,
      data_room_default_checklists
    ) VALUES (
      _company_id,
      '[
        {"id":"new-lead","label":"New Lead","color":"bg-slate-500"},
        {"id":"initial-screening","label":"Initial Screening","color":"bg-blue-500"},
        {"id":"due-diligence","label":"Due Diligence","color":"bg-indigo-500"},
        {"id":"underwriting","label":"Underwriting","color":"bg-violet-500"},
        {"id":"term-sheet","label":"Term Sheet","color":"bg-purple-500"},
        {"id":"closing","label":"Closing","color":"bg-amber-500"},
        {"id":"funded","label":"Funded","color":"bg-green-500"},
        {"id":"closed-lost","label":"Closed Lost","color":"bg-red-500"}
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
                  {"id":"dr-2","label":"Historical Financial Statements (3 years)","order":1,"required":true},
                  {"id":"dr-3","label":"Financial Projections","order":2,"required":true},
                  {"id":"dr-4","label":"Tax Returns (2 years)","order":3,"required":false},
                  {"id":"dr-5","label":"Cap Table","order":4,"required":false},
                  {"id":"dr-6","label":"Articles of Incorporation","order":5,"required":false},
                  {"id":"dr-7","label":"Management Bios","order":6,"required":false},
                  {"id":"dr-8","label":"Customer Contracts (Top 5)","order":7,"required":false},
                  {"id":"dr-9","label":"Accounts Receivable Aging","order":8,"required":false},
                  {"id":"dr-10","label":"Accounts Payable Aging","order":9,"required":false}
                ]
              }
            ]
          },
          {
            "id": "default-growth-capital",
            "dealTypeMatchString": "Growth Capital",
            "rounds": [
              {
                "id": "round-gc-1",
                "title": "Growth Capital Documents",
                "order": 0,
                "items": [
                  {"id":"gc-1","label":"Use of Proceeds Summary","order":0,"required":true},
                  {"id":"gc-2","label":"Revenue Breakdown by Product/Segment","order":1,"required":true},
                  {"id":"gc-3","label":"Unit Economics Analysis","order":2,"required":false},
                  {"id":"gc-4","label":"Growth Plan / Expansion Strategy","order":3,"required":false},
                  {"id":"gc-5","label":"Board Meeting Minutes (Last 12 Months)","order":4,"required":false}
                ]
              }
            ]
          }
        ]
      }'::jsonb
    );
  END IF;

  -- ─── 2. Default Pipeline ──────────────────────────────────────────────
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
        {"id":"new-lead","label":"New Lead","color":"bg-slate-500"},
        {"id":"initial-screening","label":"Initial Screening","color":"bg-blue-500"},
        {"id":"due-diligence","label":"Due Diligence","color":"bg-indigo-500"},
        {"id":"underwriting","label":"Underwriting","color":"bg-violet-500"},
        {"id":"term-sheet","label":"Term Sheet","color":"bg-purple-500"},
        {"id":"closing","label":"Closing","color":"bg-amber-500"},
        {"id":"funded","label":"Funded","color":"bg-green-500"},
        {"id":"closed-lost","label":"Closed Lost","color":"bg-red-500"}
      ]'::jsonb
    );
  END IF;

  -- ─── 3. Default Deal Milestones ────────────────────────────────────────
  SELECT EXISTS (
    SELECT 1 FROM public.default_milestones WHERE company_id = _company_id
  ) INTO has_milestones;

  IF NOT has_milestones THEN
    INSERT INTO public.default_milestones (company_id, title, position, timing_type, days_from_creation) VALUES
      (_company_id, 'Engagement Letter Signed',    0, 'from_creation', 7),
      (_company_id, 'Financial Model Received',    1, 'from_creation', 14),
      (_company_id, 'Site Visit Completed',        2, 'from_creation', 30),
      (_company_id, 'Credit Memo Drafted',         3, 'from_creation', 45),
      (_company_id, 'Final Approval',              4, 'from_creation', 60);
  END IF;

  -- ─── 4. Lender Stage Config ───────────────────────────────────────────
  IF first_user_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.lender_stage_configs WHERE company_id = _company_id
    ) INTO has_lender_config;

    IF NOT has_lender_config THEN
      INSERT INTO public.lender_stage_configs (
        company_id, user_id, stages, substages, pass_reasons, tracking_statuses
      ) VALUES (
        _company_id,
        first_user_id,
        '[
          {"id":"outreach-sent","label":"Outreach Sent","group":"active"},
          {"id":"reviewing-materials","label":"Reviewing Materials","group":"active"},
          {"id":"initial-call-scheduled","label":"Initial Call Scheduled","group":"active"},
          {"id":"awaiting-feedback","label":"Awaiting Feedback","group":"active"},
          {"id":"term-sheet-requested","label":"Term Sheet Requested","group":"active"},
          {"id":"term-sheet-received","label":"Term Sheet Received","group":"active"},
          {"id":"declined","label":"Declined","group":"passed"}
        ]'::jsonb,
        '[
          {"id":"awaiting-response","label":"Awaiting Response"},
          {"id":"in-review","label":"In Review"},
          {"id":"follow-up-needed","label":"Follow-up Needed"},
          {"id":"scheduled","label":"Scheduled"}
        ]'::jsonb,
        '[
          {"id":"deal-size","label":"Deal Size Mismatch"},
          {"id":"industry-fit","label":"Industry Not a Fit"},
          {"id":"risk-profile","label":"Risk Profile Concerns"},
          {"id":"timing","label":"Timing / Capacity"},
          {"id":"terms-not-competitive","label":"Terms Not Competitive"},
          {"id":"no-reason","label":"No Reason Given"},
          {"id":"other","label":"Other"}
        ]'::jsonb,
        '[
          {"id":"active","label":"Active","color":"bg-green-500"},
          {"id":"on-hold","label":"On Hold","color":"bg-yellow-500"},
          {"id":"passed","label":"Passed","color":"bg-red-500"},
          {"id":"closed-won","label":"Closed Won","color":"bg-emerald-500"},
          {"id":"closed-lost","label":"Closed Lost","color":"bg-muted"}
        ]'::jsonb
      );
    END IF;
  END IF;

END;
$$;

-- Create trigger on company_members
DROP TRIGGER IF EXISTS trg_seed_new_company_on_member ON public.company_members;
CREATE TRIGGER trg_seed_new_company_on_member
  AFTER INSERT ON public.company_members
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_seed_new_company_on_member();
