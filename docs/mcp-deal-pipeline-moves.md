# update_deal pipeline moves

- Optional `pipeline_id` requires `stage`, which resolves by exact ID or unique, case-insensitive display label in the target pipeline only.
- The caller-scoped invoker RPC locks the deal and target pipeline, checks pipeline visibility and matching workspace, then updates pipeline/stage and other supplied high-level fields with history/activity in one transaction. Existing RLS and Distressed Debt isolation remain enforced.
- Pipeline transitions with the same stage ID still record history, with source/target labels and a before/after pipeline activity entry. Existing history behavior outside the RPC remains unchanged.
- Omitting `pipeline_id` retains the original update path. Status Notes still use the existing separate note writer, after a successful pipeline transaction; a note failure explicitly reports that the move succeeded.
- Responses include the full updated deal plus `pipeline_id`, `pipeline_name`, `stage`, `stage_label` in text and structured content.

## Verification

- Eight new handler/schema regression tests; all 87 MCP tests passed.
- Isolated PostgreSQL tests cover overloaded stage IDs, target labels, invalid/missing stages, tenant/deal/auth denial, before/after activity, same-ID history, audit-failure rollback, and Distressed Debt isolation.
- Targeted ESLint and automatic preview build passed. No UI changed, and no production deal updates or communications were performed.
- The extracted catalog contains 96 tools. No new services or dependencies were enabled; existing Cloud and OAuth configuration reused. Hosted OAuth execution requires republishing and refreshing Claude's connector and was not verified.