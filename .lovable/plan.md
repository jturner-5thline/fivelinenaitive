# Phase 1 Plan — Stale Status Nudge fixes (Censys verification)

## 1. Root-cause of the failures

### A. "No suggestion produced" + app-level error toast
Runtime error captured in `<runtime-errors>`:
> `Edge function returned 400: Error, {"error":"Unknown action"}` (source: `supabase/functions/smart-email-ai/index.ts`)

Confirmed by code inspection:
- Client `src/services/smartStatusNoteSuggestion.ts:67` invokes `smart-email-ai` with `action: 'suggest_status_update'`.
- `supabase/functions/smart-email-ai/index.ts:573` `switch (action)` has cases for `generate_draft_options`, `draft_reply`, `auto_draft`, `analyze_thread_workflow`, `email_to_activity`, `detect_lender_pass`, etc. **There is no `suggest_status_update` case** — execution falls through to line 1358 returning `{ error: "Unknown action" }` with HTTP 400.
- The client catches `error` and returns `{ ok: false, text: '' }`, so the popover renders the empty-state copy `"No suggestion produced. Try Generate again."`
- The app-level toast is fired by the global `supabase.functions.invoke` error interceptor (functions returning non-2xx propagate a thrown FunctionsHttpError that the global `react-query`/toast wiring surfaces as "The app encountered an error"). Our service-layer `try/catch` swallows the *return value* but the HTTP error event is still emitted before we get the response.

So: **insufficient-activity is NOT the cause** for Censys; the LLM call never executes. It is a missing edge-function route.

### B. Censys activity context — sanity check
Will be quoted in Phase 2 verification: `useStaleStatusNoteContext` aggregates
`lender_deals` (sent / passed), `useDealContextSummary` (emails + last meeting),
`deal_stage_history` (days in Terms Issued), `useDealTasks` (outstanding).
For Censys the replay shows "17 lenders sent, 10 lenders passed" — context will
be well above the `hasSufficientActivity` threshold once the action exists.

### C. Icon placement
Trigger is `absolute top-2 right-2 z-10` (StaleStatusNudge.tsx:164). The
**parent** in `DealDetail.tsx:3083` is `relative w-full sm:w-[93%] flex flex-col gap-1`
which wraps the *whole* status-note column (assignee row included). So the icon
anchors to the top-right of that column, not to the text-box corner — that is
why it appears vertically centered near the assignee name.

## 2. Fix plan

### Fix 1 — Add `suggest_status_update` route to `smart-email-ai`
New case in the switch statement before the default branch. It will:
- Read `systemPrompt`, `userPrompt`, `fastModel`, `dealId` from the body.
- Verify user (`supabase.auth.getUser()`), 401 on miss.
- Call the Lovable AI Gateway (same client used by other branches) with
  `model = google/gemini-2.5-flash` (fast tier), `temperature: 0.3`,
  `max_tokens: 220`, the supplied system + user prompts, no tool calls.
- Sanitize: trim, drop fences, return `{ result: { text } }`.
- Catch model errors → return HTTP 200 with `{ result: { text: '' }, error_kind: 'llm_error', message }` so the client can show "Failed to generate — retry" without tripping the global error toast.

### Fix 2 — Re-anchor icon to the text-box corner
- Wrap `<RichTextInlineEdit>` in its own `relative` container (a sibling div that contains only the text-box).
- Move `<StaleStatusNudge>` *inside* that wrapper so `absolute top-2 right-2` is measured against the text box, not the whole column.
- Keep `z-10` (popover/modal layers are z-50+).
- Net DOM:
  ```
  <div className="relative ...">   {/* status note text box wrapper */}
    <StaleStatusNudge .../>         {/* absolute top-2 right-2 */}
    <RichTextInlineEdit ... />
  </div>
  ```

### Fix 3 — Error-state resilience
In `smartStatusNoteSuggestion.ts`:
- Replace silent `{ ok: false }` with discriminated result:
  `{ ok: true, text }` | `{ ok: false, kind: 'empty' | 'llm_error' | 'invoke_error', detail?: string }`.
- Always `try/catch` and always return successfully (never re-throw) so the global toast cannot fire.

In `StaleStatusNudge.tsx`:
- Render three branches: `loading`, `empty(insufficient)`, `llm_error` (new).
- The `llm_error` branch shows: **"Failed to generate — retry"** + `<details>` "Show details" containing `detail`.
- Wrap the trigger `onClick`/`onOpenChange` handler in `try/catch` and log to console (scoped), never re-throw.

### Fix 4 — Suppress global toast for this specific invoke
Pass `headers: { 'x-suppress-error-toast': '1' }` (already honored by our global interceptor) **and** check the returned `error` field instead of relying on thrown errors. This guarantees no app-level toast even if a future regression returns 4xx/5xx.

## 3. Test plan (additive)

New / updated tests:
1. `staleNudge.iconPlacement.test.tsx` — render card; assert
   `trigger.getBoundingClientRect().top === card.top + 8 (±1)` and
   `card.right - trigger.right === 8 (±1)`.
2. `staleNudge.errorBoundary.test.tsx` — mock `supabase.functions.invoke` to throw; click icon; assert no `window.onerror` / no toast with `"app encountered an error"`; popover shows "Failed to generate — retry".
3. `staleNudge.censysFixture.test.tsx` — fixture with 5 lenders sent / 2 passed / 4 client emails / 6 BD stale / Terms Issued; mock edge fn to return a 1-sentence string; assert popover shows non-empty sanitized text within 2s.
4. `staleNudge.llmError.test.tsx` — mock edge fn to return `{ result: { text: '' }, error_kind: 'llm_error', message: 'rate limit' }`; assert "Failed to generate — retry" + Show details containing `rate limit`. Distinct from "Not enough recent activity" copy.
5. Edge-fn unit test (`smart-email-ai.suggestStatus.test.ts`) — POST with `action: 'suggest_status_update'`; mock gateway 200 → returns `{ result: { text } }`; mock gateway 500 → returns 200 with `error_kind: 'llm_error'`.

## 4. Scope confirmation (additive only)
Touched files:
- `supabase/functions/smart-email-ai/index.ts` (additive: new case only; no
  existing branch modified)
- `src/services/smartStatusNoteSuggestion.ts` (result type + error kinds)
- `src/components/deal/StaleStatusNudge.tsx` (error branch + handler guard)
- `src/pages/DealDetail.tsx` (wrap the `<RichTextInlineEdit>` in a `relative`
  div and move `<StaleStatusNudge>` inside)
- New test files only.

**Untouched:** Schedule Meeting, NOTES generator, Draft Reply, Availability
Check, deal recognition, calendar render, send-pipeline. `create_calendar` /
`calendar_id` / `GCAL_SMOKETEST_CALENDAR_ID` remain default-off in production.
Code freeze otherwise remains in place.

## STOP — awaiting "approved" before Phase 2.
