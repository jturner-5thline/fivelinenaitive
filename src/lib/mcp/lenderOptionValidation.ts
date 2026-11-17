/** Option validation and array add/remove modes for create_lender / update_lender. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { VALIDATED_LENDER_FIELDS, LENDER_ARRAY_MODE_FIELDS, applyArrayMode, loadFieldOptions, validateOptionValues, type FieldOptionKey } from "./fieldOptions";

export type ArrayMode = "replace" | "add" | "remove";

/**
 * Validate option-backed fields in place (rewriting to canonical spelling).
 * Returns null when valid, otherwise a structured error with suggestions.
 */
export async function validateLenderOptions(sb: SupabaseClient, patch: Record<string, unknown>, allowNew: boolean) {
  if (allowNew) return null;
  const cache = new Map<FieldOptionKey, string[]>();
  const errors = [];
  for (const [field, spec] of Object.entries(VALIDATED_LENDER_FIELDS)) {
    if (!(field in patch) || patch[field] === null) continue;
    if (!cache.has(spec.key)) cache.set(spec.key, (await loadFieldOptions(sb, spec.key)).values);
    const res = validateOptionValues(field, patch[field], cache.get(spec.key)!, spec);
    if (res.error) errors.push(res.error);
    else patch[field] = res.value;
  }
  return errors.length
    ? { error: "invalid_option_values", message: "Some values are not in the app's option lists. Use a suggested value, check list_field_options, or pass allow_new_options: true to save them anyway.", fields: errors }
    : null;
}

/** Resolve add/remove array modes against the lender's current values. */
export async function resolveArrayModes(sb: SupabaseClient, lenderId: string, patch: Record<string, unknown>, mode: ArrayMode) {
  if (mode === "replace") return { updatedAt: null as string | null };
  const fields = LENDER_ARRAY_MODE_FIELDS.filter((f) => Array.isArray(patch[f]));
  const others = Object.keys(patch).filter((k) => Array.isArray(patch[k]) && !(LENDER_ARRAY_MODE_FIELDS as readonly string[]).includes(k));
  if (others.length) throw new Error(`array_mode add/remove only applies to ${LENDER_ARRAY_MODE_FIELDS.join(", ")}; remove ${others.join(", ")} or send them in a separate replace call.`);
  if (!fields.length) throw new Error(`array_mode ${mode} needs at least one of ${LENDER_ARRAY_MODE_FIELDS.join(", ")}.`);
  const { data, error } = await sb.from("master_lenders").select(["id", "updated_at", ...fields].join(", ")).eq("id", lenderId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Funding source not found (or not visible to this user).");
  const cur = data as unknown as Record<string, unknown>;
  for (const f of fields) patch[f] = applyArrayMode(cur[f], mode, patch[f] as string[]);
  return { updatedAt: cur.updated_at as string };
}
