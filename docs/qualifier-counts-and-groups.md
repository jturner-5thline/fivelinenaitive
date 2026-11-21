# Qualifier required counts and groups

## Final storage schema (additive)

`public.deal_qualifier_agreements` retains its existing fields and gains:

| Field | PostgreSQL type | Default | Meaning |
|---|---|---|---|
| min_required | integer, nullable | null | Required met count among ungrouped criteria; null uses match_rule (all = every, any = 1) |
| groups | jsonb, nullable | null | Array of {key, label, match_rule, min_required, fee, notes} |
| groups_logic | text, not null | all_groups | all_groups or each_group_separately |

`public.deal_qualifiers` retains its existing fields and gains `group text NULL` (a group key). Criteria without a group use the record-level rule. Group keys must be unique and referenced keys must exist. Counts must be integers from 1 through the relevant criteria count. Group fees are nullable nonnegative numbers. Deferred read-only validation checks final consistency after atomic replacements and existing single-criterion edits/deletes, preserving caller RLS.

All-groups mode requires every group, plus the ungrouped test when present. Separate mode evaluates each group independently with its own fee, subject to the ungrouped rule when present. The signed-company field remains the existing contractual setting; it does not automatically check criteria or initiate fee collection.

## Tool inputs and outputs

Exact extracted JSON input schemas for `get_deal_qualifiers`, `list_deal_qualifiers`, and `upsert_deal_qualifiers` are in `qualifier-tool-input-schemas.json`.

- get/list inputs: required deal_id UUID. Get returns the full agreement or null; list retains its qualifiers/total/met fields and additionally returns agreement, including min_required/groups/groups_logic. Each criterion includes group.
- Upsert: required deal_id, executed_qualifies, match_rule, criteria. New optional fields: min_required (integer >= 1 or null, default null), groups (array or null, default null), groups_logic (all_groups or each_group_separately, default all_groups), and criterion group (string or null, default null).
- Group: key and label strings, required match_rule (all/any), optional nullable min_required, fee, notes (defaults null).
- Existing source metadata, source, change_reason, expected_updated_at, dry_run remain. dry_run defaults true; whole-record replacement clears omitted optional agreement fields. Existing criterion IDs preserve is_met unless explicitly supplied. Identical retries do not write duplicate audit/activity. First-time saves now audit before as {}.

## Verification

- 206 tests passed across 23 files, including concrete Lango 3/4, Censys AND-group and iunu $10,000/$5,000 cases, invalid counts/groups, account access and staged confirmation.
- Isolated PostgreSQL tests passed with real writes/readback inside rollback: first save with before NOT NULL, dry run, count persistence, grouped persistence, no-op retry audit count, invalid counts/group membership, legacy delete consistency and unauthorized access.
- Signed-in preview at 1280x1800 and 390x844 verified count editing, group label/fee/minimum, criterion assignment, separate-group logic, confirmation and simulated reload. Writes were intercepted; no production records changed. Screenshots inspected; no qualifier horizontal overflow or runtime errors observed.
- Focused ESLint passed; automatic preview type/build passed. No dependencies added or removed. Full application lint/test suite and published application were not rerun for this scoped change.
- Existing Lovable Cloud and connector authentication reused; no services newly enabled. Manifest extraction succeeded with 154 tools; this is not hosted deployment.

## Remaining release step

Republish the app and refresh Claude's connector. Only after deployment, apply the approved Lango deal `9593c5c5-3d38-4126-a0c1-c6fff9cb893c` minimum of 3, retaining match_rule any and every existing criterion/metadata field. This production data change has NOT been applied before deployment. Censys and iunu remain unchanged for James's subsequent grouped upserts. No automatic publication or delayed job was scheduled.
