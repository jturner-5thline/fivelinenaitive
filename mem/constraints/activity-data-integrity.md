---
name: Activity data integrity (no backfill, no fabrication)
description: Global, deal-agnostic rule — activity records must be actual source data only; never backfilled, reconstructed, inferred, simulated, fabricated, or labeled as such
type: constraint
---
**Scope:** ALL deals across the platform — active, paused, archived, closed, historical imports, and any future imports. No exceptions, no subsets.

**Rules:**
- Activity feeds/timelines/audit displays must use only **actual source activity records** as-is.
- Do NOT backfill, reconstruct, infer, simulate, or fabricate activity rows.
- Do NOT label, tag, store, or present any activity entry as "backfilled", "imported", "reconstructed", or similar — all activity is treated uniformly as real source data.
- Applies to `deal_audit_log` and any other user-facing activity surface.
- Historical stage imports (e.g. `historical_import_5th_line_2026_06_01_batch*`) write ONLY to `deal_stage_history` + JSON forensic archives under `/mnt/documents/`. They must NEVER write activity rows to `deal_audit_log`. See [Historical Stage Import Resolver](mem://technical/historical-stage-import-resolver).

**Why:** Backfilled activity pollutes the user-facing Activity feed and misrepresents what actually happened. Batch 1 of the 2026-06-01 historical import inserted 66 such rows and they had to be hard-deleted.
