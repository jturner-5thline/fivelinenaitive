DO $$
DECLARE
  uid uuid := 'e09ac474-096d-444a-bd1d-f53d636eed92';
BEGIN
  UPDATE public.profiles SET approved_by = NULL WHERE approved_by = uid;
  UPDATE public.lender_notes_history SET user_id = NULL WHERE user_id = uid;
  UPDATE public.deal_flag_notes SET resolved_by = NULL WHERE resolved_by = uid;
  DELETE FROM public.deal_flag_notes WHERE user_id = uid;
  UPDATE public.system_announcements SET created_by = NULL WHERE created_by = uid;
  UPDATE public.ip_allowlist SET created_by = NULL WHERE created_by = uid;
  DELETE FROM public.user_data_permissions WHERE created_by = uid;
  UPDATE public.workflow_versions SET created_by = NULL WHERE created_by = uid;
  UPDATE public.deal_claap_recordings SET linked_by = NULL WHERE linked_by = uid;
  UPDATE public.lender_sync_requests SET processed_by = NULL WHERE processed_by = uid;
  UPDATE public.deal_memos SET created_by = NULL WHERE created_by = uid;
  UPDATE public.deal_memos SET updated_by = NULL WHERE updated_by = uid;
  DELETE FROM public.deal_space_financials WHERE user_id = uid;
  UPDATE public.tasks SET completed_by = NULL WHERE completed_by = uid;
  UPDATE public.tasks SET created_by = NULL WHERE created_by = uid;
  DELETE FROM public.email_thread_labels WHERE applied_by = uid;
  UPDATE public.projects SET created_by = NULL WHERE created_by = uid;
  UPDATE public.task_tags SET created_by = NULL WHERE created_by = uid;
  UPDATE public.task_comments SET author_id = NULL WHERE author_id = uid;
  UPDATE public.task_activity SET actor_id = NULL WHERE actor_id = uid;
  DELETE FROM public.zapier_webhooks WHERE user_id = uid;
  UPDATE public.claap_routing_rules SET created_by = NULL WHERE created_by = uid;
  UPDATE public.claap_routing_tasks SET assigned_to = NULL WHERE assigned_to = uid;
  UPDATE public.claap_integration_config SET fallback_admin_user_id = NULL WHERE fallback_admin_user_id = uid;
  UPDATE public.client_requests SET created_by = NULL WHERE created_by = uid;
  UPDATE public.client_request_drafts SET approved_by = NULL WHERE approved_by = uid;
  UPDATE public.client_request_drafts SET created_by = NULL WHERE created_by = uid;
  UPDATE public.client_request_drafts SET rejected_by = NULL WHERE rejected_by = uid;
  UPDATE public.client_request_audit_log SET performed_by = NULL WHERE performed_by = uid;
  UPDATE public.user_permissions SET updated_by = NULL WHERE updated_by = uid;
  UPDATE public.company_feature_overrides SET updated_by = NULL WHERE updated_by = uid;
  UPDATE public.vdr_documents SET uploaded_by = NULL WHERE uploaded_by = uid;
  UPDATE public.vdr_irl_requests SET created_by = NULL WHERE created_by = uid;
  UPDATE public.vdr_tasks SET assignee = NULL WHERE assignee = uid;
  UPDATE public.vdr_tasks SET created_by = NULL WHERE created_by = uid;
  UPDATE public.uploaded_items SET uploaded_by = NULL WHERE uploaded_by = uid;
  UPDATE public.uploaded_item_checklist_mapping SET created_by = NULL WHERE created_by = uid;
  UPDATE public.cash_flow_imports SET imported_by = NULL WHERE imported_by = uid;
  UPDATE public.deal_aliases SET created_by = NULL WHERE created_by = uid;
  UPDATE public.platform_settings SET updated_by = NULL WHERE updated_by = uid;

  DELETE FROM auth.users WHERE id = uid;
END $$;