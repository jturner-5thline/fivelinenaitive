## Suggest Times — AI Assist email feature

A new "Suggest Times" flow alongside the existing Schedule Meeting button in the AI Assist email panel. Users generate calendar-aware time slot suggestions, insert them into the draft as clickable booking links, and recipients can confirm a slot with one click to auto-book the meeting.

### Scope

**1. UI — AI Assist right rail**
- Add `Suggest Times` button under existing `Schedule Meeting`.
- Inline panel with controls: duration (15/30/45/60, default 30), window (3/5/7/14 business days, default 5), working hours (prefilled from `useUserCalendarPrefs`), TZ + recipient TZ toggle, slot count (3/5/7, default 5), buffer (0/15/30, default 15), avoid back-to-back toggle (on), focus-time-friendly toggle (off), format (bulleted/inline/numbered).
- Generated slots render as editable, removable chips (±15min nudge).
- "Insert into draft" injects formatted text + per-slot confirm links at cursor in the reply composer.
- After insertion: collapsed state with "Slots inserted — Edit times".

**2. Slot generation**
- New `lib/calendar/freebusy.ts` wrapping existing `calendar-freebusy` edge function (already present) for the signed-in user.
- New `lib/calendar/generateSlots.ts` — pure function: takes busy blocks + constraints, returns N candidate slots respecting business days, working hours, buffer, back-to-back avoidance, and focus-time rule.

**3. Backend**
- Migration: `proposed_meeting_slots` (id, thread_id, user_id, recipient_email, slot_start, slot_end, status enum proposed/accepted/expired, token uuid unique, expires_at default now()+7d, created_at). RLS: owner can CRUD their own; public read by token for confirm page.
- Edge function `confirm-meeting-slot`: validates token, calls `events.insert` via Nylas (existing pattern used by current Schedule Meeting flow), marks slot accepted + siblings expired, returns confirmation payload. No JWT required (public).
- Edge function `create-proposed-slots`: bulk-inserts proposed slots for a thread, returns rows with tokens. JWT verified.

**4. Public confirm route**
- `/schedule/confirm?token=<uuid>` — public page that calls `confirm-meeting-slot`, shows success or "no longer available".

**5. AI Assist integration**
- When `Draft Reply` AI detects scheduling intent (regex/LLM signal on thread text), auto-call slot generator with defaults and surface "Insert suggested times" chip in the draft preview card.

### Technical details

- `proposed_meeting_slots` token URL: `${window.location.origin}/schedule/confirm?token=<uuid>` (NOT `app.naitive/schedule/confirm` — use current origin so it works in preview + production).
- Sibling expiry done in the same edge function transactionally: `UPDATE … SET status='expired' WHERE thread_id=$1 AND id<>$2 AND status='proposed'`.
- Reuse Nylas grant lookup pattern from `calendar-freebusy` (gmail_tokens.grant_id).
- Calendar event creation: `POST /v3/grants/{grantId}/events?calendar_id=primary` with attendees=[recipient,user], conferencing none for now (parity with existing flow — will extend later if needed).
- Slot generation algorithm:
  1. Build candidate grid: for each business day in window, walk working hours in `duration + buffer` increments.
  2. Filter out any candidate overlapping a busy block (± buffer if avoid-back-to-back on).
  3. If focus-time-friendly: drop candidates that would leave a free remainder <60min in their enclosing free block.
  4. Spread N picks across days (round-robin per day) for diversity.
- Format helpers in `lib/calendar/formatSlots.ts` (bulleted/inline/numbered, dual-TZ optional).
- Composer insertion: extend existing reply composer to expose an imperative `insertAtCursor(html)` ref or, if not available, append to current draft value. Will inspect the composer component during implementation.

### Verification

Run through user's 5-step flow in `/admin` preview.

### Files touched (estimate)

New:
- `src/components/email/SuggestTimesPanel.tsx`
- `src/lib/calendar/generateSlots.ts` (+ test)
- `src/lib/calendar/formatSlots.ts`
- `src/pages/ScheduleConfirm.tsx` + route in `App.tsx`
- `supabase/functions/create-proposed-slots/index.ts`
- `supabase/functions/confirm-meeting-slot/index.ts`
- Migration for `proposed_meeting_slots`

Modified:
- AI Assist email panel component (locate via search for existing "Schedule Meeting" button)
- AI draft preview card to surface the "Insert suggested times" chip when scheduling intent detected
- Reply composer to expose cursor-insert API if missing