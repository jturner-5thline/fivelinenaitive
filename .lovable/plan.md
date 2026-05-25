
# Per-Company "Hours & Fees" Visibility Toggle — Phase 1 Plan

**Queued behind the open deal-status-notification Phase 1 plan. Strict additive scope. No code written until you reply `approved`. No Blount seed will run until you see and confirm the resolved UUID below.**

## 1. Resolved Blount Capital identity

- Single, unique match in `public.companies`:
  - `id = c4753066-0da9-4d87-8858-7eb1adecd173`
  - `name = "Blount Capital"`
- Migration will hard-fail (`RAISE EXCEPTION`) if row count by name is ≠ 1.

## 2. Storage decision — `companies.settings` does NOT exist

`companies` has no `settings jsonb` column. Rather than add one, **reuse the existing `company_settings.ai_settings jsonb`** column already used by every other entry in the ai-settings registry (see `supabase/functions/ai-settings-tool/registry.ts` lines 87–128). This:

- avoids a new column on `companies`
- inherits the existing RLS on `company_settings`
- uses the existing `getCompanySettingsValue` / `setCompanySettingsValue` helpers
- writes the existing `settings_audit_log` row via `ai-settings-apply`

Path inside JSONB: `ai_settings.deal_info.hours_and_fees_enabled` (boolean, default treated as `true` when key absent).

**No schema migration is required** for the read/write path. The only DB write is a single seed UPSERT for Blount (see §6).

## 3. "Hours & Fees" component location

There is no dedicated component file — the section is rendered inline in `src/pages/DealDetail.tsx`:

- Field definition: `src/hooks/useDealInfoFieldOrder.ts:42`
  `{ id: 'hoursAndFees', label: 'Hours & Fees', section: 'hours-fees', column: 'full', canHide: true }`
- Render switch case: `src/pages/DealDetail.tsx:3728` (`case 'hoursAndFees':` … through ~3850, the entire JSX block headed by `Hours & Fees`)
- Render-site calls: `src/pages/DealDetail.tsx:3869` and `:3908` (`isDealInfoFieldVisible('hoursAndFees') && renderDealInfoField('hoursAndFees')`)

### Guard insertion point

Wrap the existing call sites at lines 3869 and 3908:

```ts
const hoursAndFeesEnabled = useCompanySetting('deal_info.hours_and_fees_enabled', true);
// ...
{hoursAndFeesEnabled && isDealInfoFieldVisible('hoursAndFees') && renderDealInfoField('hoursAndFees')}
```

When `enabled === false` the JSX block does not mount — no DOM, no aria-husk, no `display:none`.

## 4. New hook (read path, single source of truth)

`src/hooks/useCompanySetting.ts` (NEW)

- Signature: `useCompanySetting<T>(path: string, defaultValue: T): T`
- React Query key: `['company_settings', company.id, 'ai_settings']`
- Query: `SELECT ai_settings FROM company_settings WHERE company_id = $1`
- Returns `get(ai_settings, path) ?? defaultValue` (lodash-style get over dotted path)
- Subscribes to realtime `postgres_changes` on `company_settings` filtered by `company_id` so all open tabs update ≤ 2 s after a flip without hard refresh.

## 5. Settings UI — admin toggle

- Mount inside the existing `DealInfoFieldsSettings` panel (`src/components/settings/DealInfoFieldsSettings.tsx`, already feature-gated via `isVisible('deal-info-fields')` on `src/pages/Settings.tsx:278`).
- Add a single `<Switch>` row at the top of that panel:
  - Label: **Show Hours & Fees on Deal Info**
  - Helper: *When off, the Hours & Fees section is hidden from all users on this account.*
  - Bound to `useCompanySetting('deal_info.hours_and_fees_enabled', true)` for current value
  - On toggle → `supabase.functions.invoke('ai-settings-tool', { body: { intent: 'apply', key: 'settings.toggle_deal_info_hours_and_fees', value: nextBool, source: 'manual_ui' } })` (uses the existing dry_run → apply path)
  - Visible only when `isAdmin === true` (prop already passed). Non-admins see nothing — zero placeholder.

## 6. New ai-settings registry entry

Add ONE entry to `supabase/functions/ai-settings-tool/registry.ts` (and the parallel array in `supabase/functions/ai-settings-apply/registry.ts` if it diverges — to be verified before implementation):

```ts
{
  key: "settings.toggle_deal_info_hours_and_fees",
  human_name: "Show Hours & Fees on Deal Info",
  description: "When off, the Hours & Fees section is hidden from all users on this account.",
  settings_tab: "deal-info-fields",
  scope: "company",
  target_table: "company_settings",
  target_column: "ai_settings.deal_info.hours_and_fees_enabled",
  aliases: ["hours and fees","hours & fees","fees section","deal hours"],
  validator: vBool,
  json_schema: { type: "boolean", default: true },
  dry_run_query: (ctx) => getCompanySettingsValue(ctx, ["deal_info","hours_and_fees_enabled"]),
  apply_mutation: (ctx, value) => setCompanySettingsValue(ctx, ["deal_info","hours_and_fees_enabled"], value),
  audit_event: "company.deal_info.hours_and_fees.toggle",
}
```

- Admin gate, undo, rate-limit, audit log row → all inherited from existing infra.
- Deny reason if non-boolean: existing `vBool` returns `"must be boolean"` → surfaced as 422.
- Non-admin direct curl: existing `ai-settings-apply` admin re-check returns 403 (defense-in-depth, already in place).
- No change to `ai-settings-tool` / `ai-settings-apply` internals; no change to `ff_ai_settings_mutations`.

