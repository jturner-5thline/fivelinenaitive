-- KB export (source side). Three read-only RPCs fixed to one tenant. No writes, no triggers.
CREATE OR REPLACE FUNCTION public.fn_kb_export_table_page(p_table text, p_limit integer, p_cursor_ts timestamptz, p_cursor_id uuid, p_scan_upper_bound timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_ub timestamptz; v_rows jsonb; v_n integer; v_more boolean; v_last jsonb;
BEGIN
  IF p_table IS NULL OR p_table NOT IN ('companies','deals','crm_companies','contacts','master_lenders','deal_lenders','deal_space_notes','deal_status_notes','lender_notes','tasks','claap_meetings','activity_logs','deal_activity') THEN RAISE EXCEPTION 'invalid_table' USING ERRCODE = '22023'; END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN RAISE EXCEPTION 'invalid_limit' USING ERRCODE = '22023'; END IF;
  IF (p_cursor_ts IS NULL) <> (p_cursor_id IS NULL) THEN RAISE EXCEPTION 'invalid_cursor' USING ERRCODE = '22023'; END IF;
  IF p_cursor_ts IS NOT NULL AND p_scan_upper_bound IS NULL THEN RAISE EXCEPTION 'cursor_requires_upper_bound' USING ERRCODE = '22023'; END IF;
  IF p_cursor_ts IS NOT NULL AND p_cursor_ts > p_scan_upper_bound THEN RAISE EXCEPTION 'cursor_after_upper_bound' USING ERRCODE = '22023'; END IF;
  IF p_scan_upper_bound IS NOT NULL AND p_scan_upper_bound > pg_catalog.clock_timestamp() THEN RAISE EXCEPTION 'upper_bound_in_future' USING ERRCODE = '22023'; END IF;
  v_ub := COALESCE(p_scan_upper_bound, pg_catalog.clock_timestamp());
  CASE p_table
    WHEN 'companies' THEN
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(q) ORDER BY q.k_ts, q.id), '[]'::jsonb) INTO v_rows
      FROM (SELECT x."id", x."name", x."logo_url", x."website_url", x."industry", x."employee_size", x."description", x."address", x."city", x."state", x."country", x."primary_domain", x."domains", x."account_type", x."notes", x."suspended_at", x."archived_at", x."created_at", x."updated_at", x.updated_at AS k_ts FROM public.companies x
            WHERE x.id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid AND x.updated_at <= v_ub
              AND (p_cursor_ts IS NULL OR (x.updated_at, x.id) > (p_cursor_ts, p_cursor_id))
            ORDER BY x.updated_at, x.id LIMIT p_limit + 1) q;
    WHEN 'deals' THEN
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(q) ORDER BY q.k_ts, q.id), '[]'::jsonb) INTO v_rows
      FROM (SELECT x."id", x."company_id", x."company", x."value", x."status", x."stage", x."engagement_type", x."deal_type", x."referred_by", x."manager", x."deal_owner", x."analyst", x."pre_signing_hours", x."post_signing_hours", x."retainer_fee", x."milestone_fee", x."success_fee_percent", x."exclusivity", x."is_flagged", x."flag_notes", x."notes", x."narrative", x."contact", x."contact_info", x."contact_email", x."contact_title", x."company_url", x."business_model", x."closing_date", x."dashboard_closing_date", x."sourced_via", x."lead_source", x."referral_source", x."opportunity_type", x."services_offered", x."fee_type", x."mrr", x."mrr_mode", x."one_time_revenue", x."projected_close_date", x."contract_start_date", x."contract_end_date", x."on_hold", x."icp_category", x."prospect_type", x."owned_by", x."next_step", x."next_step_date", x."dm_present", x."dm_name", x."outcome", x."why_not_moving_forward", x."pain_points_confirmed", x."objections_raised", x."competitors_mentioned", x."key_signal", x."product_gap_flagged", x."tags", x."pricing", x."proposal_issued_at", x."terms_issued_at", x."terms_signed_at", x."closed_at", x."lost_at", x."lost_reason", x."total_fee", x."stage_entered_at", x."crm_company_id", x."pipeline_id", x."referred_by_contact_id", x."referred_by_crm_company_id", x."referral_source_id", x."referral_source_contact_id", x."merged_into", x."hubspot_deal_id", x."created_at", x."updated_at", x.updated_at AS k_ts FROM public.deals x
            WHERE x.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid AND x.updated_at <= v_ub
              AND (p_cursor_ts IS NULL OR (x.updated_at, x.id) > (p_cursor_ts, p_cursor_id))
            ORDER BY x.updated_at, x.id LIMIT p_limit + 1) q;
    WHEN 'crm_companies' THEN
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(q) ORDER BY q.k_ts, q.id), '[]'::jsonb) INTO v_rows
      FROM (SELECT x."id", x."org_company_id", x."name", x."domain", x."additional_domains", x."domain_normalized", x."logo_url", x."company_type", x."status", x."industry", x."sub_industry", x."employee_count", x."employee_range", x."annual_revenue", x."revenue_band", x."arr", x."mrr", x."total_contract_value", x."recent_deal_amount", x."recent_deal_close_date", x."contract_start_date", x."contract_end_date", x."renewal_date", x."year_founded", x."financing_status", x."website_url", x."address", x."hq_address", x."hq_city", x."hq_state", x."hq_country", x."hq_postal_code", x."regions_served", x."parent_company_id", x."customer_tier", x."segment", x."lifecycle_stage", x."key_products", x."description", x."linkedin_url", x."twitter_url", x."phone", x."main_contact_email", x."tags", x."notes", x."last_activity_date", x."next_activity_date", x."source_system", x."hubspot_company_id", x."created_at", x."updated_at", x.updated_at AS k_ts FROM public.crm_companies x
            WHERE x.org_company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid AND x.updated_at <= v_ub
              AND (p_cursor_ts IS NULL OR (x.updated_at, x.id) > (p_cursor_ts, p_cursor_id))
            ORDER BY x.updated_at, x.id LIMIT p_limit + 1) q;
    WHEN 'contacts' THEN
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(q) ORDER BY q.k_ts, q.id), '[]'::jsonb) INTO v_rows
      FROM (SELECT x."id", x."org_company_id", x."crm_company_id", x."first_name", x."last_name", x."full_name", x."email", x."additional_emails", x."email_domain_normalized", x."phone_work", x."phone_mobile", x."phone_other", x."job_title", x."department", x."seniority", x."timezone", x."locale", x."lifecycle_stage", x."status", x."contact_type", x."lead_status", x."buying_role", x."city", x."state_region", x."industry", x."lead_source", x."lead_source_original", x."lead_source_latest", x."campaign", x."utm_source", x."utm_medium", x."utm_campaign", x."preferred_channel", x."linkedin_url", x."website_url", x."description", x."tags", x."last_activity_date", x."last_outbound_touch_date", x."last_inbound_activity_date", x."next_activity_date", x."last_contacted_date", x."last_contact_at", x."source_system", x."hubspot_contact_id", x."created_at", x."updated_at", x.updated_at AS k_ts FROM public.contacts x
            WHERE x.org_company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid AND x.updated_at <= v_ub
              AND (p_cursor_ts IS NULL OR (x.updated_at, x.id) > (p_cursor_ts, p_cursor_id))
            ORDER BY x.updated_at, x.id LIMIT p_limit + 1) q;
    WHEN 'master_lenders' THEN
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(q) ORDER BY q.k_ts, q.id), '[]'::jsonb) INTO v_rows
      FROM (SELECT x."id", x."company_id", x."name", x."lender_type", x."tier", x."active", x."appetite_status", x."loan_types", x."sub_debt", x."cash_burn", x."sponsorship", x."sponsor_requirement", x."min_revenue", x."ebitda_min", x."min_deal", x."max_deal", x."sweet_spot_min", x."sweet_spot_max", x."min_gross_margin_pct", x."max_leverage", x."industries", x."industries_to_avoid", x."geographies", x."geographies_excluded", x."b2b_b2c", x."refinancing", x."company_requirements", x."deal_structure_notes", x."geo", x."city", x."state", x."country", x."website", x."linkedin_url", x."address", x."phone", x."email", x."contact_name", x."contact_title", x."contact_phone", x."contact_geography", x."relationship_owners", x."funding_source_notes", x."about_notes", x."tags", x."crm_company_id", x."criteria_confidence", x."criteria_reviewed_at", x."created_at", x."updated_at", x.updated_at AS k_ts FROM public.master_lenders x
            WHERE x.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid AND x.updated_at <= v_ub
              AND (p_cursor_ts IS NULL OR (x.updated_at, x.id) > (p_cursor_ts, p_cursor_id))
            ORDER BY x.updated_at, x.id LIMIT p_limit + 1) q;
    WHEN 'deal_lenders' THEN
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(q) ORDER BY q.k_ts, q.id), '[]'::jsonb) INTO v_rows
      FROM (SELECT x."id", x."deal_id", x."master_lender_id", x."selected_contact_id", x."name", x."stage", x."substage", x."tracking_status", x."notes", x."pass_reason", x."quote_amount", x."quote_rate", x."quote_term", x."score", x."tags", x."last_contact_at", x."submitted_at", x."passed_at", x."declined_at", x."approved_at", x."on_hold_at", x."on_deck_at", x."excluded_at", x."last_status_change_at", x."created_at", x."updated_at", x.updated_at AS k_ts FROM public.deal_lenders x
            WHERE EXISTS (SELECT 1 FROM public.deals d WHERE d.id = x.deal_id AND d.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid) AND x.updated_at <= v_ub
              AND (p_cursor_ts IS NULL OR (x.updated_at, x.id) > (p_cursor_ts, p_cursor_id))
            ORDER BY x.updated_at, x.id LIMIT p_limit + 1) q;
    WHEN 'deal_space_notes' THEN
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(q) ORDER BY q.k_ts, q.id), '[]'::jsonb) INTO v_rows
      FROM (SELECT x."id", x."deal_id", x."linked_lender_id", x."title", x."content", x."folder", x."tags", x."position", x."is_pinned", x."is_shared", x."template_name", x."created_at", x."updated_at", x.updated_at AS k_ts FROM public.deal_space_notes x
            WHERE EXISTS (SELECT 1 FROM public.deals d WHERE d.id = x.deal_id AND d.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid) AND x.updated_at <= v_ub
              AND (p_cursor_ts IS NULL OR (x.updated_at, x.id) > (p_cursor_ts, p_cursor_id))
            ORDER BY x.updated_at, x.id LIMIT p_limit + 1) q;
    WHEN 'deal_status_notes' THEN
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(q) ORDER BY q.k_ts, q.id), '[]'::jsonb) INTO v_rows
      FROM (SELECT x."id", x."deal_id", x."note", x."created_at", x.created_at AS k_ts FROM public.deal_status_notes x
            WHERE EXISTS (SELECT 1 FROM public.deals d WHERE d.id = x.deal_id AND d.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid) AND x.created_at <= v_ub
              AND (p_cursor_ts IS NULL OR (x.created_at, x.id) > (p_cursor_ts, p_cursor_id))
            ORDER BY x.created_at, x.id LIMIT p_limit + 1) q;
    WHEN 'lender_notes' THEN
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(q) ORDER BY q.k_ts, q.id), '[]'::jsonb) INTO v_rows
      FROM (SELECT x."id", x."company_id", x."master_lender_id", x."lender_name", x."body", x."is_flag", x."tags", x."created_at", x."updated_at", x.updated_at AS k_ts FROM public.lender_notes x
            WHERE x.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid AND x.updated_at <= v_ub
              AND (p_cursor_ts IS NULL OR (x.updated_at, x.id) > (p_cursor_ts, p_cursor_id))
            ORDER BY x.updated_at, x.id LIMIT p_limit + 1) q;
    WHEN 'tasks' THEN
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(q) ORDER BY q.k_ts, q.id), '[]'::jsonb) INTO v_rows
      FROM (SELECT x."id", x."company_id", x."deal_id", x."crm_company_id", x."contact_id", x."lender_id", x."project_id", x."section_id", x."parent_task_id", x."title", x."description", x."task_type", x."priority", x."status", x."start_date", x."due_date", x."due_at", x."completed_at", x."archived_at", x."position", x."is_starred", x."is_recurring", x."recurrence_rule", x."tags", x."blocker_note", x."asana_task_gid", x."created_at", x."updated_at", x.updated_at AS k_ts FROM public.tasks x
            WHERE x.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid AND x.updated_at <= v_ub
              AND (p_cursor_ts IS NULL OR (x.updated_at, x.id) > (p_cursor_ts, p_cursor_id))
            ORDER BY x.updated_at, x.id LIMIT p_limit + 1) q;
    WHEN 'claap_meetings' THEN
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(q) ORDER BY q.k_ts, q.id), '[]'::jsonb) INTO v_rows
      FROM (SELECT x."id", x."company_id", x."deal_id", x."matched_crm_company_id", x."matched_contact_id", x."matched_lender_id", x."claap_id", x."title", x."recording_url", x."transcript", x."ai_summary", x."key_decisions", x."next_steps", x."topics", x."sentiment", x."organizer_email", x."duration_seconds", x."started_at", x."status", x."call_type", x."match_source", x."match_method", x."match_confidence", x."match_reason", x."match_status", x."manually_locked", x."matched_at", x."created_at", x."updated_at", x.updated_at AS k_ts FROM public.claap_meetings x
            WHERE x.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid AND x.updated_at <= v_ub
              AND (p_cursor_ts IS NULL OR (x.updated_at, x.id) > (p_cursor_ts, p_cursor_id))
            ORDER BY x.updated_at, x.id LIMIT p_limit + 1) q;
    WHEN 'activity_logs' THEN
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(q) ORDER BY q.k_ts, q.id), '[]'::jsonb) INTO v_rows
      FROM (SELECT x."id", x."deal_id", x."activity_type", x."description", x."direction", x."subject", x."body", x."from_address", x."to_addresses", x."cc_addresses", x."bcc_addresses", x."sent_at", x."created_at", x.created_at AS k_ts FROM public.activity_logs x
            WHERE EXISTS (SELECT 1 FROM public.deals d WHERE d.id = x.deal_id AND d.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid) AND x.created_at <= v_ub
              AND (p_cursor_ts IS NULL OR (x.created_at, x.id) > (p_cursor_ts, p_cursor_id))
            ORDER BY x.created_at, x.id LIMIT p_limit + 1) q;
    WHEN 'deal_activity' THEN
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(q) ORDER BY q.k_ts, q.id), '[]'::jsonb) INTO v_rows
      FROM (SELECT x."id", x."deal_id", x."source", x."action_type", x."created_at",
        (SELECT CASE WHEN x."before" IS NULL OR pg_catalog.jsonb_typeof(x."before") <> 'object' THEN '{}'::jsonb
          ELSE COALESCE((
            SELECT pg_catalog.jsonb_object_agg(e.key, e.value) FROM pg_catalog.jsonb_each(x."before") e
            WHERE (e.key IN ('activity_kind','activity_label','deal_lender_id','deal_owner','lender_name','logged_at','narrative','note','stage','status')
                     AND pg_catalog.jsonb_typeof(e.value) IN ('string','null'))
               OR (e.key IN ('post_signing_hours','pre_signing_hours')
                     AND pg_catalog.jsonb_typeof(e.value) IN ('number','string','null'))
               OR (e.key = 'value' AND pg_catalog.jsonb_typeof(e.value) IN ('number','string','boolean','null'))
          ), '{}'::jsonb) END) AS "before",
        (SELECT CASE WHEN x."after" IS NULL OR pg_catalog.jsonb_typeof(x."after") <> 'object' THEN '{}'::jsonb
          ELSE COALESCE((
            SELECT pg_catalog.jsonb_object_agg(e.key, e.value) FROM pg_catalog.jsonb_each(x."after") e
            WHERE (e.key IN ('activity_kind','activity_label','deal_lender_id','deal_owner','lender_name','logged_at','narrative','note','stage','status')
                     AND pg_catalog.jsonb_typeof(e.value) IN ('string','null'))
               OR (e.key IN ('post_signing_hours','pre_signing_hours')
                     AND pg_catalog.jsonb_typeof(e.value) IN ('number','string','null'))
               OR (e.key = 'value' AND pg_catalog.jsonb_typeof(e.value) IN ('number','string','boolean','null'))
          ), '{}'::jsonb) END) AS "after",
        x.created_at AS k_ts FROM public.deal_activity x
            WHERE EXISTS (SELECT 1 FROM public.deals d WHERE d.id = x.deal_id AND d.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid) AND x.created_at <= v_ub
              AND (p_cursor_ts IS NULL OR (x.created_at, x.id) > (p_cursor_ts, p_cursor_id))
            ORDER BY x.created_at, x.id LIMIT p_limit + 1) q;
    ELSE RAISE EXCEPTION 'invalid_table' USING ERRCODE = '22023';
  END CASE;
  v_n := pg_catalog.jsonb_array_length(v_rows);
  v_more := v_n > p_limit;
  IF v_more THEN
    SELECT pg_catalog.jsonb_agg(e.v ORDER BY e.o) INTO v_rows FROM pg_catalog.jsonb_array_elements(v_rows) WITH ORDINALITY e(v, o) WHERE e.o <= p_limit;
    v_n := p_limit;
  END IF;
  v_last := CASE WHEN v_n > 0 THEN v_rows -> (v_n - 1) END;
  SELECT COALESCE(pg_catalog.jsonb_agg(e.v - 'k_ts' ORDER BY e.o), '[]'::jsonb) INTO v_rows FROM pg_catalog.jsonb_array_elements(v_rows) WITH ORDINALITY e(v, o);
  RETURN pg_catalog.jsonb_build_object(
    'table', p_table, 'records', v_rows, 'count', v_n, 'has_more', v_more, 'end_of_scan', NOT v_more,
    'scan_upper_bound', pg_catalog.to_char(v_ub AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'next_cursor', CASE WHEN v_more THEN pg_catalog.jsonb_build_object(
        'ts', pg_catalog.to_char(((v_last ->> 'k_ts')::timestamptz) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'id', v_last ->> 'id') END);
END $$;

CREATE OR REPLACE FUNCTION public.fn_kb_export_id_inventory_page(p_table text, p_limit integer, p_cursor_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_ids uuid[]; v_n integer; v_more boolean;
BEGIN
  IF p_table IS NULL OR p_table NOT IN ('companies','deals','crm_companies','contacts','master_lenders','deal_lenders','deal_space_notes','deal_status_notes','lender_notes','tasks','claap_meetings','activity_logs','deal_activity') THEN RAISE EXCEPTION 'invalid_table' USING ERRCODE = '22023'; END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN RAISE EXCEPTION 'invalid_limit' USING ERRCODE = '22023'; END IF;
  CASE p_table
    WHEN 'companies' THEN
      SELECT COALESCE(pg_catalog.array_agg(q.id ORDER BY q.id), ARRAY[]::uuid[]) INTO v_ids
      FROM (SELECT x.id FROM public.companies x WHERE x.id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid AND (p_cursor_id IS NULL OR x.id > p_cursor_id) ORDER BY x.id LIMIT p_limit + 1) q;
    WHEN 'deals' THEN
      SELECT COALESCE(pg_catalog.array_agg(q.id ORDER BY q.id), ARRAY[]::uuid[]) INTO v_ids
      FROM (SELECT x.id FROM public.deals x WHERE x.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid AND (p_cursor_id IS NULL OR x.id > p_cursor_id) ORDER BY x.id LIMIT p_limit + 1) q;
    WHEN 'crm_companies' THEN
      SELECT COALESCE(pg_catalog.array_agg(q.id ORDER BY q.id), ARRAY[]::uuid[]) INTO v_ids
      FROM (SELECT x.id FROM public.crm_companies x WHERE x.org_company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid AND (p_cursor_id IS NULL OR x.id > p_cursor_id) ORDER BY x.id LIMIT p_limit + 1) q;
    WHEN 'contacts' THEN
      SELECT COALESCE(pg_catalog.array_agg(q.id ORDER BY q.id), ARRAY[]::uuid[]) INTO v_ids
      FROM (SELECT x.id FROM public.contacts x WHERE x.org_company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid AND (p_cursor_id IS NULL OR x.id > p_cursor_id) ORDER BY x.id LIMIT p_limit + 1) q;
    WHEN 'master_lenders' THEN
      SELECT COALESCE(pg_catalog.array_agg(q.id ORDER BY q.id), ARRAY[]::uuid[]) INTO v_ids
      FROM (SELECT x.id FROM public.master_lenders x WHERE x.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid AND (p_cursor_id IS NULL OR x.id > p_cursor_id) ORDER BY x.id LIMIT p_limit + 1) q;
    WHEN 'deal_lenders' THEN
      SELECT COALESCE(pg_catalog.array_agg(q.id ORDER BY q.id), ARRAY[]::uuid[]) INTO v_ids
      FROM (SELECT x.id FROM public.deal_lenders x WHERE EXISTS (SELECT 1 FROM public.deals d WHERE d.id = x.deal_id AND d.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid) AND (p_cursor_id IS NULL OR x.id > p_cursor_id) ORDER BY x.id LIMIT p_limit + 1) q;
    WHEN 'deal_space_notes' THEN
      SELECT COALESCE(pg_catalog.array_agg(q.id ORDER BY q.id), ARRAY[]::uuid[]) INTO v_ids
      FROM (SELECT x.id FROM public.deal_space_notes x WHERE EXISTS (SELECT 1 FROM public.deals d WHERE d.id = x.deal_id AND d.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid) AND (p_cursor_id IS NULL OR x.id > p_cursor_id) ORDER BY x.id LIMIT p_limit + 1) q;
    WHEN 'deal_status_notes' THEN
      SELECT COALESCE(pg_catalog.array_agg(q.id ORDER BY q.id), ARRAY[]::uuid[]) INTO v_ids
      FROM (SELECT x.id FROM public.deal_status_notes x WHERE EXISTS (SELECT 1 FROM public.deals d WHERE d.id = x.deal_id AND d.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid) AND (p_cursor_id IS NULL OR x.id > p_cursor_id) ORDER BY x.id LIMIT p_limit + 1) q;
    WHEN 'lender_notes' THEN
      SELECT COALESCE(pg_catalog.array_agg(q.id ORDER BY q.id), ARRAY[]::uuid[]) INTO v_ids
      FROM (SELECT x.id FROM public.lender_notes x WHERE x.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid AND (p_cursor_id IS NULL OR x.id > p_cursor_id) ORDER BY x.id LIMIT p_limit + 1) q;
    WHEN 'tasks' THEN
      SELECT COALESCE(pg_catalog.array_agg(q.id ORDER BY q.id), ARRAY[]::uuid[]) INTO v_ids
      FROM (SELECT x.id FROM public.tasks x WHERE x.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid AND (p_cursor_id IS NULL OR x.id > p_cursor_id) ORDER BY x.id LIMIT p_limit + 1) q;
    WHEN 'claap_meetings' THEN
      SELECT COALESCE(pg_catalog.array_agg(q.id ORDER BY q.id), ARRAY[]::uuid[]) INTO v_ids
      FROM (SELECT x.id FROM public.claap_meetings x WHERE x.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid AND (p_cursor_id IS NULL OR x.id > p_cursor_id) ORDER BY x.id LIMIT p_limit + 1) q;
    WHEN 'activity_logs' THEN
      SELECT COALESCE(pg_catalog.array_agg(q.id ORDER BY q.id), ARRAY[]::uuid[]) INTO v_ids
      FROM (SELECT x.id FROM public.activity_logs x WHERE EXISTS (SELECT 1 FROM public.deals d WHERE d.id = x.deal_id AND d.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid) AND (p_cursor_id IS NULL OR x.id > p_cursor_id) ORDER BY x.id LIMIT p_limit + 1) q;
    WHEN 'deal_activity' THEN
      SELECT COALESCE(pg_catalog.array_agg(q.id ORDER BY q.id), ARRAY[]::uuid[]) INTO v_ids
      FROM (SELECT x.id FROM public.deal_activity x WHERE EXISTS (SELECT 1 FROM public.deals d WHERE d.id = x.deal_id AND d.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid) AND (p_cursor_id IS NULL OR x.id > p_cursor_id) ORDER BY x.id LIMIT p_limit + 1) q;
    ELSE RAISE EXCEPTION 'invalid_table' USING ERRCODE = '22023';
  END CASE;
  v_n := COALESCE(pg_catalog.array_length(v_ids, 1), 0);
  v_more := v_n > p_limit;
  IF v_more THEN v_ids := v_ids[1:p_limit]; v_n := p_limit; END IF;
  RETURN pg_catalog.jsonb_build_object('table', p_table, 'ids', pg_catalog.to_jsonb(v_ids), 'count', v_n,
    'has_more', v_more, 'end_of_inventory', NOT v_more,
    'next_cursor_id', CASE WHEN v_more THEN v_ids[v_n]::text END);
END $$;

CREATE OR REPLACE FUNCTION public.fn_kb_export_verify_active_ids(p_table text, p_candidate_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_ids uuid[]; v_n integer;
BEGIN
  IF p_table IS NULL OR p_table NOT IN ('companies','deals','crm_companies','contacts','master_lenders','deal_lenders','deal_space_notes','deal_status_notes','lender_notes','tasks','claap_meetings','activity_logs','deal_activity') THEN RAISE EXCEPTION 'invalid_table' USING ERRCODE = '22023'; END IF;
  v_n := COALESCE(pg_catalog.array_length(p_candidate_ids, 1), 0);
  IF v_n < 1 OR v_n > 1000 OR pg_catalog.array_position(p_candidate_ids, NULL) IS NOT NULL THEN RAISE EXCEPTION 'invalid_candidate_ids' USING ERRCODE = '22023'; END IF;
  CASE p_table
    WHEN 'companies' THEN
      SELECT COALESCE(pg_catalog.array_agg(x.id ORDER BY x.id), ARRAY[]::uuid[]) INTO v_ids
      FROM public.companies x WHERE x.id = ANY(p_candidate_ids) AND x.id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid;
    WHEN 'deals' THEN
      SELECT COALESCE(pg_catalog.array_agg(x.id ORDER BY x.id), ARRAY[]::uuid[]) INTO v_ids
      FROM public.deals x WHERE x.id = ANY(p_candidate_ids) AND x.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid;
    WHEN 'crm_companies' THEN
      SELECT COALESCE(pg_catalog.array_agg(x.id ORDER BY x.id), ARRAY[]::uuid[]) INTO v_ids
      FROM public.crm_companies x WHERE x.id = ANY(p_candidate_ids) AND x.org_company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid;
    WHEN 'contacts' THEN
      SELECT COALESCE(pg_catalog.array_agg(x.id ORDER BY x.id), ARRAY[]::uuid[]) INTO v_ids
      FROM public.contacts x WHERE x.id = ANY(p_candidate_ids) AND x.org_company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid;
    WHEN 'master_lenders' THEN
      SELECT COALESCE(pg_catalog.array_agg(x.id ORDER BY x.id), ARRAY[]::uuid[]) INTO v_ids
      FROM public.master_lenders x WHERE x.id = ANY(p_candidate_ids) AND x.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid;
    WHEN 'deal_lenders' THEN
      SELECT COALESCE(pg_catalog.array_agg(x.id ORDER BY x.id), ARRAY[]::uuid[]) INTO v_ids
      FROM public.deal_lenders x WHERE x.id = ANY(p_candidate_ids) AND EXISTS (SELECT 1 FROM public.deals d WHERE d.id = x.deal_id AND d.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid);
    WHEN 'deal_space_notes' THEN
      SELECT COALESCE(pg_catalog.array_agg(x.id ORDER BY x.id), ARRAY[]::uuid[]) INTO v_ids
      FROM public.deal_space_notes x WHERE x.id = ANY(p_candidate_ids) AND EXISTS (SELECT 1 FROM public.deals d WHERE d.id = x.deal_id AND d.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid);
    WHEN 'deal_status_notes' THEN
      SELECT COALESCE(pg_catalog.array_agg(x.id ORDER BY x.id), ARRAY[]::uuid[]) INTO v_ids
      FROM public.deal_status_notes x WHERE x.id = ANY(p_candidate_ids) AND EXISTS (SELECT 1 FROM public.deals d WHERE d.id = x.deal_id AND d.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid);
    WHEN 'lender_notes' THEN
      SELECT COALESCE(pg_catalog.array_agg(x.id ORDER BY x.id), ARRAY[]::uuid[]) INTO v_ids
      FROM public.lender_notes x WHERE x.id = ANY(p_candidate_ids) AND x.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid;
    WHEN 'tasks' THEN
      SELECT COALESCE(pg_catalog.array_agg(x.id ORDER BY x.id), ARRAY[]::uuid[]) INTO v_ids
      FROM public.tasks x WHERE x.id = ANY(p_candidate_ids) AND x.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid;
    WHEN 'claap_meetings' THEN
      SELECT COALESCE(pg_catalog.array_agg(x.id ORDER BY x.id), ARRAY[]::uuid[]) INTO v_ids
      FROM public.claap_meetings x WHERE x.id = ANY(p_candidate_ids) AND x.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid;
    WHEN 'activity_logs' THEN
      SELECT COALESCE(pg_catalog.array_agg(x.id ORDER BY x.id), ARRAY[]::uuid[]) INTO v_ids
      FROM public.activity_logs x WHERE x.id = ANY(p_candidate_ids) AND EXISTS (SELECT 1 FROM public.deals d WHERE d.id = x.deal_id AND d.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid);
    WHEN 'deal_activity' THEN
      SELECT COALESCE(pg_catalog.array_agg(x.id ORDER BY x.id), ARRAY[]::uuid[]) INTO v_ids
      FROM public.deal_activity x WHERE x.id = ANY(p_candidate_ids) AND EXISTS (SELECT 1 FROM public.deals d WHERE d.id = x.deal_id AND d.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid);
    ELSE RAISE EXCEPTION 'invalid_table' USING ERRCODE = '22023';
  END CASE;
  RETURN pg_catalog.jsonb_build_object('table', p_table, 'checked', v_n,
    'active_ids', pg_catalog.to_jsonb(v_ids), 'active_count', COALESCE(pg_catalog.array_length(v_ids, 1), 0), 'complete', true);
END $$;

REVOKE ALL ON FUNCTION public.fn_kb_export_table_page(text, integer, timestamptz, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_kb_export_id_inventory_page(text, integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_kb_export_verify_active_ids(text, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kb_export_table_page(text, integer, timestamptz, uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_kb_export_id_inventory_page(text, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_kb_export_verify_active_ids(text, uuid[]) TO service_role;