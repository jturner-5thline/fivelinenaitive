## Goal

Add an "Auto-Suggest Status Updates & Follow-Up Tasks" capability to the existing Deal Admin Agent. Reuse the existing intelligence engine (`runDealAdminAgentAnalysis`) and Approval Queue (Duty 3 / `ai_action_queue` + `approval-queue-execute`). No parallel scheduler, no parallel queue.

## What already exists (do not rebuild)

- Per-deal signal gathering for emails, email threads, Claap recordings + transcripts, calendar items, deal activity, status notes, funding sources (deal_lenders), open tasks, stage history, milestones — in `supabase/functions/_shared/dealAdminAgentIntelligence.ts`.
- Claude-powered candidate generation with confidence/risk/evidence, dedupe by `(action_type, target_object_type, target_object_id)`, and insertion into `ai_action_queue` with full executable payload.
- Approval Queue UI (`ActionQueuePanel`, `useAiActionQueue`) and executor (`approval-queue-execute`) for `add_status_note`, `update_funding_source`, `create_followup_task`, `update_milestone`, `draft_email`, `update_deal_stage`, etc.
- Per-company entitlement + per-user activation gates (`admin_agent_user_overrides.is_activated`).
- Silence-by-default: when the engine returns zero candidates, nothing is inserted and no notification fires.

## Deltas to ship

### 1. Scope filter (per-user Deal Manager + Active Pipeline)

In `dealAdminAgentIntelligence.ts › runDealAdminAgentAnalysis`, replace the current "load deals by company, ordered by updated_at" with:

- For each activated user in the company, load only deals where `deals.deal_owner_user_id = <activated user>` (this is the "Deal Manager" field).
- Drop archived deals (already done) and the global test-deal exclusion list (already done).
- For the 5th Line company (`44556c46-9127-4b12-b14e-d6fee784afcf`): resolve the **default** pipeline via `deal_pipelines.is_default = true` for that company and require `deals.pipeline_id = <default pipeline id>`. Per project memory, the default pipeline is "Active Pipeline".
- Attribute the resulting Approval Queue items to that activated user (assignee = deal manager), not to "first activated user in workspace".

### 2. 30-minute scan cadence

- Add a pg_cron job that hits `deal-admin-agent-auto-sweep` every 30 minutes (use the existing `supabase/functions/deal-admin-agent-auto-sweep` entry point — no new function needed).
- Keep weekly `admin-agent-sweep` as-is (it handles the legacy portfolio audit and is a different code path).
- Tune `max_deals` / `max_queue_rows` / `min_confidence` for the higher cadence so we don't flood the queue.

### 3. Lender follow-up triggers (prompt extension)

Extend the existing Claude system prompt in `dealAdminAgentIntelligence.ts` with three explicit lender rules — they emit `draft_email` (external) plus an optional `create_followup_task` (internal):

1. Lender (deal_lender) `last_contact_at` is older than 3 US business days with no inbound reply since.
2. An outbound email to the lender contact reads urgent (Claude classifies tone) and has no inbound reply.
3. A lender stated they would respond by a date (parsed from email/Claap) and that date is today or past.

Reuse the existing `businessDaysBetween` helper (`src/lib/businessDays.ts`) — port the same logic to the edge function shared module so the prompt can pre-compute "BD since last contact" per lender and pass it into the bundle.

### 4. Email/Claap detection coverage (prompt sharpening)

Add explicit instructions to the existing prompt so the model emits these patterns the user called out:
- ETA commitments ("by Friday") → `add_status_note` + optional `create_followup_task`.
- "Still working on it" → `add_status_note`.
- "Won't be ready until X" → `update_funding_source` ETA or outstanding-item ETA via `add_status_note`.
- "Let me check and get back to you" → `create_followup_task`.
- Claap: on every linked recording in the bundle, always emit one `add_status_note` synthesizing what happened + next step (already partly done — tighten and make it mandatory when a recording exists and there is no matching status note within 48h).

