# Open Items MCP

Tools: `list_outstanding_items`, `create_outstanding_item`, `update_outstanding_item`, `batch_create_outstanding_items`.

- Status inputs: `requested` (default), `received`, `submitted`. Stored as the UI's JSON state; status edits preserve existing requester and delivery lists. Submitted sets both received and approved.
- Priorities: `normal` (default), `high`, `urgent`.
- `open_only` excludes items both received and approved. The existing UI Open Items tab selects item type and includes completed items; it is unchanged.
- `lender_id` is **deal_lenders.id**, not master_lenders.id. Creation validates the link and includes its current name in requestedBy. Changing lender_id preserves historical requester lists rather than silently rewriting them.
- `assigned_to` is opaque text. No existing assignee control or populated records establishes an ID/name/email convention.
- Position appends after the highest non-archived position; MCP operations serialize per deal. Concurrent legacy UI writes do not use this lock.
- Creation returns `{item, created}`; repeat deal/idempotency keys return the original full row, including archived rows, with created false. Metadata-only keys are recognized; conflicting keys rejected. Update cannot change an existing idempotency key.
- Metadata updates shallow-merge; unknown keys do not affect widget rendering. Known checklist keys such as source_phase retain existing application meaning.
- `append_note` adds a UTC-dated line; it cannot be combined with `notes`. Optional update fields accept null where appropriate. No delete tool exists.
- Full rows are listed by position/created_at/id, with total_count, has_more and next_offset. Limits: 100 default, 500 maximum; batches max 25 with independent outcomes.
- Writes use invoker RPCs, caller RLS and existing permissions, and atomically record MCP-attributed requested_item_added/updated in activity_logs. No messaging function is invoked. Existing inactive-deal UI restrictions are not new database policies.
- The table, its RLS, grants and existing triggers were not changed. Authenticated-only function execution was verified. Existing Cloud and OAuth reused; no new services enabled.
- SDK upgraded to 3.0.0 for strict undeclared-input rejection and additionalProperties false. Shared structured result mapping now validates JSON shape without unsafe casts. No dependencies removed.

## Verification

- 23 new tests (21 Open Items, 2 JSON result tests); all 76 MCP tests passed. Focused lint and automatic preview type/build checks passed.
- Disposable PostgreSQL fixture: `src/lib/mcp/__tests__/sql/outstanding-items.sql`, with function SQL from `docs/sql/outstanding-items-mcp.sql`. Run only against an explicitly disposable database. Verified defaults, linked/no-lender creation, retry/archived dedupe, status/open filters, note history, metadata preservation, paging, cross-tenant denial and rollback when activity insertion fails. Repeated after correcting the lender name column to the live schema's `name`.
- Signed-in preview at 1280x1800: Odie creation with/without Advantage Capital, retries, Submitted, dated note, open-only read, UI All/Open Items views, archive and persisted readback. All four verification items (including the first interrupted browser attempt) were archived, never deleted. Existing items unchanged; test activity history remains. No emails sent.
- Generated manifest: 95 tools; all four new schemas advertise additionalProperties false. This is not hosted OAuth verification.
- Full suite: 571 passed, 18 pre-existing failures. Full lint retains 8,747 errors and 720 warnings outside the focused check. No layout changes; mobile not checked. Direct caller-scoped database/UI acceptance was run, not a hosted MCP OAuth call.
- Republish and refresh Claude's connection to use the new hosted catalog.