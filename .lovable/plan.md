
# Blount Capital Hours & Fees — Total-Fee-Only View — Phase 1 (REVISED)

**(a) Abandonment of prior plan:** The previously saved Phase 1 plan (single `hours_and_fees_enabled` toggle that hid the entire section) is **abandoned**. No file from it has been written. I will NOT implement it.

## (b) Resolved Blount Capital identity

- `companies.id = c4753066-0da9-4d87-8858-7eb1adecd173`, `name = "Blount Capital"` — unique single match.
- Phase 2 seed will hard-fail (`RAISE EXCEPTION`) if count by name ≠ 1.

## (c) Source columns + percent convention (CONFIRMED from code, not assumed)

`public.deals`:

| Concept | Actual column | Type |
|---|---|---|
| Success fee % | `success_fee_percent` | numeric |
| Deal size | **`value`** (NOT `deal_size` — no such column exists) | numeric |
| Retainer | `retainer_fee` | numeric |
| Milestone | `milestone_fee` | numeric |
| Stored total | `total_fee` | numeric |

**Percent convention — INTEGER PERCENT.** Locked by `src/pages/DealDetail.tsx:2549`:
```
updated.totalFee = retainer + milestone + (dealValue * successPercent) / 100;
```
So `5 = 5%`. The new computed Total Fee for Blount **must use the same `/ 100` divisor**.

**Computed Total Fee for Blount** = `(deals.value * deals.success_fee_percent) / 100`. (No retainer/milestone added, because those rows are hidden by default for Blount and the spec says Total = success_fee_percent × deal_size, exclusive of retainer/milestone.)

**Currency:** `deals` has no `currency` column and `companies` has no `currency` column. Default everywhere is USD with the `$` glyph (matches every other fee input on the page, e.g. line 3778, 3794, 3846). New formatter will use `$` + integer thousands separators when ≥ 1,000; two decimals when < 1,000; em-dash `—` when `value` or `success_fee_percent` is null/≤0.

## (d) Existing component path + subtree boundaries

Single inline block in **`src/pages/DealDetail.tsx`**, no dedicated component file:

| Subtree | Lines |
|---|---|
| Section root (`<Separator/>` + outer `div` w/ "Hours & Fees" heading) | 3731–3742 |
| Left column "Hours" (Pre-/Post-Signing, Total Hours, Revenue/Hour) | 3744–3772 |
| Right column wrapper "Fees" | 3774–3857 |
| **Retainer Fee** row | 3775–3790 |
| **Milestone Fee** row | 3791–3806 |
| Success Fee % row + closing-at-end tooltip | 3807–3842 |
| **Total Fee** row (read-only, currently sourced from `deal.totalFee` derived at line 2549) | 3843–3856 |
| `case 'hoursAndFees':` switch arm | 3728–3861 |
| Render-site calls | 3869, 3908 |

**Render-guard insertion points:** wrap each fee row's grid-cell with a `{xxxEnabled && (...) }` conditional inside the Fees column at 3775/3791. The Total Fee row stays always-mounted; only its `value` source switches when `totalFeeComputedOnly` is true for that tenant. The left "Hours" column is untouched.

## (e) New ai-settings registry entries

Append to `supabase/functions/ai-settings-tool/registry.ts` (and the parallel `ai-settings-apply/registry.ts` if it has its own array — to verify at implementation time). All three reuse existing `vBool`, `getCompanySettingsValue`, `setCompanySettingsValue`, admin-gate, undo, audit.

```ts
{
  key: "settings.toggle_deal_info_retainer_fee",
  human_name: "Show Retainer Fee on Deal Info",
  description: "When off, the Retainer Fee row is hidden in the Hours & Fees section.",
  settings_tab: "deal-info-fields",
  scope: "company", target_table: "company_settings",
  target_column: "ai_settings.deal_info.fees.retainer_enabled",
  aliases: ["retainer fee","retainer","show retainer"],
  validator: vBool, json_schema: { type: "boolean", default: true },
  dry_run_query: (ctx) => getCompanySettingsValue(ctx, ["deal_info","fees","retainer_enabled"]),
  apply_mutation: (ctx, v) => setCompanySettingsValue(ctx, ["deal_info","fees","retainer_enabled"], v),
  audit_event: "company.deal_info.fees.retainer.toggle",
},
{
  key: "settings.toggle_deal_info_milestone_fee",
  human_name: "Show Milestone Fee on Deal Info",
  description: "When off, the Milestone Fee row is hidden in the Hours & Fees section.",
  settings_tab: "deal-info-fields",
  scope: "company", target_table: "company_settings",
  target_column: "ai_settings.deal_info.fees.milestone_enabled",
  aliases: ["milestone fee","milestone","show milestone"],
  validator: vBool, json_schema: { type: "boolean", default: true },
  dry_run_query: (ctx) => getCompanySettingsValue(ctx, ["deal_info","fees","milestone_enabled"]),
  apply_mutation: (ctx, v) => setCompanySettingsValue(ctx, ["deal_info","fees","milestone_enabled"], v),
  audit_event: "company.deal_info.fees.milestone.toggle",
},
{
  key: "settings.toggle_total_fee_computed_only",
  human_name: "Total Fee uses computed value (success fee % × deal size)",
  description: "When on, Total Fee on Deal Info is computed live from deal size × success fee %, ignoring retainer/milestone.",
  settings_tab: "deal-info-fields",
  scope: "company", target_table: "company_settings",
  target_column: "ai_settings.deal_info.fees.total_fee_computed_only",
  aliases: ["computed total fee","total fee computed"],
  validator: vBool, json_schema: { type: "boolean", default: false },
  dry_run_query: (ctx) => getCompanySettingsValue(ctx, ["deal_info","fees","total_fee_computed_only"]),
  apply_mutation: (ctx, v) => setCompanySettingsValue(ctx, ["deal_info","fees","total_fee_computed_only"], v),
  audit_event: "company.deal_info.fees.total_computed.toggle",
},
```

