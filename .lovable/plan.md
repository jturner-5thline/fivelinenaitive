## Stale Deal-Status Nudge — Phase 1 Plan (no code yet)

Code freeze remains in place. No changes to Schedule Meeting, NOTES generator, Draft Reply auto-populate, Availability Check, deal recognition, calendar render, edge functions, or send-pipeline. The previously-shipped `create_calendar` / `calendar_id` / `GCAL_SMOKETEST_CALENDAR_ID` changes remain default-off in production.

### 1. Target component (file paths quoted)

- **Status note input + "Last updated" label**: `src/pages/DealDetail.tsx` lines **3081–3119**. The note text lives in `deal.notes` (rendered via `RichTextInlineEdit`); the timestamp is `deal.notesUpdatedAt` (mapped from `dbDeal.notes_updated_at`, line 800).
- Persistence already updates `notes_updated_at` via the existing `updateDeal('notes', value)` mutation, so accepting an AI suggestion = writing to `deal.notes` through the same path (no schema change needed for the timestamp).
- Status-note history rows live in `deal_status_notes` (via `src/hooks/useStatusNotes.ts`) — already auto-archived when notes change.
- The nudge icon will be **absolutely positioned in the top-right of the note container** (the `<div className="w-full sm:w-[93%] flex flex-col gap-1">` wrapping `RichTextInlineEdit`), with `relative` added.

### 2. Stage gating

- "At or before Terms Issued" in the active pipeline. Resolution: read pipeline stages via `usePipelineStageConfig().getStageConfigForDeal(deal.stage, deal.pipelineId)`, look at the ordered stage list for that pipeline, compute the index of the current stage and the index of the `terms-issued`-labelled stage, show nudge only if `currentIdx <= termsIssuedIdx`.
- Exclusions: stage matches `isActiveDeal` from `src/lib/deals.ts` (already excludes Closed/Lost/Won/On Hold/Paused/Dead/Archived/Churn). We **reuse** `isActiveDeal(deal)` as the primary gate, then the at-or-before-Terms-Issued check.
- New helper: `src/lib/dealStageOrder.ts → isAtOrBeforeTermsIssued(deal, pipelineConfig): boolean`. Falls back to a documented label allowlist (`Initial Feedback`, `Lender Outreach`, `Term Sheets`, `Terms Issued`, etc.) when stage indices cannot be resolved.

### 3. Staleness predicate

- New pure util: `src/lib/businessDays.ts`
  - `businessDaysBetween(from: Date, to: Date, holidays: Set<string /* YYYY-MM-DD */>): number` — skips Sat/Sun and holiday set.
  - `isStatusNoteStale(lastUpdatedAt: Date | null, today: Date, holidays): { stale: boolean; businessDaysSince: number }`.
  - Rules: `null` lastUpdatedAt → `{ stale: true, businessDaysSince: Infinity }`. Threshold = **> 3** business days (so exactly 3 BD = not stale; 4+ BD = stale).
- **US federal holidays source**: hardcoded static list in `src/lib/usFederalHolidays.ts` for years 2025–2030 (10 fixed-date + observed Mon-following-Sun rules: New Year's, MLK, Presidents', Memorial, Juneteenth, Independence, Labor, Columbus, Veterans, Thanksgiving, Christmas). Documented + unit-tested. No network/runtime dependency.

### 4. Data-fetch layer for AI context

Reuse existing hooks where possible; no new edge functions.

| Datum | Source |
|---|---|
| Lenders sent / passed (count, names, dates, pass reasons) | existing `lender_deals` queries already used by `LendersPanel`; new tiny aggregator hook `useStaleNudgeContext(dealId)` will call the same selects |
| Recent client emails (to/from primary contact, last 14d) | reuse `useDealContextSummary` (already present in `src/hooks/`) |
| Most recent meeting summary | reuse the same summary util currently feeding `DealContextCard` (Claap/meeting_summaries table via existing selector) |
| Current stage + days-in-stage | derived from `deal.stage` + `deal_stage_history` (already queried in `useDealActivityStats`) |
| Outstanding items status | reuse `useDealTasks` / outstanding-items hook used by Active Pipeline checklist |

New hook `src/hooks/useStaleStatusNoteContext.ts` aggregates the above into one `StaleNudgeContext` object; **no new RPC** unless aggregation latency is too high — call it out for Phase 2 measurement.

### 5. AI prompt + reuse

- Single source of truth: extend `src/services/smartEmailTopic.ts`'s existing summarization invoker pattern → new sibling `src/services/smartStatusNoteSuggestion.ts` that calls `smart-email-ai` edge function with a NEW `action: 'suggest_status_update'` payload. **No edge-function code changes** in Phase 2 — the existing function already accepts arbitrary actions and falls through to a generic prompt; we pass the full prompt from the client. (If smoke-test shows the edge function ignores unknown actions, fall back to action: `generate_draft_options` with a system override.)
- Output contract enforced **client-side**:
  - System prompt: "You write a 1–2 sentence factual status update for a deal. Max 280 characters. Plain prose. No headers, no bullets, no signature, no quoted email, no 'Topic:' prefix. Reference at least one concrete datum (lender name, email date, meeting takeaway, or outstanding item)."
  - Post-process validator: trim, strip leading "Topic:" / "Status:" / bullet glyphs, collapse whitespace, hard-truncate at 280 chars at the last sentence boundary, assert 1–2 sentences (regex `/[.!?](\s|$)/g` count ≤ 2). On failure → one retry with stricter system message; second failure → surface "Generate again" affordance.

