## Goal
Make the Daily Rundown modal user-scoped so opening it for `jmoffitt@5thline.co` pulls John's calendar, Gmail, HubSpot, QBO, Asana, and naitive deals using **his** OAuth tokens — not the viewer's — across every tab (Agenda, Catch Up, Email, Financial, Deals, Operational, End of Day).

This is a large architectural change. Before I touch code, I need to confirm scope and a few decisions.

## Questions before I build

1. **Who can invoke this?** Spec says "admin role or explicit delegation". Today, is there already a `delegations` table, or should I gate purely on `app_role = 'admin'` for v1 and add delegation later?

2. **OAuth token storage.** For John's Gmail / Google Calendar — are his tokens already stored per-user in the DB (e.g. `nylas_grants`, `google_integrations`), or is the current Gmail/Calendar fetch always using the *signed-in viewer's* tokens via the connector gateway? This determines whether I need a new "act-as-user" edge function pattern or can reuse existing per-user token tables.

3. **Scope of v1.** Building all 7 tabs as "act-as-John" simultaneously is ~2–3 days of work and touches every rundown subcomponent. Do you want:
   - **(a) Full build** — refactor every tab + edge function to accept a `target_user_id` param, add permission gate, banner, confirmation modal on actions.
   - **(b) Phased** — ship the user-scoping plumbing + Agenda + Email + End of Day first (the spec's main acceptance criteria), then Financial/Deals/Operational/Catch Up in a follow-up.
   - **(c) Read-only first** — populate all tabs as John (view), but defer "act as John" write actions (Draft Reply/Create Task as him) to phase 2.

4. **How is "Daily Rundown" opened today?** Is there an existing route/modal trigger where I can add a `?user=jmoffitt@5thline.co` param, or do you want a new entry point (e.g. an admin page that lists users and lets you open any user's rundown)?

## Proposed architecture (once questions are answered)

### Plumbing
- Add `targetUserId` prop threaded through `DailyRundownModal` → every tab component.
- New hook `useRundownTarget()` returns `{ targetUser, isViewingSelf, canViewTarget }`.
- Permission check via `has_role(auth.uid(), 'admin')` OR `auth.uid() = targetUserId`.
- Banner component when `!isViewingSelf` with "actions perform on John's behalf" + per-action confirmation.

### Edge functions (refactor to accept `target_user_id`)
- `gmail-sync` / `gmail-threads` → load tokens from `nylas_grants` (or equiv) for `target_user_id` instead of `auth.uid()`.
- `google-calendar-events` → same.
- `asana-tasks` → look up John's Asana PAT from per-user secrets table.
- `hubspot-activity` → scope by `hubspot_owner_id` mapped from `target_user_id`.
- `qbo-snapshot` → scope by entities in John's `qbo_user_access`.
- All functions: verify `getClaims()`, then check `has_role(claims.sub, 'admin') OR claims.sub = target_user_id`, else 403.

### Per-tab changes
- **Agenda** — reuse existing `CalendarAgendaTab`, pass `targetUserId`; enrich attendees via HubSpot/naitive contact join; reuse existing availability ranker for conflict color-coding.
- **Email** — reuse `EmailDigestTab`; add "Awaiting John's reply >24h" and "Sent by John, awaiting response >3d" priority sections via Gmail search queries.
- **Catch Up** — aggregate from news provider + HubSpot activity + Asana updates scoped to John.
- **Financial** — QBO snapshot scoped to John's accessible entities.
- **Deals** — query `deals` where `deal_owner_id = john OR deal_manager_id = john OR john ∈ team_members`.
- **Operational** — Asana tasks where John is assignee/follower + Tech Roadmap items.
- **End of Day** — existing two-pane layout, swap data source to John's outstanding items; resolutions stored per-user in `rundown_clears`.

### Empty states
Each tab checks `integrationsStatus[tab]`; if not connected for John, render `<ConnectIntegrationEmpty integration="gmail" userName="John" />` instead of failing.

### Caching
React Query keys include `targetUserId`, 5-minute staleTime, 10-minute background refetchInterval while modal open. Header shows `Last refreshed Xm ago` + manual Refresh button.

### Files I expect to touch
- `src/components/dashboard/DailyRundownModal.tsx` (add target prop + banner + permission gate)
- `src/components/dashboard/CalendarAgendaTab.tsx`
- `src/components/dashboard/EmailDigestTab.tsx` (or equivalent)
- `src/components/dashboard/CatchUpTab.tsx`
- `src/components/dashboard/FinancialTab.tsx`
- `src/components/dashboard/DealsTab.tsx`
- `src/components/dashboard/OperationalTab.tsx`
- `src/components/dashboard/EndOfDayTab.tsx` (just retarget data source)
- New: `src/hooks/useRundownTarget.ts`, `src/components/dashboard/ActingAsBanner.tsx`, `src/components/dashboard/ConnectIntegrationEmpty.tsx`
- Edge functions: `gmail-*`, `google-calendar-*`, `asana-*`, `hubspot-*`, `qbo-*` — add `target_user_id` param + admin/self gate

## What I need from you
Please answer Q1–Q4 above so I scope the first PR correctly. My recommendation is **(b) phased + (c) read-only first** — ship Agenda/Email/End-of-Day as John in view-mode with the permission gate and banner, then layer in act-as-John write actions and the remaining tabs.