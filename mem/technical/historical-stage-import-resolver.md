---
name: Historical stage import resolver policy
description: Resolver and multi-match policy for sheet-driven historical deal_stage_history imports (5th Line backfill batches 2+)
type: preference
---
Stage resolution: composite (pipeline_id, stage_id). Use In Development overloaded IDs per pipeline-stage-id-overloading memory. NDA/Needs List Sent in Active Deals → stage_id 'ndaneeds-list-sent' (canonical, not orphan).

Multi-match policy: auto-resolve when exactly one candidate has sim=1.00 on normalized name (lowercase, alphanumeric-only). Skip + log to skipped_ambiguous ONLY when ≥2 candidates tie at sim=1.00. Never auto-pick when no candidate reaches 1.00.

Conflict policy: overwrite-and-log. Log old_changed_at → new_changed_at to deal_audit_log when changed_at differs.

Time anchor: (sheet_date || ' 12:00:00')::timestamp AT TIME ZONE 'America/New_York' (DST-aware).

Audit sink: deal_audit_log with action_type='stage_history_import', metadata.run_id, metadata.op ∈ insert|overwrite|skipped_ambiguous. Flag sibling-deal cases with metadata.flag='sibling_deal_exists'.
