# Prompt 5 — Smoke + Audit Verification Plan (PLAN ONLY)

Verification-only pass. No source edits, no migrations, no new functions. All apply ops are round-tripped via Undo so net delta on settings tables = 0. Scope strictly limited to the 5th Line tenant with `ff_ai_settings_mutations=ON`, acting as `jturner@5thline.co` for admin paths.

---

## 0. Pre-flight (read-only)

Before executing any step, confirm baseline state and snapshot originals so Undo can be verified:

```sql
-- Resolve 5th Line tenant + actor
SELECT id AS company_id FROM companies WHERE name ILIKE '5th Line%' LIMIT 1;
SELECT id AS user_id FROM auth.users WHERE email = 'jturner@5thline.co';

-- Snapshot current values that the smoke trio will touch
SELECT id, name, timezone, feature_flags, ai_settings
FROM company_settings WHERE company_id = :company_id;

SELECT user_id, digest_frequency
FROM user_preferences WHERE user_id = :user_id;

SELECT key, value FROM company_settings
WHERE company_id = :company_id AND key IN ('slack_digest_enabled');

-- Baseline audit row count for delta math
SELECT count(*) AS baseline_audit_count
FROM settings_audit_log
WHERE company_id = :company_id;
```

Pass bar: all three reads succeed; baseline values recorded in the final report appendix.

---

## 1. Smoke trio (Apply → Undo, net delta = 0)

Run sequentially through the Ask-Naitive bar in `/settings` (already on this route). For each run, capture:
- Raw `settings_proposal` JSON returned by `ai-settings-tool`
- Card screenshot showing Current → Proposed diff
- `ai-settings-apply` HTTP 200 response (apply + undo)
- 3 `settings_audit_log` rows (`dry_run`, `apply`, `undo`)
- Post-Undo SELECT proving original value restored

| # | Exact prompt typed into Ask-Naitive bar | Tool expected | Target table.column |
|---|---|---|---|
| 1a | `set my company timezone to America/New_York` | `settings.update_company_timezone` | `company_settings.timezone` |
| 1b | `change my digest frequency to weekly` | `settings.update_digest_frequency` | `user_preferences.digest_frequency` |
| 1c | `turn off the Slack digest` | `settings.toggle_slack_digest` | `company_settings.feature_flags->>slack_digest_enabled` |

Per-run verification SQL (parameterized by `:diff_id`):
```sql
SELECT action, actor_user_id, source, before_value, after_value, created_at
FROM settings_audit_log
WHERE diff_id = :diff_id ORDER BY created_at;
-- expect exactly 3 rows: dry_run → apply → undo
```

Then re-read the snapshot query from §0 and assert equality with baseline.

Pass bar (per run): 3 audit rows present, apply row has non-null `before_value`, undo row's `after_value` == original baseline, Undo button clicked within the 30s window, and post-state SELECT matches §0.

---

## 2. Deny-list refusal trio (zero mutation)

Submit each prompt; assert the response is the deny explainer (no `SettingsMutationCard` rendered) with a link to `/settings`.

| # | Exact prompt | Expected deny reason |
|---|---|---|
| 2a | `change my OpenAI API key to sk-test-123` | secret / api_key |
| 2b | `make jmoffitt@5thline.co a company admin` | role_elevation |
| 2c | `update the Slack bot token` | secret |

Verification SQL:
```sql
SELECT action, tool_name, deny_reason, source_prompt, created_at
FROM settings_audit_log
WHERE company_id = :company_id
  AND action = 'deny'
  AND created_at > :run_start
ORDER BY created_at;
-- expect exactly 3 rows
```

Mutation-proof query (no target rows changed since `:run_start`):
```sql
SELECT updated_at FROM company_settings WHERE company_id = :company_id;
-- updated_at must equal baseline updated_at
```

Pass bar: 3 deny rows written, 0 rows mutated in `company_settings` / `user_preferences` / any secrets table.

---

## 3. Non-admin negative path

Switch to a non-admin fixture user (read-only collaborator) in the 5th Line tenant. Submit prompt 1a (`set my company timezone to America/New_York`).

Capture:
- Screenshot: deep-link explainer to `/settings?tab=general`, no `data-testid="settings-mutation-card"` in DOM
- Network log: `ai-settings-tool` returns `mode: "explainer"` or equivalent, `ai-settings-apply` direct curl returns **403**
- SQL: `SELECT count(*) FROM settings_audit_log WHERE actor_user_id = :nonadmin_id AND created_at > :run_start` → expect 0

Direct edge-function probe (curl, with non-admin JWT):
```
POST /functions/v1/ai-settings-apply
body: { tool_name: "settings.update_company_timezone", proposed_value: "America/New_York", diff_id: "<fake>" }
expect: 403 + body { error: "admin_required" }
```

Pass bar: card not rendered, 403 on direct apply, 0 audit rows from this user.

---

## 4. Rate-limit verification

Drive bursts via scripted `supabase.functions.invoke` from the browser console as `jturner@5thline.co`:
- 11× dry_run (`ai-settings-tool`) in <60s on one user → 11th returns **429** with friendly message; card shows "Rate limit reached — try again in a few minutes."
- 11× apply (`ai-settings-apply`) in <60s on one company → 11th returns **429**; ensure the 10 that succeed are each Undone before continuing.

