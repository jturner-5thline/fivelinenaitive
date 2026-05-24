# Prompt 4 — Phase 1 Plan: Server Intent Router + Tool Registry + RLS

**Status:** PLAN ONLY. No code written. No migrations executed. No production data touched.

---

## 1. Intent Router — `ai-settings-tool`

### File paths

| Kind | Path | Purpose |
|---|---|---|
| New | `supabase/functions/ai-settings-tool/index.ts` | Classifier + dry-run emitter |
| New | `supabase/functions/ai-settings-tool/registry.ts` | Allow-listed tool registry (shared with `ai-settings-apply`) |
| New | `supabase/functions/ai-settings-tool/denyList.ts` | Hard-coded deny patterns |
| New | `supabase/functions/ai-settings-apply/index.ts` | Commit + undo (called by `useSettingsMutation` hook) |
| New | `supabase/functions/ai-settings-apply/registry.ts` | Re-exports from `../ai-settings-tool/registry.ts` (Deno-style relative import) |
| Touched | `supabase/functions/copilot-chat/index.ts` | Single dispatch hook — see §1.3 |

No other files touched. AskNaitiveBar, SettingsMutationCard, useSettingsMutation, AICopilotPanel, ChatMessageList remain untouched.

### 1.1 Request / response shape

```text
POST /functions/v1/ai-settings-tool
Headers: Authorization: Bearer <user JWT>
Body: {
  prompt: string,            // raw user text from Ask-AI bar
  company_id: string,        // resolved client-side from useCompany
  context?: { route?: string, deal_id?: string }
}

200 OK (proposal):
{
  ok: true,
  proposal: {
    diff_id: string,         // uuid; binds to audit_log row
    tool_name: string,       // e.g. "settings.update_company_name"
    human_name: string,      // "Company name"
    description: string,
    settings_tab: string,    // deep-link tab
    target_table: string,
    target_column: string,
    scope: "company" | "user",
    current_value: unknown,
    proposed_value: unknown,
    args: Record<string, unknown>,
    json_schema: object,     // for the Edit textarea validator
    source_prompt: string,
    requires_role: "company_admin",
    confidence: number       // 0..1
  }
}

200 OK (refusal — low confidence OR deny-list OR non-admin):
{
  ok: true,
  refusal: {
    reason: "low_confidence" | "deny_listed" | "not_admin" | "unknown_setting",
    explainer: string,       // plain English, rendered as markdown text
    deep_link?: string       // "/settings?tab=integrations" when tab is known
  }
}

401 Unauthorized | 403 not_admin (defense in depth) | 429 rate_limited | 400 invalid
```

The shape of `proposal` matches the `SettingsProposal` interface already shipped in `src/hooks/useSettingsMutation.ts` and consumed by `SettingsMutationCard.tsx` — zero client changes required.

### 1.2 Output contract — segment serialization

`copilot-chat` emits the proposal into the assistant message as a fenced JSON block already detected by the Prompt-3 dispatchers:

```json
{
  "responseType": "settings_proposal",
  "data": { /* proposal */ }
}
```

Detection sites already shipped:
- `src/components/AICopilotPanel.tsx` — `parsed.responseType === 'settings_proposal'` branch (line ~432) → `<SettingsMutationCard>`.
- `src/components/dashboard/chat/ChatMessageList.tsx` — `extractSettingsProposal()` helper → `<SettingsMutationCard>` below markdown.

### 1.3 Where it plugs in

Existing pipeline:

```text
AskNaitiveBar ─► copilotStore.openPanelWithPrompt
              └► AICopilotPanel ─POST─► supabase/functions/copilot-chat
                                            │
                                            ├─ tool registry (read-only today)
                                            └─ OpenAI/Lovable-AI function calling
```

Touched dispatch point: `supabase/functions/copilot-chat/index.ts` — exactly one new step in the pre-LLM router. Pseudocode (~20 lines, no business logic relocated):

```text
// Pre-LLM router (additive, behind ff_ai_settings_mutations)
if (looksLikeSettingsIntent(prompt)) {
  const out = await fetch(SUPABASE_URL + '/functions/v1/ai-settings-tool', {
    headers: { Authorization: req.headers.get('Authorization')! },
    body: JSON.stringify({ prompt, company_id, context })
  });
  const { proposal, refusal } = await out.json();
  if (proposal) emitSegment({ responseType: 'settings_proposal', data: proposal });
  else if (refusal) emitMarkdown(refusal.explainer + linkTo(refusal.deep_link));
  return; // short-circuit; do NOT call the generic agent loop
}
// else: existing copilot-chat behavior, unchanged
```

