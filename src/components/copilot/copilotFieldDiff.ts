// Shared field-diff + status logic for the Naitive AI confirmation card.
//
// Every confirm/update card renders a structured table of the fields
// it's about to change (or just changed). The card never collapses
// multiple fields into a one-line summary — each row carries its
// own status badge after the user clicks Confirm.
//
// Status semantics:
//   - verified         (✅) — field was written through verifiedDealUpdate
//                            on the edge function side and the read-back
//                            matched. This is the only "really persisted"
//                            state.
//   - activity-only    (⚠️) — the action didn't go through verifiedDealUpdate
//                            (e.g. note logging, lender status, pipeline
//                            move). The DB write may have succeeded but
//                            we can't *prove* it from the response — only
//                            the audit/activity_log row is guaranteed.
//   - mismatch         (❌) — verifiedDealUpdate threw WriteNotPersistedError
//                            for this field; the database still has the
//                            old value.
//   - pending          (—)  — pre-Confirm state.

export type FieldStatus = "verified" | "activity-only" | "mismatch" | "pending";

export interface FieldDiff {
  /** Database column name (or synthetic key for non-column rows). */
  field: string;
  /** Friendly label shown in the table's first column. */
  label: string;
  /** Old value (omit for create-only / note-style rows). */
  oldValue?: unknown;
  /** New value the AI is about to write. */
  newValue: unknown;
}

// Action types whose handler funnels through verifiedDealUpdate in
// the copilot-chat edge function. A success response means every
// listed field was verified on the database.
const VERIFIED_THROUGH_HELPER = new Set<string>([
  "update_deal_stage",
  "update_deal_status",
  "update_deal_fields",
]);

// Action types we still consider valid writes but whose response does
// not include per-field DB confirmation. We badge them ⚠️ so the user
// knows the activity_log row exists but the underlying field-level
// persistence wasn't proven.
const ACTIVITY_LOGGED_ONLY = new Set<string>([
  "add_deal_note",
  "log_note",
  "move_deal_pipeline",
  "update_milestone",
  "update_lender_status",
  "delete_outstanding_item",
  "add_lender_to_deal",
  "add_lenders_to_deal",
]);

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === "";
}

/**
 * Derive the list of fields the card will display, from the action
 * type and the params payload the edge function attached.
 */
