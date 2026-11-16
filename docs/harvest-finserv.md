# Harvest FinServ integration

- Connector credentials stay server-side. Harvest account 1772323 is fixed, never caller-selected.
- `sync-harvest` requires a verified user and 5th Line workspace membership. Owners/admins can explicitly sync; members can read.
- Imports all available time entries from 2024-01-01 through the UTC sync day. One page per call, up to 2,000 entries; retries resume the pending run. Only completed snapshots replace displayed totals. Old snapshots remain stored; no source data is deleted.
- Financial numerators remain existing FinServ QuickBooks revenue and operating profit. Denominator is actual Harvest billable hours. No manual input records are changed.
- Billable Amount is USD hours × entry billable rate; incomplete-rate/non-USD months show missing amounts, not misleading zeros. 5,319 billable entries lacked an explicit entry rate at initial import.
- Utilization means billable / total logged hours, not billable / contractual capacity. Scott, Siddhi and Kris match Harvest first names; existing monthly goals and blended-average behavior are preserved.
- Refresh is manual via Integrations → Harvest → Sync Now. No daily job is installed; no provider writes, communications, task creation or financial record changes occur.

## Verification
- Initial import: 11,746 entries, 2024-01-02–2026-11-14; 8,616.50 billable hours. Saved sync state read back after preview reload.
- Signed-in preview: 1280×1800 and 390×844; October 2026 charts, entry drawer, and persisted sync checked. No page errors. New charts fit phone width; existing header overlap/logo issue remains outside this scope.
- Eight new Vitest tests and two Deno logic tests passed. Broader suite: 690 passed, 18 existing unrelated failures. New-file lint passed; existing affected files retain 41 errors and two warnings.
- Automatic preview build/type check passed. Deno check passed with isolated package resolution after local installed SDK lacked the SDK CORS export. Published UI and direct cross-tenant session checks have not been exercised.