`looksLikeSettingsIntent()` = cheap regex + verb list ("rename", "set", "change", "turn off/on", "enable/disable", "update my", "switch to") AND noun must hit registry alias map. Anything that doesn't match falls through to today's pipeline. No existing route is rerouted.

### 1.4 NL → structured classification

Two-step inside `ai-settings-tool`:

1. **Cheap keyword + alias match** against `registry.aliases` (e.g. `"timezone" → settings.update_company_timezone`). If unique hit and value is parsable by the tool's `validator`, emit proposal with `confidence: 0.95`.
2. **LLM fallback** (Lovable-AI `google/gemini-2.5-flash-lite`, JSON mode, registry passed as enum). Output: `{ tool_name, args, confidence }`. Hard-fail if `tool_name` not in registry. Soft-fail if `confidence < 0.6` → `refusal{reason:'low_confidence'}`.

Examples:
| Prompt | tool_name | proposed_value |
|---|---|---|
| "rename my company to 5th Line Financial LLC" | `settings.update_company_name` | `"5th Line Financial LLC"` |
| "turn off the slack digest" | `settings.toggle_slack_digest` | `false` |
| "set timezone to America/New_York" | `settings.update_company_timezone` | `"America/New_York"` |
| "change my password to hunter2" | refusal `deny_listed` | — |
| "make jturner an admin" | refusal `deny_listed` | — |
| "what's my pipeline?" | falls through to existing agent | — |

### 1.5 Confidence threshold

- `confidence ≥ 0.85` → proposal emitted.
- `0.60 ≤ confidence < 0.85` → proposal with `confidence` field present; card still renders (user reviews the diff anyway — humans-in-the-loop is the safety net).
- `confidence < 0.60` → refusal `low_confidence`, plain text suggestion with deep link to the best-guess tab.

---

## 2. Tool Registry (allow-list)

### Path
`supabase/functions/ai-settings-tool/registry.ts`

### Entry schema

```ts
type ToolEntry = {
  key: string;               // "settings.update_company_name"
  human_name: string;
  description: string;
  settings_tab: string;      // matches /settings?tab=
  scope: "company" | "user";
  target_table: string;
  target_column: string;     // dotted path supported for JSONB ("company_settings.value.timezone")
  aliases: string[];         // for cheap classifier
  validator: ZodSchema;      // server-side input validation
  json_schema: object;       // shipped to client for the Edit textarea
  dry_run_query: (sb, ctx)        => Promise<{ current_value: unknown }>;
  apply_mutation: (sb, ctx, val)  => Promise<{ undo_token: string; old: unknown; new: unknown }>;
  undo_mutation: (sb, ctx, token) => Promise<{ ok: true }>;
  audit_event: string;       // "company.name.update"
};
```

### Initial allow-list (10 keys for 5th Line launch)

| Key | Table.Column | Scope | Validator |
|---|---|---|---|
| `settings.update_company_name` | `companies.name` | company | `z.string().min(1).max(120)` |
| `settings.update_company_timezone` | `company_settings.value->>timezone` | company | IANA tz enum |
| `settings.update_user_theme` | `user_ui_preferences.value->>theme` | user | `'light' \| 'dark' \| 'system'` |
| `settings.update_notification_email` | `profiles.notification_email` | user | `z.string().email()` |
| `settings.update_digest_frequency` | `company_settings.value->>digest_frequency` | company | `'daily' \| 'weekly' \| 'off'` |
| `settings.toggle_ai_assistant` | `company_settings.value->>ai_assistant_enabled` | company | `z.boolean()` |
| `settings.toggle_ai_draft_autosend` | `company_settings.value->>ai_draft_autosend` | company | `z.boolean()` — **default false** |
| `settings.update_email_signature` | `user_email_signatures.signature_html` | user | `z.string().max(8000)` |
| `settings.toggle_slack_digest` | `company_settings.value->>integrations.slack_digest_enabled` | company | `z.boolean()` |
| `settings.update_gcal_default_calendar_id` | `company_settings.value->>integrations.gcal_default_calendar_id` | company | `z.string().regex(/^[\w.@+-]+$/)` |

### Deny-list (hard refusal — never reach LLM)

`supabase/functions/ai-settings-tool/denyList.ts` — regex + keyword list:

