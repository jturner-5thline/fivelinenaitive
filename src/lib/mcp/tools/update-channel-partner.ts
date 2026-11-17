import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { CHANNEL_PARTNER_STAGES, PARTNER_SELECT, hydratePartners, type PartnerRow } from "../channelPartners";

export default defineTool({
  name: "update_channel_partner",
  title: "Update channel partner",
  description: "Update a Channel Partner: stage (prospect/nurturing/trial/engaged; history recorded automatically) and owner, and/or replace the current status note (the previous note stays in visible history, as in the app). Returns the updated partner with a diff. 'Last contact' is the linked company's last activity date — log contact with add_company_note. There is no separate stored 'next step' field; put next steps in the status note.",
  inputSchema: {
    partner_id: z.string().uuid(),
    stage: z.enum(CHANNEL_PARTNER_STAGES).optional(),
    owner_user_id: z.string().uuid().nullable().optional(),
    status_note: z.string().trim().min(1).max(5000).optional().describe("New current status note; earlier notes remain in history."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ partner_id, stage, owner_user_id, status_note }, ctx) => {
    const denied = requireAuth(ctx);
    if (denied) return denied;
    if (stage === undefined && owner_user_id === undefined && status_note === undefined) return errorResult("No fields to update.");
    const sb = supabaseForUser(ctx);
    try {
      const { data: before, error: bErr } = await sb.from("channel_partners").select(PARTNER_SELECT).eq("id", partner_id).maybeSingle();
      if (bErr) return errorResult(bErr.message);
      if (!before) return errorResult("Channel partner not found (or not visible to you).");
      const b = before as unknown as PartnerRow;
      const diff: Record<string, { old: unknown; new: unknown }> = {};
      const upd: Record<string, unknown> = {};
      if (stage !== undefined && stage !== b.stage) { upd.stage = stage; diff.stage = { old: b.stage, new: stage }; }
      if (owner_user_id !== undefined && owner_user_id !== b.owner_user_id) { upd.owner_user_id = owner_user_id; diff.owner_user_id = { old: b.owner_user_id, new: owner_user_id }; }
      let row = b;
      if (Object.keys(upd).length) {
        const { data, error } = await sb.from("channel_partners").update({ ...upd, updated_at: new Date().toISOString() }).eq("id", partner_id).select(PARTNER_SELECT).maybeSingle();
        if (error) return errorResult(error.message);
        if (!data) return errorResult("Update denied by existing permissions.");
        row = data as unknown as PartnerRow;
      }
      if (status_note !== undefined) {
        const [cur] = await hydratePartners(sb, [b], false);
        if (cur.status_note !== status_note) {
          const { error } = await sb.from("channel_partner_status_notes").insert({ channel_partner_id: partner_id, company_id: b.company_id, note: status_note, created_by: ctx.getUserId() });
          if (error) return errorResult(error.message);
          diff.status_note = { old: cur.status_note, new: status_note };
        }
      }
      const [partner] = await hydratePartners(sb, [row], true);
      return textResult({ partner, diff }, { partner_id });
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
