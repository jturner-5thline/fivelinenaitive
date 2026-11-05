# Funding-source MCP editing

## Status and verification

The catalog contains 89 tools (39 added); existing tools remain registered. Four additive migrations added transactional write RPCs and audit provenance. No authentication or integration services were enabled: the existing Lovable Cloud backend and OAuth configuration are reused. FLEx remains disconnected.

Verified: 39 MCP tests, saved disposable PostgreSQL assertions (text modes/length, conflicts, notes/history, primary contacts, attachments, archive, cross-company rejection, author permissions, merge rollback, audit-failure rollback), focused lint and automatic preview type/build checks passed. The broader suite has 534 passing tests and 18 existing failures outside this change; full-project lint reports 8,735 errors and 720 warnings in existing/shared code, while focused checks pass. Signed-in preview at 1280×1800 verified a real lender dry-run returned one diff while stored notes, updated_at and audit count remained unchanged; schema discovery returned all 17 requested/history tables and 253 columns. No live writes, merges, deletes or communications were used for testing. Mobile/layout testing is not applicable: no visible layout changed. Production OAuth-client execution is not verified; republish the app and refresh Claude's connection before using the new catalog.

## Important limitations

- Tools preserve **existing permissions**, not universal write access. Author-only notes and administrator-only sync records remain restricted. Several requested tables have no existing DELETE, UPDATE or INSERT policy, so those operations return permission errors rather than widening access. In particular fit/disqualification/pass-detection/pass-pattern deletes, sync-request create/delete, sync-decision update/delete and dismissal updates can be unavailable under current RLS. A tool in the catalog is not a grant.
- `lender_notes_history` stores **deal-specific** notes and requires a deal_lender_id. Directory note edits/deletes are instead preserved in the new tenant-scoped, append-only `lender_master_note_history`; existing deal-note history remains unchanged.
- `delete_lender` is a **soft archive** (`active=false`). Related rows and storage are preserved. Deal-linked archive requires force:true and existing deletion permission.
- Merge is all-or-nothing and refuses duplicate deal links, two primary contacts, unique conflicts, inaccessible rows, computed-analytics references, or remaining operational/array references. It does not silently drop conflicts or rewrite tasks, analytics, queues or agents. Attachment paths remain unchanged. Non-empty kept values (including false and zero) win; source values are retained in the deletion audit. Lenders with unsupported references must resolve them before merge.
- criteria_confidence currently has one established value: `imported` (imported criteria, not independently verified); null clears it. No invented confidence categories were added.
- No broad permission changes were made; attachment metadata UPDATE follows existing uploader + company checks. Master identity/tenancy/created timestamps are immutable; updated_at is server maintained.
- Multi-company creation preserves a server-derived company; callers cannot supply arbitrary ownership.

## Input examples

```json
{"lender_id":"<master_lenders UUID>","funding_source_notes":"New evidence","mode":"append","dry_run":true,"source":"lender website","change_reason":"Criteria refresh"}
```

`update_lender` accepts one edit or `updates` (1–25 items). Each item uses lender_id or name_lookup; `name` renames. mode defaults to replace; append/prepend insert a blank line and validate the final length. expected_updated_at rejects stale edits and returns the current row. Bulk failures are independent. Diff fields include old and new values; provenance is stored on each changed audit row.

`upsert_lender_contact`: legacy `contact_id` identifies the lender_contacts row. **crm_contact_id** writes its CRM `contact_id` link, or null unlinks, without breaking old clients. The CRM record must belong to the same company. Only specified fields change; primary demotions and audits share a transaction.

### Attachments

```json
{"lender_id":"<master_lenders UUID>","file_name":"One Pager.pdf","category":"marketing_materials","content_type":"application/pdf","content_base64":"<base64 bytes>"}
```

Supply exactly one of content_base64 (optional data-URL prefix accepted) or a public HTTPS url. Maximum 20 MB; supported document/image extensions only. MIME is verified from extension (arbitrary MIME overrides are not accepted). Redirecting download URLs are rejected; use the direct file URL. update_lender_attachment takes attachment_id plus file_name and/or category; stored bytes/path/uploader cannot be changed. Deletion requires confirm:true and uploader permissions. Storage cleanup failures are explicitly reported after a successful audited metadata deletion.

### Related tables

Each requested table has create/update/delete tools (singular names, e.g. update_lender_pass_detection). lender_id identifies the parent; record_id identifies updates/deletes. Identity, tenancy, actor and review timestamps are server-derived, never caller-writable. source/change_reason are accepted. Confirmed/dismissed detection status stamps the verified caller. describe_schema returns actual columns and editable contracts. Computed analytics remain read-only.

## Re-running isolated SQL tests

Use a disposable local PostgreSQL instance, not the project PG environment. Apply `src/lib/mcp/__tests__/sql/lender-test-schema.sql`, migrations 0059–0062, then `lender-editing.sql` and `lender-permissions.sql` with ON_ERROR_STOP=1. The schema is a minimal test fixture, not a production schema export. These tests deliberately revoke privileges and create local fake records; never run them against the shared backend.
