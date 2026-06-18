
# Daily Deal Rundown — Bug Analysis

The Rundown surface is rendered by `PipelineTab` (in `src/components/dashboard/DailyBriefingModal.tsx`) which mounts `PipelineMemoView` (`src/pages/pipeline/PipelineMemoView.tsx`). Each deal card is `PipelineMemoCard` (`src/components/pipeline/memo/PipelineMemoCard.tsx`) composed of `MemoHeader`, `TasksMilestonesBand`, `ActivityPanel`, `LendersPanel`, `CalendarPanel`.

---

## Bug 1 — Only a few deals show, mostly On Hold

**Pipeline of filters**

1. `useDealsContext()` → `useDealsDatabase.fetchDeals` returns all deals (paginated).
2. `PipelineTab.syncScopedDeals` runs `filterRundownEligibleDeals(base, activePipelineId, isAdmin)` from `src/hooks/useDailyBriefingData.ts` (lines 97–115):
   ```ts
   if (!activePipelineId) return [];
   return deals.filter(d => {
     if (d.pipelineId !== activePipelineId) return false;   // ← hard gate
     if (UNIVERSAL_SUPPRESSED_STATUSES.has(status)) return false;
     if (/^test/i.test(name)) return false;
     return true;
   });
   ```
3. For non-admins it also strips `archived` / `closed-lost`.
4. `PipelineTab.filteredDeals` further narrows to owner-name match OR an open assigned task when `targetDealOwnerName`/`targetUserId` is passed (rundown scope only).

**Root cause**
The hard `d.pipelineId !== activePipelineId` gate is the dominant filter. `activePipelineId` resolves to the `is_default = true` row in `deal_pipelines` ("Active Pipeline"). Any deal whose `pipeline_id` is null or pointing at a different pipeline (e.g. legacy "In Development", FinServ, naitive, secondary boards) is silently dropped — even if it is otherwise a healthy live deal. On-hold deals that happen to be on the default pipeline pass, so the surviving population skews to "mostly on hold."

The diagnostic `console.warn('[PipelineTab] empty deals result', …)` already exists for the zero-deals case but won't fire for "few deals," so the filter has been invisible.

**Proposed fix**
- Loosen the rundown eligibility filter: keep `pipelineId === activePipelineId` *or* `pipelineId == null` (treat unassigned as default), and also include any deal whose stage maps to a known stage of the active pipeline. The cleanest version: only drop deals on a *different non-default* pipeline, and keep `pipelineId == null` + `pipelineId === activePipelineId`.
- Additionally exclude `'on-hold'` (and `'archived'`/`'closed-lost'` already covered) from the universal rundown set unless the admin filter chip explicitly selects it, so a healthy rundown isn't dominated by on-hold deals.
- Keep `UNIVERSAL_SUPPRESSED_STATUSES` and test-name exclusions as-is.
- Add a one-line `console.debug` summary (pre/post filter counts) for ongoing diagnosis.

**Files to touch**
- `src/hooks/useDailyBriefingData.ts` (`filterRundownEligibleDeals`)
- `src/components/dashboard/DailyBriefingModal.tsx` (the secondary suppressed-status list in `syncScopedDeals`)

---

## Bug 2 — Cannot change deal stage (e.g. "Initial Feedback") inside the Rundown

**Where stage is rendered**
- Left tile (`DealTile` in `PipelineMemoView.tsx` line 689+): renders a read-only `<Badge variant="outline">{stageLabel}</Badge>`.
- Right card header (`MemoHeader.tsx`): renders only `EditableDealStatusTag` (which edits *canonical status*: on-track / at-risk / off-track / on-hold / archived) plus an editable free-text "Status notes" field that writes to `deal.notes`.

**Root cause**
There is no UI control wired to change `deal.stage` anywhere in the Rundown. `EditableDealStatusTag` only mutates `deal.status` via `updateDealStatus`. The stage badge is a `<Badge>`, not an interactive component. So the user's request to set stage to "Initial Feedback" has no entry point at all — it's not a broken handler, it's a missing component.

