
CREATE OR REPLACE FUNCTION public.clone_demo_tenant(
  p_source_company_id uuid,
  p_target_company_id uuid,
  p_owner_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '600s'
AS $$
DECLARE
  v_counts jsonb := '{}'::jsonb;
  v_pipeline_map jsonb := '{}'::jsonb;
  r record;
  v_new_id uuid;
BEGIN
  IF p_source_company_id = p_target_company_id THEN
    RAISE EXCEPTION 'source and target must differ';
  END IF;

  ------------------------------------------------------------------
  -- Idempotency: wipe target rows in all tables we manage.
  ------------------------------------------------------------------
  DELETE FROM tasks WHERE company_id = p_target_company_id;
  DELETE FROM deal_activity WHERE deal_id IN (SELECT id FROM deals WHERE company_id = p_target_company_id);
  DELETE FROM deal_emails WHERE deal_id IN (SELECT id FROM deals WHERE company_id = p_target_company_id);
  DELETE FROM deal_milestones WHERE deal_id IN (SELECT id FROM deals WHERE company_id = p_target_company_id);
  DELETE FROM deal_lenders WHERE deal_id IN (SELECT id FROM deals WHERE company_id = p_target_company_id);
  DELETE FROM deal_stage_history WHERE company_id = p_target_company_id;
  DELETE FROM deals WHERE company_id = p_target_company_id;
  DELETE FROM deal_pipelines WHERE company_id = p_target_company_id;
  DELETE FROM lender_notes WHERE company_id = p_target_company_id;
  DELETE FROM lender_stage_configs WHERE company_id = p_target_company_id;
  DELETE FROM master_lenders WHERE company_id = p_target_company_id;
  DELETE FROM contacts WHERE org_company_id = p_target_company_id OR company_id = p_target_company_id;
  DELETE FROM crm_companies WHERE org_company_id = p_target_company_id;
  DELETE FROM agents WHERE company_id = p_target_company_id;
  DELETE FROM workflows WHERE company_id = p_target_company_id;
  DELETE FROM dashboard_layouts WHERE company_id = p_target_company_id;
  DELETE FROM task_templates WHERE company_id = p_target_company_id;
  DELETE FROM ai_configuration WHERE company_id = p_target_company_id;
  DELETE FROM company_settings WHERE company_id = p_target_company_id;
  DELETE FROM company_features WHERE company_id = p_target_company_id;
  DELETE FROM company_feature_overrides WHERE company_id = p_target_company_id;

  ------------------------------------------------------------------
  -- Temp id maps
  ------------------------------------------------------------------
  CREATE TEMP TABLE _deal_map (old_id uuid PRIMARY KEY, new_id uuid NOT NULL) ON COMMIT DROP;
  CREATE TEMP TABLE _lender_map (old_id uuid PRIMARY KEY, new_id uuid NOT NULL) ON COMMIT DROP;
  CREATE TEMP TABLE _contact_map (old_id uuid PRIMARY KEY, new_id uuid NOT NULL) ON COMMIT DROP;
  CREATE TEMP TABLE _crmco_map (old_id uuid PRIMARY KEY, new_id uuid NOT NULL) ON COMMIT DROP;

  ------------------------------------------------------------------
  -- Pipelines (skip 5th-Line-proprietary)
  ------------------------------------------------------------------
  FOR r IN
    SELECT * FROM deal_pipelines
    WHERE company_id = p_source_company_id
      AND name NOT IN ('naitive Pipeline','FinServ Pipeline')
  LOOP
    v_new_id := gen_random_uuid();
    INSERT INTO deal_pipelines(id, company_id, name, stages, is_default, position, created_at, updated_at)
    VALUES (v_new_id, p_target_company_id, r.name, r.stages, r.is_default, r.position, now(), now());
    v_pipeline_map := v_pipeline_map || jsonb_build_object(r.id::text, v_new_id::text);
  END LOOP;
  v_counts := v_counts || jsonb_build_object('deal_pipelines',
    (SELECT count(*) FROM deal_pipelines WHERE company_id = p_target_company_id));

  ------------------------------------------------------------------
  -- Lender stage configs
  ------------------------------------------------------------------
  INSERT INTO lender_stage_configs(id, company_id, user_id, stages, substages, pass_reasons, tracking_statuses, created_at, updated_at)
  SELECT gen_random_uuid(), p_target_company_id, p_owner_user_id, stages, substages, pass_reasons, tracking_statuses, now(), now()
  FROM lender_stage_configs WHERE company_id = p_source_company_id LIMIT 1;
  v_counts := v_counts || jsonb_build_object('lender_stage_configs',
    (SELECT count(*) FROM lender_stage_configs WHERE company_id = p_target_company_id));

  ------------------------------------------------------------------
  -- Master lenders — FULL clone with anonymized PII
  ------------------------------------------------------------------
  WITH src AS (
    SELECT id AS old_id, gen_random_uuid() AS new_id, *
    FROM master_lenders WHERE company_id = p_source_company_id
  ),
  ins AS (
    INSERT INTO master_lenders
    SELECT (jsonb_populate_record(
      NULL::master_lenders,
      to_jsonb(ml) || jsonb_build_object(
        'id', src.new_id,
        'company_id', p_target_company_id,
        'user_id', p_owner_user_id,
        'email', 'lender-' || substr(md5(ml.id::text),1,8) || '@example.com',
        'contact_name', 'Demo Contact',
        'contact_phone', '+1-555-0100',
        'phone', '+1-555-0100',
        'relationship_owners', '[]'::jsonb,
        'created_at', to_jsonb(now()),
        'updated_at', to_jsonb(now())
      )
    )).*
    FROM master_lenders ml
    JOIN src ON src.old_id = ml.id
    RETURNING id
  )
  INSERT INTO _lender_map(old_id, new_id) SELECT old_id, new_id FROM src;
  v_counts := v_counts || jsonb_build_object('master_lenders',
    (SELECT count(*) FROM master_lenders WHERE company_id = p_target_company_id));

  ------------------------------------------------------------------
  -- CRM companies — FULL clone (jsonb rewrite)
  ------------------------------------------------------------------
  WITH src AS (
    SELECT id AS old_id, gen_random_uuid() AS new_id
    FROM crm_companies WHERE org_company_id = p_source_company_id
  ),
  ins AS (
    INSERT INTO crm_companies
    SELECT (jsonb_populate_record(
      NULL::crm_companies,
      to_jsonb(c) || jsonb_build_object(
        'id', src.new_id,
        'org_company_id', p_target_company_id,
        'owner_user_id', p_owner_user_id,
        'created_by', p_owner_user_id,
        'last_modified_by', p_owner_user_id,
        'phone', '+1-555-0100'
      )
    )).*
    FROM crm_companies c
    JOIN src ON src.old_id = c.id
    RETURNING id
  )
  INSERT INTO _crmco_map(old_id, new_id) SELECT old_id, new_id FROM src;
  v_counts := v_counts || jsonb_build_object('crm_companies',
    (SELECT count(*) FROM crm_companies WHERE org_company_id = p_target_company_id));

  ------------------------------------------------------------------
  -- Contacts — FULL clone, anonymize email + phones, remap crm_company_id
  ------------------------------------------------------------------
  WITH src AS (
    SELECT id AS old_id, gen_random_uuid() AS new_id
    FROM contacts WHERE org_company_id = p_source_company_id
  ),
  ins AS (
    INSERT INTO contacts
    SELECT (jsonb_populate_record(
      NULL::contacts,
      to_jsonb(c) || jsonb_build_object(
        'id', src.new_id,
        'company_id', p_target_company_id,
        'org_company_id', p_target_company_id,
        'owner_user_id', p_owner_user_id,
        'created_by', p_owner_user_id,
        'last_modified_by', p_owner_user_id,
        'email', 'contact-' || substr(md5(c.id::text),1,8) || '@example.com',
        'additional_emails', '[]'::jsonb,
        'phone_work', '+1-555-0100',
        'phone_mobile', '+1-555-0100',
        'phone_other', NULL,
        'crm_company_id', COALESCE((SELECT to_jsonb(m.new_id) FROM _crmco_map m WHERE m.old_id = c.crm_company_id), 'null'::jsonb),
        'primary_company_id', COALESCE((SELECT to_jsonb(m.new_id) FROM _crmco_map m WHERE m.old_id = c.primary_company_id), 'null'::jsonb)
      )
    )).*
    FROM contacts c
    JOIN src ON src.old_id = c.id
    RETURNING id
  )
  INSERT INTO _contact_map(old_id, new_id) SELECT old_id, new_id FROM src;
  v_counts := v_counts || jsonb_build_object('contacts',
    (SELECT count(*) FROM contacts WHERE org_company_id = p_target_company_id));

  ------------------------------------------------------------------
  -- Deals — FULL clone with anonymized contact info, remap pipeline_id + crm_company_id
  ------------------------------------------------------------------
  WITH src AS (
    SELECT id AS old_id, gen_random_uuid() AS new_id
    FROM deals
    WHERE company_id = p_source_company_id
      AND pipeline_id IN (SELECT id FROM deal_pipelines WHERE company_id = p_source_company_id AND name NOT IN ('naitive Pipeline','FinServ Pipeline'))
      AND COALESCE(company,'') NOT ILIKE 'test %'
      AND COALESCE(company,'') NOT IN ('Test-Niki''s Store','Example Deal')
  ),
  ins AS (
    INSERT INTO deals
    SELECT (jsonb_populate_record(
      NULL::deals,
      to_jsonb(d) || jsonb_build_object(
        'id', src.new_id,
        'company_id', p_target_company_id,
        'user_id', p_owner_user_id,
        'pipeline_id', v_pipeline_map -> d.pipeline_id::text,
        'crm_company_id', COALESCE((SELECT to_jsonb(m.new_id) FROM _crmco_map m WHERE m.old_id = d.crm_company_id), 'null'::jsonb),
        'merged_into', 'null'::jsonb,
        'merged_hubspot_ids', '[]'::jsonb,
        'deal_class', '"standard"'::jsonb,
        'deal_owner', '"Griffin Moor"'::jsonb,
        'manager', '"Griffin Moor"'::jsonb,
        'analyst', '"GM Analyst"'::jsonb,
        'referred_by', '"Demo Referral"'::jsonb,
        'referral_source', '"Demo Referral"'::jsonb,
        'contact', '"Demo Contact"'::jsonb,
        'contact_info', 'null'::jsonb,
        'contact_email', to_jsonb('contact-' || substr(md5(d.id::text),1,8) || '@example.com'),
        'flag_notes', 'null'::jsonb,
        'notes', 'null'::jsonb,
        'narrative', 'null'::jsonb,
        'ai_custom_instructions', 'null'::jsonb,
        'hubspot_deal_id', 'null'::jsonb,
        'hubspot_sync_status', 'null'::jsonb,
        'hubspot_sync_error', 'null'::jsonb,
        'hubspot_last_synced_at', 'null'::jsonb
      )
    )).*
    FROM deals d
    JOIN src ON src.old_id = d.id
    RETURNING id
  )
  INSERT INTO _deal_map(old_id, new_id) SELECT old_id, new_id FROM src;
  v_counts := v_counts || jsonb_build_object('deals',
    (SELECT count(*) FROM deals WHERE company_id = p_target_company_id));

  ------------------------------------------------------------------
  -- Deal stage history (remap deal_id + pipeline_id)
  ------------------------------------------------------------------
  INSERT INTO deal_stage_history
  SELECT (jsonb_populate_record(
    NULL::deal_stage_history,
    to_jsonb(h) || jsonb_build_object(
      'id', gen_random_uuid(),
      'deal_id', m.new_id,
      'company_id', p_target_company_id,
      'pipeline_id', COALESCE(v_pipeline_map -> h.pipeline_id::text, 'null'::jsonb),
      'changed_by', to_jsonb(p_owner_user_id)
    )
  )).*
  FROM deal_stage_history h
  JOIN _deal_map m ON m.old_id = h.deal_id
  WHERE h.company_id = p_source_company_id;
  v_counts := v_counts || jsonb_build_object('deal_stage_history',
    (SELECT count(*) FROM deal_stage_history WHERE company_id = p_target_company_id));

  ------------------------------------------------------------------
  -- Deal lenders (remap deal_id + master_lender_id)
  ------------------------------------------------------------------
  INSERT INTO deal_lenders
  SELECT (jsonb_populate_record(
    NULL::deal_lenders,
    to_jsonb(dl) || jsonb_build_object(
      'id', gen_random_uuid(),
      'deal_id', dm.new_id,
      'master_lender_id', COALESCE((SELECT to_jsonb(lm.new_id) FROM _lender_map lm WHERE lm.old_id = dl.master_lender_id), 'null'::jsonb)
    )
  )).*
  FROM deal_lenders dl
  JOIN _deal_map dm ON dm.old_id = dl.deal_id;
  v_counts := v_counts || jsonb_build_object('deal_lenders',
    (SELECT count(*) FROM deal_lenders dl JOIN deals d ON d.id = dl.deal_id WHERE d.company_id = p_target_company_id));

  ------------------------------------------------------------------
  -- Deal milestones (remap deal_id; set user_id to owner)
  ------------------------------------------------------------------
  INSERT INTO deal_milestones
  SELECT (jsonb_populate_record(
    NULL::deal_milestones,
    to_jsonb(dm) || jsonb_build_object(
      'id', gen_random_uuid(),
      'deal_id', m.new_id,
      'user_id', to_jsonb(p_owner_user_id)
    )
  )).*
  FROM deal_milestones dm
  JOIN _deal_map m ON m.old_id = dm.deal_id;
  v_counts := v_counts || jsonb_build_object('deal_milestones',
    (SELECT count(*) FROM deal_milestones dm JOIN deals d ON d.id = dm.deal_id WHERE d.company_id = p_target_company_id));

  ------------------------------------------------------------------
  -- Deal emails (remap deal_id; drop gmail link since user has no inbox)
  ------------------------------------------------------------------
  INSERT INTO deal_emails
  SELECT (jsonb_populate_record(
    NULL::deal_emails,
    to_jsonb(de) || jsonb_build_object(
      'id', gen_random_uuid(),
      'deal_id', m.new_id,
      'user_id', to_jsonb(p_owner_user_id)
    )
  )).*
  FROM deal_emails de
  JOIN _deal_map m ON m.old_id = de.deal_id;
  v_counts := v_counts || jsonb_build_object('deal_emails',
    (SELECT count(*) FROM deal_emails de JOIN deals d ON d.id = de.deal_id WHERE d.company_id = p_target_company_id));

  ------------------------------------------------------------------
  -- Deal activity (remap deal_id + user_id)
  ------------------------------------------------------------------
  INSERT INTO deal_activity
  SELECT (jsonb_populate_record(
    NULL::deal_activity,
    to_jsonb(da) || jsonb_build_object(
      'id', gen_random_uuid(),
      'deal_id', m.new_id,
      'user_id', to_jsonb(p_owner_user_id)
    )
  )).*
  FROM deal_activity da
  JOIN _deal_map m ON m.old_id = da.deal_id;
  v_counts := v_counts || jsonb_build_object('deal_activity',
    (SELECT count(*) FROM deal_activity da JOIN deals d ON d.id = da.deal_id WHERE d.company_id = p_target_company_id));

  ------------------------------------------------------------------
  -- Tasks (remap deal_id, company_id, contact_id, crm_company_id, lender_id, assignment fields)
  ------------------------------------------------------------------
  INSERT INTO tasks
  SELECT (jsonb_populate_record(
    NULL::tasks,
    to_jsonb(t) || jsonb_build_object(
      'id', gen_random_uuid(),
      'company_id', to_jsonb(p_target_company_id),
      'deal_id', COALESCE((SELECT to_jsonb(m.new_id) FROM _deal_map m WHERE m.old_id = t.deal_id), 'null'::jsonb),
      'contact_id', COALESCE((SELECT to_jsonb(m.new_id) FROM _contact_map m WHERE m.old_id = t.contact_id), 'null'::jsonb),
      'crm_company_id', COALESCE((SELECT to_jsonb(m.new_id) FROM _crmco_map m WHERE m.old_id = t.crm_company_id), 'null'::jsonb),
      'lender_id', COALESCE((SELECT to_jsonb(m.new_id) FROM _lender_map m WHERE m.old_id = t.lender_id), 'null'::jsonb),
      'assigned_to', to_jsonb(p_owner_user_id),
      'assigned_by', to_jsonb(p_owner_user_id),
      'created_by', to_jsonb(p_owner_user_id),
      'completed_by', COALESCE(CASE WHEN t.completed_by IS NOT NULL THEN to_jsonb(p_owner_user_id) END, 'null'::jsonb),
      'asana_task_gid', 'null'::jsonb,
      'asana_sync_status', 'null'::jsonb,
      'asana_sync_error', 'null'::jsonb,
      'asana_synced_at', 'null'::jsonb,
      'nylas_event_id', 'null'::jsonb
    )
  )).*
  FROM tasks t
  WHERE t.company_id = p_source_company_id;
  v_counts := v_counts || jsonb_build_object('tasks',
    (SELECT count(*) FROM tasks WHERE company_id = p_target_company_id));

  ------------------------------------------------------------------
  -- Lender notes (remap master_lender_id)
  ------------------------------------------------------------------
  INSERT INTO lender_notes
  SELECT (jsonb_populate_record(
    NULL::lender_notes,
    to_jsonb(ln) || jsonb_build_object(
      'id', gen_random_uuid(),
      'company_id', to_jsonb(p_target_company_id),
      'user_id', to_jsonb(p_owner_user_id)
    )
  )).*
  FROM lender_notes ln
  WHERE ln.company_id = p_source_company_id;
  v_counts := v_counts || jsonb_build_object('lender_notes',
    (SELECT count(*) FROM lender_notes WHERE company_id = p_target_company_id));

  ------------------------------------------------------------------
  -- Agents / Workflows / Dashboards / Task templates / AI / Settings / Features
  ------------------------------------------------------------------
  INSERT INTO agents(
    id, user_id, company_id, name, description, avatar_emoji, system_prompt, personality,
    temperature, can_access_deals, can_access_lenders, can_access_activities,
    can_access_milestones, can_search_web, is_shared, is_public, usage_count, graph_config,
    created_at, updated_at
  )
  SELECT gen_random_uuid(), p_owner_user_id, p_target_company_id, name, description, avatar_emoji,
    system_prompt, personality, temperature, can_access_deals, can_access_lenders,
    can_access_activities, can_access_milestones, can_search_web, is_shared, false, 0,
    graph_config, now(), now()
  FROM agents WHERE company_id = p_source_company_id;
  v_counts := v_counts || jsonb_build_object('agents',
    (SELECT count(*) FROM agents WHERE company_id = p_target_company_id));

  INSERT INTO workflows(
    id, user_id, name, description, is_active, trigger_type, trigger_config, actions,
    template_id, company_id, created_at, updated_at
  )
  SELECT gen_random_uuid(), p_owner_user_id, name, description, is_active, trigger_type,
    trigger_config, actions, template_id, p_target_company_id, now(), now()
  FROM workflows WHERE company_id = p_source_company_id;
  v_counts := v_counts || jsonb_build_object('workflows',
    (SELECT count(*) FROM workflows WHERE company_id = p_target_company_id));

  INSERT INTO dashboard_layouts(
    id, user_id, name, description, is_active, grid_config, widgets_config, settings,
    position, company_id, created_at, updated_at
  )
  SELECT gen_random_uuid(), p_owner_user_id, name, description, is_active, grid_config,
    widgets_config, settings, position, p_target_company_id, now(), now()
  FROM dashboard_layouts WHERE company_id = p_source_company_id;
  v_counts := v_counts || jsonb_build_object('dashboard_layouts',
    (SELECT count(*) FROM dashboard_layouts WHERE company_id = p_target_company_id));

  INSERT INTO task_templates(id, company_id, name, description, template_tasks, created_by, created_at, updated_at)
  SELECT gen_random_uuid(), p_target_company_id, name, description, template_tasks, p_owner_user_id, now(), now()
  FROM task_templates WHERE company_id = p_source_company_id;
  v_counts := v_counts || jsonb_build_object('task_templates',
    (SELECT count(*) FROM task_templates WHERE company_id = p_target_company_id));

  INSERT INTO ai_configuration(id, company_id, default_model, default_temperature, max_tokens, features_enabled, copilot_instructions, created_at, updated_at)
  SELECT gen_random_uuid(), p_target_company_id, default_model, default_temperature, max_tokens, features_enabled, copilot_instructions, now(), now()
  FROM ai_configuration WHERE company_id = p_source_company_id LIMIT 1;
  v_counts := v_counts || jsonb_build_object('ai_configuration',
    (SELECT count(*) FROM ai_configuration WHERE company_id = p_target_company_id));

  INSERT INTO company_settings(
    id, company_id, default_deal_stage_id, permission_settings, deal_stages,
    deal_panel_layout, lender_matching_config, deal_info_layout, deals_widgets_config,
    deals_special_widgets, fpa_dashboard_config, data_room_default_checklists,
    disclaimer, deal_types, stale_alert_config, feature_flags, ai_settings,
    created_at, updated_at
  )
  SELECT gen_random_uuid(), p_target_company_id, NULL, permission_settings, deal_stages,
    deal_panel_layout, lender_matching_config, deal_info_layout, deals_widgets_config,
    deals_special_widgets, fpa_dashboard_config, data_room_default_checklists,
    disclaimer, deal_types, stale_alert_config, feature_flags, ai_settings, now(), now()
  FROM company_settings WHERE company_id = p_source_company_id LIMIT 1;

  INSERT INTO company_settings(id, company_id, created_at, updated_at)
  SELECT gen_random_uuid(), p_target_company_id, now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM company_settings WHERE company_id = p_target_company_id);

  v_counts := v_counts || jsonb_build_object('company_settings',
    (SELECT count(*) FROM company_settings WHERE company_id = p_target_company_id));

  INSERT INTO company_features(
    company_id, workflows_enabled, timeline_view_enabled, agreement_icon_visible,
    deal_memo_enabled, sample_deal_on_signup, assist_enabled,
    key_metrics_flex_enabled, gamma_enabled, created_at, updated_at
  ) VALUES (
    p_target_company_id, true, true, true, true, false, true, false, false, now(), now()
  );

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
