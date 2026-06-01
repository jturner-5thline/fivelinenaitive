
CREATE OR REPLACE FUNCTION public.clone_demo_tenant(
  p_source_company_id uuid,
  p_target_company_id uuid,
  p_owner_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_counts jsonb := '{}'::jsonb;
  v_n int;
  v_pipeline_map jsonb := '{}'::jsonb;
  r record;
  v_new_id uuid;
  v_default_pipeline_id uuid;
BEGIN
  IF p_source_company_id = p_target_company_id THEN
    RAISE EXCEPTION 'source and target must differ';
  END IF;

  -- Idempotency: wipe target rows in tables we touch.
  DELETE FROM deal_stage_history WHERE company_id = p_target_company_id;
  DELETE FROM deals WHERE company_id = p_target_company_id;
  DELETE FROM deal_pipelines WHERE company_id = p_target_company_id;
  DELETE FROM lender_stage_configs WHERE company_id = p_target_company_id;
  DELETE FROM master_lenders WHERE company_id = p_target_company_id;
  DELETE FROM agents WHERE company_id = p_target_company_id;
  DELETE FROM workflows WHERE company_id = p_target_company_id;
  DELETE FROM dashboard_layouts WHERE company_id = p_target_company_id;
  DELETE FROM task_templates WHERE company_id = p_target_company_id;
  DELETE FROM ai_configuration WHERE company_id = p_target_company_id;
  DELETE FROM company_settings WHERE company_id = p_target_company_id;
  DELETE FROM company_features WHERE company_id = p_target_company_id;
  DELETE FROM company_feature_overrides WHERE company_id = p_target_company_id;

  ---------------------------------------------------------------------------
  -- Pipelines (skip 5th-Line-proprietary naitive/FinServ pipelines)
  ---------------------------------------------------------------------------
  FOR r IN
    SELECT * FROM deal_pipelines
    WHERE company_id = p_source_company_id
      AND name NOT IN ('naitive Pipeline','FinServ Pipeline')
  LOOP
    v_new_id := gen_random_uuid();
    INSERT INTO deal_pipelines(id, company_id, name, stages, is_default, position, created_at, updated_at)
    VALUES (v_new_id, p_target_company_id, r.name, r.stages, r.is_default, r.position, now(), now());
    v_pipeline_map := v_pipeline_map || jsonb_build_object(r.id::text, v_new_id::text);
    IF r.is_default THEN v_default_pipeline_id := v_new_id; END IF;
  END LOOP;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('deal_pipelines',
    (SELECT count(*) FROM deal_pipelines WHERE company_id = p_target_company_id));

  ---------------------------------------------------------------------------
  -- Lender stage configs (single row per company)
  ---------------------------------------------------------------------------
  INSERT INTO lender_stage_configs(id, company_id, user_id, stages, substages, pass_reasons, tracking_statuses, created_at, updated_at)
  SELECT gen_random_uuid(), p_target_company_id, p_owner_user_id, stages, substages, pass_reasons, tracking_statuses, now(), now()
  FROM lender_stage_configs WHERE company_id = p_source_company_id LIMIT 1;
  v_counts := v_counts || jsonb_build_object('lender_stage_configs',
    (SELECT count(*) FROM lender_stage_configs WHERE company_id = p_target_company_id));

  ---------------------------------------------------------------------------
  -- Master lenders: sample 300 active, anonymize PII
  ---------------------------------------------------------------------------
  INSERT INTO master_lenders(
    id, user_id, company_id, email, name, lender_type, loan_types, sub_debt, cash_burn,
    sponsorship, min_revenue, ebitda_min, min_deal, max_deal, industries, industries_to_avoid,
    b2b_b2c, refinancing, company_requirements, deal_structure_notes, geo,
    contact_name, contact_title, relationship_owners, lender_one_pager_url,
    referral_lender, referral_fee_offered, referral_agreement, nda, onboarded_to_flex,
    upfront_checklist, post_term_sheet_checklist, gift_address, tier, active,
    contact_phone, tags, website, linkedin_url, address, phone, funding_source_notes, about_notes,
    created_at, updated_at
  )
  SELECT
    gen_random_uuid(), p_owner_user_id, p_target_company_id,
    'lender-' || substr(md5(id::text),1,8) || '@example.com',
    name, lender_type, loan_types, sub_debt, cash_burn,
    sponsorship, min_revenue, ebitda_min, min_deal, max_deal, industries, industries_to_avoid,
    b2b_b2c, refinancing, company_requirements, deal_structure_notes, geo,
    'Demo Contact', contact_title, '{}'::text[], NULL,
    referral_lender, referral_fee_offered, referral_agreement, nda, false,
    upfront_checklist, post_term_sheet_checklist, NULL, tier, true,
    '+1-555-0100', tags, website, NULL, NULL, '+1-555-0100', funding_source_notes, about_notes,
    now(), now()
  FROM (
    SELECT * FROM master_lenders
    WHERE company_id = p_source_company_id AND COALESCE(active, true) = true
    ORDER BY random() LIMIT 300
  ) src;
  v_counts := v_counts || jsonb_build_object('master_lenders',
    (SELECT count(*) FROM master_lenders WHERE company_id = p_target_company_id));

  ---------------------------------------------------------------------------
  -- Deals: sample 80 from non-archived pipelines, anonymize, remap pipeline_id
  ---------------------------------------------------------------------------
  CREATE TEMP TABLE _deal_map (old_id uuid, new_id uuid) ON COMMIT DROP;

  WITH src AS (
    SELECT d.* FROM deals d
    JOIN deal_pipelines p ON p.id = d.pipeline_id
    WHERE d.company_id = p_source_company_id
      AND p.name NOT IN ('naitive Pipeline','FinServ Pipeline','Archived Pipeline')
      AND COALESCE(d.company,'') NOT ILIKE 'test %'
      AND COALESCE(d.company,'') NOT IN ('Test-Niki''s Store','Example Deal')
    ORDER BY random()
    LIMIT 80
  ),
  ins AS (
    INSERT INTO deals(
      id, company, value, status, stage, engagement_type, deal_type, referred_by, manager,
      created_at, updated_at, user_id, pre_signing_hours, post_signing_hours, retainer_fee,
      milestone_fee, success_fee_percent, exclusivity, company_id, deal_owner, is_flagged,
      flag_notes, notes, notes_updated_at, narrative, contact, contact_info, company_url,
      business_model, pipeline_id, analyst, closing_date, sourced_via, deal_class,
      dashboard_closing_date, lead_source, referral_source, opportunity_type, services_offered,
      fee_type, mrr, one_time_revenue, projected_close_date, contract_start_date,
      contract_end_date, on_hold, contact_email, contact_title, next_step, next_step_date,
      tags, pricing
    )
    SELECT
      gen_random_uuid(), src.company, src.value, src.status, src.stage, src.engagement_type,
      src.deal_type, 'Demo Referral', 'Griffin Moor', now(), now(), p_owner_user_id,
      src.pre_signing_hours, src.post_signing_hours, src.retainer_fee, src.milestone_fee,
      src.success_fee_percent, src.exclusivity, p_target_company_id, 'Griffin Moor', false,
      NULL, NULL, NULL, NULL, 'Demo Contact', NULL, src.company_url, src.business_model,
      (v_pipeline_map ->> src.pipeline_id::text)::uuid, 'GM Analyst',
      src.closing_date, src.sourced_via, NULL, src.dashboard_closing_date, src.lead_source,
      'Demo Referral', src.opportunity_type, src.services_offered, src.fee_type, src.mrr,
      src.one_time_revenue, src.projected_close_date, src.contract_start_date,
      src.contract_end_date, COALESCE(src.on_hold, false),
      'contact-' || substr(md5(src.id::text),1,8) || '@example.com',
      src.contact_title, src.next_step, src.next_step_date, src.tags, src.pricing
    FROM src
    RETURNING id, (SELECT s.id FROM src s LIMIT 1) AS _placeholder
  )
  SELECT 1; -- can't easily map old->new via single CTE; redo with row_number

  -- Redo to build proper id map
  TRUNCATE _deal_map;
  DELETE FROM deals WHERE company_id = p_target_company_id;

  WITH src AS (
    SELECT d.*, gen_random_uuid() AS new_id FROM deals d
    JOIN deal_pipelines p ON p.id = d.pipeline_id
    WHERE d.company_id = p_source_company_id
      AND p.name NOT IN ('naitive Pipeline','FinServ Pipeline','Archived Pipeline')
      AND COALESCE(d.company,'') NOT ILIKE 'test %'
      AND COALESCE(d.company,'') NOT IN ('Test-Niki''s Store','Example Deal')
    ORDER BY random()
    LIMIT 80
  ),
  ins AS (
    INSERT INTO deals(
      id, company, value, status, stage, engagement_type, deal_type, referred_by, manager,
      created_at, updated_at, user_id, pre_signing_hours, post_signing_hours, retainer_fee,
      milestone_fee, success_fee_percent, exclusivity, company_id, deal_owner, is_flagged,
      narrative, contact, contact_info, company_url, business_model, pipeline_id, analyst,
      closing_date, sourced_via, dashboard_closing_date, lead_source, referral_source,
      opportunity_type, services_offered, fee_type, mrr, one_time_revenue,
      projected_close_date, contract_start_date, contract_end_date, on_hold, contact_email,
      contact_title, next_step, next_step_date, tags, pricing
    )
    SELECT
      src.new_id, src.company, src.value, src.status, src.stage, src.engagement_type,
      src.deal_type, 'Demo Referral', 'Griffin Moor', now(), now(), p_owner_user_id,
      src.pre_signing_hours, src.post_signing_hours, src.retainer_fee, src.milestone_fee,
      src.success_fee_percent, src.exclusivity, p_target_company_id, 'Griffin Moor', false,
      NULL, 'Demo Contact', NULL, src.company_url, src.business_model,
      (v_pipeline_map ->> src.pipeline_id::text)::uuid, 'GM Analyst',
      src.closing_date, src.sourced_via, src.dashboard_closing_date, src.lead_source,
      'Demo Referral', src.opportunity_type, src.services_offered, src.fee_type, src.mrr,
      src.one_time_revenue, src.projected_close_date, src.contract_start_date,
      src.contract_end_date, COALESCE(src.on_hold, false),
      'contact-' || substr(md5(src.id::text),1,8) || '@example.com',
      src.contact_title, src.next_step, src.next_step_date, src.tags, src.pricing
    FROM src
    RETURNING id
  )
  INSERT INTO _deal_map(old_id, new_id)
  SELECT s.id, s.new_id FROM src s;

  v_counts := v_counts || jsonb_build_object('deals',
    (SELECT count(*) FROM deals WHERE company_id = p_target_company_id));

  ---------------------------------------------------------------------------
  -- Deal stage history for the cloned deals (remap deal_id + pipeline_id)
  ---------------------------------------------------------------------------
  INSERT INTO deal_stage_history(
    id, deal_id, company_id, pipeline_id, from_stage, to_stage, changed_at,
    changed_by, source, to_stage_id, to_stage_label_raw, unresolved_stage_label,
    exited_at, event_type, from_stage_id, from_stage_label_raw
  )
  SELECT
    gen_random_uuid(), m.new_id, p_target_company_id,
    (v_pipeline_map ->> h.pipeline_id::text)::uuid,
    h.from_stage, h.to_stage, h.changed_at, p_owner_user_id, h.source,
    h.to_stage_id, h.to_stage_label_raw, h.unresolved_stage_label,
    h.exited_at, h.event_type, h.from_stage_id, h.from_stage_label_raw
  FROM deal_stage_history h
  JOIN _deal_map m ON m.old_id = h.deal_id
  WHERE h.company_id = p_source_company_id
    AND (h.pipeline_id IS NULL OR v_pipeline_map ? h.pipeline_id::text);
  v_counts := v_counts || jsonb_build_object('deal_stage_history',
    (SELECT count(*) FROM deal_stage_history WHERE company_id = p_target_company_id));

  ---------------------------------------------------------------------------
  -- Agents
  ---------------------------------------------------------------------------
  INSERT INTO agents(
    id, user_id, company_id, name, description, avatar_emoji, system_prompt, personality,
    temperature, can_access_deals, can_access_lenders, can_access_activities,
    can_access_milestones, can_search_web, is_shared, is_public, usage_count, graph_config,
    created_at, updated_at
  )
  SELECT
    gen_random_uuid(), p_owner_user_id, p_target_company_id, name, description, avatar_emoji,
    system_prompt, personality, temperature, can_access_deals, can_access_lenders,
    can_access_activities, can_access_milestones, can_search_web, is_shared, false, 0,
    graph_config, now(), now()
  FROM agents WHERE company_id = p_source_company_id;
  v_counts := v_counts || jsonb_build_object('agents',
    (SELECT count(*) FROM agents WHERE company_id = p_target_company_id));

  ---------------------------------------------------------------------------
  -- Workflows
  ---------------------------------------------------------------------------
  INSERT INTO workflows(
    id, user_id, name, description, is_active, trigger_type, trigger_config, actions,
    template_id, company_id, created_at, updated_at
  )
  SELECT
    gen_random_uuid(), p_owner_user_id, name, description, is_active, trigger_type,
    trigger_config, actions, template_id, p_target_company_id, now(), now()
  FROM workflows WHERE company_id = p_source_company_id;
  v_counts := v_counts || jsonb_build_object('workflows',
    (SELECT count(*) FROM workflows WHERE company_id = p_target_company_id));

  ---------------------------------------------------------------------------
  -- Dashboard layouts
  ---------------------------------------------------------------------------
  INSERT INTO dashboard_layouts(
    id, user_id, name, description, is_active, grid_config, widgets_config, settings,
    position, company_id, created_at, updated_at
  )
  SELECT
    gen_random_uuid(), p_owner_user_id, name, description, is_active, grid_config,
    widgets_config, settings, position, p_target_company_id, now(), now()
  FROM dashboard_layouts WHERE company_id = p_source_company_id;
  v_counts := v_counts || jsonb_build_object('dashboard_layouts',
    (SELECT count(*) FROM dashboard_layouts WHERE company_id = p_target_company_id));

  ---------------------------------------------------------------------------
  -- Task templates
  ---------------------------------------------------------------------------
  INSERT INTO task_templates(id, company_id, name, description, template_tasks, created_by, created_at, updated_at)
  SELECT gen_random_uuid(), p_target_company_id, name, description, template_tasks, p_owner_user_id, now(), now()
  FROM task_templates WHERE company_id = p_source_company_id;
  v_counts := v_counts || jsonb_build_object('task_templates',
    (SELECT count(*) FROM task_templates WHERE company_id = p_target_company_id));

  ---------------------------------------------------------------------------
  -- AI configuration
  ---------------------------------------------------------------------------
  INSERT INTO ai_configuration(id, company_id, default_model, default_temperature, max_tokens, features_enabled, copilot_instructions, created_at, updated_at)
  SELECT gen_random_uuid(), p_target_company_id, default_model, default_temperature, max_tokens, features_enabled, copilot_instructions, now(), now()
  FROM ai_configuration WHERE company_id = p_source_company_id LIMIT 1;
  v_counts := v_counts || jsonb_build_object('ai_configuration',
    (SELECT count(*) FROM ai_configuration WHERE company_id = p_target_company_id));

  ---------------------------------------------------------------------------
  -- Company settings (clone + override default_deal_stage_id remap if needed)
  ---------------------------------------------------------------------------
  INSERT INTO company_settings(
    id, company_id, default_deal_stage_id, permission_settings, deal_stages,
    deal_panel_layout, lender_matching_config, deal_info_layout, deals_widgets_config,
    deals_special_widgets, fpa_dashboard_config, data_room_default_checklists,
    disclaimer, deal_types, stale_alert_config, feature_flags, ai_settings,
    created_at, updated_at
  )
  SELECT
    gen_random_uuid(), p_target_company_id, NULL, permission_settings, deal_stages,
    deal_panel_layout, lender_matching_config, deal_info_layout, deals_widgets_config,
    deals_special_widgets, fpa_dashboard_config, data_room_default_checklists,
    disclaimer, deal_types, stale_alert_config, feature_flags, ai_settings, now(), now()
  FROM company_settings WHERE company_id = p_source_company_id LIMIT 1;

  -- Ensure a row exists even if source has none
  INSERT INTO company_settings(id, company_id, created_at, updated_at)
  SELECT gen_random_uuid(), p_target_company_id, now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM company_settings WHERE company_id = p_target_company_id);

  v_counts := v_counts || jsonb_build_object('company_settings',
    (SELECT count(*) FROM company_settings WHERE company_id = p_target_company_id));

  ---------------------------------------------------------------------------
  -- Company features (advisory-only baseline; integrations OFF)
  ---------------------------------------------------------------------------
  INSERT INTO company_features(
    company_id, workflows_enabled, timeline_view_enabled, agreement_icon_visible,
    deal_memo_enabled, sample_deal_on_signup, assist_enabled,
    key_metrics_flex_enabled, gamma_enabled, created_at, updated_at
  ) VALUES (
    p_target_company_id, true, true, true, true, false, true, false, false, now(), now()
  );

  -- Disable proprietary / 5th-Line-only integrations and surfaces
  INSERT INTO company_feature_overrides(id, company_id, feature_key, is_enabled, updated_by, created_at, updated_at)
  SELECT gen_random_uuid(), p_target_company_id, fk, false, p_owner_user_id, now(), now()
  FROM unnest(ARRAY[
    'naitive_pipeline','finserv_pipeline','flex_integration','claap_integration',
    'hubspot_integration','quickbooks_integration','docusign_integration','asana_integration',
    'gmail_integration','google_calendar_integration','perplexity_integration',
    'jturner_briefing','fifth_line_live_dashboard'
  ]) AS fk;
  v_counts := v_counts || jsonb_build_object('company_feature_overrides',
    (SELECT count(*) FROM company_feature_overrides WHERE company_id = p_target_company_id));

  RETURN jsonb_build_object(
    'target_company_id', p_target_company_id,
    'owner_user_id', p_owner_user_id,
    'counts', v_counts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.clone_demo_tenant(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clone_demo_tenant(uuid, uuid, uuid) TO service_role;
