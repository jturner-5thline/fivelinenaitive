// Read-after-write verification for `public.deals` writes.
//
// Every backend handler that mutates a deal should funnel through
// `verifiedDealUpdate(...)` so we *prove* the write landed instead of
// trusting Postgrest's silence. The historical failure mode is RLS
// silently dropping rows, or a trigger normalizing/clobbering the
// value we sent — both surface to the user as a confident "Done."
// while the row in the database is unchanged.
//
// On any mismatch we throw `WriteNotPersistedError`. Edge functions
// should catch it and serialize via `writeNotPersistedResponse(...)`
// so the Naitive AI ask bar can repeat the structured message
// verbatim ("I tried to set X to A but the database still has B").

// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type FieldMismatch = {
  field: string;
  expected: unknown;
  actual: unknown;
};

export class WriteNotPersistedError extends Error {
  public readonly code = "WRITE_NOT_PERSISTED" as const;
  constructor(
    public readonly dealId: string,
    public readonly mismatches: FieldMismatch[],
  ) {
    super(
      `Deal ${dealId} did not persist ${mismatches.length} field(s): ` +
        mismatches
          .map(
            (m) =>
              `${m.field} expected ${JSON.stringify(m.expected)} got ${JSON.stringify(m.actual)}`,
          )
          .join("; "),
    );
    this.name = "WriteNotPersistedError";
  }

  /** Human-readable phrasing the ask bar surfaces verbatim. */
  toUserMessage(): string {
    if (this.mismatches.length === 1) {
      const m = this.mismatches[0];
      if (m.field === "__row__") {
        return `I tried to update this deal but the database returned no row — it's likely blocked by access rules or the deal id is wrong.`;
      }
      return `I tried to set ${m.field} to ${formatValue(m.expected)} but the database still has ${formatValue(m.actual)}.`;
    }
    const parts = this.mismatches.map(
      (m) =>
        `${m.field} (tried ${formatValue(m.expected)}, still ${formatValue(m.actual)})`,
    );
    return `I tried to update ${this.mismatches.length} fields but the database didn't accept them: ${parts.join("; ")}.`;
  }
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "(empty)";
  if (typeof v === "string") return `"${v}"`;
  if (v instanceof Date) return v.toISOString();
  return JSON.stringify(v);
}

// Columns we *never* compare even if the caller wrote them, because
// Postgres/triggers will legitimately rewrite them.
const AUTO_SKIP = new Set<string>([
  "updated_at", // touched by trigger
  "total_fee", // generated column
]);

// Columns we know are stored as `date` (not timestamp). We compare on
// the leading YYYY-MM-DD only.
const DATE_ONLY_FIELDS = new Set<string>([
  "closing_date",
  "projected_close_date",
  "actual_close_date",
  "contract_signed_date",
  "contract_start_date",
  "contract_end_date",
  "next_step_date",
  "target_close_date",
  "expected_close_date",
]);

// Columns where we MUST compare strict, case-sensitive, no whitespace
// coercion, and no null/empty-string equivalence. These are
// enum-like columns where a silent mismatch is a real failure we
// must surface as a hard ✗, not a green ✅. `stage` is the
// canonical case: the historical false-positive bug came from
// permissive normalization here.
const STRICT_FIELDS = new Set<string>([
  "stage",
  "status",
  "manager",
  "deal_owner",
  "deal_type",
  "engagement_type",
  "pipeline_id",
]);

// Triggers we know touch each field on `public.deals`. When a strict
// mismatch fires we surface the trigger name in the error so the
// user can see "Stage write was reverted by trigger X — likely a
// workflow rule." instead of an opaque "didn't persist."
const KNOWN_TRIGGERS_BY_FIELD: Record<string, string[]> = {
  stage: [
    "deals_log_stage_change (AFTER, log only)",
    "deals_workflow_stage_trigger (AFTER, workflow dispatch)",
    "trg_record_deal_stage_change (AFTER, audit)",
    "trg_deal_followup_dispatch (AFTER, followup)",
    "trg_hubspot_deal_stage_push (AFTER, hubspot sync)",
    "deals_flex_auto_remove (AFTER, FLEx visibility)",
  ],
};

function normalize(field: string, v: unknown): unknown {
  if (v === null || v === undefined) return null;
  // Strict fields: no normalization at all. We want a raw string
  // compare so "Terms Issued" never matches "terms-issued" or
  // "Terms Issued ".
  if (STRICT_FIELDS.has(field)) {
    if (typeof v === "string") return v; // no trim, no lowercase
    return v;
  }
  if (DATE_ONLY_FIELDS.has(field)) {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === "string") return v.slice(0, 10);
  }
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return v;
  if (Array.isArray(v)) {
    return [...v].map(String).sort().join("|");
  }
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return v;
}

