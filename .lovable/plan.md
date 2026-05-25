
# Flex Sync Requests — Triage & Merge Review Overhaul

This is a sizable change touching DB schema, a new matching engine, and a rebuilt panel. Proposing a phased plan so we can ship incrementally and you can review after each phase.

## Scope summary

Today `LenderSyncRequestsPanel` is a flat queue with `new_lender / update_existing / merge_conflict` cards and a simple merge dialog. We will turn it into:

- 4-tab triage (New / Likely Match / Conflict Review / Completed)
- A scored matching engine producing confidence labels + candidates per request
- A side-by-side review drawer with field-level decisions
- Separate contact reconciliation flow
- Audit log of every accepted/rejected field change
- Expanded status model and safer bulk actions

## Phase 1 — Data model & matching engine (foundation)

**Migration**
- `lender_sync_requests`: add columns
  - `confidence` text  (`exact_duplicate | likely_duplicate | possible_match | needs_review | none`)
  - `suggested_action` text (`add | update | merge | review`)
  - `match_candidates` jsonb  (array of `{ lender_id, score, reasons[] }`)
  - `match_reason` text  (top reason, denormalized for table)
  - `conflict_count` int default 0
  - `contact_change_count` int default 0
  - Expand `status` allowed values via CHECK to: `pending_new | pending_match_review | pending_conflict_review | approved_add | approved_update | approved_merge | rejected | completed` (keep legacy values readable; new requests use new states)
  - `assigned_reviewer_id` uuid
- New table `lender_sync_request_decisions` (audit log): `id, request_id, field_name, scope ('lender'|'contact'), existing_value jsonb, incoming_value jsonb, action ('keep'|'use_incoming'|'fill_empty'|'append'|'mark_conflict'), decided_by, decided_at, notes`
- New table `lender_sync_settings` (per-company): `auto_approve_deterministic boolean default false`, `likely_match_threshold numeric default 0.82`, `possible_match_threshold numeric default 0.65`
- Backfill: compute `confidence/suggested_action/match_candidates` for existing pending rows via one-time SQL using existing similarity helpers
- RLS: read/write scoped to company members; insert into decisions limited to authenticated reviewers

**Matching engine** — `src/lib/lenderMatching.ts`
- Inputs: incoming `incoming_data`, candidate set from `master_lenders` (company-scoped)
- Signals & weights:
  - Exact normalized name → +1.0 (deterministic)
  - Alias overlap → +0.95
  - Website/domain exact → +0.9, fuzzy → up to +0.6
  - Email-domain match (incoming.email vs existing.email) → +0.7
  - Phone exact → +0.6
  - Address/geo overlap → +0.3
  - Shared contact (name+email) → +0.5
  - Name fuzzy (Dice on normalized) → up to +0.6
  - Tag/keyword overlap → up to +0.2
- Output: ranked candidates + `confidence` label using thresholds from settings; `suggested_action = merge` when ≥1 strong candidate, `update` when exactly one strong candidate and source_lender_id already linked, else `add`
- Pure functions, unit-tested

**Edge function** — `match-lender-sync-request` (deploys automatically)
- Triggered on insert via DB trigger (NOTIFY → invoke) OR called by `useLenderSyncRequests` post-insert; also exposed for backfill
- Persists `confidence`, `suggested_action`, `match_candidates`, `match_reason`, `conflict_count`, `contact_change_count`
- Auto-approve only when admin setting on AND deterministic exact match with zero populated-field conflicts AND no contact deltas

## Phase 2 — UI: 4-tab panel + filters + list columns

Rewrite `LenderSyncRequestsPanel.tsx` (and supporting components):
- Tabs: **New | Likely Match | Conflict Review | Completed**
  - New: `confidence in (none, needs_review)` AND `suggested_action = add`
  - Likely Match: `suggested_action in (update, merge)` AND no unresolved conflicts
  - Conflict Review: `conflict_count > 0` OR status `pending_conflict_review`
  - Completed: terminal statuses
- Filters bar (per tab, persisted): confidence, source_system, age bucket (24h / 7d / 30d / older), assigned reviewer, suggested action
- New table/list view `SyncRequestTable.tsx` with sortable columns: request type, suggested action, confidence chip, matched lender, reason, conflict count, contact changes, updated at, reviewer
- Status chips with semantic tokens; "delta" inline counts (e.g. `+2 new contacts · 1 conflict`)
- Sort by confidence DESC default

