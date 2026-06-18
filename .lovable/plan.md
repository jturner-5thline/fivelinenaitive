# Daily Rundown — Capability Audit (read-only)

No code was changed. Findings below cite the files/functions backing each capability.

---

### 1) Add items to the deal calendar directly from the rundown — **Partial**

- The EOD Rundown mounts `HighlightCalendarMenu` around meeting note/title surfaces, which calls `useAddToDealCalendar().openFromSelection(...)` → opens `AddToDealCalendarDialog` → `AddToDealCalendarForm` (writes to `deal_calendar_items`).
  - `src/components/dashboard/EndOfDayTab.tsx:55, 1471, 1635` (two `<HighlightCalendarMenu>` wrappers)
  - `src/components/calendar/HighlightCalendarMenu.tsx`, `AddToDealCalendarProvider.tsx`, `AddToDealCalendarForm.tsx`
  - DB layer: `src/hooks/useDealCalendarItems.ts` (`addItem`)
- A dedicated, always-visible "Add to deal calendar" button on each rundown tile is **not** wired in `EndOfDayTab`. The reusable inline button exists (`src/components/dashboard/AddToDealCalendarInlineAction.tsx`) and is used elsewhere (rundown items in `DailyBriefingModal`/agenda surfaces), but **not** in the EOD tile actions row — users must text-highlight content first.

Verdict: **partial** — capability exists via text-highlight; no explicit one-click "Add to deal calendar" button on the rundown tile itself.

---

### 2) Newly created tasks auto-identify the linked deal (not random) — **Yes**

- `EndOfDayTab.tsx:1057–1093` renders `QuickCreateTaskDialog` with `initialDealId={prefill.dealId}` and the critical `lockInitialDeal` flag.
- `src/components/tasks/QuickCreateTaskDialog.tsx:44–52, 199, 213–216` documents and enforces lock-mode: the title-based fuzzy auto-match is suppressed so the explicit meeting→deal link is authoritative and can never be overwritten (or fall back to a random deal when none is linked).
- On save, `deal_id: input.deal_id || undefined` and `source.module = 'rundown_item'` are persisted (`EndOfDayTab.tsx:1077–1085`).

Verdict: **yes** — implemented and guarded by `lockInitialDeal`.

---

### 3) Reassign tasks that auto-assigned themselves to an external party — **N/A → Yes (for reassignment generally)**

- The system explicitly **never** auto-assigns to externals: `src/hooks/useMeetingTaskSuggestions.ts:208` ("external contact names are never auto-assigned"); external `@mentions` are kept as `external_mention` metadata only, and the task assignee defaults to the meeting attendee or the current user (`useMeetingTaskSuggestions.ts:431` "missing assignee here means a stale/external row. Default to the…").
- Regardless, the assignee is editable in the create dialog (`QuickCreateTaskDialog.tsx:110, 186–188`, "Assign to" picker over `teamMembers`) and reassigning persisted tasks is supported in `src/hooks/useTasks.ts:664, 681` ("Fire Zapier webhook when task is assigned/reassigned" / "Send task assigned email notification on reassignment").

Verdict: the "auto-assigned to external party" scenario should not occur by design; **reassignment itself is fully supported** on both create and edit.

---

### 4) Two notification icons clearing logic (persistent notification that never clears) — **No (bug confirmed)**

- Two surfaces render in the header:
  - `src/components/notifications/HeaderNotificationPreview.tsx` — toast-style banner; auto-dismisses after 5s and has a manual `✕` (`dismiss()` at lines 24–31, 39–41).
  - `src/components/notifications/DealManagementNotificationBell.tsx` — count badge driven by `useMyDealNotifications` (`src/hooks/useMyDealNotifications.ts`).
- `useMyDealNotifications` counts `flex_info_notifications` with `status IN ('pending','read')` (lines 57–61). There is **no UI affordance to mark these resolved/cleared** — clicking the bell only navigates to `/` (line 24 of the bell). The count drops only when the underlying row's status moves outside `pending|read` server-side, which the rundown does not do.
- Net effect matches the reported bug: the bell badge can stay populated indefinitely with no user-facing "clear" / "mark read" action.

Verdict: **no** — persistent badge has no clearing path from the UI.

---

### 5) Convert Claap action items into an "outstanding item" — **No**

- Claap action items are surfaced via `useMeetingClaapContext().actionItems` and consumed in:
  - `MeetingTasksInlineAction.tsx` → routes a single item into `onOpenTask(suggestions[0])` (creates a **task**, not an outstanding item).
  - `MeetingFollowupInlineAction.tsx` → drafts a follow-up **email** body.
  - `MeetingCreateFollowUpAction.tsx` → opens the Add-to-Deal-Calendar form (creates a calendar event/task).
- "Outstanding items" in the rundown are derived from calendar events (`EndOfDayTab.tsx:491` `const outstanding = useMemo<TileEvent[]>...`), not user-created entries. There is no code path that promotes a Claap `action_items[i]` into a new outstanding rundown row.

Verdict: **no** — Claap action items can become tasks, emails, or calendar entries, but not a standalone outstanding rundown item.

---

### 6) Assign a task to a user other than the creator — **Yes**

- `QuickCreateTaskDialog.tsx` exposes a full "Assign to" picker over `teamMembers` with open-task counts (`useAssigneeOpenTaskCounts`), remembers the last assignee in localStorage (`LAST_ASSIGNEE_KEY`), and passes `assigned_to: input.assigned_to` to `createTask` (`EndOfDayTab.tsx:1074`).
- Backend: `src/hooks/useTasks.ts` honors `assigned_to`, fires assignment/reassignment Zapier webhook and email notifications (lines 664, 681). A live in-app banner is shown to assignees by `src/components/TaskAssignmentBanner.tsx`.

Verdict: **yes** — fully implemented.

---

## Summary

| # | Capability | Status |
|---|---|---|
| 1 | Add to deal calendar from rundown | Partial (highlight-only; no per-tile button) |
| 2 | Tasks auto-identify linked deal | Yes (`lockInitialDeal`) |
| 3 | Reassign auto-assigned-to-external tasks | Auto-assign-to-external prevented by design; reassign itself works |
| 4 | Two notification icons clearing logic | No — bell badge has no clear/mark-read UI |
| 5 | Claap action items → outstanding item | No (only → task / email / calendar) |
| 6 | Assign task to non-creator | Yes |

No files were modified. Awaiting your direction on which gaps (#1, #4, #5 in particular) you'd like a fix plan for.
