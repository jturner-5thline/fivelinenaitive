
## Goal

Upgrade the Approval Queue from a deferred-suggestion list into the universal **execution checkpoint** for everything the Deal Admin Agent proposes. Approve = apply the change to the real record. Drafted emails are the only exception: Approve stages them for manual send.

## 1. Data model (migration)

Extend `ai_action_queue` to support the full action surface and decision-first review:

New columns:
- `assigned_to uuid` — reviewer in whose queue the item appears (defaults to `user_id` for back-compat)
- `priority text` — `low | normal | high | urgent`
- `risk_level text` — `low | medium | high` (drives bulk-approve eligibility)
- `target_object_type text` — `deal | deal_lender | task | activity_log | deal_milestone | outstanding_item | email_draft | contact | crm_company`
- `target_object_id uuid`
- `old_values jsonb` — snapshot of fields the action will change
- `new_values jsonb` — proposed values (editable before approve)
- `evidence jsonb` — array of `{ kind, label, ref_id, snippet, url }` (emails, meetings, activity rows, etc.)
- `rationale text` — why the agent proposed this
- `edited_before_approval boolean default false`
- `rejection_reason text`
- `reassigned_from uuid`
- `more_context_requested_at timestamptz`
- `more_context_notes text`

New action_type values (extending the existing enum-as-text):
- `update_deal_stage`
- `update_deal_status`
- `add_status_note`
- `update_funding_source` (lender stage/status)
- `update_milestone` / `create_milestone`
- `create_followup_task`
- `update_contact` / `update_company`
- `draft_email` (staged send — does NOT auto-send)
- `escalate`
- `reassign_deal`

New table `ai_action_audit`:
- `id, action_queue_id, target_object_type, target_object_id, action_type, old_values jsonb, new_values jsonb, approver_user_id, decision text` (`approved|rejected|reassigned|edited_approved|more_context|email_staged`), `execution_status text` (`success|failed|staged`), `failure_reason text`, `was_edited bool`, `rejection_reason text`, `created_at`.
- RLS: visible to company members of the linked deal/object; insertable by service role + auth.

New table `staged_email_drafts` (or reuse `email_drafts` if compatible) for emails awaiting manual send after approval:
- Mirrors draft fields (`to, cc, bcc, subject, body_html, deal_id, thread_id, source_action_id`), `status: 'staged' | 'sent' | 'cancelled'`.
- Approve on a `draft_email` action writes here and moves the item to `approved` with execution_status `staged`.

Indexes + GRANT + RLS per project standards. `assigned_to` defaults to `user_id`, backfilled.

## 2. Server: execution router

New edge function `approval-queue-execute` (auth-verified):
- Input: `{ action_id, edited_values?, decision: 'approve'|'reject'|'reassign'|'more_context', reassign_to_user_id?, rejection_reason?, more_context_notes? }`
- Loads the queue item, validates `assigned_to === auth.uid()` (or admin), captures fresh `old_values` from live record, merges `edited_values` into `new_values`, executes the typed mutation:

| action_type | mutation |
|---|---|
| update_deal_stage | `deals.update({ stage })` + post-stage automations |
| update_deal_status | `deals.update({ status })` |
| add_status_note | insert `deal_status_notes` |
| update_funding_source | `deal_lenders.update({ substage, tracking_status })` |
| create_milestone / update_milestone | `deal_milestones` upsert |
| create_followup_task | `tasks.insert(...)` (existing logic) |
| update_contact / update_company | targeted column update |
| draft_email | insert into `staged_email_drafts` (status=staged) — **no send** |
| escalate | insert task assigned to escalation target + activity log |
| reassign_deal | update `deals.manager` |
| (existing) create_task, log_note, update_lender_status, save_to_data_room, deal_update | keep current paths |

Always writes an `ai_action_audit` row (success or failure). On failure, queue row → `failed` with `execution_error`, no partial state.

Bulk-approve endpoint: same function in array mode, only items where `risk_level='low'`.

