# Master Plan Claude tools

## Catalog

- `get_master_plan`: all five current tabs, sections, exact first-column row titles, formats, linked dashboard keys and cells. `year` accepts 2027 or 2028; omitted means both. `period_type` accepts monthly, quarterly or both (default).
- `tab`: financials, entity-metrics (`kpis` alias), headcount, sales-dashboard-v2, sales-bd-roi. Omitted or `all` returns every current tab; it does not add an All tab to the popup.
- `upsert_master_plan_targets`: up to 500 requested cells `{metric_key, period, value}`; linked KPI keys fan out to each linked dashboard, with a 2,000-cell expanded limit. Financials percentages use percentage points, not decimal fractions. Monthly and quarterly targets are independent.
- `upsert_headcount`: up to 96 monthly cells `{realm_id, month, value}`. Values from 0 through 9999.99, at most two decimal places. `null` clears any supported cell.

Both writers default to `dry_run:true`. A real save requires explicit user approval followed by `dry_run:false, confirm:true`. Optional `change_reason` is stored in the permanent per-cell audit.

## Boundaries

- Existing 5th Line workspace and three-editor allowlist are enforced before writes and inside the invoker RPC. Reads require the caller's membership.
- First-column titles are shared registry metadata, not editable database cells. Tools can read titles but cannot rename them.
- Quarterly Headcount, annual averages and firm total are derived from monthly entries and read-only, matching the popup. Firm total removes the existing one-person duplicate.
- Browser-only drafts are not available to a remote MCP. Save them first.
- Linked stored values and conflicts are exposed alongside the shared displayed value; writes reject conflicting values for the same linked metric.
- Atomic batches save existing target/headcount rows and `master_plan_mcp_audit` together. No new triggers, background jobs, messages or data backfills.
- No services were enabled: existing Cloud, authentication and MCP OAuth configuration were reused unchanged. No dependencies were added or removed.

## Verification

- All 223 tests across 27 MCP/planning files passed, including 16 new tests covering catalog, linked expansion, monthly/quarterly separation, pagination, headcount math, limits, auth, editor restrictions, confirmations, null clears and errors.
- Isolated PostgreSQL fixture and assertions exercise actual save/read-back, null clear, no-op retry, audit attribution, failed-batch rollback, dry run, other-user audit isolation and unauthorized write denial. These are not production tests.
- Authenticated local handlers read all tabs and 32 period columns, and returned zero writes from a real backend dry run. This does not validate hosted MCP OAuth transport.
- Signed-in preview checked all five tabs, monthly/quarterly switching and screenshots at 1280×1800 and 390×844 without writes. Existing mobile year controls remain clipped; no layout changes were requested here.
- New-file lint and automatic preview type/build checks passed. Published Claude tool transport requires republishing and connector refresh; no real production cell save was performed.