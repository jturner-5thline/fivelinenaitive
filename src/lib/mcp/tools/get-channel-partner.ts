import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { PARTNER_SELECT, hydratePartners, type PartnerRow } from "../channelPartners";

export default defineTool({
  name: "get_channel_partner",
  title: "Get channel partner",
  description: "Read one Channel Partner by partner id or CRM company id: stage, owner, current status note plus full status-note history, stage/activity history, last contact and next activity date.",
  inputSchema: { partner_id: z.string().uuid().optional(), crm_company_id: z.string().uuid().optional() },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ partner_id, crm_company_id }, ctx) => {
    const denied = requireAuth(ctx);
    if (denied) return denied;
    if (!partner_id && !crm_company_id) return errorResult("Provide partner_id or crm_company_id.");
    const sb = supabaseForUser(ctx);
    try {
      let q = sb.from("channel_partners").select(PARTNER_SELECT).limit(1);
      q = partner_id ? q.eq("id", partner_id) : q.eq("crm_company_id", crm_company_id as string);
      const { data, error } = await q.maybeSingle();
      if (error) return errorResult(error.message);
      if (!data) return errorResult("Channel partner not found (or not visible to you).");
      const [partner] = await hydratePartners(sb, [data as unknown as PartnerRow], true);
      return textResult({ partner }, { partner_id: partner.id });
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