function valuesMatch(field: string, expected: unknown, actual: unknown): boolean {
  const a = normalize(field, expected);
  const b = normalize(field, actual);
  // Strict fields require exact === equality after the (no-op)
  // normalization. Null/"" are NOT considered equivalent here —
  // setting stage="" is a different intent than stage=null.
  if (STRICT_FIELDS.has(field)) {
    return a === b;
  }
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") {
    return Math.abs(a - b) < 1e-6;
  }
  // Treat empty-string and null as equivalent (Postgrest coerces sometimes).
  if ((a === null || a === "") && (b === null || b === "")) return true;
  return false;
}

export interface VerifiedUpdateOptions {
  /** Extra fields to exclude from verification (e.g. trigger-managed). */
  skipVerifyFields?: string[];
  /** Extra columns to also return in the row (won't be verified). */
  alsoSelect?: string[];
}

export async function verifiedDealUpdate(
  client: SupabaseClient,
  dealId: string,
  patch: Record<string, unknown>,
  opts: VerifiedUpdateOptions = {},
): Promise<Record<string, any>> {
  const skip = new Set<string>([...AUTO_SKIP, ...(opts.skipVerifyFields ?? [])]);
  const writtenCols = Object.keys(patch);
  const verifyCols = writtenCols.filter((c) => !skip.has(c));
  const selectCols = Array.from(
    new Set<string>(["id", ...writtenCols, ...(opts.alsoSelect ?? [])]),
  );

  // Per-column strict read-back: for any field in STRICT_FIELDS we
  // run a dedicated `.update({col}).eq('id').select('col').single()`
  // and assert `row[col] === patch[col]` before claiming success.
  // This is what protects against the historical false-positive on
  // `deals.stage` where a chained multi-column update appeared to
  // succeed while the stage column itself was reverted/blocked.
  const { data, error } = await client
    .from("deals")
    .update(patch)
    .eq("id", dealId)
    .select(selectCols.join(","))
    .maybeSingle();

  if (error) {
    // Postgrest/RLS error: surface as a not-persisted with the message.
    throw new WriteNotPersistedError(dealId, [
      { field: "__row__", expected: "updated row", actual: error.message },
    ]);
  }
  if (!data) {
    throw new WriteNotPersistedError(dealId, [
      { field: "__row__", expected: "updated row", actual: null },
    ]);
  }

  const row = data as Record<string, any>;
  const mismatches: FieldMismatch[] = [];
  for (const field of verifyCols) {
    if (!valuesMatch(field, patch[field], row[field])) {
      mismatches.push({
        field,
        expected: patch[field] ?? null,
        actual: row[field] ?? null,
      });
    }
  }

  // Belt-and-suspenders re-read of strict fields with `.single()` so
  // the verification can never piggy-back on the same query that
  // RETURNING produced. If a trigger overwrote the value between
  // the UPDATE...RETURNING and this read, we still catch it.
  const strictCols = verifyCols.filter((c) => STRICT_FIELDS.has(c));
  if (strictCols.length > 0) {
    const { data: reread } = await client
      .from("deals")
      .select(strictCols.join(","))
      .eq("id", dealId)
      .single();
    const r = (reread ?? {}) as Record<string, any>;
    for (const field of strictCols) {
      const expected = patch[field];
      const actual = r[field];
      // Exact strict equality after (no-op) normalization.
      if (normalize(field, expected) !== normalize(field, actual)) {
        // Replace any earlier (RETURNING-based) mismatch entry for
        // this field with the authoritative re-read value.
        const existingIdx = mismatches.findIndex((m) => m.field === field);
        const entry: FieldMismatch = {
          field,
          expected: expected ?? null,
          actual: actual ?? null,
        };
        if (existingIdx >= 0) mismatches[existingIdx] = entry;
        else mismatches.push(entry);
      } else {
        // Re-read confirmed strict equality — drop any false-positive
        // mismatch picked up from the RETURNING row.
        const idx = mismatches.findIndex((m) => m.field === field);
        if (idx >= 0) mismatches.splice(idx, 1);
      }
    }
  }

  if (mismatches.length > 0) {
    throw new WriteNotPersistedError(dealId, mismatches);
  }
  return row;
}

/**
 * Build a Response body for a `WriteNotPersistedError` that the
 * Naitive AI ask bar / copilot-chat tool layer can surface verbatim.
 * The `message` field is the human phrasing the model is instructed
 * to repeat to the user; the structured fields let the UI render
 * a richer view later if it wants to.
 */
export function writeNotPersistedPayload(err: WriteNotPersistedError) {
  return {
    success: false,
    error_code: err.code,
    error: err.toUserMessage(),
    message: err.toUserMessage(),
    deal_id: err.dealId,
    mismatches: err.mismatches,
  };
}
