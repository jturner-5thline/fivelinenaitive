# MCP deal relationships

## Changes
- Added `link_deal_contact`, `unlink_deal_contact`, `add_deal_alias`, and `remove_deal_alias`, with every argument advertised in the strict tool schemas.
- Contact lookups are case-insensitive by email within the deal workspace; missing or ambiguous matches fail without creating contacts. Explicit roles update the link; omitted roles remain untouched. Unlink deletes only the association.
- Alias matching lowercases, trims and collapses whitespace, using the existing per-deal unique constraint. Repeated add/remove operations return `changed: false` without extra activity.
- Invoker RPCs lock the deal, preserve RLS, enforce matching workspaces, and commit mutations and MCP-attributed deal activity together. Anonymous execution is revoked. Existing tables and policies remain unchanged.
- `update_deal.crm_company_id` validates the accessible workspace company. When combined with pipeline/stage fields, company and pipeline changes share one transaction; target labels resolve against the target pipeline. Equal updates avoid writes/activity. Omitted new fields retain the existing update path. Status Notes retain the separate existing writer and explicit partial-failure reporting.
- `get_deal` always includes contact roles, linked CRM company identity, and alias strings in text and structured results; existing expanded related alias rows remain available separately.

## Verification
- Added 22 handler/schema/read tests; all 116 MCP tests passed.
- Isolated PostgreSQL assertions passed for contact linking, role preservation/update, retries, alias normalization, unlink preserving contacts, cross-tenant denial, missing contacts, target-pipeline labels, unchanged retry timestamps/activity, unauthenticated denial and audit rollback. The harness runs against an empty local database, never hosted records.
- Focused new/updated tool and test lint passed. `get-deal.ts` retains three pre-existing explicit-any lint errors in unrelated expanded child queries.
- Automatic preview type/build checks passed. Generated catalog contains 100 tools and all requested input fields. Hosted database confirms both RPCs are invoker functions, executable by authenticated callers but not anonymous callers.
- No live records changed, communications sent, dependencies removed or services newly enabled. Existing Lovable Cloud and MCP OAuth configuration were reused; hosted OAuth tool execution and published behavior remain unverified.
- This managed MCP function deploys only through app publication, not individual development function deployment. Republish the app and refresh Claude's connector to expose the new revision.