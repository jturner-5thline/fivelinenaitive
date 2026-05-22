# Lender status timestamps — end-to-end

## Goal
Make every status transition on `deal_lenders` (Submitted, Passed, Declined, Approved) write a dated timestamp the UI can show on lender cards, in the lender pop-up, and as a sort key. Backfill historical rows best-effort from `deal_activity_log`.

## Phase 1 — Data layer (migration)

**1. Schema** — `ALTER TABLE public.deal_lenders ADD COLUMN`:
- `submitted_at timestamptz`
- `passed_at timestamptz`
- `declined_at timestamptz`
- `approved_at timestamptz`
- `last_status_change_at timestamptz`

Indexes on `(deal_id, submitted_at desc)` and `(deal_id, last_status_change_at desc)` to back the new sort options.

**2. Trigger** — `BEFORE UPDATE OR INSERT` function `public.deal_lenders_set_status_timestamps()`:
- Resolve a normalized status from `NEW.tracking_status` / `NEW.stage` / `NEW.substage` using the same mapping `bucketLenders` uses (`onDeck | inReview | termsIssued | passed | declined | approved | submitted`).
- On INSERT: if the resolved status is one of submitted/passed/declined/approved, set the matching `*_at = now()` and `last_status_change_at = now()`.
- On UPDATE: if the resolved status changed vs OLD, set the matching `*_at = now()` (only when the column is currently NULL or the status is re-entering) and always bump `last_status_change_at = now()`. Never null-out an existing `*_at`.
- Honors the existing `app.allow_clear = 'on'` GUC escape hatch (consistent with the persistence safeguards from the earlier deals migration).

**3. Backfill** — one-shot block in the same migration:
- For each `deal_lenders` row, scan `deal_activity_log` where `entity_type='deal_lender'` (or `metadata->>'lender_id'` matches) for transitions whose new status maps to submitted/passed/declined/approved. Take the earliest matching event per status and write its `created_at` into the column.
- If no log entry exists, leave NULL (UI falls back to `created_at` with `~`).
- Set `last_status_change_at = COALESCE(greatest of *_at, updated_at)`.

**4. RLS** — confirmed already company-scoped via the deal's `company_id`. The new columns inherit the same policy; no change needed.

## Phase 2 — UI

**A. Lender row / card (`LenderPipelineSnapshot`, lender list rows in Lender Matching & Sourcing)**
- Next to the status pill, render `formatStatusDate(lender)` → e.g. `Submitted Apr 14`, `Passed May 2`. Year shown only when not current (2026).
- Empty/legacy: when the matching `*_at` is NULL, fall back to `created_at` rendered as `~ Apr 14` with tooltip "approximate (legacy row, exact transition date not recorded)".
- Wrap in `<Tooltip>` showing full timestamp + time + user's local TZ via `Intl.DateTimeFormat(..., { timeZoneName: 'short' })`.

**B. Lender pop-up (`LenderStageManageDialog`)**
- New "Status history" section above notes. Vertical timeline of events sorted desc: Submitted → (In review) → Passed/Approved/Declined, each with date + tooltip-on-hover full timestamp.
- Items derived from the `*_at` columns. If all NULL, show "No recorded transitions — created {date}".

**C. Sort dropdown on /deals Lender Matching & Sourcing**
- Append two options to existing sort menu: `Most recently submitted` (order by `submitted_at desc nulls last`) and `Most recently updated` (order by `last_status_change_at desc nulls last`).
- Persist selection via the existing sort-pref store.

## Phase 3 — Tests / verification

- Unit test for `formatStatusDate` (year hiding rule, `~` fallback, TZ tooltip string).
- Trigger smoke test via `supabase--read_query`: update a test lender's status and assert the matching `*_at` populated and `last_status_change_at` bumped.
- Manual checklist: load Worthy and SG / Alignment under 5th Line, screenshot pill + tooltip + pop-up timeline.
- Permissions QA: re-fetch as jmoffitt@5thline.co (member, canSeeInsights=true) to confirm columns visible.

## Technical notes

- Status normalization helper goes in `src/lib/lenderStatusBuckets.ts` (already used by `LenderPipelineSnapshot`) so trigger + UI stay aligned. Trigger uses an inline SQL mapping that mirrors it.
- `formatStatusDate` lives in `src/utils/formatLenderCurrency.ts`-adjacent new file `src/utils/lenderStatusDate.ts` to keep concerns small.
- All updates respect existing `updated_at` optimistic concurrency check shipped in the persistence migration.
- No new deps; uses existing Tooltip, date-fns, recharts not needed for timeline (CSS-only).

## Deliverable
A PR-style summary at the end with: migration filename, trigger code excerpt, list of UI files touched, backfill row count for the 5th Line tenant, and screenshots of Worthy + SG / Alignment.