## 3. Agent → queue producer

Update `supabase/functions/_shared/adminAgentQueue.ts` + admin-agent-sweep so every concrete recommendation is enqueued as an **execution-style** item with `target_object_type/id`, `old_values`, `new_values`, `rationale`, `evidence`, `risk_level`, and `assigned_to` (the deal manager). Replace reminder titles with imperative titles ("Update LAGO Innovation in Censys Technologies to Terms Issued").

Update copilot-chat write paths so AI-proposed mutations are routed through the queue instead of executed directly (except when the user already approved inline via the existing confirm cards).

## 4. Client hooks

`src/hooks/useAiActionQueue.ts`:
- Add fields to `QueuedAiAction`.
- `useApproveAiAction(item, { editedValues? })` → calls edge function, no longer does inline writes for the new types; preserves existing types for back-compat fallback.
- New: `useRejectAiAction(id, reason)`, `useReassignAiAction(id, userId)`, `useRequestMoreContext(id, notes)`, `useStagedEmailDrafts()`.
- Queue list filters by `assigned_to = auth.uid()` (with admin override for 5th Line).

## 5. UI — action-first rows + decision-first expanded review

Refactor `ActionQueuePanel.tsx`:

**Collapsed row** (one line, action-first):
- Imperative title, deal/company chip, reviewer avatar, age, priority + risk pill, source-trigger summary, `pending` badge.
- Primary CTA: **Approve & Apply** (or **Approve & Stage** for `draft_email`). Secondary: Reject / Edit / Reassign / More Context / Open Record. Chevron to expand.

**Expanded review** (decision-first header):
1. "If approved: **<verb> <target>**" — single bold sentence.
2. Old → New diff table for `old_values`/`new_values`. Inline editable fields where applicable.
3. Rationale paragraph.
4. Evidence list: email subjects, meeting titles, activity rows — each opens the underlying record in a new tab/overlay.
5. Action bar: Approve · Edit then Approve · Reject (with reason input) · Reassign (user picker) · Request More Context (notes) · Open Linked Record.
6. For `draft_email`: full email preview + recipients; Approve → "Move to Staged Drafts" toast linking to staged-send UI.

Bulk-approve bar only enables on low-risk items; show count "Approve N low-risk".

Keep current popup chrome (no translucent layer, red badge unchanged) — align with email popup look.

## 6. Staged email send UI

New route surface: a "Staged Drafts" panel reachable from the Approval Queue header and the existing email composer area. Lists `staged_email_drafts` with full preview, Edit, Discard, and **Send Now** (calls existing send pipeline). Sending writes an `ai_action_audit` row tying back to the original queue item.

## 7. Audit + safe failure

- Every approve/reject/reassign/more-context/edit writes one `ai_action_audit` row.
- Execution wrapped in try/catch on the edge function; on failure the queue row stays visible with `failed` status, a "Retry" button reruns the same payload.
- Edited values stored back to `new_values` and `edited_before_approval=true` before execution.

## 8. Tests

- Unit: payload builders per action_type, edit-merge logic, bulk-approve risk filter.
- Edge function: auth required, executes correct mutation per type, writes audit row, draft_email stages without sending.
- UI smoke: expanded review renders old/new diff, Edit-then-Approve sends merged payload.

## Technical notes

- Existing inline confirm flow (`CopilotActionConfirm`, `CopilotApprovalGroup`) stays — it remains the path for "approve inline now". The Approval Queue is the deferred + universal path.
- `assigned_to` differs from `user_id` only when an admin reassigns; backfill `assigned_to = user_id`.
- New action types are added as plain string values (no enum migration) since the column is `text`.
- Email send pipeline is reused from existing `gmail_send` / `microsoft_send` paths — we only gate it behind manual click on staged drafts.

## Out of scope (this pass)

- Slack/email notifications when items land in someone's queue (existing notification rules already cover this).
- Cross-tenant reassignment UI beyond same-company members.
- Mobile-specific layout polish for the expanded review.
