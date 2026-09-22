import type { ToolContext } from "@lovable.dev/mcp-js";
import type { supabaseForUser } from "./supabase";
import { textResult, errorResult } from "./supabase";

type Sb = ReturnType<typeof supabaseForUser>;

/**
 * Shared lookup used by the lender write tools: accept an explicit id, or a
 * (partial, case-insensitive) name — mirroring `get_lender` — and refuse to
 * guess when a name matches several funding sources.
 */
export async function resolveLenderId(
  sb: Sb,
  lender_id?: string | null,
  name?: string | null,
): Promise<{ id: string } | { error: ReturnType<typeof errorResult> | ReturnType<typeof textResult> }> {
  if (lender_id) return { id: lender_id };
  if (!name) return { error: errorResult("Provide lender_id or name_lookup.") };

  const { data, error } = await sb.from("master_lenders").select("id, name, lender_type").ilike("name", `%${name}%`).limit(5);
  if (error) return { error: errorResult(error.message) };
  const matches = (data ?? []) as Array<Record<string, unknown>>;
  if (matches.length === 0) return { error: errorResult("Funding source not found (or not visible to this user).") };
  if (matches.length > 1) {
    const exact = matches.find((m) => String(m.name ?? "").toLowerCase() === String(name).toLowerCase());
    if (!exact) {
      return {
        error: textResult(
          {
            ambiguous: true,
            message: "Multiple funding sources match that name; call again with one of these ids.",
            matches: matches.map((m) => ({ id: m.id, name: m.name, lender_type: m.lender_type })),
          },
          { count: matches.length },
        ),
      };
    }
    return { id: exact.id as string };
  }
  return { id: matches[0].id as string };
}

function display(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Resolve a human name for the audit trail. `profiles` is keyed by user_id. */
async function actorName(sb: Sb, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data } = await sb.from("profiles").select("display_name, email").eq("user_id", userId).maybeSingle();
  const row = data as { display_name?: string | null; email?: string | null } | null;
  return row?.display_name || row?.email || null;
}

/**
 * Write one `lender_audit_logs` row per genuinely changed field, matching the
 * shape the UI writes (and that `get_lender` surfaces as `audit_history`).
 * Audit failures never fail the write itself.
 */
export async function logLenderAudit(
  sb: Sb,
  ctx: ToolContext,
  lenderId: string,
  action: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
  fields: string[],
  metadata?: Record<string, unknown>,
): Promise<string[]> {
  const userId = ctx.getUserId?.() ?? null;
  const who = await actorName(sb, userId);

  const rows: Array<Record<string, unknown>> = [];
  const changed: string[] = [];
  for (const field of fields) {
    const oldValue = display(before?.[field]);
    const newValue = display(after?.[field]);
    if (oldValue === newValue) continue;
    changed.push(field);
    rows.push({
      lender_id: lenderId,
      user_id: userId,
      user_display_name: who,
      action,
      field_changed: field,
      old_value: oldValue,
      new_value: newValue,
      metadata: metadata ?? null,
    });
  }
  if (rows.length === 0 && before !== null) return changed;
  if (rows.length === 0) {
    rows.push({
      lender_id: lenderId,
      user_id: userId,
      user_display_name: who,
      action,
      field_changed: null,
      old_value: null,
      new_value: null,
      metadata: metadata ?? null,
    });
  }
  const { error } = await sb.from("lender_audit_logs").insert(rows);
  if (error) console.warn("[lender-audit] failed to log change", { lenderId, action, message: error.message });
  return changed;
}
