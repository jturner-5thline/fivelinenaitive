---
name: Historical stage import resolver
description: Deterministic resolver policy + audit-trail destination for historical_import_* batches
type: feature
---
**Resolver policy (effective Batch 2 / rows 52+):**
- Exact-normalized match on `deals.company` within the 5th Line tenant (`company_id='44556c46-9127-4b12-b14e-d6fee784afcf'`).
- Strict skip only when ≥2 candidates tie at sim=1.00. Single 1.00 match wins; <1.00 best match wins if uniquely highest above threshold.
- Pipeline-aware stage resolution: every (sheet label → stage_id) lookup MUST scope to the target pipeline_id (default = "In Development" `40b17dfb-9122-49e0-bf7c-5aa993d5d615`). Stage IDs in In Development are overloaded (`closed-won` = "Indication of Interest"). See [Pipeline Stage IDs](mem://technical/pipeline-stage-id-overloading).
- Timestamps: sheet date at 12:00 America/New_York → UTC (DST-aware).
- Rule 5 (upsert-and-log): if `(deal_id, pipeline_id, stage_id)` row already exists in `deal_stage_history`, overwrite `changed_at` on the oldest such row; otherwise insert. `source='backfill'` on stage history rows.

**Audit-trail destination — DO NOT write to `deal_audit_log`:**
- Historical import runs MUST NOT insert `stage_history_import` or `stage_history_overwrite` rows into `deal_audit_log`. Those entries polluted the user-facing Activity feed in Batch 1 and were hard-deleted (66 rows on 2026-06-01).
- Forensic record lives in `/mnt/documents/historical_batch<N>_audit_archive.json` — one file per run, exported BEFORE the transaction commits. Schema mirrors the old `deal_audit_log` row shape: `{deal_id, action_type, entity_type, entity_id, entity_name, metadata: {run_id, sheet_name, label, sheet_date, pipeline_id, stage_id, new_changed_at, op: 'insert'|'overwrite', old_changed_at?, overwrote_history_id?, flag?, sibling_deal_id?}, source, created_at}`.
- Rollback trail (overwrote_history_id, old_changed_at) lives ONLY in the JSON archive — sufficient for forensic replay.

**Flags:** sibling-deal collisions (e.g. PacketFabric) carry `metadata.flag='sibling_deal_exists'` + `sibling_deal_id` in the JSON archive entry.

**Batch 1 completed 2026-06-01:** 50 deals, 7 inserts + 59 overwrites in `deal_stage_history`, 66-row audit archive at `/mnt/documents/historical_batch1_audit_archive.json`. `deal_audit_log` rows purged.
