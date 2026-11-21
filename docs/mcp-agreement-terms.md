# naitive agreement terms — final tools and verification

## Result

- New tools: `update_deal_fees`, `get_deal_qualifiers`, `upsert_deal_qualifiers`.
- Updated reads: `get_deal` always includes the qualifier agreement (both `qualifiers` and `deal.qualifiers`); `get_deal_hours_fees` includes `success_fee_minimum`.
- Existing single-qualifier list/add/edit/delete tools remain available.
- Hours & Fees now has a nullable Minimum Fee input. Total fee is `max(value × success_fee_percent / 100, success_fee_minimum or 0)`. Closing fee stays `max(0, total − retainer − milestone)`. A stored percentage of 1.5 means 1.5%, including percentages below 1.
- No direct total-fee or closing-fee input is accepted by the new fee tool. Only supplied fee fields change; null clears.
- Whole-record qualifier replacement, fee patches, audit rows and activity entries commit atomically under the caller's permissions. Stale `expected_updated_at` returns `conflict: true` with the current data and no write. Both write tools default `dry_run` to true; use false only after explicit user approval.
- Qualifier agreement text remains verbatim. Criteria are ordered by position. Supply an existing criterion `id` when changing its wording to retain its checkbox; explicit `is_met` checks/unchecks it. Whole-record replacement removes omitted criteria and clears omitted source/date/note metadata. Identical retries do not create duplicate audit entries.
- The widget shows the explicit signed-company Yes/No rule, all/any criteria rule, numbered requirements, and agreement link. Agreement details expand inline. Edits still need Save confirmation; clicking outside discards unsaved changes.

## Existing storage reused

No existing qualifier records were moved or rewritten.

- `public.deal_qualifiers`: existing `id`, `deal_id`, `text`, `is_met`, `position`, `created_by`, `created_at`, `updated_at`; added nullable `metric`, `operator`, `value`, `unit` for structured agreement extraction.
- `public.deal_qualifier_agreements`: one metadata record per deal, containing `id`, `deal_id`, `company_id`, `executed_qualifies`, `match_rule`, `source_file_id`, `source_file_url`, `agreement_signed_date`, `notes`, `updated_by`, `source`, `created_at`, `updated_at`. Criteria are assembled from the existing qualifier rows, not duplicated in JSON storage.
- Fee audit rows use `deal_audit_log.metadata` for `field`, `old`, `new`, `source`, `change_reason`; one row per changed field, plus a `deal_activity` entry.

## Verification and limits

- 198 focused tests passed, including fee math, null clearing, verbatim text, read/write handlers, no-op returns, save confirmation/discard/failure, minimum-input commits, and the existing MCP regression suite.
- Isolated PostgreSQL 17 tests passed: fee/qualifier previews make no writes; real isolated writes preserve legacy rows and checkboxes; audit counts, null clears, removal, concurrency, idempotence, unauthenticated access and unauthorized reads/writes were checked.
- Signed-in preview checked at 1280×1800 and 390×844: qualifier add/check, signed-company rule, URL/date editing, outside-click discard, confirmation, refresh readback and minimum-fee input. Saves and unrelated background writes were intercepted; refresh persistence was simulated, not a live production write. No runtime errors were observed. Real persistence was verified only in the isolated database.
- Focused lint passed. Automatic preview type/build checks passed.
- Full suite run: 822 passed and 18 pre-existing failures in unrelated areas. Final changes were then covered by the 198-test focused run. Full lint still reports pre-existing project-wide errors; those were not changed.
- No dependencies were added or removed, no saved production records were edited for testing, and no real communications were sent.
- Existing Lovable Cloud and connector authentication were reused; no services were newly enabled.
- The final catalog extracted successfully with 154 tools. This confirms configuration, not hosted deployment. Republish the app, then refresh Claude's connector. The published revision and Claude's live OAuth workflow have not been tested for these changes.

## Final input schemas

These are extracted from the final connector catalog; required fields, nullable inputs, defaults, and closed top-level schemas are shown exactly.

### `update_deal_fees`

