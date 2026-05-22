# Meeting Scheduler — Consolidated Fix Plan

Five gaps to close from Asana 1215032669126149. Listed in build order. Zoom (part 3) requires you to create a Zoom OAuth app first; everything else I can ship without you.

---

## Part 1 — Fix "silent failure" on Find free slots (P1)

The popover already has slot-list rendering, error states, and persistence wired. The "silent close" the reporter saw is almost certainly the form-submit problem: the popover lives inside the `EmailComposerCard`'s form, and the trigger `Button` defaults to `type="submit"`. Clicking it submits the form, the email dialog closes, the popover unmounts mid-fetch — looking like a no-op.

Fix:
- Audit every `<Button>` inside `InsertAvailabilityPopover` — all need `type="button"` (the inner Find/Insert buttons already have it; the trigger button does, but the Add-teammate button does not).
- Stop event propagation on click of Find free slots so a parent form can't intercept.
- Add explicit `[InsertAvailability]`-prefixed `console.error` on every catch + after each setError.
- Slot list already renders grouped-by-day with checkboxes; add skeleton loader rows during fetch and clearer empty-state copy.

## Part 2 — Insert formatting + persistence polish (P1)

Existing flow already inserts HTML and writes to `naitive_proposed_slots`. Tighten:
- Match copy exactly: "Here are a few times that work for me (all times Eastern): … Let me know what works and I'll send a calendar invite."
- Force tz label to ET regardless of local tz in the body text (the model is "I propose Eastern times").
- Add columns to `naitive_proposed_slots`: `recipient_emails text[]`, `meeting_id uuid`, `conferencing_provider text`, `conferencing_meeting_id text`. Keep existing `recipient_email` for back-compat.
- Toast: "N slots inserted and held until accepted".
- Close popover only after the DB insert resolves (currently it closes optimistically).

## Part 3 — Zoom OAuth (P1) — NEEDS YOUR ACTION FIRST

To build this I need you to:
1. Create a Zoom OAuth app at https://marketplace.zoom.us/develop/create → General App → User-managed.
2. Redirect URL: `https://tgkksvazruzbghssnxde.supabase.co/functions/v1/zoom-auth/callback`
3. Scopes: `meeting:write:meeting`, `meeting:read:meeting`, `user:read:user`
4. Send me **Client ID** and **Client Secret** via the secrets prompt I'll trigger.

What I'll then ship:
- Table `user_integrations` (provider, access_token, refresh_token, expires_at, scope, account_id).
- Edge functions `zoom-auth` (init + callback + refresh) and `zoom-create-meeting`.
- "Connect Zoom" card in Settings → Integrations.
- Conferencing dropdown in popover footer + calendar dialog with greyed/tooltipped options based on which providers are connected (Google Meet default, Teams stub, Zoom, None, Phone).
- On Send with one slot + Zoom: create meeting, inject Join Zoom block into email body, set conferencing fields on the slot row to 'booked'.
- Multi-slot + Zoom: append "I'll send the Zoom link once we lock the time."

**If you want me to skip Zoom again, say so and I'll ship parts 1, 2, 4, 5 only.**

## Part 4 — Wire "Schedule next" (P2)

- New `src/components/scheduling/FindATimeDialog.tsx` — full-screen Dialog reusing the popover's controls/slot list, plus the conferencing dropdown (greys Zoom if part 3 isn't done yet).
- "Send invite" CTA creates the Gcal event directly via the existing `calendar-events` edge function (no email composer flow).
- Hook from End-of-Day meeting detail → Action Items → Schedule next button.

## Part 5 — Gcal connection guard (P2)

- On popover mount, call a small probe (cheap `calendar-events` list with `max_results=1`) and flip a `gcalConnected` flag.
- If false: yellow chip at top with "Connect Google Calendar in Settings → Integrations" + "Connect now" button → `/settings/integrations`. Disable "Find free slots" until connected.

---

## Technical notes

- Migration adds 4 columns to `naitive_proposed_slots` (additive, no breakage) and creates `user_integrations` only if you green-light Zoom.
- Skipping Zoom: parts 1, 2, 4, 5 are pure frontend + tiny migration (~30 min of compute).
- With Zoom: add ~1 edge function file + OAuth flow + Settings UI + dropdown wiring (~2x the work) and is gated on your Zoom app credentials.

---

## Two questions before I start

1. **Zoom: build it or skip it again?** Same answer as last time ("skip Zoom") is totally fine — parts 1/2/4/5 still close most of the bug report.
2. The conferencing dropdown's "Microsoft Teams" option — there's no MS integration in the project today. OK to render it permanently greyed with "Microsoft 365 integration coming soon"?