- `password`, `passwd`, `mfa`, `2fa`, `totp`, `recovery code`
- `api[\s_-]?key`, `api[\s_-]?token`, `secret`, `bearer`, `client[\s_-]?secret`
- `oauth`, `refresh[\s_-]?token`, `access[\s_-]?token`, `service[\s_-]?role`
- `billing`, `card`, `stripe`, `invoice`, `payment method`, `subscription`
- `rls`, `policy`, `grant`, `revoke`, `role[\s_-]?assign`, `make .* admin`, `promote .* to`, `demote`
- `webhook secret`, `signing secret`, `hmac`, `cert`, `private key`
- Any prompt whose proposed target_column begins with `auth.`, `vault.`, `pgsodium.`, `secrets.`, `storage.policies`, or matches `*_role*`.

Deny-list match → `refusal{reason:'deny_listed', explainer: "<setting> is not editable from the AI bar for security reasons. Open Settings ▸ <best-guess-tab>."}` and one `action='deny'` audit row.

---

## 3. RLS + Audit migrations (DDL for review — NOT executed)

### 3.1 `settings_audit_log` (new table)

```sql
CREATE TYPE public.settings_audit_action AS ENUM ('dry_run','apply','undo','deny');

CREATE TABLE public.settings_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL,
  actor_user_id   uuid NOT NULL,
  tool_key        text NOT NULL,
  target_table    text,
  target_column   text,
  diff_id         uuid,                    -- groups dry_run→apply→undo
  old_value       jsonb,
  new_value       jsonb,
  action          public.settings_audit_action NOT NULL,
  reason          text,                    -- denial reason, error message, etc.
  source_prompt   text,
  confidence      numeric(4,3),
  undo_token      text,
  applied_at      timestamptz,             -- NULL except for action='apply'
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sal_company_created ON public.settings_audit_log (company_id, created_at DESC);
CREATE INDEX idx_sal_diff            ON public.settings_audit_log (diff_id);
CREATE INDEX idx_sal_actor           ON public.settings_audit_log (actor_user_id, created_at DESC);

ALTER TABLE public.settings_audit_log ENABLE ROW LEVEL SECURITY;

-- SELECT: same-company admins only
CREATE POLICY "sal_select_company_admins"
  ON public.settings_audit_log
  FOR SELECT
  TO authenticated
  USING (public.is_company_admin(auth.uid(), company_id));

-- INSERT: service-role only (edge function uses service-role client for the write)
CREATE POLICY "sal_insert_service_only"
  ON public.settings_audit_log
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- No UPDATE / DELETE policies → append-only.
```

Migration touches **zero existing rows** (DDL + RLS only).

### 3.2 Allow-listed column policy audit

Per-tool RLS gap check (review only — **no changes in Prompt 4 unless flagged**):

| Tool | Table | Admin-only UPDATE exists? | Action needed |
|---|---|---|---|
| company.name | `companies` | ✅ admin-only | none |
| company.timezone | `company_settings` | ✅ admin-only | none |
| user.theme | `user_ui_preferences` | ✅ self-owned | none |
| notification_email | `profiles` | ✅ self-owned | none |
| digest_frequency | `company_settings` | ✅ admin-only | none |
| ai_assistant_enabled | `company_settings` | ✅ admin-only | none |
| ai_draft_autosend | `company_settings` | ✅ admin-only | none |
| email_signature | `user_email_signatures` | ⚠️ verify in Phase 2 | confirm policy or add admin override |
| slack_digest_enabled | `company_settings` | ✅ admin-only | none |
| gcal_default_calendar_id | `company_settings` | ✅ admin-only | none |

Defense-in-depth: `ai-settings-apply` uses **user-scoped** Supabase client (forwards user JWT) for the actual UPDATE — so even if a registry entry were misconfigured, the underlying table RLS still gates the write.

### 3.3 Rate-limit plan

Implemented in-process inside `ai-settings-apply` (per the `no-backend-rate-limiting` guidance this is the lightweight ad-hoc form, scoped to one edge function):

- 10 `apply` per minute per `company_id` → returns **429** → `useSettingsMutation` already surfaces the friendly "Rate limit reached" string (T4 test green).
- 60 `dry_run` per minute per `actor_user_id` → returns **429** from `ai-settings-tool` → router falls back to plain markdown reply.

Counters: sliding-window in `settings_audit_log` (cheap COUNT on `created_at > now() - interval '1 minute'` filtered by company/actor + action). No new table. No Redis.

---

## 4. Admin gating + audit chain

- **Client gate (already shipped):** `useCompany().isAdmin` disables Accept.
- **Server re-check (Prompt 4):** both edge functions call `is_company_admin(auth.uid(), company_id)` via user-scoped supabase client. Non-admin → 403 + audit row `action='deny', reason='not_admin'`.
- **Per-action audit rows:**
  - `dry_run` written by `ai-settings-tool` on every proposal emit.
  - `apply` written by `ai-settings-apply` on successful UPDATE (transactional with the UPDATE — same `diff_id`).
  - `undo` written by `ai-settings-apply` on successful revert.
  - `deny` written on deny-list hit, non-admin, validator failure, or rate-limit reject.
