/**
 * Shared helpers for the Insights MCP tools.
 *
 * Keep this import-safe: function definitions only, no env reads or I/O at
 * module scope (the MCP entry is evaluated at build time and on cold start).
 */

/** Global test-deal exclusions — mirrors the rule applied across the app UI. */
const EXCLUDED_EXACT = new Set(["test-niki's store", "example deal"]);

export function isExcludedDealName(name: string | null | undefined): boolean {
  const n = (name ?? "").trim().toLowerCase();
  if (!n) return false;
  if (EXCLUDED_EXACT.has(n)) return true;
  return n.startsWith("test ");
}

export function monthKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function sum(values: Array<number | null | undefined>): number {
  return values.reduce<number>((acc, v) => acc + (Number(v) || 0), 0);
}

export function groupAggregate<T>(
  rows: T[],
  keyOf: (row: T) => string,
  valueOf: (row: T) => number,
): Array<{ key: string; count: number; total_value: number }> {
  const map = new Map<string, { key: string; count: number; total_value: number }>();
  for (const row of rows) {
    const key = keyOf(row) || "unknown";
    const entry = map.get(key) ?? { key, count: 0, total_value: 0 };
    entry.count += 1;
    entry.total_value += Number(valueOf(row)) || 0;
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => b.total_value - a.total_value);
}

/** Tables the generic `query_insights_dataset` tool may read (read-only, RLS-scoped). */
export const INSIGHTS_DATASETS = [
  "deals",
  "deal_lenders",
  "deal_pipelines",
  "deal_stage_history",
  "deal_milestones",
  "deal_computed_metrics",
  "deal_stage_durations",
  "deal_stage_transitions",
  "outstanding_items",
  "tasks",
  "activity_logs",
  "contacts",
  "crm_companies",
  // Contact / CRM satellites
  "contact_activities",
  "contact_audit_log",
  "contact_company_associations",
  "contact_company_match_audit",
  "contact_field_suggestions",
  "contact_field_suggestion_audit",
  "contact_tagging_rules",
  "contact_types",
  "crm_contact_attachments",
  "crm_company_activities",
  "crm_company_attachments",
  "crm_company_team",
  "crm_industry_options",
  // Workspace/account company records and their settings
  "companies",
  "company_settings",
  "company_members",
  "company_features",
  "company_feature_overrides",
  "company_invitations",
  "company_join_requests",
  "company_email_style_guide",
  "company_write_up_fields",
  "company_agent_access",
  "partner_companies",
  "partner_contacts",
  "wf_contacts",
  "master_lenders",
  "custom_metrics",
  "insights_metric_targets",
  "metric_manual_inputs",
  "dashboard_grid_layouts",
  "dashboard_layouts",
  "quickbooks_invoices",
  "quickbooks_customers",
  "quickbooks_payments",
  "quickbooks_expenses",
  "quickbooks_bills",
  "quickbooks_reports",
  "qbo_pnl_snapshots",
  "qbo_cashflow_snapshots",
  "claap_meetings",
  "team_interaction_metrics",
  "deal_writeups",
  "deal_memos",
  "deal_checklist_items",
  "deal_checklist_status",
  "deal_attachments",
  "deal_status_notes",
  "deal_financial_data",
  "deal_flag_notes",
  "deal_ownership",
  "deal_space_notes",
  "deal_activity",
  "contact_deals",
  "deal_pipeline_configs",
  // Funding-source (lender) directory and its satellites
  "lender_contacts",
  "lender_notes",
  "lender_notes_history",
  "lender_attachments",
  "lender_audit_logs",
  "lender_disqualifications",
  "lender_doc_flags",
  "lender_fit_attributes",
  "lender_match_rules",
  "lender_pass_detections",
  "lender_pass_patterns",
  "lender_recommendation_outcomes",
  "lender_recommendation_run_items",
  "lender_recommendation_runs",
  "lender_stage_configs",
  "lender_sync_requests",
  "lender_sync_settings",
  "funding_source_acquisition_plans",
  "deal_lender_recommendation_exclusions",
  "lender_outcome_stats",
  "lender_match_weight_calibrations",
  "lender_qa_regression_tests",
  "lender_sync_request_decisions",
  "lender_duplicate_dismissals",
  "lender_history_warning_dismissals",
  "pending_lender_notifications",
  "external_deal_lenders",
  "deal_saas_lenders",
  "wf_lenders",
  // Flex (lender sync) tables
  "flex_sync_settings",
  "flex_sync_history",
  "flex_notifications",
  "flex_info_notifications",
  "flex_auto_removal_audit",
  // Deal satellites — meetings, documents, deal space, memos, governance
  "deal_meeting_history",
  "deal_call_transcripts",
  "deal_claap_recordings",
  "meeting_deal_links",
  "meeting_synthesized_notes",
  "meeting_task_suggestions",
  "meeting_holds",
  "meeting_claap_resolution",
  "deal_space_documents",
  "deal_space_document_summaries",
  "deal_financial_files",
  "deal_financial_insights",
  "deal_drive_folders",
  "deal_data_room_custom_folders",
  "deal_document_exclusions",
  "deal_space_conversations",
  "deal_space_messages",
  "deal_space_note_versions",
  "deal_space_note_comments",
  "deal_space_note_templates",
  "deal_space_financials",
  "deal_memo_approvals",
  "deal_memo_comments",
  "deal_memo_views",
  "deal_memo_audit_logs",
  "deal_stage_history_notes",
  "deal_status_report_drafts",
  "deal_emails",
  "deal_email_prompts",
  "deal_info_requests",
  "client_requests",
  "client_request_drafts",
  "deal_audit_log",
  "deal_access_requests",
  "deal_advance_reasons",
  "deal_aliases",
  "deal_sla_rules",
  "deal_saved_views",
  "deal_ai_settings",
  "deal_ai_status_snapshots",
  "deal_research_cache",
  "deal_fit_profiles",
  "deal_calendar_items",
  "deal_kpi_links",
  "deal_saas_model",
  "deal_saas_mappings",
  "deal_saas_sensitivity",
  "finserv_deal_projects",
  "cashflow_deal_overrides",
  "pending_deal_suggestions",
  "duplicate_deal_suppressions",
  "pending_deal_notifications",
  "external_deals",
  // Task satellites
  "task_activity",
  "task_attachments",
  "task_collaborators",
  "task_comments",
  "task_dependencies",
  "task_followers",
  "task_labels",
  "task_label_assignments",
  "task_tags",
  "task_tag_assignments",
  "task_time_entries",
  "task_templates",
  "task_projects",
  "task_watchers",
  "task_mentions",
  "task_saved_views",
  // Agenda comments
  "agenda_comment_threads",
  "agenda_comments",
] as const;