**Proposed fix**
- Add an `EditableDealStageTag` (sibling to `EditableDealStatusTag`) that:
  - Reads pipeline-aware stages via the existing `usePipelineStageConfig().getStagesForDeal(deal.pipelineId)` (already used to *display* the stage label).
  - Opens a popover with stage options.
  - On select, calls `updateDeal(deal.id, { stage: nextStageId })` from `useDealsContext()`.
  - Optimistic update + toast + revert on failure (mirror the pattern in `EditableDealStatusTag`).
- Mount it in two places:
  - `MemoHeader.tsx` — next to the status pill.
  - `DealTile` in `PipelineMemoView.tsx` — replace the read-only stage `<Badge>`.
- Reuse pipeline-aware stage resolution from memory rule "Pipeline Stage IDs" so labels like "Initial Feedback" / "Indication of Interest" stay correct in the In Development pipeline.

**Files to touch**
- New: `src/components/deal/EditableDealStageTag.tsx`
- `src/components/pipeline/memo/MemoHeader.tsx`
- `src/pages/pipeline/PipelineMemoView.tsx` (DealTile)

---

## Bug 3 — Milestones tab shows "No milestones for this deal" even when the deal page has milestones

**Where the Milestones pill is**
`TasksMilestonesBand.tsx` (lines ~605–655) renders a three-pill filter (Tasks / Milestones / Outstanding). When "Milestones" is active, it filters `deal.milestones` (`allIncompleteMilestones` from `deal.milestones || []`). If that array is empty it prints "No milestones for this deal."

**Root cause**
`mapDbDealToDeal` in `src/hooks/useDealsDatabase.ts` (lines 264–389) maps a row from `deals` straight into the `Deal` type — but it **never reads `deal_milestones`** and never sets the `milestones` field. So `deal.milestones` is `undefined` for every deal in `DealsContext`. The deal detail page works because it uses a separate hook (`useDealMilestones`) that queries `deal_milestones` directly, while the Rundown card reads only the in-memory `Deal`.

`TasksMilestonesBand` also uses `deal.milestones` to compute `nextMilestone` for the default (unfiltered) row, and `PipelineMemoView.sorted` uses it for tier-2 priority — both currently always evaluate empty for the same reason.

**Proposed fix (pick one — preferred is A)**

**A. Batch-load milestones for the rundown set (no schema churn).**
- Add `usePipelineDealMilestones(dealIds, enabled)` (parallel to `usePipelineDealTasks`) that queries `deal_milestones` for the visible deal IDs in one round trip and returns `Map<dealId, DealMilestone[]>`.
- Wire it in `PipelineMemoView` and pass `milestones={milestonesByDeal.get(deal.id)}` into `PipelineMemoCard` → `TasksMilestonesBand`.
- In `TasksMilestonesBand`, prefer the prop, fall back to `deal.milestones`.
- Invalidate the new query on `copilot-action-completed` for `add_milestone` / `toggle_milestone`, and after the local `completeMilestone` mutation.

**B. Hydrate `deal.milestones` globally.**
Add a `deal_milestones` join inside `fetchDeals` and populate `milestones` in `mapDbDealToDeal`. Lower-risk for the rundown but increases the cold-start payload for every page that reads `DealsContext`, so A is preferred.

**Files to touch (option A)**
- New: `src/hooks/usePipelineDealMilestones.ts`
- `src/pages/pipeline/PipelineMemoView.tsx` (call hook, pass map)
- `src/components/pipeline/memo/PipelineMemoCard.tsx` (forward `milestones` prop)
- `src/components/pipeline/memo/TasksMilestonesBand.tsx` (consume prop, fallback to `deal.milestones`)

---

## Cross-check
- Memory "Pipeline Stage IDs" and "Stage Resolution" both apply to Bug 2: use `getStageConfigForDeal(stageId, pipelineId)` so the editable stage tag respects per-pipeline labels (esp. In Development overloads).
- Memory "Active Pipeline" applies to Bug 1: the rundown is deliberately scoped to the default pipeline, so the fix should preserve "default OR null" while keeping non-default pipelines out.
- No DB schema change required for any fix.