- **30s undo window (server):** `apply` rows store `applied_at`; `undo` rejected with **410 Gone** if `now() - applied_at > interval '30 seconds'`. `useSettingsMutation` already hides the Undo button at t=30s; this is the server backstop.

---

## 5. Phase-2 test plan

### Unit (Deno, `supabase/functions/ai-settings-tool/router.test.ts`)

8 classification fixtures:

| # | Prompt | Expected |
|---|---|---|
| 1 | "rename my company to 5th Line Financial LLC" | `settings.update_company_name`, `"5th Line Financial LLC"` |
| 2 | "set timezone to America/New_York" | `settings.update_company_timezone`, `"America/New_York"` |
| 3 | "turn off slack digest" | `settings.toggle_slack_digest`, `false` |
| 4 | "switch theme to dark" | `settings.update_user_theme`, `"dark"` |
| 5 | "update notification email to ops@5thline.co" | `settings.update_notification_email`, `"ops@5thline.co"` |
| 6 | "change my password to hunter2" | refusal `deny_listed` |
| 7 | "rotate the openai api key" | refusal `deny_listed` |
| 8 | "make jturner an admin" | refusal `deny_listed` |

### Unit — registry validators (`registry.test.ts`)
- IANA tz: accept `America/New_York`, reject `EST`, `Foo/Bar`.
- email: accept `a@b.co`, reject `notanemail`.
- boolean coercion: `"off" → false`, `"on" → true`.
- gcal id regex.

### Integration (Supabase **test project**, never prod)
- `dry_run → apply → undo` produces exactly 3 `settings_audit_log` rows sharing one `diff_id`.
- Non-admin caller → 403, one `action='deny',reason='not_admin'` row.
- Deny-listed prompt → no UPDATE, one `action='deny',reason='deny_listed'` row.
- 11th apply in 60s → 429, no UPDATE, one `deny` row with `reason='rate_limited'`.
- 31s-old undo → 410 Gone, audit row `action='deny',reason='undo_expired'`.

### Playwright E2E (`tests/e2e/ai-settings-mutation.spec.ts`)
- Login as 5th Line admin (`jturner@5thline.co`).
- Type "rename my company to 5th Line Financial LLC" in Ask-Naitive bar.
- Expect `[data-testid=settings-mutation-card]` with Current=`5th Line` Proposed=`5th Line Financial LLC`.
- Click Accept → expect "Applied" + Undo countdown.
- Click Undo within 30s → expect "Change reverted" + DB row reverted (verified via direct query).

### Live screenshot
After successful Playwright E2E pass, captured on the 5th Line admin account and attached to the Phase-2 deliverable for sign-off.

---

## 6. Risk + rollback

- **Feature flag** `ff_ai_settings_mutations`, persisted in `company_settings.value->>feature_flags->>ai_settings_mutations`. Default **OFF for all tenants** except 5th Line (`company_id IN (allow-list)`).
- Both edge functions short-circuit to refusal `{reason:'feature_off'}` when flag is OFF — card never renders.
- **Rollback** = flip flag OFF; no schema rollback needed. Every `apply` has an audit row + `undo_token` so manual revert is possible past the 30s window via DB.
- **No impact** to calendar smoke-test guardrails: `create_calendar` / `calendar_id` / `GCAL_SMOKETEST_CALENDAR_ID` are unrelated code paths and remain default-off. No edge function in this prompt touches `meeting-holds`, `calendar-events`, `send-pipeline`, NOTES, Draft Reply, Stale Status Nudge, Availability Check, deal recognition, calendar render, email ingestion, or classifier.

---

## Scope summary

**NEW files:**
- `supabase/functions/ai-settings-tool/{index.ts, registry.ts, denyList.ts, router.test.ts, registry.test.ts}`
- `supabase/functions/ai-settings-apply/{index.ts, apply.test.ts}`
- `supabase/migrations/<ts>_settings_audit_log.sql`
- `tests/e2e/ai-settings-mutation.spec.ts`

**TOUCHED files:**
- `supabase/functions/copilot-chat/index.ts` — single additive pre-LLM router hook (~20 lines, flag-gated).

**UNTOUCHED:** AskNaitiveBar, SettingsMutationCard, useSettingsMutation, AICopilotPanel, ChatMessageList, copilotStore, all CopilotXxx cards, and every system in the code freeze list.

**STOP.** Awaiting "approved" before Phase 2 (writing code, migration, tests, live screenshot).