**Recommendation: adopt all three keys**, including `total_fee_computed_only` (default `false`; Blount seeded `true`). This is cleaner than a hard-coded company-UUID gate: auditable through the same `settings_audit_log`, admin-toggleable, surfaces in Settings, and zero risk of accidentally affecting other tenants because the default is `false`.

## Storage decision

Same as previously: reuse `company_settings.ai_settings jsonb` (already in use by every existing registry entry — `supabase/functions/ai-settings-tool/registry.ts:87–128`). **No `companies.settings` column added.** No schema migration needed for the read/write path; only a single data UPSERT to seed Blount's three flags.

## (f) Settings switch placement

Mount inside the existing `src/components/settings/DealInfoFieldsSettings.tsx` panel (already wired at `src/pages/Settings.tsx:278` behind `isVisible('deal-info-fields')`). Render order at the top of the panel, admin-only via existing `isAdmin` prop:

1. Switch — **Show Retainer Fee** (helper: *"When off, the Retainer Fee row is hidden from all users on this account."*)
2. Switch — **Show Milestone Fee** (same helper, "Milestone Fee row")
3. Switch — **Total Fee uses computed value (success fee % × deal size)** (helper: *"When on, Total Fee is computed live as deal size × success fee % and ignores Retainer/Milestone."*)

Non-admins see nothing — zero placeholder.

## New read-path hook

`src/hooks/useCompanyFeesVisibility.ts` (NEW):
```ts
useCompanyFeesVisibility() => {
  retainerEnabled: boolean,    // default true
  milestoneEnabled: boolean,   // default true
  totalEnabled: true,          // always true (constant)
  totalFeeComputedOnly: boolean,  // default false
}
```
Backed by one react-query for `company_settings.ai_settings` (key `['company_settings', companyId, 'ai_settings']`) with realtime subscription on `company_settings` filtered by `company_id` for ≤ 2 s cross-tab propagation.

## (g) React-query invalidation keys

On mutation success of any of the three keys, invalidate exactly:

- `['company_settings', companyId, 'ai_settings']`

(Realtime handles other open tabs.)

## Files — new vs touched

**New (3)**
- `src/hooks/useCompanyFeesVisibility.ts`
- `src/hooks/__tests__/useCompanyFeesVisibility.test.ts`
- `src/pages/__tests__/dealDetailHoursAndFees.test.tsx` (RTL + non-Blount snapshot)

**Touched (3, additive)**
- `src/pages/DealDetail.tsx` — inside the `case 'hoursAndFees':` arm (3728–3861): wrap Retainer row (3775–3790) with `{retainerEnabled && (...)}`; same for Milestone row (3791–3806); for the Total Fee `<Input>` `value` (3849), branch:
  ```ts
  totalFeeComputedOnly
    ? formatComputedTotal(deal.value, deal.successFeePercent)
    : (deal.totalFee ? Math.round(deal.totalFee).toLocaleString() : '')
  ```
  When `totalFeeComputedOnly` is true, the Total Fee input is also made `readOnly` with tooltip text "Computed: deal size × success fee %". No other lines in this file change.
- `src/components/settings/DealInfoFieldsSettings.tsx` — prepend three admin-only `<Switch>` rows.
- `supabase/functions/ai-settings-tool/registry.ts` — append the three entries above (and same in `ai-settings-apply/registry.ts` if it diverges).

**Untouched (explicit freeze list)**
- `SettingsMutationCard.tsx`, `useSettingsMutation.ts`, `AICopilotPanel`, `ChatMessageList`
- `ai-settings-tool/index.ts`, `ai-settings-apply/index.ts` internals
- `settings_audit_log` schema, `ff_ai_settings_mutations` gate
- Pilot KPI files, deal-status-notification files, Schedule Meeting / NOTES / Draft Reply / Stale Status Nudge / Availability Check / calendar render / meeting-holds / calendar-events / send-pipeline / email ingestion classifier
- `companies` table — no new column
- The `totalFee` derivation at line 2549 (the existing default-tenant behavior must stay 100% intact)

## Blount Capital seed (Phase 2 only, after approval; not until you re-confirm the UUID)

Single `supabase--insert` statement:

