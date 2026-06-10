# Ask AI "Wrong Lenders" — Root Cause & Fix Plan

## What I checked

### 1) Funding Sources tab (UI)
- Tab: `src/pages/DealDetail.tsx:4245` (`<TabsContent value="lenders">`). It renders `deal.lenders` from `useDealsContext` (`src/contexts/DealsContext.tsx`).
- Lenders source: `src/hooks/useDealsDatabase.ts:417-422` fetches all `deal_lenders` (`select *`, no `deal_id` filter) once, then maps per‑deal at `:269-292` via `dbLenders.filter(l => l.deal_id === dbDeal.id)`. Each row goes into `deal.lenders` for that specific `deal.id`.

### 2) Ask AI edge function
- `supabase/functions/deal-space-ai/index.ts`
  - Body destructure: `:939` reads `{ messages, dealId, conversationId, ... }` from the request.
  - Context builder `buildDealContext()` at `:460` queries everything by **the same `deal_id`** (`:466-482`), including `deal_lenders` (`:468`).
  - The lender block in the system prompt is built at `:609-625` with a numbered list `${i+1}. ${l.name}`.
- The client passes the current route's `dealId` (`src/components/deal/DealSpaceAskAITab.tsx` → `useDealSpaceAI` → `supabase.functions.invoke('deal-space-ai', { body: { dealId, ... } })` in `src/hooks/useDealSpaceAI.ts:74-82`).

Both surfaces filter `deal_lenders` by `deal_id` correctly. No mock data, no missing filter, no status mapping bug. The status mapping in the AI block (`stage === 'Passed' || tracking_status === 'passed'` at `:611-612`) matches what the UI groups as "Passed".

## Actual root cause — duplicate deals with the same display name

Direct DB query on the "Worthy" account:

```
id                                    | company   | length
104502f4-75a7-4e2b-8a78-ba26cb9fa7f2  | 'Worthy'  | 6
10870efb-1bc5-4c4f-beeb-1f9e3566d6b5  | 'Worthy ' | 7   <-- trailing space
```

Both rows live in the same tenant (`company_id 44556c46…`, 5th Line). They look identical in every list/picker because the trailing space is invisible.

Lenders per deal (`deal_lenders` filtered by `deal_id`):
- `104502f4` ("Worthy", no space): 10 lenders, **all** with `tracking_status='passed'`. **No Dwight Funding.**
- `10870efb` ("Worthy ", trailing space): 30 lenders including **Dwight Funding** (`tracking_status='active'`, `stage='on-deck'`) and **SG Credit Partners** (`tracking_status='passed'`). Dwight is the 4th name when ordered by `created_at DESC` — exactly matching the AI's "lender #4 in the system" phrasing, which comes from the `${i+1}. ${l.name}` template at `:617`.

The only existing Ask AI conversation for "Worthy" is bound to the trailing‑space deal:

```
deal_space_conversations
525779d7-...  deal_id=10870efb (Worthy with trailing space)  updated 2026-06-09
```

So the AI's answer is correct **for the deal it was asked about** (`10870efb`). The Funding Sources tab the user is comparing against is for the **other** Worthy (`104502f4`). The two surfaces are not diverging because of a data‑source bug — they are pointed at two different deal rows that happen to share a display name.

## Why this is easy to hit
- Deal names are not normalized: `createDeal` in `src/hooks/useDealsDatabase.ts:545-547` stores `dealData.company` verbatim, so `"Worthy "` and `"Worthy"` are different rows.
- The deal list, search, breadcrumb, and conversation header all render `deal.company` raw, so duplicates are visually indistinguishable.
- `useDealsContext` already loads both rows; there is no UI cue (id suffix, created date, owner) when two deals collide on name.

## Proposed fix

### A. Data cleanup (immediate, manual)
1. Use the existing duplicate detection / merge tool (memory: `features/deals/duplicate-detection-and-merge-system`) to merge `10870efb` "Worthy " into `104502f4` "Worthy" (or vice versa, whichever has the canonical write‑up). This consolidates `deal_lenders`, `deal_space_conversations`, notes, and write‑ups onto a single deal.
2. As part of the merge, `UPDATE deals SET company = btrim(company)` for the surviving row to remove the trailing space.

### B. Prevent recurrence (small code changes — UI/server input normalization only)
1. **Trim on write.** In `src/hooks/useDealsDatabase.ts` `createDeal` (~`:545-547`) and `updateDeal` (deal‑name update path), trim `company` before insert/update: `(dealData.company || 'New Deal').trim()`.
2. **Duplicate‑name warning.** In `CreateDealDialog`/`CreateCompanyDialog` and the deal rename input, after the user types, query `deals` in the same `company_id` for `lower(btrim(company)) = lower(btrim(input))` and surface a non‑blocking "A deal named 'Worthy' already exists" warning with a link to the existing deal. Do not silently dedupe — let the user choose.
3. **Disambiguate in the UI when collisions exist.** In any list that renders `deal.company` (deal carousel, Ask AI header, breadcrumbs), when two deals in the visible set share the same trimmed name, append a short discriminator (owner initials or `#<first 6 of id>`). Lightweight: compute a `Map<trimmedName, count>` once in the deals context.
4. **Ask AI header confirmation.** In `DealSpaceAskAITab`, show the deal id suffix (`#10870ef`) next to the deal name in the chat header so users can confirm which deal the assistant is scoped to. No edge‑function change required.

### C. Optional hardening (no behavior change for non‑duplicates)
- One‑off migration: `UPDATE deals SET company = btrim(company) WHERE company <> btrim(company);` after data cleanup is complete.
- Consider a partial unique index on `(company_id, lower(btrim(company)))` only after the team confirms intentional duplicates (e.g., two separate "Acme" engagements) are handled by appending a discriminator.

## Files referenced
- `src/pages/DealDetail.tsx:4245` — Funding Sources tab content.
- `src/hooks/useDealsDatabase.ts:264-292` (lender mapping per deal), `:417-422` (lender fetch), `:545-547` (deal create — name normalization gap).
- `src/contexts/DealsContext.tsx` — exposes `deal.lenders`.
- `src/components/deal/DealSpaceAskAITab.tsx`, `src/hooks/useDealSpaceAI.ts:74-82` — Ask AI client; passes route `dealId`.
- `supabase/functions/deal-space-ai/index.ts:460-625` — context builder and lender block (no bug; correctly scoped).

## What I am NOT changing
No edits to the Ask AI edge function, the lender query, or the Funding Sources rendering — those are working as designed. The fix is data cleanup plus name‑normalization/disambiguation in the deal creation and selection UI.