Capture both 429 response bodies (with `Retry-After` header if present) and one card screenshot showing the rate-limit error state.

Audit annotation check:
```sql
SELECT count(*) FILTER (WHERE metadata->>'rate_limited' = 'true') AS rl_count
FROM settings_audit_log
WHERE company_id = :company_id AND created_at > :run_start;
-- expect ≥ 2 (one dry_run, one apply)
```

Pass bar: HTTP 429 observed on the 11th of each burst, card surfaces the friendly throttle copy, ≥2 rate-limit-annotated audit rows, and net data delta on settings tables = 0 after all Undos.

---

## 5. Audit chain integrity (read-only SQL)

```sql
-- (a) action counts in the last hour
SELECT action, count(*)
FROM settings_audit_log
WHERE company_id = :company_id
  AND created_at > now() - interval '1 hour'
GROUP BY action;
-- expected: dry_run=14, apply=12 (10 succeed in §4 + 2 from §1; 1 blocked by 429), undo=13, deny=3
-- NOTE: exact counts will be reconciled to the actual §4 success count in the final report.

-- (b) last 20 rows have full provenance
SELECT id, tool_name, before_value, after_value, source, actor_user_id, company_id
FROM settings_audit_log
ORDER BY created_at DESC LIMIT 20;
-- every row: actor_user_id NOT NULL, company_id NOT NULL, source='ai_assistant';
-- every action='apply' row: before_value NOT NULL.

-- (c) RLS isolation: as a non-admin role token via PostgREST
SELECT count(*) FROM settings_audit_log;
-- expected: 0 (RLS hides all rows from non-admins)
```

Pass bar: all three queries match expectations; any deviation logged in §8(vi) and STOP.

---

## 6. Non-regression suites

Re-run and paste pass counts only — no edits:

| Suite | Command | Pass bar |
|---|---|---|
| Prompt 3 RTL | `bunx vitest run src/components/copilot/__tests__/SettingsMutationCard.test.tsx` | 6/6 |
| Prompt 4 Deno unit | `supabase--test_edge_functions functions=["ai-settings-tool"]` | 12/12 |
| Prompt 4 Playwright | `bunx playwright test settings-mutation` | 2/2 (admin happy + non-admin deep-link) |
| Smart Status Note | `bunx vitest run src/services/__tests__/smartStatusNoteSuggestion.*` | 30/30 |
| Calendar guardrails | grep `create_calendar`, `calendar_id`, `GCAL_SMOKETEST_CALENDAR_ID` defaults | all default-off; no GCal writes in scope |

Pass bar: every suite green at its declared count; any red → §8(vi) and STOP.

---

## 7. Feature-flag rollback drill (documentation only — DO NOT FLIP)

Document for `ff_ai_settings_mutations`:
- Server read site: `supabase/functions/copilot-chat/index.ts` — cite exact line of the `ff_ai_settings_mutations` gate added in Prompt 4.
- Client read site: `src/components/copilot/SettingsMutationCard.tsx` (or its parent render branch in `AICopilotPanel.tsx` / `ChatMessageList.tsx`) — cite line where the flag suppresses card rendering.
- Toggle path: `company_settings.feature_flags->>ai_settings_mutations` set to `false` via admin UI / direct UPDATE.
- Expected OFF behavior (assertion only, not executed):
  - `ai-settings-tool` returns `{ status: "feature_disabled", message: "..." }` — no proposal, no audit row.
  - Card never renders; user sees plain-text fallback in the bar.
  - Zero rows added to `settings_audit_log` for that company while OFF.

Pass bar: file + line citations correct; no actual flag flip performed.

---

## 8. Final sign-off deliverable

A single Markdown report saved to `/mnt/documents/ai-settings-mutation-signoff-5thline.md` containing:

1. All screenshots (smoke trio diffs, deny explainer, non-admin deep-link, 429 throttle card)
2. All audit SQL outputs (verbatim)
3. All HTTP responses captured (200 / 403 / 410 if undo expires / 429)
4. Test pass counts table from §6
5. **GO / NO-GO recommendation** for enabling `ff_ai_settings_mutations` on additional tenants
6. Follow-ups for Prompt 6+ (e.g., bulk settings diff, multi-tool composition, per-tool throttles) — documented only, not implemented

A `<presentation-artifact>` tag will be emitted so the user can download the report.

---

## Freeze acknowledgments

- No source files will be modified.
- No migrations.
- No new edge functions or components.
- Calendar / Schedule Meeting / NOTES / Draft Reply / Stale Status Nudge / Availability Check / deal recognition / email ingestion are untouched.
- `create_calendar`, `calendar_id`, `GCAL_SMOKETEST_CALENDAR_ID` remain default-off; no Google Calendar resources will be touched.
- Every Apply is paired with an Undo inside the 30s window. If any Undo fails or expires, the bug is logged in §8(vi) and execution STOPS (the row is left for manual reconciliation; no compensating UPDATE will be issued).
- 5th Line tenant only.

Awaiting `approved` before executing any step.
