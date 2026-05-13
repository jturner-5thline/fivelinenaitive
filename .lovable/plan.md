# Optimize the deal pop-up modal

## Root-cause measurement

The current overlay (`src/components/naitive-pipeline/NaitiveDealOverlay.tsx`) embeds the deal page via an `<iframe src="/deal/:id?embedded=1">`. Every open re-instantiates the entire React app inside the iframe:

- New JS execution context (no shared bundle parse cache after first mount)
- Re-creates every `*Provider` (Auth, Deals, Stages, Pipelines, Lenders, Charts, Widgets, Tooltip, Theme, QueryClient, etc.) — ~25 providers
- Brand-new React Query cache → all `deals`, `lenders`, `stages`, `documents`, `activity`, `write-up`, `vdr`, `comments` queries refetch from scratch
- No reuse of the deal row already present in the parent page's `useDealsContext()`

This is why opening a deal feels "as slow as a full page navigation" — it literally is one. No iframe-side optimization can fix shared-cache reuse; we have to render `DealDetail` in the same React tree.

## Change

### 1. Replace iframe with in-tree render

Render `<DealDetail>` directly inside `NaitiveDealOverlay`. Wrap it in an isolated **`MemoryRouter`** seeded with `/deal/:id?…` so:

- `useParams()` returns the right deal id without changing the parent URL
- `useSearchParams()` (used for the tab state inside DealDetail) stays scoped to the modal
- The 3 `navigate('/deals')` / `navigate(returnTo)` call sites are intercepted via a `<Routes>` 404 fallback that calls the parent's `onClose()`

This keeps the rest of the parent app (Auth, QueryClient, DealsContext, StagesContext, etc.) shared, so the deal record already in `useDealsContext()` is reused instantly with zero refetch.

### 2. Instant skeleton + summary header

Render an immediate header with already-known fields from the deal prop (company, value, stage badge, owner, last-updated) before `DealDetail` paints. Wrap `DealDetail` in `<Suspense fallback={<DealOverlaySkeleton />}>` so its lazy chunk doesn't block first paint.

### 3. Recent-deal cache

`DealDetail` already reads from React Query / `useDealsContext`, both shared with the parent → reopening the same deal is instant by construction. No new cache layer needed; we just stop spawning a new iframe per open.

### 4. Hover/mousedown prefetch

On `NaitiveDealCard` and `DealCard`, add `onMouseEnter` / `onFocus` / `onTouchStart` handlers that call `queryClient.prefetchQuery` for the deal's primary query keys (`['deal', id]`, `['deal-activity', id]`, `['deal-documents-summary', id]`). Light, idempotent, fires once per card per session.

### 5. Cheap render perf passes (only inside the modal)

- Wrap `NaitiveDealOverlay` in `React.memo`
- `useCallback` the `onNavigate` / `onClose` / `onStageChange` props from `Deals.tsx` and `NaitivePipeline.tsx` so the memo holds
- Keep heavy DealDetail tab panels lazy: they already use route state, but ensure unmount when not active (no behavior change)

## Out of scope

- No edits to `DealDetail.tsx` business logic
- No edits to other pages, AppLayout, or providers
- No changes to permissions, save flows, or integrations
- No new dependencies

## Files touched

- `src/components/naitive-pipeline/NaitiveDealOverlay.tsx` — swap iframe for MemoryRouter+DealDetail+skeleton header, focus-trap stays
- `src/components/naitive-pipeline/NaitiveDealCard.tsx` — hover/focus/touch prefetch
- `src/components/deals/DealCard.tsx` — hover/focus/touch prefetch
- `src/pages/Deals.tsx` / `src/pages/NaitivePipeline.tsx` — wrap overlay handlers in `useCallback` (already partly done in Naitive)
- (new) `src/components/naitive-pipeline/DealOverlaySkeleton.tsx`

## Verification

1. Open any deal from the kanban — header summary visible in <100 ms, full DealDetail hydrates without a network round-trip for fields already in `useDealsContext`.
2. Reopen same deal — instant (shared cache).
3. Switch deals via ←/→ — only deal-scoped queries refetch; providers stay mounted.
4. Confirm no broken navigation: "Back to Pipeline" closes the modal; delete still works and closes the modal.
5. Browser performance profile before/after to quantify the win.

## Acceptance check

- Click → modal visible immediately ✓
- Primary fields visible immediately ✓
- Recently opened deal reopen instant ✓
- Secondary tabs lazy ✓ (no change vs today, just no longer behind an iframe boot)
- No regressions to save, permissions, integrations ✓