### 6. UI plan

- New component: `src/components/deal/StaleStatusNudge.tsx` (icon + popover + state machine).
- **Icon**: `lucide-react` `BellDot` at `h-3.5 w-3.5` (14px), color `text-amber-400/80` with `hover:text-amber-300`. Wrapped in a `button` absolutely positioned `top-2 right-2` inside the note container (which gets `relative`). Tooltip via existing `Tooltip` primitive: "Status hasn't been updated in {N} business days. Click to draft an AI update."
- **Popover**: Radix `Popover` (already in project — `src/components/ui/popover.tsx`), `align="end"`, width `w-[420px]`. Contents:
  1. Header: "AI status update suggestion"
  2. Current status (read-only quote block, muted)
  3. AI suggestion (loading skeleton → text). In edit mode, becomes a `<Textarea>`.
  4. Disclosure `<details>` "Generated from": bulleted list of sources used (e.g. "3 lenders sent (Advantage, Eastward, …)", "Last client email May 21", "Meeting summary May 18").
  5. Action row: `Accept`, `Edit` (toggles textarea + swaps Accept→Save), `Generate again`, `Cancel`.
- **Save path**: `Accept` / `Save` call the same `updateDeal('notes', value)` used by `RichTextInlineEdit`, then call `addStatusNote(oldNotes)` for history parity. Timestamp `notes_updated_at` is bumped by the existing trigger.
- **Audit**: write to existing `naitive_pipeline_audit` via `logNaitivePipelineAudit({ entityType: 'deal_transition', entityId: dealId, action: 'status_note_ai_suggest', context: { mode: 'accepted'|'edited'|'dismissed', suggestion, finalValue }})` — additive use of existing util (`src/lib/naitivePipelineAudit.ts`).
- **Insufficient activity** (no lenders sent AND no client emails in last 14d AND no recent meeting AND no outstanding items): popover renders fallback copy "Not enough recent activity to suggest an update — please update manually." with only `Cancel` + `Edit` buttons.

### 7. Permissions

- Owner, Manager, or admin only. Compute: `isOwner = deal.userId === user.id`, `isManager = deal.managerUserId === user.id || normalizedNameMatch(deal.manager, profile.fullName)`, `isAdmin = useUserPermissions().permissions.admin`. Helper: `src/lib/dealStaleNudgePermissions.ts`.
- Read-only users → icon never mounts.

### 8. Test plan

New test files:
- `src/lib/__tests__/businessDays.test.ts` — Vitest
  - 3 BD exactly → not stale
  - 4 BD across a weekend → stale
  - Holiday-only gap → not stale (Memorial Day → next biz day)
  - `null` lastUpdatedAt → stale, `Infinity`
- `src/lib/__tests__/staleNoteSanitize.test.ts` — Vitest
  - Strip "Topic:" prefix, bullets, signature blocks
  - Enforce ≤ 280 chars at sentence boundary
  - Reject 3-sentence outputs (regex assertion)
- `src/components/deal/__tests__/StaleStatusNudge.test.tsx` — RTL + Vitest
  - Hidden when `isActiveDeal === false` (Closed/Lost/Paused stage fixtures)
  - Hidden when stage index > Terms Issued
  - Hidden when permissions resolve to read-only
  - Visible + tooltip text correct when 4 BD stale
  - Click → suggestion resolves within 2s (mocked invoke)
  - `Accept` → calls `updateDeal('notes', suggestion)` once and writes audit row
  - `Generate again` → second invoke fires
  - `Edit` → textarea editable, `Save` writes edited value
  - Insufficient-activity context → fallback copy + only Cancel/Edit
  - Output assertion: `/^[^\n]{1,280}$/` and ≤ 2 sentences
- Playwright smoke (`tests/staleStatusNudge.spec.ts`): seed a fixture deal w/ `notes_updated_at` 5 BD ago, open `/deals?deal=...`, expect icon visible, open popover, accept, expect note text replaced and timestamp updated.

### 9. Strict additive scope confirmation

Touched files (Phase 2):
- NEW: `src/lib/businessDays.ts`, `src/lib/usFederalHolidays.ts`, `src/lib/dealStageOrder.ts`, `src/lib/dealStaleNudgePermissions.ts`, `src/lib/staleNoteSanitize.ts`
- NEW: `src/hooks/useStaleStatusNoteContext.ts`
- NEW: `src/services/smartStatusNoteSuggestion.ts`
- NEW: `src/components/deal/StaleStatusNudge.tsx`
- NEW tests under `src/lib/__tests__/` + `src/components/deal/__tests__/` + `tests/`
- EDIT (minimal): `src/pages/DealDetail.tsx` — add `relative` class to status-note container and mount `<StaleStatusNudge deal={deal} />` inside it. No other lines changed.

No changes to: Schedule Meeting, NOTES generator, Draft Reply, Availability Check, deal recognition, calendar render, edge functions, send-pipeline, `meeting-holds/*`, `calendar-events/*`. `create_calendar` / `calendar_id` / `GCAL_SMOKETEST_CALENDAR_ID` remain default-off in production.

Awaiting **"approved"** to begin Phase 2.