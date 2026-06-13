/**
 * Admin Agent — "Verify Deal Information" capability.
 *
 * Shared TypeScript types used by both the client (Ask nAItive AI chat
 * rendering, settings UI) and the server (supabase/functions/_shared/
 * adminAgentAudit.ts). Keep the field names identical to the table
 * columns and to the JSON returned by the audit service so the chat
 * model can render the same shape without translation.
 */

export type AdminAgentReviewStatus =
  | 'fresh'
  | 'may_need_review'
  | 'no_post_creation_update_recorded';

export type AdminAgentCriticalField =
  | 'status'
  | 'stage'
  | 'milestones'
  | 'status_notes'
  | 'funding_sources';

export interface AdminAgentSettings {
  id: string;
  company_id: string;
  enabled: boolean;
  active_pipeline_ids: string[];
  active_stage_ids: string[];
  critical_fields: AdminAgentCriticalField[];
  stale_threshold_business_days: number;
  friday_sweep_enabled: boolean;
  default_chat_behavior: {
    portfolio_page_size: number;
    show_more: boolean;
    ask_before_writes: boolean;
    group_by: 'deal' | 'field';
  };
  advisory_tone: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminAgentUserOverride {
  id: string;
  company_id: string;
  user_id: string;
  enabled: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminAgentHoliday {
  id: string;
  company_id: string;
  holiday_date: string; // YYYY-MM-DD
  label: string;
  created_at: string;
}

/**
 * One auditable section on a deal. Funding Sources is split into one
 * `AdminAgentItemFinding` per lender so per-lender freshness can be
 * surfaced and confirmed independently.
 */
export interface AdminAgentItemFinding {
  /** Stable field key. For per-lender items: `funding_source:<lender_id>`. */
  field: string;
  /** Display label. */
  label: string;
  /** ISO timestamp of last meaningful update, or null when never updated. */
  last_updated_at: string | null;
  /** ISO timestamp the underlying entity was created. */
  created_at: string | null;
  /** Business days elapsed since last update, or null when never updated. */
  business_days_since_last_update: number | null;
  /** True when an explicit post-creation update exists. */
  has_post_creation_update: boolean;
  review_status: AdminAgentReviewStatus;
  /** One-line context shown to the user. */
  detail?: string;
  /** Present for per-lender items so the UI can deep-link. */
  lender_id?: string;
}

export interface AdminAgentDealAudit {
  deal_id: string;
  deal_name: string;
  pipeline_id: string | null;
  stage: string | null;
  status: string | null;
  /** All items in spec order: status, stage, milestones, status_notes, funding_sources, then per-lender. */
  items: AdminAgentItemFinding[];
  flagged_count: number;
  never_updated_count: number;
  /** Highest BD age across all items (drives portfolio sort). */
  oldest_business_days: number;
}

export interface AdminAgentPortfolioAudit {
  mode: 'portfolio';
  audited_at: string;
  pipeline_id: string | null;
  stale_threshold_business_days: number;
  total_evaluated: number;
  total_flagged: number;
  total_clean: number;
  total_never_updated: number;
  total_stale_only: number;
  page: AdminAgentDealAudit[];
  show_more_available: boolean;
  next_offset: number | null;
  friday_sweep: boolean;
}

export interface AdminAgentSingleDealAudit {
  mode: 'single_deal';
  audited_at: string;
  stale_threshold_business_days: number;
  deal: AdminAgentDealAudit;
  friday_sweep: boolean;
}

export type AdminAgentAuditResult =
  | AdminAgentPortfolioAudit
  | AdminAgentSingleDealAudit;

export interface AdminAgentAuditRunRecord {
  id: string;
  company_id: string;
  user_id: string | null;
  scope_type: 'portfolio' | 'single_deal';
  deal_ids: string[];
  findings_summary: Record<string, unknown>;
  total_evaluated: number;
  total_flagged: number;
  total_never_updated: number;
  triggered_by: 'chat' | 'friday_sweep' | 'manual' | 'scheduled';
  created_at: string;
}

/**
 * Stage 2 — captured follow-up intent. The chat layer parses the
 * user's natural-language reply into one row per (deal, field [, lender])
 * with an action of update / create / ignore. Stage 2 only stores; the
 * execution workflows live in Duties 2–4 and consume these rows.
 */
export type AdminAgentSelectionAction = 'update' | 'create' | 'ignore';
export type AdminAgentSelectionStatus = 'pending' | 'queued' | 'executed' | 'cancelled';

export interface AdminAgentSelectedAction {
  id: string;
  audit_run_id: string | null;
  company_id: string;
  user_id: string;
  deal_id: string | null;
  field: AdminAgentCriticalField;
  lender_id: string | null;
  action: AdminAgentSelectionAction;
  note: string | null;
  source_message: string | null;
  status: AdminAgentSelectionStatus;
  created_at: string;
  updated_at: string;
}
