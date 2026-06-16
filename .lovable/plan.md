# Platform-Wide Performance Remediation

This is a very large, cross-cutting refactor that touches routes, providers, queries, subscriptions, modals, and bundling. To keep it safe (no regressions to Asana sync, email, calendar, tasks, RBAC, demo account, workflows), I'll ship it in numbered, independently revertable phases. Each phase ends with measurable verification before moving on.

A `.lovable/plan.md` already exists with an earlier draft of this work — phases 1–3 there are partly done. I'll continue from where that left off, fill gaps, and extend coverage to **every** route/modal as you asked.

## Phase 0 — Baseline (1 commit)
- Turn on the existing `perfDiagnostics` panel in Admin → Observability with: route mount time, first content paint, TTI, active React Query subscriptions, active Supabase channels, intervals/timeouts, listeners, long tasks >50ms, memory trend.
- Capture a snapshot per top route (Deals, Pipeline, Dashboard, Mail, Calendar, Tasks, Contacts, CrmCompanies, Lenders, Admin, Analytics, Insights, FinServ, Finance) so we can show before/after numbers.
- Add a dev-only console group on each route mount: `[perf] /route — mount Xms, queries N, channels M`.

## Phase 1 — Shell-first rendering + code splitting (everything)
- Audit `src/App.tsx`; every route gets `React.lazy` + Suspense with a route-appropriate skeleton (extend `OverlayLoadingShell` pattern to full pages).
- Same treatment for heavy modals/overlays: DailyBriefingModal, DealsOverlay, TasksOverlay, CalendarOverlay, MailOverlay, DashboardOverlay, AdminAgent, AgreementDrafter, VDR workspace, Deal detail tabs.
- Inside each shell, render header + nav + empty content immediately; data hooks fire after first paint via `useDeferredValue` / `startTransition`.
- Lazy-mount inactive tabs in deal detail, dashboard, admin, settings — only the active tab's tree mounts.

## Phase 2 — Prefetch on intent
- Extend `routePrefetch.ts` to cover Mail, Calendar, Dashboard, Insights, Admin, DailyRundown, VDR.
- Add `onMouseEnter` / `onFocus` prefetch on top-nav links, deal cards, task rows, email rows, and overlay-launch buttons (code chunk + minimum query payload via `queryClient.prefetchQuery`).
- Idle-time prefetch of common chunks after first paint (already partly wired).

## Phase 3 — Background work throttling
- Route every `setInterval` through `startVisibilityAwareInterval` (already exists). Known offenders: notification poll, deal management notifications, email intelligence sync, calendar refresh, Gmail/Nylas sync status, Asana sync status, news feed, FLEx sync, briefing refresh.
- React Query global defaults: `staleTime: 60_000`, `gcTime: 300_000`, `refetchOnWindowFocus: false`, `refetchInterval` paused when `document.hidden`.
- Pause Realtime channels when tab hidden >2min; resume on visibility.
- Gate animations (`MorphingBlob`, dashboard shimmer, gradients) on `visibilityState === 'visible'` and `prefers-reduced-motion`.

## Phase 4 — Subscription / listener / timer hygiene
- Scan for `supabase.channel(` outside `useEffect` cleanups → fix leaks.
- Scan for `addEventListener` without `removeEventListener` → fix.
- Scan for `setInterval`/`setTimeout` without clear on unmount → fix.
- Consolidate per-row Realtime subscriptions into one shared channel per table (notifications, deal updates, tasks, inbox).

## Phase 5 — Query / fetch de-duplication
- Audit all `useDealsDatabase` / direct `supabase.from('deals')` callers; route everything through `DealsContext`.
- Same for contacts, companies, lenders, tasks, inbox — one shared React Query key per dataset; widgets read from cache.
- Request coalescing in `inboxCacheStore` (shared inflight promise).
- Trim `.select('*')` to required columns on the heaviest queries (deals list, contacts list, tasks list, inbox list, lenders list).
- Split expensive joins/enrichment (relationships, AI summaries, activity history) into deferred follow-up queries fired after initial paint.

## Phase 6 — Render-cost reduction
- `React.memo` on hot leaf rows: `DealCard`, `DealRow`, `ContactRow`, `LenderRow`, `InboxMessageRow`, `TaskRow`, `NotificationRow`.
- Stabilize callbacks/keys in `DealsContext`, dashboard widgets, pipeline.
- Split `DealsContext` into data vs actions providers so action-only consumers don't rerender on data changes.
- Move per-render aggregations (dashboard analytics, pipeline summaries) to memoized selectors keyed by data version.

## Phase 7 — Virtualization & pagination
- Standardize on `react-virtuoso` (already installed). Apply to: Deals list/grid + pipeline columns, Contacts, CrmCompanies, Lenders, Mail/Inbox, Tasks, activity logs/audit trail, admin people/companies/demo metrics tables.
- Server-side pagination on tables with unbounded row counts.

## Phase 8 — Bundle audit
- `vite build --report` (via rollup-plugin-visualizer if not already present) → identify large deps.
- Replace bulk `lucide-react` and date-fns imports with per-icon / per-function imports where missed.
- Lazy-load heavy-but-rare deps: `xlsx`, `recharts` (per-chart only on Analytics/Insights), `react-flow`, `docx`, PDF libs, `framer-motion` heavy variants, `@radix-ui` dialogs only where used.
- Manual `rollup` `manualChunks` for vendor split (react, radix, charts, date, supabase) so route chunks stay small.

## Phase 9 — Cloud compute check
- Run `supabase--db_health` + `supabase--slow_queries`. If saturation or slow queries found, add targeted indexes via migration and report whether the Cloud instance needs an upgrade. If an upgrade is warranted, I'll tell you and link Backend → Advanced settings → Upgrade instance — I won't change billing.

## Phase 10 — Verification & docs
For each top route, measure:
- Shell paint <300ms, initial render <1.5s warm cache, INP <200ms.
- No long task >200ms idle.
- Memory growth <10MB over 10min idle.
- ≤1 Realtime channel per logical stream.
- Background CPU ≈0 when tab hidden.
- Modal-open latency <150ms for cached, <500ms cold.

Recorded in `docs/perf-audit-2026-06-16.md` with a before/after table and a "bottlenecks found → fix applied" summary returned to you in chat.

## Out of scope
- Backend edge function perf (separate workstream).
- UX, layout, business logic, RBAC changes.
- Schema changes beyond targeted indexes uncovered in Phase 9.

## Risk & rollout
- Each phase is one focused PR-sized commit, reverted independently if it misbehaves.
- Phases 5/6 (context splitting, query dedup) are highest risk for stale-state bugs — mitigated by Phase 0 diagnostics + spot Playwright runs on Deals/Mail/Tasks before sign-off.
- Virtualizing pipeline columns interacts with drag-and-drop; will use Virtuoso `customScrollParent`.

## What I need from you
This is realistically a multi-day effort touching hundreds of files. Two options:

1. **Full plan, phases 0→10** — best end state, larger diff, more credits.
2. **High-impact slice: phases 0–4 only** — typically resolves "browser-wide slowdown" and "modals stall the app" symptoms in one pass, then we measure and decide whether 5–10 are still needed.

Tell me **"full plan"** or **"slice 0–4"** (or pick specific phases) and I'll start executing immediately. I will not publish to production — preview only — and you publish when you're satisfied.