### 5. Tone presets

Pass two tone constants into the prompt:
- Internal (status notes, internal tasks): concise, fairly informal, not casual/funny.
- External drafts (`draft_email`): concise, semi-formal, acquaintance/friendly.

### 6. Per-user tone training (silent learning)

New table `admin_agent_tone_deltas`:
- `id`, `user_id`, `company_id`, `queue_item_id`, `action_type`, `original_draft jsonb`, `edited_draft jsonb`, `diff_summary text`, `created_at`.
- RLS + GRANTs per project standards.

Hook: in `approval-queue-execute` for `draft_email` (and `add_status_note` / `create_followup_task` when `new_values` was edited), compare incoming `new_values` to stored `old_values`/`payload.on_approve_execution_payload.new_values`; if changed, insert a delta row. No UI, no notifications.

Use: in `runDealAdminAgentAnalysis`, before calling the model, fetch the last ~15 tone deltas for the deal manager and include a compact "user style fingerprint" block in the prompt ("this user typically shortens X, prefers Y phrasing").

### 7. 4-business-day escalation

New scheduled task (pg_cron, daily 9am ET) — extend `admin-agent-sweep` (or add a small `admin-agent-escalate` function) that:
- Finds `ai_action_queue` rows with `status='pending'`, `source.origin='deal_admin_agent'`, `created_at` older than 4 US business days.
- Resolves the company admin (first user with `role='admin'` in `user_roles` for that company).
- Inserts a new `ai_action_queue` row of type `escalate` assigned to the admin, linking back to the stale item. Existing executor already handles `escalate`.
- Marks the original row with `payload.escalated_at` so it isn't re-escalated.

### 8. Dedupe / fingerprinting (already in place, just verified)

Existing dedupe key is `(action_type, target_object_type, target_object_id)` over rows with `status in ('pending','approved')` for the deal. That already satisfies "do not re-propose a signal already in the queue or actioned" because the target objects (email id, claap id, task id, lender id) are encoded into `target_object_id` / `evidence_references`. No changes.

## Out of scope

- No new approval surface — everything lands in the existing Approval Queue.
- No new in-app notifications when there are zero candidates (silence rule already holds).
- No changes to the chat-driven `verify_deal_information` flow.

## Files touched

- `supabase/functions/_shared/dealAdminAgentIntelligence.ts` — scope filter, lender BD pre-compute, prompt extensions, tone preset, tone-delta fingerprint, deal-manager assignee.
- `supabase/functions/deal-admin-agent-auto-sweep/index.ts` — iterate per activated user (deal manager) instead of attributing to "first activated user".
- `supabase/functions/approval-queue-execute/index.ts` — write `admin_agent_tone_deltas` row when an edited draft is approved.
- `supabase/functions/_shared/businessDays.ts` *(new)* — port of `src/lib/businessDays.ts` for edge-function use.
- `supabase/functions/admin-agent-escalate/index.ts` *(new, small)* — 4-BD escalation pass.
- `supabase/migrations/<ts>_admin_agent_tone_deltas.sql` — create table + RLS + GRANT.
- pg_cron schedules (via `supabase--insert`, not migration, per scheduled-jobs guidance): every 30 min → `deal-admin-agent-auto-sweep`; daily 9am ET → `admin-agent-escalate`.

## Verification

- Deploy, trigger `deal-admin-agent-auto-sweep` with `{ company_id: "<5th line id>" }` and inspect `ai_action_queue` rows for a known deal manager.
- Confirm queue rows only appear for deals where `deal_owner_user_id` matches an activated user and (for 5th Line) `pipeline_id` is the default Active Pipeline.
- Approve an edited `draft_email` and confirm a row lands in `admin_agent_tone_deltas`.
- Backdate a queue row > 4 BD and run the escalate function; confirm an `escalate` queue row is created for the company admin.