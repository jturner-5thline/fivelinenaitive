# Fix the placeholder referral widgets on Sales & BD

## Confirmed problem

`src/components/channels/ReferralSourceMetricWidgets.tsx` renders eight tiles with hardcoded values:
- Four `MetricTile`s passed literal `"0"` / `"$0"` and no data hook.
- Four `LeaderboardTile`s built from `const rows = [1, 2, 3]` with `—` labels and `0` / `$0`.
- Both tile types render a `Drill →` hint but have no click handler or dialog.
- "Deals on Board from Referral Sources" and "Dollars on Board from Referral Sources" duplicate the real, query-backed tiles in `src/components/partners/ReferralSourceDeals.tsx`, which is rendered in the same section through `sideSlot` — two tiles with the same name and different numbers.

Only the Channel Mix donut in that file is real.

## Plan

### 1. Remove the duplicated tiles
Drop the "Deals on Board from Referral Sources" and "Dollars on Board from Referral Sources" `MetricTile`s. `ReferralSourceDeals` already computes and drills into both from `deal_stage_history` + `deals`.

### 2. Wire the two remaining metric tiles to real data
New hook `useReferralSourceMetrics(range)` in `src/components/channels/useReferralSourceMetrics.ts`, using the Sales & BD timeframe from `useSalesBdDateRange`:
- **Meetings w/ Existing Referral Sources** — count `claap_meetings` (fallback: calendar/meeting records) in the range whose attendee contact/company matches a known referral source (`contacts` / `crm_companies` flagged as referral sources, same matching the referral table already uses).
- **New Referral Sources Added** — count referral-source records whose `created_at` falls in the range.
Each tile gets an `onClick` that opens a drill dialog listing the underlying meetings / sources, reusing the dialog pattern already in `ChannelMixDonut`.

### 3. Leaderboards
- **Most Active Referral Sources** — group referral-sourced deals in range by `referred_by` (contact/company), rank top 3 by deal count or summed `value` per the existing `#`/`$` toggle.
- **Most Active Channels** — same aggregation grouped by channel type from `useChannelEntries`.
- **Most Profitable Referral Sources / Channels** — rank by fee revenue. If no fee field is reliably populated on referral deals, these two tiles render an explicit "No fee data yet" empty state instead of fake zeros — never `0` placeholders.
Rows become buttons that open the same drill dialog scoped to that source/channel.

### 4. Empty states
Any tile with no data in range shows a muted "No data in selected timeframe" line and hides the `Drill →` hint, so zeros are always real zeros.

## Technical notes
- Queries follow the existing `useQuery` + Supabase client style in `ReferralSourceDeals.tsx`, keyed on the range so they refetch with the header timeframe selector.
- Global test-deal exclusions (`src/utils/excludedDeals.ts`) apply to all new aggregations.
- No schema changes; read-only queries against existing tables.

## Open question
Which field represents fee revenue for the "Most Profitable" tiles? If there isn't one, those two tiles ship with the empty state above.
