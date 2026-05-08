## Goal

Reduce manual clicks for task creation in two places:

1. **Email AI sidebar** — auto-detect follow-up actions in the analyzed thread and surface them as one-click "Approve / Edit / Dismiss" cards in Suggested Updates.
2. **Deal Rundown card** — add an inline "+ Add Follow-up" form per deal plus an AI-driven "Next best action" row, both creating tasks linked to the deal and synced to Asana.

Strictly additive — no existing toolbars, layouts, or working flows are removed.

## Part 1 — Proactive follow-up detection (Email AI sidebar)

### New backend
- **Edge function `detect-email-followups`** (verifies `supabase.auth.getUser()`, returns 401 if missing).
- Input: `threadId`, normalized thread messages (subject, from, to, bodies, dates), `deal` context summary (id, name, stage, lenders/recipients, last activity).
- Calls Lovable AI (`google/gemini-3-flash-preview`) via tool-calling for structured output. Schema returns up to 5 items:
  ```
  { suggestions: [{
      id: string,                  // stable hash of trigger + title
      title: string,               // "Follow up with Trevor re: Censys intro call"
      reason: 'meeting' | 'awaiting_item' | 'deadline' | 'unanswered_question' | 'silent_lender' | 'other',
      contact?: string,
      dueDate?: string,            // ISO; required when reason='deadline'
      defaultAssigneeIsCurrentUser: true,
      asanaSync: true
  }] }
  ```
- Returns `{ suggestions: [] }` cleanly when no actionable items are found.
- Handles 429/402 gracefully and surfaces them via toast on the client.

### Frontend
- **New component `SuggestedFollowupsCard.tsx`** rendered inside `SuggestedDealUpdatesSection`:
  - Renders only after thread analysis is complete (gated on the existing `isAnalyzing` flag), never during "Analyzing thread…".
  - For each suggestion, a card with: checkbox (visual only), title, secondary line `Due · Assign · Sync to Asana toggle`, and `Approve / Edit / Dismiss` buttons.
  - **Approve** → calls the same task-creation path the existing `Create Task` quick action uses (`useCreateTaskFromEmail` or equivalent), so Asana sync, deal linking, and toast all stay identical.
  - **Edit** → expands the row into the existing `CreateTaskInlineCard` pre-filled with the suggestion.
  - **Dismiss** → removes locally and persists dismissal in `sessionStorage` keyed by `threadId + suggestion.id` so a re-open of the same thread does not resurface dismissed items in the same session.
- **Empty state**: `No action items detected in this thread.` (matches the planned bug-fix copy).
- **No changes** to the Quick Actions toolbar or the existing "Create Task" button.

### Caching
- Detection result cached in `sessionStorage` per `threadId` (mirrors the existing draft cache strategy) so re-opening the popup is instant.

## Part 2 — Deal Rundown card

Lives in `src/components/pipeline/memo/PipelineMemoCard.tsx` / `TasksMilestonesBand.tsx`.

### Fix 1 — `+ Add Follow-up` per card

- New button below the existing task list inside `TasksMilestonesBand`.
- Click reveals an inline form (reuses the email `CreateTaskInlineCard` styling — extracted into a shared `InlineTaskForm` if needed):
  - Title (pre-filled by the AI rule below)
  - Due date (default = next business day; weekend rolls to Monday)
  - Assignee (default = current user)
  - Sync to Asana toggle (ON by default)
  - Create / Cancel
- Pre-fill rule (computed locally, no AI call needed):
  - No lender responses → `Follow up with lenders on [Deal Name]`
  - Stale (>7 days no activity) → `Check in on status of [Deal Name]`
  - Has overdue tasks → `Review overdue items on [Deal Name]`
  - Else → `Follow up on [Deal Name]`
- On Create:
  - Insert into `tasks` with `deal_id` set, `assigned_to = currentUser`.
  - If toggle on, fire the existing Asana sync path used by email task creation (no new Asana code).
  - Optimistic UI: prepend the new task to the in-card list immediately, then reconcile with refetched data; toast `Task created`.

### Fix 2 — AI "Next best action" row

- Below the Tasks & Milestones section, render `⚡ Next best action: <copy> — [Create Task]` only when a clear action exists.
- Source of the one-liner:
  - Computed locally from the existing batched data already on the page (lender activity timestamps, deal stage transitions, open task overdue counts) — no extra fetch, no AI call required for the v1.
  - Heuristics map to the user's examples (`No lender activity in 14 days…`, `Terms issued 3 days ago…`, `2 overdue tasks…`).
- Click `Create Task` opens the same inline form pre-filled with the suggested action title; submit path is identical to Fix 1.
- Hide the row entirely when no rule fires (no empty state).

## Files

### New
- `supabase/functions/detect-email-followups/index.ts`
- `src/components/deal/email/SuggestedFollowupsCard.tsx`
- `src/hooks/useEmailFollowupSuggestions.ts` (calls the edge function, handles cache + dismissals)
- `src/components/pipeline/memo/AddFollowupInlineForm.tsx`
- `src/components/pipeline/memo/NextBestActionRow.tsx`
- `src/lib/dealNextBestAction.ts` (pure heuristics, unit-testable)

### Edited
- `src/components/deal/email/AiAssistSidebar.tsx` (mount the new card after analysis completes)
- `src/components/deal/email/SuggestedDealUpdatesSection.tsx` (slot in the new card; preserve existing children)
- `src/components/pipeline/memo/TasksMilestonesBand.tsx` (Add Follow-up button + form mount, NBA row)
- `src/components/pipeline/memo/PipelineMemoCard.tsx` (only if mount points need wiring)

### Read-only / unchanged
- `EmailQuickActionsToolbar.tsx`, `CreateTaskInlineCard.tsx` (reused via composition)
- Existing Asana sync path (reused; no schema or integration changes)

## Constraints respected

- Strictly additive; existing layouts, Quick Actions toolbar, and Create Task button untouched.
- Suggestions render only after analysis completes — never during "Analyzing thread…".
- All task creation flows go through the existing `tasks` insert + Asana sync path with `deal_id` link.
- Edge function verifies auth and surfaces 429/402 to the client per Lovable AI guidelines.
- No new data layer changes; reuses `usePipelineDealTasks` and existing notification/lender data already loaded on the page.

## Out of scope (will not be done in this pass)

- Changing the email Quick Actions toolbar.
- Persisting per-user dismissals across sessions (sessionStorage only for v1).
- LLM-driven Next Best Action copy (heuristics for v1; can be upgraded to AI later without UI changes).
