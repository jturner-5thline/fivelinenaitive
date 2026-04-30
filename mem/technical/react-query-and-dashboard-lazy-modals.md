---
name: react-query-defaults-and-dashboard-lazy-modals
description: Project-wide React Query defaults (staleTime/gcTime/refetchOnWindowFocus) and Dashboard heavy-modal lazy-loading rules
type: preference
---
React Query is configured globally in src/App.tsx with:
  staleTime: 60s, gcTime: 5min, refetchOnWindowFocus: false, retry: 1.
Do not remove these defaults — they are the baseline for perceived speed.
Per-query overrides remain allowed when a query genuinely needs different semantics
(e.g., realtime counters, polling, or sensitive financial reads). Mutations MUST
still call queryClient.invalidateQueries(...) explicitly.

Dashboard heavy modals are lazy-loaded via React.lazy in src/pages/Dashboard.tsx
and wrapped in <Suspense fallback={null}>:
  - DailyBriefingModal, InboxDialog, DealsCarouselDialog, FullCalendarView, AddWidgetDialog.
Keep these lazy. Do not promote them back to eager imports.

Why: cuts initial Dashboard chunk by several thousand lines; modal bodies only
load when the user opens them, racing against the dialog open animation.
