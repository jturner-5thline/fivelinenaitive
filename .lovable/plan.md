# Add to Deal Calendar — shared highlight/right-click workflow

A reusable pattern that lets users highlight any narrative text on a supported surface, right-click, and convert that snippet into a dated **task/to-do** or **event** on the relevant deal calendar — with full backlink traceability.

## Reuse what already exists

- **Tasks**: `public.tasks` (has `deal_id`, `due_date`, `assignee`, etc.) — used for "Task / To-do".
- **Events**: `public.deal_calendar_items` (has `deal_id`, `date`, `time`, `type` ∈ meeting/deadline/reminder/note) — used for "Event".
- **Date parsing**: `chrono-node` (already in deps, used elsewhere).
- **Confirmation modal**: small new dialog; reuses existing deal-picker + assignee patterns from `QuickCreateTaskDialog`.

No replacement of those systems — we only add a new entry point + a backlink store.

## Architecture

```text
TextSurface (memo, claap summary, rundown item, agenda, report, comment)
        │
        │ wrapped by <AddToDealCalendarProvider sourceCtx={...}>
        │   ├─ captures selection (mouseup) + custom context-menu (onContextMenu)
        │   └─ shows floating "Add to Deal Calendar" pill
        ▼
useAddToDealCalendar()  ← shared hook + context
        │
        ├─ parseRelativeDate(text, anchorTs)   (chrono-node, anchored to source ts)
        ├─ openConfirmDialog(prefill)
        ▼
<AddToDealCalendarDialog />
        │ user picks: Task/To-do vs Event, deal, date, assignee/owner
        ▼
On save:
  - if Task → insert into tasks
  - if Event → insert into deal_calendar_items
  - always insert one row into calendar_item_sources (backlink)
  - toast: "Added to {Deal} calendar for {date}" + "Open calendar" link
```

`SourceCtx` is the contract every surface implements:

```ts
type SourceCtx = {
  module: 'meeting_notes' | 'claap_summary' | 'rundown_item' | 'agenda'
        | 'report' | 'comment' | 'deal_memo' | 'other';
  recordId: string;          // id of the note/meeting/etc.
  sourceTimestamp: string;   // ISO — anchor for relative-date parsing
  dealId?: string | null;    // preselect when known
  deepLinkUrl?: string;      // for "Jump to source"
  label?: string;            // e.g. "Worthy ↔ 5th Line Sync — Notes"
};
```

## Database

One new table for traceability. Re-using `tasks` and `deal_calendar_items` for the actual items.

```sql
CREATE TABLE public.calendar_item_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- exactly one of these is set, enforced by trigger
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  deal_calendar_item_id UUID REFERENCES public.deal_calendar_items(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  source_module TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  source_timestamp TIMESTAMPTZ NOT NULL,
  source_text TEXT NOT NULL,           -- highlighted snippet snapshot
  source_deep_link TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- + GRANTs, RLS scoped via deal_id ownership, indexes on (task_id),
--   (deal_calendar_item_id), (deal_id), (source_module, source_record_id).
```

The created item itself is just a normal task or calendar item — nothing about the backlink is needed to render it. The backlink table powers the "View source" affordance and audit.

## Date parsing

`src/lib/parseRelativeDate.ts`

- Wrap `chrono-node` with `{ instant: new Date(sourceTimestamp), timezone: userTz }`.
- Return `{ date: Date | null, confidence: 'high' | 'low' | 'none', matchedText, ambiguous }`.
- Phrases like "by Tuesday", "next Thursday", "end of week", "tomorrow", "in two days" → high.
- "soon", "later this month with no anchor" → low/none → require user confirm; field stays editable.

## Shared UI pieces (new)

- `src/components/calendar/AddToDealCalendarProvider.tsx`
  Context that exposes `openFromSelection(selectionText, sourceCtx)`. Renders the dialog once at the provider root.
- `src/components/calendar/HighlightCalendarMenu.tsx`
  Wraps any text region. Adds:
  - `onContextMenu` → shadcn `ContextMenu` with single "Add to Deal Calendar" item (only when selection ⊆ this region and non-empty).
  - Floating action pill (anchored to selection rect) for non-right-click users.
  Both call `provider.openFromSelection(...)`.
- `src/components/calendar/AddToDealCalendarDialog.tsx`
  - Toggle: **Task / To-do** ↔ **Event** (segmented control, required choice).
  - Fields: title (prefilled = first sentence/snippet, trimmed), date (with parsed badge "Parsed from: 'by Tuesday'"), time (event only), deal picker (locked when sourceCtx.dealId set, else searchable), assignee/owner (Task only; defaults to current user), source preview (read-only quote block with module + timestamp).
  - Save → insert + backlink + toast `Added to {DealName} calendar for {date}` with action `Open calendar` → `/deals?deal={id}#calendar`.

## Shared hook

`src/hooks/useAddToDealCalendar.ts`

- `openFromSelection(text, ctx)` → parses date anchored to `ctx.sourceTimestamp`, opens dialog with prefill.
- `save({kind, dealId, title, date, time, assigneeId, ctx, originalText})` →
  - `kind==='task'`: insert into `tasks` (deal_id, title, due_date, assignee, status='open', created_by).
  - `kind==='event'`: insert into `deal_calendar_items` (deal_id, title, date, time, type: 'deadline' for due-style, 'meeting' for true events with a time — chosen by user via small subtype select).
  - Always insert into `calendar_item_sources` with the snapshot.
  - Invalidates relevant React Query keys.

## Surface integration (v1)

Mount `<AddToDealCalendarProvider>` once near the dashboard root so all child surfaces can call it. Wire `HighlightCalendarMenu` into the highest-leverage surfaces first:

1. Meeting detail notes/summary (Daily Rundown → meeting drawer body)
2. Claap summary text blocks
3. Daily Rundown action-item text
4. Agenda item descriptions
5. Report narrative blocks
6. Comments

Each integration is ~5 LOC: import the wrapper and pass a `SourceCtx`. Surfaces with no linked deal pass `dealId: null` — the dialog requires the user to pick one (never silently fuzzy-matches).

## "View source" on calendar items

- Existing calendar/task list rows get a small "From: {module}" chip when a backlink exists (joined from `calendar_item_sources`). Click → opens `source_deep_link` in new tab, or scrolls to the source if same route.

## Acceptance / verification

- Highlight in a meeting note → right-click → menu shows "Add to Deal Calendar".
- Dialog prefills deal (when ctx has one), parses "by Tuesday" relative to the note's created_at (not now), lets user choose Task vs Event.
- Saving creates the row in the correct table, creates a `calendar_item_sources` row, and shows the success toast with the calendar link.
- Refresh → item persists on the deal calendar. Open the item → "View source" jumps back.
- No silent deal attachment when context lacks a deal.

## Out of scope for v1

- Bulk highlight → multiple items.
- AI rewrite of the snippet into a cleaner title.
- Editing the backlink after creation (display only).
- Adding the menu to non-narrative surfaces (tables, charts).

## Implementation order

1. Migration: `calendar_item_sources` table + GRANTs + RLS + indexes.
2. `parseRelativeDate` util + small unit smoke usage.
3. `useAddToDealCalendar` hook + provider + dialog.
4. `HighlightCalendarMenu` wrapper (context menu + selection pill).
5. Mount provider at app root; integrate into surfaces 1–3 (meeting notes, Claap summary, Rundown items).
6. Add backlink chip + "View source" on existing calendar/task rows.
7. Verify in preview on a real meeting note.
