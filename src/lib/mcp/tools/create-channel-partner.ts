import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { CHANNEL_PARTNER_STAGES, PARTNER_SELECT, callerCompanyId, hydratePartners, type PartnerRow } from "../channelPartners";

export default defineTool({
  name: "create_channel_partner",
  title: "Create channel partner",
  description: "Add an existing CRM company to the Channel Partner pipeline (BD page), like the app's Add Partner action. Defaults: stage prospect, owner = you. Optional first status note. Refuses if the company is already a channel partner (returns the existing id). Stage history is recorded automatically. Create the CRM company first with create_company if needed.",
  inputSchema: {
    crm_company_id: z.string().uuid(),
    stage: z.enum(CHANNEL_PARTNER_STAGES).default("prospect"),
    owner_user_id: z.string().uuid().optional(),
    status_note: z.string().trim().min(1).max(5000).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ crm_company_id, stage, owner_user_id, status_note }, ctx) => {
    const denied = requireAuth(ctx);
    if (denied) return denied;
    const sb = supabaseForUser(ctx);
    const userId = ctx.getUserId();
    try {
      const companyId = await callerCompanyId(sb, userId);
      const { data: existing } = await sb.from("channel_partners").select("id").eq("company_id", companyId).eq("crm_company_id", crm_company_id).maybeSingle();
      if (existing) return { ...textResult({ error: "already_exists", partner_id: existing.id, message: "This company is already a channel partner; use update_channel_partner." }), isError: true as const };
      const { data, error } = await sb.from("channel_partners").insert({
        company_id: companyId, crm_company_id, stage: stage ?? "prospect", owner_user_id: owner_user_id ?? userId, created_by: userId,
      }).select(PARTNER_SELECT).maybeSingle();
      if (error) return errorResult(error.message);
      if (!data) return errorResult("Channel partner was not created (company not in your workspace or permission denied).");
      if (status_note) {
        const { error: nErr } = await sb.from("channel_partner_status_notes").insert({ channel_partner_id: (data as { id: string }).id, company_id: companyId, note: status_note, created_by: userId });
        if (nErr) return errorResult(`Partner created, but the status note failed: ${nErr.message}`);
      }
      const [partner] = await hydratePartners(sb, [data as unknown as PartnerRow], true);
      return textResult({ partner, created: true }, { partner_id: partner.id });
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
