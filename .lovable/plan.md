## Goal

Consolidate Term Sheet / IOI / LOI approval queue items into **one card per (deal, lender)**. The card's details pane exposes each sub-step (save PDF, move funding source to Terms Issued, add lender-specific status note, and — when applicable — advance the deal stage) so the user can review and approve them together.

## Approach

Rather than merging the underlying rows into a single database action, tag every item that the "Terms Issued bundle" rule emits with a shared `bundle_key`, then have the Approval Queue UI collapse items sharing that key into a single lender card with a multi-step detail panel — mirroring how `draft_email_bundle` and `update_funding_source_bundle` already work.

### 1. Deal Admin Agent protocol (`supabase/functions/_shared/dealAdminAgentIntelligence.ts`)

- Extend `TERMS_ISSUED_RULES` so every one of the 4 proposals for a lender's Terms Issued event carries the same `bundle_key` in `proposed_values`, formatted as `terms_issued:{deal_id}:{funding_source_id_or_sender_domain}`:
  - `update_funding_source` → funding_source_id known.
  - `add_status_note` / `update_deal_stage` / `save_to_data_room` → same key so the UI can group them even though their `target_object_id` is the deal.
- Server-side safety net in `normalizeCandidateTargets`: when the model omits `bundle_key`, infer it for a candidate by scanning `evidence_references` for a shared email/thread id + matching lender contact, and stamp `bundle_key` before persistence.
- Persist `bundle_key` in the `ai_action_queue` payload (the field flows through the existing `on_approve_execution_payload.new_values` slot; no schema migration).

### 2. UI grouping (`src/components/ai-queue/ActionQueuePanel.tsx`)

- Add a new bundler that runs **before** the existing draft / funding-source / claap bundlers:
  - Collect items whose `payload.bundle_key` starts with `terms_issued:`.
  - Group by that key; when 2+ items share it, emit one synthetic `terms_issued_bundle` card titled `"{Lender} — Term Sheet / IOI"` with the deal name and a description like `"Save PDF · Update funding source · Add status note"`.
  - Attach the child items on `__bundle` so the existing detail-pane bundle renderer displays each sub-action with its own approve/reject.
- Register `terms_issued_bundle` in `TYPE_META` (icon: `FileSignature` from `lucide-react`) and in `consolidatedAiQueueCount` so the badge count matches.
- Detail pane: reuse the existing multi-item bundle renderer used by `update_funding_source_bundle` (each child keeps its own editable form) so no new UI surface is needed.

### 3. Refresh sweep + cleanup

- After deploy, invoke `deal-admin-agent-auto-sweep` for the Gabb Wireless workspace (Cloud edge function) so a fresh pass emits the newly tagged items.
- Dismiss the currently-pending, un-tagged Terms Issued items for Gabb Wireless via an `UPDATE` on `ai_action_queue` with `status='dismissed', rejection_reason='auto_resolved_pre_bundle_key'`, scoped to `deal_id = <gabb_id>` AND `action_type IN ('update_funding_source','add_status_note','save_to_data_room','update_deal_stage')` AND `status='pending'` AND `created_at < now() - interval '1 minute'` (so we don't wipe the fresh sweep's output).

### Technical details

- No schema migration required; `bundle_key` lives in the JSONB payload.
- Dedupe: `queueSemanticKey` continues to key on `(deal, funding_source)` for the "funding_source_attention" group; the new `bundle_key` is purely for UI grouping and does not affect dedupe.
- Backwards compat: items without `bundle_key` render exactly as today.
- Redeploy `deal-admin-agent-analyze`, `deal-admin-agent-auto-sweep`, `deal-admin-agent-test-scan` so the new prompt/inference is live.

### Out of scope

- No changes to the actual "on approve" execution — approving the lender bundle still runs each child action independently. The user experience is what consolidates.
- No changes to other bundlers (drafts, claap, generic fs updates).
