# Rep Scorecard — Scoped Live Build

Static `RepPerformanceModelGrid` stays as-is (the spreadsheet model is untouched). We add a **separate** live "Rep Scorecard" card on Insights → Performance that pulls from real deal data, plus the minimum schema and backfill to make it accurate.

## Phase 1 — Schema + stage + auto-stamp (migration only, awaits approval)

1. **New pipeline stage** `proposal-issued` (label "Proposal Issued"), inserted between `client-strategy-review` and `submitted-to-lenders` in `src/types/deal.ts` `STAGE_CONFIG` and in any default `deal_pipelines` rows.
2. **New columns on `public.deals`** (all `timestamptz null`):
   - `proposal_issued_at`
   - `terms_issued_at`
   - `terms_signed_at`
   - `closed_at`
   - `lost_at`
   - `deal_owner_user_id uuid` (FK to `auth.users`, indexed)
3. **Trigger** `deals_stamp_stage_anchors_trg` (BEFORE UPDATE OF stage): when `NEW.stage` first transitions into a milestone stage, stamp the corresponding anchor if NULL.
   - `proposal-issued` → `proposal_issued_at`
   - `terms-issued` → `terms_issued_at`
   - `funded-invoiced` → `closed_at`
   - `closed-won` → `closed_at` (if not already set)
   - `closed-lost` → `lost_at`
   - `terms_signed_at` is **only** set via explicit UI action (no stage maps to it) — handled in phase 3.
4. **Idempotent backfill** (one SQL statement, in same migration) using `deal_stage_durations`:
   - For each `(deal_id, stage_slug)` with `entered_at`, MIN(`entered_at`) populates the matching anchor on `deals` where it's currently NULL.
   - `proposal_issued_at` cannot be backfilled (stage didn't exist) — left NULL.
   - `terms_signed_at` left NULL (no historical signal).
5. **Owner backfill (dry-run report only this phase)**: a view `v_deal_owner_resolution` resolves free-text `deal_owner` / `manager` against `profiles.display_name` within the same `org_company_id`. No writes. Phase 4 applies after you review.

GRANTs + RLS preserved (deals already has policies; new columns inherit). Trigger is `SECURITY DEFINER` with `search_path = public`.

## Phase 2 — Hook + Rep Scorecard card

- `src/hooks/useRepScorecard.ts`: query deals scoped to current tenant, filtered by `deal_owner_user_id`, bucketed by `fiscal_quarter` derived from each anchor (calendar quarters, FY = calendar year per existing convention — confirm in implementation).
- `src/components/metrics/rep-model/RepScorecardCard.tsx`: Liquid Glass card with:
  - Rep dropdown (defaults to current user, admins see all reps).
  - Period buttons: Q1 / Q2 / Q3 / Q4 / Year (current FY).
  - **Active only** toggle (default OFF) for Pipeline Production rows.
  - Rows: Deals on Board, Dollars on Board, Proposals Issued #, Dollars Proposed, **Terms Issued** (count + $), Terms Signed (count + $), Clients Signed (count + $), Deals Closed (count + $), Dollars Funded, **Lost Deals** (count + $).
  - Each row has a tooltip showing the anchor column it uses.
- Mount on `Insights.tsx` Performance tab, above the static grid.
- Admin-only banner (uses `useAdminRole`): "N orphan deals are not attributed to any rep" linking to phase 4's picker. Hidden if N = 0.

Exclusions: applies the global "Test-Niki's Store / Example Deal / starts with 'test '" rule and the deal-class isolation per memory.

## Phase 3 — `terms_signed_at` capture UI

Small affordance on the deal detail page when stage = `terms-issued` or later: a single "Mark Terms Signed" button stamps `terms_signed_at = now()`. Free-text override allowed (date picker) for historical entries. Admin-only.

## Phase 4 — Niki backfill (dry-run → apply) + Audit page

- Page `/admin/performance-audit` (gated `useAdminRole`) listing the proposed owner resolutions from `v_deal_owner_resolution` for the 11 Asana deals + Opconnect, with confidence scores and an "Apply" button per row (and "Apply all >= 0.9").
- Same page also lists scorecard delta per metric per rep before/after each backfill operation.
- Specific writes (gated behind the page's "Apply"):
  - Set `deal_owner_user_id` to Niki on the 12 named deals (you confirm her user id in this phase).
  - Mark EVGateway `status = 'lost'`, stamp `lost_at` = stage transition into closed-lost (or now()).
  - Mark BBP `terms_issued_at` = stage entry into `terms-issued`.
  - Lango / Opconnect: re-derive `signed_at` / `closed_at` from earliest matching stage event; no manual quarter override — the bucket comes from the anchor.

## Phase 5 — Tests

- Unit (vitest): fiscal-quarter helper, anchor selection per metric, Active-only filter excludes lost.
- Unit: scorecard aggregation includes lost in Pipeline Production unless Active-only.
- E2E (`e2e/rep-performance-niki.spec.ts`): runs **after** phase 4 backfill — open Insights → Performance, pick Niki, assert new rows and that EVGateway is in the Lost row.

## What's explicitly **not** in scope

- Refactoring the static `RepPerformanceModelGrid` spreadsheet.
- A SQL `rep_performance` materialized view (we'll query directly; matview can come later if perf demands).
- Application-layer NOT NULL check on `deal_owner_user_id` for stages ≥ Proposal Issued (would break too many existing rows; revisit after backfill).
- `fiscal_year` / `fiscal_quarter` as stored columns — computed in the hook + a SQL function `deal_fiscal_bucket(ts)` used by audit queries. Cheaper, no triggers on every anchor write.

## Technical notes

- Trigger uses `WHEN (OLD.stage IS DISTINCT FROM NEW.stage)` and only writes if the anchor is currently NULL — idempotent on stage bounce.
- All new columns nullable; no existing code paths break.
- `deal_owner_user_id` FK uses `ON DELETE SET NULL` to keep historical scorecards alive after a user is removed.
- `fiscal_quarter` derivation lives in `src/lib/fiscalQuarter.ts` (new). Calendar-year FY assumed; if your FY ≠ calendar year, say so before Phase 2.

## Ship order

Phase 1 migration → I'll halt for approval. Then Phase 2 ships in one turn. Phase 3, 4, 5 follow each in their own turn so we can sanity-check numbers as we go.
