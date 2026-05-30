# Extend intelligent action-item UX to all Daily Rundown actions

The Claap recording action-item now resolves to an Auto-matched / Suggested chip with inline Approve/Change. Extend the same pattern to the four other action items on each meeting card.

## Scope

Files touched (one focused build):

```text
supabase/functions/rundown-rank-deals-for-meeting/index.ts        (new)
supabase/functions/rundown-prefill-followup/index.ts              (new)
supabase/functions/rundown-prefill-tasks/index.ts                 (new)
supabase/functions/rundown-suggest-schedule/index.ts              (new)
supabase/functions/_shared/rundown-scoring.ts                     (new)
src/components/dashboard/MeetingDealInlineAction.tsx              (new)
src/components/dashboard/MeetingFollowupInlineAction.tsx          (new)
src/components/dashboard/MeetingTasksInlineAction.tsx             (new)
src/components/dashboard/MeetingScheduleInlineAction.tsx          (new)
src/components/dashboard/EndOfDayTab.tsx                          (wire-in)
supabase/migrations/<ts>_rundown_assert_examples.sql              (new)
```

All four new components follow the existing `MeetingClaapInlineAction` shape: identical 4 s timeout, abort-on-unmount, try/catch with silent fallback to the legacy CTA, no error toast, independent state, and an "AI suggested" sparkle icon when pre-filled.

## 1. Link to deal

Edge function `rundown-rank-deals-for-meeting` scores every active deal in the tenant for the meeting:

- attendee email-domain → `deals.company_id` match: **+0.40**
- attendee email → `deals.contact_id` match: **+0.30**
- token Jaccard ≥ 0.5 between meeting title and deal name/borrower/lender: **+0.25**
- deal touched in last 14 days: **+0.15**
- existing `deal_meetings` row: **+0.50** (treated as confirmed link)
- cap at 1.00

Bands:
- ≥ 0.90 → Auto-matched (green pill, ▶ Deal name, Approve / Change)
- 0.65–0.89 → Suggested (amber pill, Approve / Reject / Change)
- otherwise → legacy "Link to deal" CTA

Approve writes `deal_meetings` row `{ meeting_id, deal_id, source: 'auto' | 'manual' }`. Click on the deal name opens `/deals/:id` in a new tab.

## 2. Send follow-up

If a Claap recording is Auto-matched on this meeting AND has `ai_summary` or `transcript`:
- Call `rundown-prefill-followup` → reuses existing follow-up generator (`generate-followup-email` or equivalent) seeded with the recording's summary/transcript and primary attendee.
- Render `▶ Draft ready: Follow-up to <attendee>` with **Review & send** button (opens existing composer with draft).
- No recording → keep legacy CTA.

## 3. Create task

If Auto-matched recording has Claap-extracted action items OR we can run `claap-extract-action-items`:
- Render `▶ N tasks suggested` + **Review** button (opens existing task-batch review modal pre-populated).
- None → legacy CTA.

## 4. Schedule next

`rundown-suggest-schedule` reads the recording summary/transcript and looks for cadence phrases ("next week", "in two weeks", "monthly", "follow up Friday", etc.) via lightweight regex + a Gemini fallback for ambiguous phrases.
- If a date can be resolved → `▶ Suggested: <Date> follow-up with <attendee>` + **Schedule** button (opens existing scheduler pre-filled).
- Otherwise → legacy CTA.

## Shared rules (all four)

- Each component owns its own state, runs in parallel on card render, never blocks the others.
- 4 s timeout; on timeout or error the legacy CTA renders silently (no toast).
- All RPCs check `supabase.auth.getUser()` → 401 if missing, then use a user-scoped client so tenant RLS applies.
- A small `Sparkles` icon (lucide) sits next to any pre-filled action.

## SQL test

`rundown_assert_examples()` PL/pgSQL function asserts that for the existing Datarails | 5th Line, Shimmy Ruben & James Turner, and Blount Consulting fixtures:
- deal link resolves to the expected deal id with score ≥ 0.90
- follow-up pre-fill returns a non-empty draft body
- task pre-fill returns ≥ 1 task

Raises `EXCEPTION` on mismatch. Callable manually from the SQL editor; not wired to a trigger.

## Non-goals

- No changes to the existing Claap inline action (already shipping correctly).
- No changes to the legacy CTAs themselves — they remain the fallback render.
- No schema changes beyond the test function (the `deal_meetings` table is assumed to already exist; if it doesn't, that's a follow-up migration the user should confirm before we add it).

## Open question before I build

The `deal_meetings` join table — does it already exist, or should the Approve action write to a different table (e.g. `meeting_links`, `calendar_event_deals`)? I'll grep on build start; if it's missing I'll surface that and pause on Approve wiring rather than invent a schema.
