# Bulk deal funding-source timestamp overrides

`bulk_upsert_deal_lenders` accepts optional per-row `timestamps`: `submitted_at`, `approved_at`, `passed_at`, `declined_at`, `excluded_at`, `on_hold_at`, `on_deck_at`, `last_status_change_at`.

- ISO dates/timestamps or null to clear; omitted columns are preserved.
- Explicit fields override inferred `status_date` values.
- In upsert mode, a nonempty timestamps object writes/counts `updated` even when stage is unchanged; dry runs count `would_update` without writes. `insert_only` still skips existing links. Empty objects do not force a write.
- Existing user-scoped permissions and historical timestamp trigger opt-in are unchanged. Activity includes the supplied timestamp before/after values.

## Verification

- Reproduced the original same-stage skip using isolated PostgreSQL, then passed the same regression with the updated function.
- Isolated tests covered all eight timestamp updates/null clears, omitted-date preservation, same-stage previews and writes, insertion, timestamp priority, insert-only behavior, invalid values/keys and denied callers.
- All 184 MCP tests passed, including schema preservation and actual handler forwarding/updated counts. Focused lint and automatic type/build passed.
- Authenticated hosted same-stage dry-run returned would_update; a follow-up read confirmed original dates unchanged. No live test writes, communications or dependency changes.
- No UI changes; no browser layout testing needed. Published Claude OAuth calls remain unverified until republish and connector refresh.
- Existing Cloud/auth services reused; no new services enabled. Final 154-tool manifest extracted; this is configuration, not hosted MCP deployment.