export function deriveFieldDiffs(
  actionType: string,
  params: Record<string, unknown> = {},
): FieldDiff[] {
  const get = (k: string) => params[k];
  switch (actionType) {
    case "update_deal_stage":
      return [
        {
          field: "stage",
          label: "Stage",
          oldValue: get("current_stage"),
          newValue: get("new_stage"),
        },
      ];
    case "update_deal_status":
      return [
        {
          field: "status",
          label: "Status",
          oldValue: get("current_status"),
          newValue: get("new_status"),
        },
      ];
    case "update_deal_fields": {
      const rows: FieldDiff[] = [];
      if (get("value") !== undefined) {
        rows.push({
          field: "value",
          label: "Deal size",
          oldValue: get("current_value"),
          newValue: get("value"),
        });
      }
      if (get("closing_date") !== undefined) {
        rows.push({
          field: "closing_date",
          label: "Closing date",
          oldValue: get("current_closing_date"),
          newValue: get("closing_date"),
        });
      }
      if (get("is_flagged") !== undefined) {
        rows.push({
          field: "is_flagged",
          label: "Flagged",
          oldValue: get("current_is_flagged"),
          newValue: get("is_flagged"),
        });
      }
      if (get("flag_notes") !== undefined && get("is_flagged") !== undefined) {
        rows.push({
          field: "flag_notes",
          label: "Flag notes",
          oldValue: get("current_flag_notes"),
          newValue: get("flag_notes"),
        });
      }
      if (get("stage") !== undefined) {
        rows.push({
          field: "stage",
          label: "Stage",
          oldValue: get("current_stage"),
          newValue: get("stage"),
        });
      }
      if (get("manager") !== undefined) {
        rows.push({
          field: "manager",
          label: "Deal manager",
          oldValue: get("current_manager"),
          newValue: get("manager"),
        });
      }
      if (get("deal_owner") !== undefined) {
        rows.push({
          field: "deal_owner",
          label: "Deal owner",
          oldValue: get("current_deal_owner"),
          newValue: get("deal_owner"),
        });
      }
      if (get("narrative") !== undefined) {
        rows.push({
          field: "narrative",
          label: "Narrative",
          oldValue: get("current_narrative"),
          newValue: get("narrative"),
        });
      }
      if (get("deal_type") !== undefined) {
        rows.push({
          field: "deal_type",
          label: "Deal type",
          oldValue: get("current_deal_type"),
          newValue: get("deal_type"),
        });
      }
      if (get("engagement_type") !== undefined) {
        rows.push({
          field: "engagement_type",
          label: "Engagement",
          oldValue: get("current_engagement_type"),
          newValue: get("engagement_type"),
        });
      }
      return rows;
    }
    case "move_deal_pipeline":
      return [
        {
          field: "pipeline_id",
          label: "Pipeline",
          newValue: get("new_pipeline_name") ?? get("new_pipeline_id"),
        },
        {
          field: "stage",
          label: "Stage",
          newValue: get("new_stage"),
        },
      ];
    case "add_deal_note":
    case "log_note":
      return [
        {
          field: "__note__",
          label: "Note",
          newValue: get("note"),
        },
      ];
    case "update_milestone":
      return [
        {
          field: "milestone",
          label: get("milestone_name") ? `Milestone — ${get("milestone_name")}` : "Milestone",
          oldValue: get("current_completed"),
          newValue: get("completed"),
        },
      ];
    case "update_lender_status": {
      const rows: FieldDiff[] = [];
      const lender = get("lender_name") ? ` — ${get("lender_name")}` : "";
      if (get("new_stage") !== undefined) {
        rows.push({
          field: "lender_stage",
          label: `Lender stage${lender}`,
          oldValue: get("current_stage"),
          newValue: get("new_stage"),
        });
      }
      if (get("new_tracking_status") !== undefined) {
        rows.push({
          field: "tracking_status",
          label: `Tracking${lender}`,
          oldValue: get("current_tracking_status"),
          newValue: get("new_tracking_status"),
        });
      }
      return rows;
    }
    case "delete_outstanding_item":
      return [
        {
          field: "__deleted__",
          label: "Outstanding item (deleted)",
          oldValue: get("item_description") ?? get("description"),
          newValue: "—",
        },
      ];
    case "add_lender_to_deal":
      return [
        {
          field: "lender",
          label: "Lender",
          newValue: get("lender_name"),
        },
      ];
    case "add_lenders_to_deal": {
      // Render one row per entity so the post-Confirm status table
      // can badge each lender independently (verified / skipped / failed).
      const names = Array.isArray(get("lender_names"))
        ? (get("lender_names") as unknown[])
        : [];
      return names.map((n, i) => ({
        field: `lender_${i}`,
        label: i === 0 ? "Lenders" : "",
        newValue: n,
      }));
    }
    default:
      // Unknown action: best-effort — show every param that isn't
      // a structural field (deal_id / deal_name) so the user still
      // sees what's being sent.
      return Object.entries(params)
        .filter(
          ([k]) =>
            !["deal_id", "dealId", "deal_name", "current_stage", "current_status", "current_value", "current_closing_date", "current_is_flagged", "current_flag_notes"].includes(k),
        )
        .map(([k, v]) => ({ field: k, label: k, newValue: v }));
  }
}

export interface VerifiedResult {
  success: boolean;
  error_code?: string;
  mismatches?: Array<{ field: string; expected?: unknown; actual?: unknown }>;
  audit?: { after?: Record<string, unknown> | null } | null;
}

/**
 * Map each field to its post-Confirm status based on the edge function
 * response. See file-header comments for badge semantics.
 */
export function computeFieldStatuses(
  actionType: string,
  diffs: FieldDiff[],
  result: VerifiedResult | null,
): Record<string, FieldStatus> {
  const out: Record<string, FieldStatus> = {};

  if (!result) {
    for (const d of diffs) out[d.field] = "pending";
    return out;
  }

  // WriteNotPersistedError — per-field truth from mismatches array.
  // Fields NOT in mismatches landed in the DB (the SQL UPDATE ran
  // before the verifier compared); only listed fields reverted/no-oped.
  if (result.error_code === "WRITE_NOT_PERSISTED") {
    const missed = new Set(
      (result.mismatches ?? []).map((m) => m.field),
    );
    for (const d of diffs) {
      if (missed.has("__row__")) {
        // RLS denied or row missing — nothing persisted.
        out[d.field] = "mismatch";
      } else if (missed.has(d.field)) {
        out[d.field] = "mismatch";
      } else if (VERIFIED_THROUGH_HELPER.has(actionType)) {
        out[d.field] = "verified";
      } else {
        out[d.field] = "activity-only";
      }
    }
    return out;
  }

  // Generic failure (network / unknown error) — treat everything as
  // not-persisted; the audit row probably wasn't written either.
  if (!result.success) {
    for (const d of diffs) out[d.field] = "mismatch";
    return out;
  }

  // Success path.
  for (const d of diffs) {
    if (VERIFIED_THROUGH_HELPER.has(actionType)) {
      out[d.field] = "verified";
    } else if (ACTIVITY_LOGGED_ONLY.has(actionType)) {
      out[d.field] = "activity-only";
    } else {
      // Unknown action type — be honest, don't claim verified.
      out[d.field] = "activity-only";
    }
  }
  return out;
}

/** Display helper: render any field value for the table cell. */
export function formatFieldValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return v.toLocaleString();
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
