## Goal

Every Claap recording that arrives via sync/webhook automatically lands in the Approval Queue with (a) AI-suggested deal/company/contact links and (b) AI-extracted action items, gated behind a two-stage human approval before anything is written to deals, contacts, or tasks. Rename the surface from "Action Queue" to "Approval Queue" everywhere user-facing.

## Scope

### 1. Backend — auto-enqueue Claap recordings

- Update `supabase/functions/claap-webhook/index.ts`: after a new recording is persisted, enqueue an item into `ai_action_queue` of a new `type = 'claap_recording_review'` with a payload referencing `claap_recording_id`, `title`, `meeting_at`, raw attendees, and `org_company_id`. Skip if the recording is already linked to a deal with high confidence (preserves existing auto-link behavior in `claap-suggest-matches`).
- Reuse `claap-suggest-matches` to produce candidate deals/companies/contacts; store top 3 with confidence + an explanation string (e.g. "attendee email domain matches Vispero; transcript mentions 'Vispero Q2'"). Pre-select top candidate when confidence ≥ 0.75.
- New edge function `claap-extract-action-items`: pulls transcript + summary from the recording, calls Lovable AI Gateway (Gemini 2.5 Flash) with a structured schema returning `{ title, description, suggested_owner_user_id, suggested_owner_name, due_at|null, source_quote, dedupe_key }`. Group by owner. Dedupe via case-insensitive title hash + similar `dedupe_key`. Store results on the queue item's payload (not in `tasks` yet — tasks are only created on approval).
- Both calls are fired after webhook insert; failures degrade gracefully (queue item still created, with empty suggestions/action_items and a `processing_error` field the UI can surface as "AI analysis failed — retry").

### 2. Frontend — Approval Queue card UX

Add a new card renderer in `ActionQueuePanel.tsx` for `type === 'claap_recording_review'`:

- **Header:** recording title, meeting date/time, attendee chips.
- **Stage 1 — Relationship matching:** suggested deal / company / contacts rows with a Confidence pill (High/Medium/Low) and an "Why this match?" tooltip showing the AI's explanation. Buttons: **Approve**, **Edit match** (opens picker reusing `ClaapDealSelector` / contact + company pickers), **Create new** (opens quick-create flows), **Reject** (drops the suggestion, recording stays linked to nothing).
- **Stage 2 — Action items:** unlocks after Stage 1 is approved or skipped. Renders the extracted action items grouped by owner with inline edit (title, owner, due date). Buttons per row: **Approve**, **Edit**, **Discard**. Toolbar: **Approve all**, **Discard all**.
- All writes go through new RPC-style handlers in `useAiActionQueue.ts`:
  - `approveClaapMatch(itemId, { dealId, companyId, contactIds })` → updates `claap_recordings` link rows, logs `deal_activity`, then advances queue item to `awaiting_tasks` sub-status.
  - `approveClaapTasks(itemId, taskPayloads[])` → bulk insert into `tasks` with `source = 'claap'`, link to deal/company, log activity, mark queue item `approved`.
- No optimistic completion: queue item only flips to `approved` after the DB write returns success. On failure, surface a toast and keep the item open.

### 3. Rename: Action Queue → Approval Queue (user-facing only)

Files to update (string-level only, no DB/table rename):

- `src/components/ai-queue/ActionQueueBadge.tsx`, `ActionQueuePanel.tsx`
- `src/components/dashboard/ActionQueueWidget.tsx` (label, aria, title attrs)
- `src/components/deals/DealsHeader.tsx` (overlay key, label, icon map)
- `src/components/deal/email/*` (tooltip strings)
- `src/hooks/useAiActionQueue.ts` (toast copy + comment headers)
- `src/pages/Dashboard.tsx` (dialog title, tile label, aria)
- `src/lib/headerOverlayNav.ts` comment
- `src/index.css` comment (cosmetic)

Keep file/component names, DB table `ai_action_queue`, hook name, and route as-is to avoid breakage. Only the strings the user sees change. The overlay registry key `'Action Queue'` in `DealsHeader.tsx` is used as a lookup key in 4 places — rename all 4 in lockstep.

### 4. Activity logging

After each approved match or task batch, insert into `deal_activity` (`type` = `'claap_match_approved'` or `'claap_tasks_approved'`) with a payload referencing the recording + queue item ID. Only on confirmed DB success.

## Technical details

```
claap-webhook (recording.created)
  └── inserts ai_action_queue row { type: 'claap_recording_review', payload: { claap_recording_id, meta } }
        ├── async: claap-suggest-matches → payload.suggestions = [{deal, company, contacts, confidence, why}]
        └── async: claap-extract-action-items → payload.action_items = [{title, owner, due_at, source_quote}]
```

```
ApprovalQueueCard (new renderer)
  Stage 1: match approval  ──► writes claap_recordings links + activity ──► sets payload.stage = 'tasks'
  Stage 2: action items    ──► bulk insert tasks + activity              ──► status = 'approved'
```

`ai_action_queue.type` enum likely already accepts strings; add `'claap_recording_review'` to the TS union in `useAiActionQueue.ts`. No DB migration needed for the type column (text). Add a `payload.stage` field tracked client-side and persisted via the existing payload JSONB.

### Out of scope

- Renaming the DB table or hook (`useAiActionQueue`)
- Changing the route `/dashboard` overlay path
- Backfilling existing recordings — only new recordings from webhook time forward auto-enqueue
- Building a separate top-level `/approval-queue` page (the existing dialog/dashboard tile stays the entry point)
