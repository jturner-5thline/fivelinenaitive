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

function normalize(field: string, v: unknown): unknown {
  if (v === null || v === undefined) return null;
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
