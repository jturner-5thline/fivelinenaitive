# Platform-Wide Performance Hardening

This is a large, cross-cutting effort. Below is the staged plan I'll execute. Each phase is independently shippable and verified before moving on.

## Phase 1 — Diagnostics & Baseline (ship first)
Goal: see the problem before fixing it, and catch regressions later.

1. **Perf instrumentation module** (`src/lib/perfDiagnostics.ts`)
   - Counters for: active React Query subscriptions, active Supabase Realtime channels, active intervals/timeouts, registered event listeners.
   - Long-task observer (PerformanceObserver `longtask`) — log tasks >50ms with route.
   - Memory sampler (`performance.memory` where available) every 60s while visible.
   - Route render timing hook used by route shells.
2. **Wrap globals**: monkey-patch `setInterval`/`setTimeout`/`addEventListener` in dev only to count + tag by stack.
3. **Wrap `supabase.channel`** to track subscription count + leak warnings on >25 channels.
4. **Admin → Diagnostics panel** (`src/components/admin/PerfDiagnosticsPanel.tsx`)
   - Live counters, top long tasks, memory trend chart, slowest routes table.
   - "Snapshot" button writes a JSON report to clipboard for triage.

## Phase 2 — Background work throttling
Goal: hidden tabs and inactive modules must not burn CPU/network.

1. **Audit every `setInterval`** in `src/hooks/**` and `src/components/**`; route through `startVisibilityAwareInterval` (already exists in `src/lib/visibilityAwareInterval.ts`).
   - Known offenders to convert: notification poll, deal management notifications, email intelligence sync, calendar refresh, Gmail/Nylas sync status, Asana sync status, news feed, FLEx sync.
2. **React Query global defaults**: bump `staleTime` to 60s, `gcTime` to 5m, disable `refetchOnWindowFocus` for heavy queries (opt-in instead), set `refetchInterval` to pause when `document.hidden`.
3. **Pause Realtime subscriptions** when tab hidden >2min; resume on visibility.
4. **Animations**: gate Framer/CSS animation loops (`MorphingBlob`, dashboard shimmer) on `document.visibilityState === 'visible'` and `prefers-reduced-motion`.

## Phase 3 — Subscription & listener hygiene
1. Scan for `supabase.channel(...)` outside `useEffect` cleanups — fix any leaks (DealsContext, notifications, inbox).
2. Scan for `window.addEventListener` without paired `removeEventListener` — fix.
3. Scan for `setInterval`/`setTimeout` without clear on unmount — fix.
4. Consolidate per-row Realtime subscriptions into a single shared channel per table (notifications, deal updates, tasks).

## Phase 4 — De-duplicate data fetching
1. **Shared deals dataset**: `DealsContext` already centralizes; audit all `useDealsDatabase` callers and remove direct duplicate fetches (grid/list/pipeline/dashboard already share — verify mail/calendar do too).
2. **Shared contacts/companies/lenders/tasks contexts**: ensure single fetch per session, shared via React Query keys; remove ad-hoc `supabase.from(...)` calls in widgets.
3. **Memoized selectors**: extract `useMemo` view models (`useFilteredDeals`, `useDealsByStage`) into shared hooks so each view doesn't recompute the same filter/sort.
4. **Inbox cache**: keep existing `inboxCacheStore` but add request coalescing — concurrent callers share one inflight promise.

## Phase 5 — Virtualization & pagination
Adopt `react-virtuoso` (already used in HubSpot table) consistently.

1. **Deals**: list view → virtualize rows; grid view → virtualize cards; pipeline columns → virtualize within column.
2. **Contacts page**: virtualize table (currently full mount of 100s/1000s).
3. **CRM Companies page**: virtualize.
4. **Lenders directory**: virtualize.
5. **Mail/Inbox**: virtualize message list.
6. **Activity logs & audit trail**: virtualize + keep existing pagination.
7. **Admin tables** (people, companies, demo metrics): virtualize + server-side pagination where row count is unbounded.

## Phase 6 — Render cost reduction
1. **React.memo** for hot leaf components in heavy views (`DealCard`, `DealRow`, `ContactRow`, `LenderRow`, `InboxMessageRow`).
2. **Stable callbacks/keys**: audit `useCallback`/`useMemo` deps in `DealsContext`, dashboard widgets, pipeline.
3. **Split contexts**: `DealsContext` value object → split into data vs actions providers so action-only consumers don't rerender on data updates.
4. **Lazy-mount inactive tabs**: dashboard tabs, deal-detail tabs render only the active panel.

## Phase 7 — Heavy computation offload
1. Dashboard analytics aggregations: move from inline `useMemo` (every render) to memoized selectors keyed by data version.
2. Pipeline summary metrics: compute once per `deals` change, share via context.
3. Consider Web Worker for `/analytics` heavy roll-ups if Phase 7.1 still shows long tasks.

## Phase 8 — Audit & verification
Run on each of top-10 routes (Deals, Pipeline, Dashboard, Mail, Calendar, Tasks, Contacts, CrmCompanies, Lenders, Admin):
- Initial render <1.5s on warm cache
- INP <200ms
- No long task >200ms during idle
- Memory growth <10MB over 10min idle
- ≤1 Realtime channel per logical stream
- Background CPU ≈0 when tab hidden

Record results in `docs/perf-audit-2026-06-12.md`.

---

## Technical notes
- All work is frontend/data-layer. No schema changes.
- React Query v5 already installed; tuning is config-only.
- `react-virtuoso` already a dependency.
- Visibility helpers (`visibilityAwareInterval`, `useInboxPrefetch`) already exist — extend their use.
- Will deliver in **8 sequential PR-sized commits** (one per phase) so each can be reviewed/reverted independently.

## Risk
- Splitting `DealsContext` and adding memoization can introduce subtle stale-state bugs — mitigated by Phase 1 diagnostics + targeted Playwright run before Phase 8 sign-off.
- Virtualizing pipeline columns interacts with drag-and-drop; will use Virtuoso's `customScrollParent` to keep DnD working.

## Out of scope
- Backend/edge function perf (separate workstream).
- Bundle-size optimization beyond what falls out of lazy mounting (no new code-splitting pass).

---

**Scale & timing**: this is roughly a multi-day effort and will touch a large surface area. If you'd like, I can narrow Phase 1 (diagnostics + background throttling + listener/subscription audit) as the first shippable slice — that alone typically resolves the "background tab slows my whole computer" symptom — and queue the rest behind it. Tell me to proceed full plan, or start with Phase 1–3 only.