## 7. Blount Capital seed (Phase 2 only, after approval)

Performed via the `supabase--insert` tool (data-only, NOT a schema migration). Pseudocode of the single statement:

```sql
WITH target AS (
  SELECT id FROM public.companies
   WHERE name = 'Blount Capital'
)
INSERT INTO public.company_settings (company_id, ai_settings)
SELECT id, jsonb_build_object('deal_info', jsonb_build_object('hours_and_fees_enabled', false))
  FROM target
ON CONFLICT (company_id) DO UPDATE
  SET ai_settings = jsonb_set(
    COALESCE(company_settings.ai_settings, '{}'::jsonb),
    '{deal_info,hours_and_fees_enabled}', 'false'::jsonb, true);
-- Hard-fail guard:
DO $$ BEGIN
  IF (SELECT count(*) FROM public.companies WHERE name = 'Blount Capital') <> 1
    THEN RAISE EXCEPTION 'Blount Capital company resolution failed'; END IF;
END $$;
```

(The `DO` guard will be executed BEFORE the upsert in the real call.)

## 8. React-query invalidation keys

On apply / undo success, invalidate exactly:

- `['company_settings', companyId, 'ai_settings']`

The realtime subscription on `company_settings` handles cross-tab propagation; the invalidate handles the originating tab's optimistic refresh. No other keys touched.

## 9. Files — new vs touched

**New (3)**
- `src/hooks/useCompanySetting.ts`
- *(no new component — toggle row inlined into existing DealInfoFieldsSettings)*
- `src/hooks/__tests__/useCompanySetting.test.ts`
- `src/pages/__tests__/dealDetailHoursAndFees.test.tsx`

**Touched (3, additive)**
- `src/pages/DealDetail.tsx` — wrap the two existing `'hoursAndFees'` render call sites (3869, 3908) with the enabled guard. No other lines changed.
- `src/components/settings/DealInfoFieldsSettings.tsx` — prepend one admin-only `<Switch>` row.
- `supabase/functions/ai-settings-tool/registry.ts` — append one `REGISTRY` entry (and same in `ai-settings-apply/registry.ts` if it has its own array).

**Untouched (explicit freeze list)**
- `SettingsMutationCard.tsx`, `useSettingsMutation.ts`, `AICopilotPanel`, `ChatMessageList`
- `ai-settings-tool/index.ts`, `ai-settings-apply/index.ts` internals
- `settings_audit_log` schema, `ff_ai_settings_mutations` gate
- Pilot KPI files, deal-status-notification files, Schedule Meeting / NOTES / Draft Reply / Stale Status Nudge / Availability Check / calendar render / meeting-holds / calendar-events / send-pipeline / email ingestion classifier
- `companies` table — NO new column added

## 10. Phase 2 test matrix

| # | Layer | Test |
|---|---|---|
| T1 | Unit | `useCompanySetting('deal_info.hours_and_fees_enabled', true)` returns `true` when key absent; `false` when explicitly set |
| T2 | RTL  | `<DealDetail>` mock company with enabled=true → `getByText('Hours & Fees')` present |
| T3 | RTL  | Same with enabled=false → `queryByText('Hours & Fees')` is `null` AND no `data-field-id="hoursAndFees"` node in DOM |
| T4 | RTL  | `<DealInfoFieldsSettings isAdmin={false} />` → switch not in DOM |
| T5 | RTL  | `<DealInfoFieldsSettings isAdmin={true} />` → switch present, bound to current value, toggle invokes `ai-settings-tool` with key `settings.toggle_deal_info_hours_and_fees` |
| T6 | Deno (edge) | `ai-settings-tool` dry-run for new key returns current bool; apply writes JSONB path; undo reverts |
| T7 | Integration | After apply, `settings_audit_log` row exists with `event='company.deal_info.hours_and_fees.toggle'`, `before_value`, `after_value`, `source` |
| T8 | Integration | Non-admin user calling `ai-settings-apply` with new key → 403 |
| T9 | Live (Blount Capital tenant) | Load any deal → no Hours & Fees section; flip ON in Settings → section appears within ≤ 2 s in second open tab via realtime; flip OFF → disappears live. Screenshots before/after |
| T10 | Live regression (5th Line tenant) | Hours & Fees visible exactly as today on all deals; toggle absent in Settings unless admin |
| T11 | Regression sweep | Prompt 3 RTL 6/6, Prompt 4 Deno 12/12 + Playwright, SettingsMutationCard E2E, Smart Status Note 30/30, Pilot KPI tracking, deal-status-notification suite — all green |

## 11. Open confirmations (please answer with approval)

1. **Storage decision OK?** Reuse `company_settings.ai_settings` JSONB instead of adding a `companies.settings` column. (Recommended — zero schema change, full inheritance of existing RLS + audit + undo.)
2. **Settings placement OK?** Inline the switch at the top of the existing `DealInfoFieldsSettings` panel (Settings → Deal Info Fields), rather than introducing a new "Display" sub-section.
3. **Default-true semantics OK?** Absent key = enabled (matches today's behavior for all tenants); only Blount gets an explicit `false` seed row.

Reply `approved` (and answers to any of the three above you want to override) and I will implement Phase 2 exactly as scoped, with the Blount seed gated on the hard-fail UUID check.
