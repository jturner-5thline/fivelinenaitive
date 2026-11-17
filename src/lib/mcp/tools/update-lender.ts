import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { resolveLenderId } from "../lenderWrites";
import { LENDER_FIELD_SCHEMA, validateLenderPatch } from "../lenderFields";
import { resolveArrayModes, validateLenderOptions } from "../lenderOptionValidation";
import { LENDER_ARRAY_MODE_FIELDS } from "../fieldOptions";

export const lenderUpdateItem = z.object({
  lender_id: z.string().uuid().optional(),
  name_lookup: z.string().trim().min(1).max(200).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  ...LENDER_FIELD_SCHEMA,
  mode: z.enum(["replace", "append", "prepend"]).optional(),
  expected_updated_at: z.string().datetime({ offset: true }).optional(),
  dry_run: z.boolean().optional(),
  array_mode: z.enum(["replace", "add", "remove"]).optional().describe("For loan_types, industries, industries_to_avoid, geographies and tags: replace (default) sets the whole list; add appends missing values; remove drops the given values."),
  allow_new_options: z.boolean().optional().describe("Save values that are not in the app's option lists (see list_field_options)."),
  source: z.string().max(1000).optional(),
  change_reason: z.string().max(2000).optional(),
}).strict();

export default defineTool({
  name: "update_lender",
  title: "Update funding source / lender",
  description: "Edit every master_lenders column except id, user_id, company_id, created_at and server-maintained updated_at. Does NOT edit deal_lenders or lender_contacts. Only supplied fields change; null clears. Long-text mode replace/append/prepend is atomic with blank-line separation and final length validation. Supports updates[1..25] with independent results, expected_updated_at (conflict returns current lender), dry_run (field diffs, no writes), source and change_reason in each audit row. name renames; name_lookup identifies, rejecting ambiguity. criteria_confidence: imported (unverified), verified_call (recorded lender call), verified_email (lender writing), verified_attachment (lender-produced document); null clears. array_mode add/remove edits list fields without resending the whole list (checked against the current row for concurrency). Option-backed fields (lender_type, loan_types, industries, industries_to_avoid, geographies, geographies_excluded, cash_burn, sponsorship, refinancing, sub_debt, appetite_status, tier) are validated against list_field_options; unknown values are rejected with closest matches unless allow_new_options: true. FLEx columns are inert metadata; FLEx stays disconnected.",
  inputSchema: { ...lenderUpdateItem.shape, updates: z.array(lenderUpdateItem).min(1).max(25).optional() },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const { updates, ...single } = input;
    if (updates && Object.keys(single).some((k) => !["dry_run", "source", "change_reason", "mode", "array_mode", "allow_new_options"].includes(k))) {
      return errorResult("Provide either updates or a single lender edit. Only mode, array_mode, allow_new_options, dry_run, source and change_reason may be batch defaults.");
    }
    const sb = supabaseForUser(ctx);
    const results = [];
    for (const value of updates ?? [single]) {
      const item = { mode: input.mode, array_mode: input.array_mode, allow_new_options: input.allow_new_options, dry_run: input.dry_run, source: input.source, change_reason: input.change_reason, ...value };
      const { lender_id, name_lookup, mode, array_mode, allow_new_options, expected_updated_at, dry_run, source, change_reason, ...fields } = item;
      try {
        const patch = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
        if (!Object.keys(patch).length) throw new Error("No fields to update.");
        const invalid = await validateLenderPatch(sb, patch);
        if (invalid) throw new Error(invalid);
        const resolved = await resolveLenderId(sb, lender_id, name_lookup);
        if ("error" in resolved) {
          if (!updates) return resolved.error;
          results.push({ lender_id: lender_id ?? null, success: false, error: resolved.error.content });
          continue;
        }
        // Validate only the values supplied (not existing list entries); values being removed need no validation.
        const toValidate = array_mode === "remove"
          ? Object.fromEntries(Object.entries(patch).filter(([k]) => !(LENDER_ARRAY_MODE_FIELDS as readonly string[]).includes(k)))
          : patch;
        const optionErr = await validateLenderOptions(sb, toValidate, allow_new_options ?? false);
        if (toValidate !== patch) Object.assign(patch, toValidate);
        if (optionErr) {
          if (!updates) return { ...textResult(optionErr), isError: true as const };
          results.push({ lender_id: resolved.id, success: false, ...optionErr });
          continue;
        }
        const arr = await resolveArrayModes(sb, resolved.id, patch, array_mode ?? "replace");
        const { data, error } = await sb.rpc("mcp_update_lender", {
          p_lender_id: resolved.id, p_patch: patch, p_mode: mode ?? "replace",
          p_expected_updated_at: expected_updated_at ?? arr.updatedAt ?? null, p_dry_run: dry_run ?? false,
          p_source: source ?? null, p_change_reason: change_reason ?? null,
        });
        if (error) throw new Error(error.message);
        if (!updates) return { ...textResult(data), ...(data?.error ? { isError: true as const } : {}) };
        results.push({ lender_id: resolved.id, success: !data?.error, ...data });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (!updates) return errorResult(message);
        results.push({ lender_id: lender_id ?? null, success: false, error: message });
      }
    }
    return textResult({ results });
  },
});