```json
{
  "type": "object",
  "properties": {
    "deal_id": {
      "type": "string",
      "format": "uuid"
    },
    "retainer_fee": {
      "anyOf": [
        {
          "type": "number",
          "minimum": 0
        },
        {
          "type": "null"
        }
      ]
    },
    "milestone_fee": {
      "anyOf": [
        {
          "type": "number",
          "minimum": 0
        },
        {
          "type": "null"
        }
      ]
    },
    "success_fee_percent": {
      "anyOf": [
        {
          "type": "number",
          "minimum": 0,
          "maximum": 100
        },
        {
          "type": "null"
        }
      ]
    },
    "success_fee_minimum": {
      "anyOf": [
        {
          "type": "number",
          "minimum": 0
        },
        {
          "type": "null"
        }
      ]
    },
    "exclusivity": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 2000
        },
        {
          "type": "null"
        }
      ]
    },
    "contract_start_date": {
      "anyOf": [
        {
          "type": "string",
          "format": "date"
        },
        {
          "type": "null"
        }
      ]
    },
    "contract_end_date": {
      "anyOf": [
        {
          "$ref": "#/properties/contract_start_date/anyOf/0"
        },
        {
          "type": "null"
        }
      ]
    },
    "source": {
      "type": "string",
      "maxLength": 1000,
      "default": "mcp"
    },
    "change_reason": {
      "type": "string",
      "maxLength": 2000
    },
    "expected_updated_at": {
      "type": "string",
      "format": "date-time"
    },
    "dry_run": {
      "type": "boolean",
      "default": true
    }
  },
  "required": [
    "deal_id"
  ],
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

### `get_deal_qualifiers`

```json
{
  "type": "object",
  "properties": {
    "deal_id": {
      "type": "string",
      "format": "uuid"
    }
  },
  "required": [
    "deal_id"
  ],
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

### `upsert_deal_qualifiers`

```json
{
  "type": "object",
  "properties": {
    "deal_id": {
      "type": "string",
      "format": "uuid"
    },
    "executed_qualifies": {
      "type": "boolean"
    },
    "match_rule": {
      "type": "string",
      "enum": [
        "all",
        "any"
      ]
    },
    "criteria": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "position": {
            "type": "integer",
            "minimum": 0
          },
          "text": {
            "type": "string",
            "minLength": 1,
            "maxLength": 20000
          },
          "is_met": {
            "type": "boolean"
          },
          "metric": {
            "anyOf": [
              {
                "type": "string",
                "enum": [
                  "total_commitment",
                  "interest_only_months",
                  "term_months",
                  "interest_rate",
                  "all_in_rate",
                  "advance_rate",
                  "min_balance",
                  "personal_guarantee",
                  "board_seat",
                  "lender_equity",
                  "other"
                ]
              },
              {
                "type": "null"
              }
            ],
            "default": null
          },
          "operator": {
            "anyOf": [
              {
                "type": "string",
                "enum": [
                  ">=",
                  "<=",
                  "=",
                  "none"
                ]
              },
              {
                "type": "null"
              }
            ],
            "default": null
          },
          "value": {
            "anyOf": [
              {
                "type": "number"
              },
              {
                "type": "null"
              }
            ],
            "default": null
          },
          "unit": {
            "anyOf": [
              {
                "type": "string",
                "maxLength": 50
              },
              {
                "type": "null"
              }
            ],
            "default": null
          }
        },
        "required": [
          "position",
          "text"
        ],
        "additionalProperties": false
      },
      "maxItems": 200
    },
    "source_file_id": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 1000
        },
        {
          "type": "null"
        }
      ],
      "default": null
    },
    "source_file_url": {
      "anyOf": [
        {
          "type": "string",
          "format": "uri"
        },
        {
          "type": "null"
        }
      ],
      "default": null
    },
    "agreement_signed_date": {
      "anyOf": [
        {
          "type": "string",
          "format": "date"
        },
        {
          "type": "null"
        }
      ],
      "default": null
    },
    "notes": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 20000
        },
        {
          "type": "null"
        }
      ],
      "default": null
    },
    "source": {
      "type": "string",
      "maxLength": 1000,
      "default": "mcp"
    },
    "change_reason": {
      "type": "string",
      "maxLength": 2000
    },
    "expected_updated_at": {
      "type": "string",
      "format": "date-time"
    },
    "dry_run": {
      "type": "boolean",
      "default": true
    }
  },
  "required": [
    "deal_id",
    "executed_qualifies",
    "match_rule",
    "criteria"
  ],
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

### `get_deal`

```json
{
  "type": "object",
  "properties": {
    "deal_id": {
      "type": "string",
      "format": "uuid"
    },
    "include_tasks": {
      "type": "boolean",
      "default": true
    },
    "include_lenders": {
      "type": "boolean",
      "default": true
    },
    "include_related": {
      "type": "boolean",
      "default": false
    },
    "include_task_detail": {
      "type": "boolean",
      "default": false
    }
  },
  "required": [
    "deal_id"
  ],
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

### `get_deal_hours_fees`

```json
{
  "type": "object",
  "properties": {
    "deal_id": {
      "type": "string",
      "format": "uuid"
    },
    "pipeline_id": {
      "type": "string",
      "format": "uuid"
    },
    "stage": {
      "type": "string",
      "maxLength": 100,
      "description": "Raw stage id."
    },
    "query": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200,
      "description": "Substring match on deal/company name."
    },
    "only_missing_fees": {
      "type": "boolean",
      "default": false
    },
    "include_weekly_hours": {
      "type": "boolean",
      "default": false
    },
    "limit": {
      "type": "integer",
      "minimum": 1,
      "maximum": 2000,
      "default": 500,
      "description": "Max deals listed (rollups always cover all matches)."
    }
  },
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```