export type InsightsDataset = (typeof INSIGHTS_DATASETS)[number];

/**
 * Insights dashboard catalog. Mirrors `src/config/insightsDashboards.ts`; kept
 * inline so the MCP bundle stays free of app-path aliases.
 */
export const DASHBOARD_OPTIONS = [
  { id: "management-snapshot", name: "Weekly Rundown", isFavorite: true, folder: "management-insights" },
  { id: "revenue-customers", name: "Revenue & Customers", isFavorite: false, folder: "financial" },
  { id: "controller-dashboard", name: "Controller Dashboard", isFavorite: false, folder: "financial" },
  { id: "sales-bd-page", name: "Sales & BD", isFavorite: false, folder: "sales-bd" },
  { id: "sales-dashboard-v2", name: "Sales Dashboard", isFavorite: false, folder: "sales-bd" },
  { id: "finserv-financial-metrics", name: "FinServ Financial Metrics", isFavorite: false, folder: null },
  { id: "consolidated-debt-pipeline", name: "Debt Advisory Metrics", isFavorite: false, folder: "sales-bd" },
  { id: "lender-intelligence", name: "Lender Intelligence Dashboard", isFavorite: false, folder: "sales-bd" },
  { id: "sales-bd-roi", name: "Sales & BD ROI", isFavorite: false, folder: "sales-bd" },
  { id: "management-review", name: "Insights Dashboard", isFavorite: false, folder: "management-insights" },
] as const;