```sql
DO $$ BEGIN
  IF (SELECT count(*) FROM public.companies WHERE name = 'Blount Capital') <> 1
    THEN RAISE EXCEPTION 'Blount Capital company resolution failed'; END IF;
END $$;

INSERT INTO public.company_settings (company_id, ai_settings)
SELECT id, jsonb_build_object('deal_info', jsonb_build_object('fees', jsonb_build_object(
         'retainer_enabled', false,
         'milestone_enabled', false,
         'total_fee_computed_only', true)))
  FROM public.companies WHERE name = 'Blount Capital'
ON CONFLICT (company_id) DO UPDATE
  SET ai_settings = jsonb_set(
        jsonb_set(
          jsonb_set(COALESCE(company_settings.ai_settings,'{}'::jsonb),
                    '{deal_info,fees,retainer_enabled}', 'false'::jsonb, true),
          '{deal_info,fees,milestone_enabled}', 'false'::jsonb, true),
        '{deal_info,fees,total_fee_computed_only}', 'true'::jsonb, true);
```

## (h) Phase 2 test matrix

| # | Layer | Test |
|---|---|---|
| T1 | Unit | `useCompanyFeesVisibility` returns defaults `{retainer:true, milestone:true, total:true, totalFeeComputedOnly:false}` when key absent; honors explicit overrides |
| T2 | Unit | `formatComputedTotal(v, p)` — null/0/negative `v` or null `p` → `—`; `v=1_000_000, p=2` → `$20,000`; `v=10_000, p=0.5` → `$50`; `v=500, p=10` → `$50.00` (sub-$1k two-decimal rule) |
| T3 | Unit | Percent convention parity: `(value * percent) / 100` matches DealDetail line 2549 derivation |
| T4 | RTL  | HoursAndFees with `retainerEnabled=false, milestoneEnabled=false, totalFeeComputedOnly=true` → only `data-testid="fee-total"` present; `queryByTestId('fee-retainer')` and `queryByTestId('fee-milestone')` are `null` |
| T5 | RTL  | Same as T4 but with null `success_fee_percent` → Total renders `—` with the specified tooltip |
| T6 | RTL  | Settings panel: non-admin → all three switches absent; admin → all three switches present, bound to current values |
| T7 | RTL **non-Blount snapshot** (regression-lock) | Render HoursAndFees with the defaults (`retainerEnabled=true, milestoneEnabled=true, totalFeeComputedOnly=false`) and snapshot the entire subtree to capture today's exact markup. CI fails if anyone later changes non-Blount behavior. |
| T8 | Deno (edge) | `ai-settings-tool` dry-run + apply + undo for all three new keys |
| T9 | Integration | `settings_audit_log` rows written for each of the three toggles with correct `tool_key`, before/after, source |
| T10 | Integration | Non-admin direct `ai-settings-apply` call with any of the three new keys → 403 |
| T11 | Live (Blount tenant) | Open a Blount deal with `value` and `success_fee_percent` both set → no Retainer row, no Milestone row, Total Fee = correct product; flip Retainer ON in Settings → row appears in second open tab within ≤ 2 s; flip back OFF → disappears. Screenshots before/after. |
| T12 | Live regression (5th Line tenant) | Hours & Fees identical to today; three switches present for admins but all default ON / `total_fee_computed_only=OFF` so Total Fee continues to use the existing `deal.totalFee` derivation |
| T13 | Regression sweep | Prompt 3 RTL 6/6, Prompt 4 Deno 12/12 + Playwright, SettingsMutationCard E2E, Smart Status Note 30/30, Pilot KPI, deal-status-notification suite — all green; confirm grep shows zero files from the abandoned prior plan written |

## (i) Non-Blount regression proof plan

- **T7 snapshot test** above is the primary lock — any change to non-Blount markup fails CI.
- Plus runtime guard in `useCompanyFeesVisibility`: when no `company_settings.ai_settings.deal_info.fees` key exists, the returned object is **byte-identical** to today's effective behavior (`retainer=true, milestone=true, totalFeeComputedOnly=false`), so untouched tenants take the unchanged code path through the JSX (`true && (...)`) and the unchanged `value=deal.totalFee` source.
- T12 live check on the 5th Line tenant before sign-off.

## Open confirmations (please answer with `approved` or override)

1. **Adopt the third key `total_fee_computed_only`?** Recommended yes — auditable + admin-toggleable, defaults `false` so zero risk to other tenants, Blount seeded `true`.
2. **Currency = USD `$` glyph, no per-deal currency lookup?** Confirmed there's no `currency` column on `deals` or `companies`; every existing fee input on the page uses `$`. Will mirror exactly.
3. **Total Fee input becomes read-only when `total_fee_computed_only=true`?** Recommended yes (today's Total Fee is already `readOnly` at line 3850 with `bg-muted/40 cursor-not-allowed`). Same styling will apply.

Reply `approved` (and override any of the three above if needed). On approval I will implement Phase 2 exactly as scoped; the Blount seed will not run until you have explicitly seen and re-confirmed the UUID `c4753066-0da9-4d87-8858-7eb1adecd173` above.
