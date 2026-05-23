## Remediation Plan — AI Email Assistant fixes #5/#6/#3/#2/#1/#4

Scope: all 18 actionable findings from the verification report. Classifier weights stay at current values (0.99 / 0.7 / 0.5 / 0.4); the spec doc is updated to match. Live-OAuth smoke tests (#2f / #1f / #4h) and cron-schema verification (#4d) remain user-side — I'll surface what to check after deploy.

The plan is grouped by execution phase so we can land it in one DB migration + a small batch of edge-function/UI edits.

---

### Phase 1 — Schema migration (single migration)

1. **`recognition_log.message_id`** — already exists nullable, but `classify-email-thread` writes NULL. No schema change; fixed in Phase 2 by populating it.
2. **`recognition_log.candidates`** — already jsonb. No schema change; populated in Phase 2.
3. **`meeting_holds.google_event_id`** — existing; no change. Append `extendedProperties.private.naitive_hold_id` is a Nylas event-payload concern, no DB change.
4. **Cron job** — create `meeting-holds-sweep` cron at 15 min if not present (idempotent insert into `cron.job` via `cron.schedule`).
5. **Seed `meeting_title_templates`** for 5th Line tenants — one Default row + 7 stage-matched rows per `org_company_id` belonging to 5thline.co domain. Insert via `supabase--insert` (data not schema).

### Phase 2 — Edge-function edits (`smart-email-ai`, `gmail-messages`, `classify-email-thread`, `meeting-holds`)

6. **#5b Writer wiring (outbound)** — in `smart-email-ai/index.ts`, add new action `log_email_activity` that inserts a full email row into `activity_logs` with all new columns (`direction='outbound'`, subject, body, from/to/cc/bcc, message_id from Gmail send response, thread_id, sent_at, provider='gmail'). Invoked by the existing send path right after the Gmail send call.
7. **#5b Writer wiring (inbound)** — in `gmail-messages/index.ts` (the sync ingest path), after upserting each `gmail_messages` row, if the message resolves to a deal via `email_threads.matched_deal_id`, additionally upsert one `activity_logs` row keyed by `message_id` (ON CONFLICT DO NOTHING via the existing unique partial index).
8. **#6a `candidates[]` population** — in `classify-email-thread/index.ts`, change the recognition_log insert to write `candidates: result.candidates ?? []`. In `classifier.ts`, add a `candidates` field to the return shape containing the ranked top-5 `{deal_id, score, signals[]}` considered.
9. **#6c Threshold alignment** — change UI chip thresholds to `0.6 / 0.3` (currently 0.6 / 0.4) so telemetry and UI agree. Edit `classifier.ts` constants only.
10. **#6g `message_id` population** — in `classify-email-thread/index.ts`, write the latest message's `gmail_message_id` into `recognition_log.message_id` (instead of NULL).
11. **#4c `— Pending` suffix + `naitive_hold_id` ext-prop** — in `meeting-holds/index.ts` `runCreate`, append ` — Pending` to the Nylas event title and pass `{ extendedProperties: { private: { naitive_hold_id: <row id> } } }` on the create call.
12. **#4a Refill window ±5 business days** — in `MeetingSchedulerCard` re-verify branch, replace the generic slot generator call with one explicitly windowed to `[firstChosenSlot, +5 business days]`, mirroring the documented behavior.

### Phase 3 — Client / UI edits (additive)

13. **#3c Settings seeder** — `MeetingTitleSettings.tsx` already loads SEED_TEMPLATES client-side. Add an on-mount upsert (admin-only) that persists missing seed rows to `meeting_title_templates` so they're visible to other users; idempotent.
14. **#3e Reply subject guard** — extend `useRenderMeetingTitle` consumers (`StageMeetingTitleChip`, `MeetingSchedulerCard.onSetSubject`) to accept a `isReply` flag; when true, return `Re: <original>` instead of the rendered title. Wire `isReply` from `InlineReplyComposer` / `EmailComposerCard`.
15. **#6e "Confirm link" pill on Communications tab** — in `DealCommunicationsTab.tsx`, when a row's recognition outcome is `suggested` (joined via `activity_logs.message_id → recognition_log.message_id`), render an inline "Confirm link" pill that writes a `recognition_overrides` row on click.
16. **#4f Per-slot status dots green/amber/grey/red** — extend `SlotStatus` union to include `'amber' | 'grey' | 'red'` and map: clean→green, refilled→amber, limited-unknown→grey, conflict→red. Pure presentational.
17. **#2b ±1-week prefetch** — in `useCalendarEvents`, after the primary fetch, fire-and-forget prefetch the prior and next ranges via `queryClient.prefetchQuery`.
18. **#2d react-window virtualization** — wrap the time-grid rows in `react-window`'s `FixedSizeList`. Already a dep; if missing, `bun add react-window`.

### Phase 4 — Documentation only (no code behavior change)

19. **#6b Spec doc** — update the comments in `classifier.ts` so the documented weights match the implemented constants (0.99 / 0.7 / 0.5 / 0.4), and note thresholds 0.6 / 0.3.

### Phase 5 — Deploy + smoke

Deploy `smart-email-ai`, `gmail-messages`, `classify-email-thread`, `meeting-holds`. Then ask the user to run the three live-OAuth smoke tests (#2f / #1f / #4h) and to verify the `meeting-holds-sweep` cron row.

---

### Items explicitly NOT done

- **#5d Backfill of historical `deals.notes`** — query shows zero candidate rows (0 deals match AI-email-shape regex). I'll add a no-op stub script under `supabase/scripts/` but won't run any destructive migration.
- **#6h `deal_contacts` table** — the spec called for this table; the classifier uses `contact_deals` instead. Keeping `contact_deals` (current behavior) and reconciling the spec text in the same Phase-4 doc edit.
- **#6b weight rewrite** — user opted to keep current code.
- **#4d cron verification, #2f / #1f / #4h live smoke** — require permissions/sessions I don't have from here.

### Files touched

- `supabase/functions/smart-email-ai/index.ts`
- `supabase/functions/gmail-messages/index.ts`
- `supabase/functions/classify-email-thread/index.ts`
- `supabase/functions/classify-email-thread/classifier.ts`
- `supabase/functions/meeting-holds/index.ts`
- `src/components/settings/MeetingTitleSettings.tsx`
- `src/components/deal/email/MeetingSchedulerCard.tsx`
- `src/components/deal/email/StageMeetingTitleChip.tsx`
- `src/components/deal/email/InlineReplyComposer.tsx` (pass `isReply`)
- `src/components/deal/DealCommunicationsTab.tsx`
- `src/hooks/useCalendarEvents.ts`
- `src/components/calendar/NaitiveCalendar.tsx`
- One new migration for the sweep cron + (separately, via insert tool) the 5th Line seed templates.

Approve to proceed and I'll execute Phases 1-5 in order.
