import { z } from "zod";

/** Explicit schemas generated from inspected columns; identity, tenancy and provenance stay server-owned. */
export const LENDER_RELATED_FIELDS = {
  lender_fit_attributes: {
    summary: z.string().max(20000).nullable().optional(),
    positive_signals: z.record(z.unknown()).or(z.array(z.unknown())).optional(),
    negative_signals: z.record(z.unknown()).or(z.array(z.unknown())).optional(),
    exclusions: z.record(z.unknown()).or(z.array(z.unknown())).optional(),
    nuanced_preferences: z.record(z.unknown()).or(z.array(z.unknown())).optional(),
  },
  lender_disqualifications: {
    deal_id: z.string().uuid().optional(),
    deal_lender_id: z.string().uuid().nullable().optional(),
    reason_category: z.enum(["deal_size_mismatch", "industry_exclusion", "geographic_restriction", "risk_profile_concerns", "timing_issues", "relationship_issues", "terms_mismatch", "other"]).optional(),
    reason_details: z.string().max(20000).nullable().optional(),
    deal_size: z.number().finite().nullable().optional(),
    deal_industry: z.string().max(20000).nullable().optional(),
    deal_geography: z.string().max(20000).nullable().optional(),
  },
  lender_doc_flags: {
    has_nda: z.boolean().optional(),
    has_marketing: z.boolean().optional(),
  },
  funding_source_acquisition_plans: {
    year: z.number().int().optional(),
    cadence: z.string().max(20000).optional(),
    period: z.number().int().optional(),
    target_count: z.number().int().optional(),
  },
  lender_match_rules: {
    rule_type: z.string().max(20000).optional(),
    applies_when: z.record(z.unknown()).or(z.array(z.unknown())).nullable().optional(),
    reason: z.string().max(20000).optional(),
    delta: z.number().int().nullable().optional(),
    active: z.boolean().optional(),
  },
  lender_pass_detections: {
    deal_id: z.string().uuid().optional(),
    deal_lender_id: z.string().uuid().nullable().optional(),
    gmail_message_id: z.string().max(20000).optional(),
    thread_id: z.string().max(20000).nullable().optional(),
    sender_email: z.string().max(20000).nullable().optional(),
    sender_name: z.string().max(20000).nullable().optional(),
    confidence: z.string().max(20000).optional(),
    is_pass: z.boolean().optional(),
    reason_summary: z.string().max(20000).nullable().optional(),
    source_quote: z.string().max(20000).nullable().optional(),
    status: z.string().max(20000).optional(),
    edited_reason: z.string().max(20000).nullable().optional(),
    raw_classification: z.record(z.unknown()).or(z.array(z.unknown())).nullable().optional(),
  },
  lender_pass_patterns: {
    reason_category: z.enum(["deal_size_mismatch", "industry_exclusion", "geographic_restriction", "risk_profile_concerns", "timing_issues", "relationship_issues", "terms_mismatch", "other"]).optional(),
    pattern_type: z.string().max(20000).optional(),
    pattern_value: z.string().max(20000).optional(),
    confidence_score: z.number().finite().nullable().optional(),
  },
  lender_sync_requests: {
    source_system: z.string().max(20000).optional(),
    source_lender_id: z.string().max(20000).nullable().optional(),
    request_type: z.string().max(20000).optional(),
    incoming_data: z.record(z.unknown()).or(z.array(z.unknown())).optional(),
    changes_diff: z.record(z.unknown()).or(z.array(z.unknown())).nullable().optional(),
    status: z.string().max(20000).optional(),
    processing_notes: z.string().max(20000).nullable().optional(),
    confidence: z.string().max(20000).nullable().optional(),
    suggested_action: z.string().max(20000).nullable().optional(),
    match_candidates: z.record(z.unknown()).or(z.array(z.unknown())).optional(),
    match_reason: z.string().max(20000).nullable().optional(),
    conflict_count: z.number().int().optional(),
    contact_change_count: z.number().int().optional(),
    assigned_reviewer_id: z.string().uuid().nullable().optional(),
  },
  lender_sync_request_decisions: {
    request_id: z.string().uuid().optional(),
    field_name: z.string().max(20000).optional(),
    scope: z.string().max(20000).optional(),
    existing_value: z.record(z.unknown()).or(z.array(z.unknown())).nullable().optional(),
    incoming_value: z.record(z.unknown()).or(z.array(z.unknown())).nullable().optional(),
    action: z.string().max(20000).optional(),
    notes: z.string().max(20000).nullable().optional(),
  },
  lender_duplicate_dismissals: {
    dismissal_key: z.string().max(20000).optional(),
    lender_ids: z.array(z.string().uuid()).max(100).optional(),
  },
  lender_history_warning_dismissals: {
    deal_id: z.string().uuid().optional(),
  },
} as const;

export type LenderRelatedTable = keyof typeof LENDER_RELATED_FIELDS;
