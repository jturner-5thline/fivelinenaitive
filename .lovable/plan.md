# Asana Task Sync Hardening — Implementation Plan

## What's already in place (no rebuild needed)
- `syncTaskToAsana`, `updateTaskInAsana`, `getAsanaSyncContext` (`src/hooks/useAsanaTaskSync.ts`)
- `asana_sync_log` table (records every create/update attempt)
- `tasks.asana_task_gid` column for bi-directional linkage
- `asana-webhook` edge function — Asana → Naitive completion sync is already wired
- Asana integration is connected, `sync_on_task_create=true`, project + section GIDs valid
- Active sync log shows 100% success when invoked — the real problem is **some task-creation paths skip the sync entirely**

## The actual diagnosis
Most recent task ("Review lenders for Vispero", 2026-05-18 21:53) was created by jturner on deal Vispero with company_id set, but has **no asana_task_gid and no asana_sync_log entry** — meaning the code path that created it never called `syncTaskToAsana`. There are ~10 task-creation entry points across the app and not all call the sync helper.

## Changes

### 1. Database migration
Add to `tasks` table:
- `asana_sync_status` text — `pending` | `synced` | `failed` | `disabled`
- `asana_sync_error` text (nullable) — last error message
- `asana_synced_at` timestamptz (nullable)
- `asana_sync_attempts` int default 0

Expand `asana_sync_log` to capture more detail:
- `http_status` int (nullable)
- `response_body` jsonb (nullable)
- `attempt_number` int default 1

### 2. Centralize sync — `src/lib/asana/syncTaskAfterCreate.ts`
One helper every task-creation path calls. It:
- Resolves company_id, assignee email, sync context
- Calls `syncTaskToAsana` with retry-with-backoff (3 attempts, exponential, only for 429/5xx)
- Writes `asana_sync_status` + `asana_sync_error` + `asana_synced_at` back to `tasks` row
- Returns `{ ok, gid, error }` so the caller can show inline feedback
- Logs every attempt to `asana_sync_log` with http_status + response_body + attempt_number

### 3. Audit & route every task-creation path through the helper
Routes to update (replace inline `syncTaskToAsana` calls with helper):
- `src/hooks/useDealTasks.ts` (deal-page task create)
- `src/hooks/useTasks.ts` (general tasks page + subtask create + completion mirroring)
- `src/hooks/useTaskTemplates.ts` (templates)
- `src/hooks/useDealMemoApproval.ts` (memo approvals)
- `src/components/tasks/TaskDetailDrawer.tsx`
- `src/components/deals/CreateTaskForMentionDialog.tsx`
- `src/components/deal/email/CreateTaskInlineCard.tsx`
- `src/components/deal/email/SuggestedTaskCards.tsx`
- `src/components/deal/email/SuggestedFollowupsCard.tsx`
- `src/components/deal/email/EmailUnifiedAiAction.tsx`
- `src/components/deal/DealSpaceNoteEditor.tsx`
- `src/components/dashboard/chat/NaitiveTaskComposer.tsx`
- `src/components/pipeline/memo/AddFollowupInlineForm.tsx`
- `src/pages/SuggestedTaskPreview.tsx`

Audit grep: any `INSERT INTO tasks` not followed by a helper call gets one added.

### 4. Edge function `asana-proxy` — expand logging
In the `create_task` and `update_task` cases:
- Log to console: payload, response status, response body, error
- Return `http_status` and `response_body` in the JSON response so the client can persist them

### 5. Transactional UX
- Toast in helper: while sync is in-flight, show "Creating task…"; on success "Task created & synced to Asana"; on failure "Task created locally — Asana sync failed (will retry)" with a Retry action button
- Task rows in lists get a small badge when `asana_sync_status='failed'` (red dot + tooltip with error)
- Click badge → re-runs helper → updates row

### 6. Dev-only debug panel
Add `src/components/AsanaSyncDebug.tsx` — floating bottom-left panel (mirroring `InsightsAccessDebug`), gated on `import.meta.env.DEV`. Shows last 10 entries from `asana_sync_log` with status, error, timestamp. Mount in `App.tsx`.

### 7. Custom-field & assignee resilience (already partially handled)
- Assignee: if email lookup fails, create unassigned instead of erroring (already the behavior — verified)
- Custom fields: not currently sent in payload — no change needed. If/when added, validate GIDs against `asana_proxy` `/projects/:gid/custom_field_settings` first.

### 8. Bi-directional confirmation
`asana-webhook` already mirrors completion Asana → Naitive. Verify webhook subscription exists for the Deal Management project; if missing, register via existing `register_webhook` action. Document in setup tab.

## Out of scope (deliberately)
- Replacing the `asana_sync_log` table — already adequate
- Rewriting `asana-webhook` — already functional
- Background queue worker — retry-with-backoff in the client request covers it for now

## Acceptance test (manual, after deploy)
1. As jturner@5thline.co on /deals, create a task on any deal → verify Asana task appears in Deal Management → correct section, assignee, due date, deal name in title.
2. Force a failure (temporarily set wrong section GID in config) → verify red badge on task + working "Retry" button + sync_status='failed' in DB.
3. Mark Naitive task complete → Asana task flips complete.
4. Mark Asana task complete → next webhook tick reflects in Naitive.

## Estimated diff
~1 migration, 1 new helper file, 1 new debug component, ~14 call-site edits, 1 edge function patch.
