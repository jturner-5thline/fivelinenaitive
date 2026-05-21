## Goal

Turn the existing "Schedule Meeting" tile in the email AI Assist quick-actions toolbar into a compact popover anchored to that tile, with a true in-app calendar booking experience — visual week grid, editable invite fields, one-click Google Calendar create with Meet link, and a graceful fallback to the existing propose-by-email flow.

## What changes

### New component: `QuickBookMeetingPopover.tsx`
Compact popover anchored to the Schedule Meeting tile (no full-screen modal). Sections, top to bottom:

1. **Header** — "Schedule meeting" title, X close button.
2. **Calendar status guard** — if `calendar-status` reports no connected calendar, render a small "Connect your calendar" prompt linking to `/integrations` and stop here.
3. **Duration toggle** — pill row: 15 / 30 / 45 / 60 / 90 min. Persists to existing `naitive.meetingScheduler.durationMinutes` localStorage key so it stays in sync with the legacy card.
4. **Mini weekly calendar grid** —
   - 5-column Mon–Fri view (current week by default), prev/next-week arrows, "Today" pill.
   - Working hours 9 AM–5 PM in the user's persisted timezone, 30-min row resolution.
   - Visual layers: user's Google Calendar busy blocks in gray; AI-recommended best-fit slot (from the existing availability suggester) in green with a small "Best fit" badge; secondary AI slot suggestions in blue.
   - Click any open slot → outline-selected; selected slot drives the editable fields below.
   - Conflicts: if a selected slot overlaps a busy block, show an inline warning chip `Conflicts with: <event title>` but allow override.
5. **Quick-create invite fields** —
   - **Title** input (pre-filled `Re: <thread subject>` or `<deal name> — Intro call`).
   - **Date / start–end time** (pre-filled from grid selection, editable via shadcn time pickers).
   - **Attendees** chip editor (`Me`, latest sender, plus any other email participants extracted from the thread; type-to-add + remove). Same dedup logic as the existing scheduler.
   - **Location / video** — default chip "Google Meet (auto-generated)"; toggle to switch to custom location text input.
   - **Description / notes** — pre-filled with a short AI-generated agenda derived from the thread (reuse the existing `summarizeSelectedEmailThread` util, trimmed to ~3 bullets).
   - **More options** (collapsed) — recurrence, reminder, visibility selects.
6. **Primary CTA row** — `Book meeting` (creates the event) + `Cancel`.
   - On book:
     a. Call `calendar-events` edge function with `action: 'create'`, `add_meet_link: true`, the selected timezone, attendees, title, description.
     b. Toast: `Meeting booked for <day, time>. Invite sent to <N> attendees.`
     c. Append `Meeting booked for <day, time> — invite sent.` (plus Meet link) to the reply draft via the existing `onInsertDraft` callback.
     d. If `dealId` is set, write a `meeting_booked` entry to `deal_audit_log` with thread/event metadata so it shows in the deal Activity feed.
     e. Close the popover.
7. **Secondary link** — `Propose via email instead` at the bottom; collapses the popover and opens the legacy `MeetingSchedulerCard` inline (existing propose +1hr / propose anyway behavior preserved).

### Wiring changes

- `EmailQuickActionsToolbar.tsx`
  - Wrap the `meeting` tile in a shadcn `<Popover>`; the trigger is the existing `AIAssistActionButton`. Content = `<QuickBookMeetingPopover>` anchored with `align="start" side="bottom" sideOffset={6}`.
  - Keep `<MeetingSchedulerCard>` rendering as the inline panel only when the popover requests the "propose via email" fallback (controlled by a new `mode` state — default `quick-book`, falls through to `propose`).

- `AiAssistSidebar.tsx`
  - The existing `schedulerOpen` flow (line 690 + line 1446) currently opens the legacy card directly when the AI hint detects a scheduling intent. Switch that trigger so it now opens the new popover anchored to the meeting tile in the quick-actions toolbar (via a shared `scheduleIntent:open` window event the toolbar already listens for, or via a small lifted state). Legacy propose flow remains reachable through the popover's "Propose via email instead" link.

### Edge function / data
- Reuse existing `calendar-events` function (already supports `action: 'list'` for busy and `action: 'create'` with `add_meet_link: true` and timezone). No backend changes required.
- Reuse `calendar-status` to detect whether to show the Connect prompt.
- Activity log: insert into `deal_audit_log` with `action_type='meeting_booked'`, `entity_type='calendar_event'`, `entity_name=<title>`, `metadata={ event_id, start, end, attendees, meet_link, thread_id }` via the user-scoped Supabase client.

### Visual style
- Match the AI Assist dark theme: `rounded-xl`, `bg-card/95 backdrop-blur`, `border-white/10`, subtle shadow, ~360px wide × auto height, max-height ~520px with internal scroll. Anchored to the tile so it reads as a quick-action overlay.

## What stays unchanged
- `MeetingSchedulerCard.tsx`, `AvailabilityCheckCard.tsx`, `OpenAvailabilityCard.tsx` are not modified. Legacy flows reachable via the "Propose via email instead" link.
- `calendar-events`, `calendar-status` edge functions unchanged.

## Out of scope
- Multi-week month view.
- Drag-to-select on the grid (click only).
- Editing existing busy events.
- Cross-tenant calendar invites beyond what Nylas already supports.

## Risk / verification
- Smoke: open thread → click Schedule Meeting → popover appears anchored to the tile, busy blocks load, AI slot is badged "Best fit", change duration, pick a slot, edit title, add an attendee, click Book → toast + draft line appended + (if linked) Activity entry.
- Fallback: disconnect calendar → popover shows Connect prompt only.
- Regression: existing propose-by-email path still reachable via the secondary link, and no behavior change to AvailabilityCheckCard or OpenAvailabilityCard auto-surfacing.