## Phase 3 — Review drawer (side-by-side)

New `SyncRequestReviewDrawer.tsx`:
- Layout: 3 columns inside a Sheet
  - Left: incoming request (read-only)
  - Right: candidate dropdown + existing record
  - Center: per-field decision rows: existing value, incoming value, recommended action, override segmented control (Keep / Use incoming / Fill empty / Append / Mark conflict)
- Contact section (separate from lender fields):
  - Exact contact match → "merge & backfill missing" preselected
  - Likely contact match → "Confirm merge contact" button + side-by-side
  - Net-new contact → add as additional contact
  - Primary contact unchanged unless toggled
- Decision summary panel before Confirm: action, fields-to-update count, empty-fields-to-backfill count, conflicting fields needing approval, contacts to merge, net new contacts, "deals/notes/history preserved: yes"
- Confirm writes:
  - Apply field decisions to canonical `master_lenders`
  - Insert per-field rows into `lender_sync_request_decisions`
  - Upsert contacts into `lender_contacts`, preserving primary
  - Re-point any deal_lender associations if user changed the canonical
  - Update request `status` to `approved_add | approved_update | approved_merge`

## Phase 4 — Bulk actions + safety

- Bulk bar appears only when selection has uniform `confidence = exact_duplicate` OR `suggested_action = update` with zero populated-field conflicts
- Actions: "Approve fill-empty updates", "Approve exact contact additions", "Mark for later review"
- Never auto-merge medium confidence
- Auto-approve deterministic updates only if `lender_sync_settings.auto_approve_deterministic = true`
- Reversible: a "View audit" drawer that reads `lender_sync_request_decisions`

## Phase 5 — Polish & verification

- Notification bell counts use new statuses
- Realtime subscription unchanged but reads new fields
- Vitest:
  - matching engine scoring & threshold tests
  - decision-summary computation
  - contact reconciliation precedence
- Manual smoke in preview against existing pending requests

## Technical details

- Schema additions are additive and CHECK-constraint relaxed so legacy statuses still load. Migration includes one-shot backfill that calls the matching engine via PL/pgSQL stub OR leaves `confidence='none'` and lets the edge function backfill on next refetch (preferred — no SQL duplication).
- Matching engine is a pure TS module re-used by the edge function (Deno-compatible) and by client-side previews.
- All decisions persisted; nothing destructive happens without a `lender_sync_request_decisions` row.
- We retain the existing `MergeConflictDialog` path during rollout for back-compat, switching the panel default to the new drawer once Phase 3 lands.

## Files (rough)

```text
supabase/migrations/<ts>_flex_sync_triage.sql                 (new)
supabase/functions/match-lender-sync-request/index.ts         (new)
src/lib/lenderMatching.ts                                     (new, shared)
src/lib/__tests__/lenderMatching.test.ts                      (new)
src/hooks/useLenderSyncRequests.ts                            (extend types + write decisions)
src/hooks/useFlexSyncSettings.ts                              (extend with thresholds)
src/components/lenders/LenderSyncRequestsPanel.tsx            (rewrite)
src/components/lenders/SyncRequestTable.tsx                   (new)
src/components/lenders/SyncRequestReviewDrawer.tsx            (new)
src/components/lenders/SyncRequestFiltersBar.tsx              (new)
src/components/lenders/SyncRequestDecisionSummary.tsx         (new)
src/components/lenders/SyncRequestAuditDrawer.tsx             (new)
```

## Open questions before I start

1. **Phasing**: ship all 5 phases in one go, or land Phase 1+2 first, review, then 3–5? (Strong recommend the latter — much safer.)
2. **Reviewer assignment**: assign manually via a dropdown on each row, or auto-round-robin among admins? I'll default to manual.
3. **Auto-approve setting**: default OFF for everyone, exposed in Integrations → Flex settings — OK?
4. **Thresholds**: defaults of `likely ≥ 0.82`, `possible ≥ 0.65` (tunable per company). OK to start there?

Confirm phasing and answers to 2–4 and I'll start with Phase 1.
