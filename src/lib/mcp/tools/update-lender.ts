import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { resolveLenderId } from "../lenderWrites";
import { LENDER_FIELD_SCHEMA, validateLenderPatch } from "../lenderFields";

export const lenderUpdateItem = z.object({
  lender_id: z.string().uuid().optional(),
  name_lookup: z.string().trim().min(1).max(200).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  ...LENDER_FIELD_SCHEMA,
  mode: z.enum(["replace", "append", "prepend"]).optional(),
  expected_updated_at: z.string().datetime({ offset: true }).optional(),
  dry_run: z.boolean().optional(),
  source: z.string().max(1000).optional(),
  change_reason: z.string().max(2000).optional(),
}).strict();

export default defineTool({
  name: "update_lender",
  title: "Update funding source / lender",
  description: "Edit every master_lenders column except id, user_id, company_id, created_at and server-maintained updated_at. Does NOT edit deal_lenders or lender_contacts. Only supplied fields change; null clears. Long-text mode replace/append/prepend is atomic with blank-line separation and final length validation. Supports updates[1..25] with independent results, expected_updated_at (conflict returns current lender), dry_run (field diffs, no writes), source and change_reason in each audit row. name renames; name_lookup identifies, rejecting ambiguity. criteria_confidence: imported means unverified imported criteria; null clears. FLEx columns are inert metadata; FLEx stays disconnected.",
  inputSchema: { ...lenderUpdateItem.shape, updates: z.array(lenderUpdateItem).min(1).max(25).optional() },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const { updates, ...single } = input;
    if (updates && Object.keys(single).some((k) => !["dry_run", "source", "change_reason", "mode"].includes(k))) {
      return errorResult("Provide either updates or a single lender edit. Only mode, dry_run, source and change_reason may be batch defaults.");
    }
    const sb = supabaseForUser(ctx);
    const results = [];
    for (const value of updates ?? [single]) {
      const item = { mode: input.mode, dry_run: input.dry_run, source: input.source, change_reason: input.change_reason, ...value };
      const { lender_id, name_lookup, mode, expected_updated_at, dry_run, source, change_reason, ...fields } = item;
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
        const { data, error } = await sb.rpc("mcp_update_lender", {
          p_lender_id: resolved.id, p_patch: patch, p_mode: mode ?? "replace",
          p_expected_updated_at: expected_updated_at ?? null, p_dry_run: dry_run ?? false,
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