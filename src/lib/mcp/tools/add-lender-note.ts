import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth } from "../supabase";
import { writeLenderRelated, writeProvenance } from "../lenderRelatedWrites";

export default defineTool({
  name: "add_lender_note", title: "Add funding source note",
  description: "Create lender_notes body, tags and is_flag. Server derives author, lender name and company. Writes field-level audit atomically; does not write deal_lenders or deal-note history.",
  inputSchema: { lender_id: z.string().uuid(), body: z.string().min(1).max(20000), tags: z.array(z.string().max(200)).max(100).optional(), is_flag: z.boolean().optional(), ...writeProvenance },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ lender_id, source, change_reason, ...patch }, ctx) => {
    const err = requireAuth(ctx); if (err) return err;
    return writeLenderRelated(supabaseForUser(ctx), "lender_notes", "create", lender_id, undefined, patch, false, source, change_reason);
  },
});