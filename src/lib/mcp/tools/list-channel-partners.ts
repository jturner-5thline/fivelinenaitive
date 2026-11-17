import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { CHANNEL_PARTNER_STAGES, PARTNER_SELECT, callerCompanyId, hydratePartners, type PartnerRow } from "../channelPartners";

export default defineTool({
  name: "list_channel_partners",
  title: "List channel partners",
  description: "Read-only. Lists the Channel Partner pipeline on the BD page (separate from Referral Sources): id, linked CRM company, stage (prospect/nurturing/trial/engaged), owner, current status note, last contact (company's last activity) and next activity date. Filter by stage, owner or company name. Paginated.",
  inputSchema: {
    stages: z.array(z.enum(CHANNEL_PARTNER_STAGES)).max(4).optional(),
    owner_user_id: z.string().uuid().optional(),
    query: z.string().trim().max(200).optional().describe("Company name contains (case-insensitive)."),
    limit: z.number().int().min(1).max(500).default(100),
    offset: z.number().int().min(0).default(0),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ stages, owner_user_id, query, limit, offset }, ctx) => {
    const denied = requireAuth(ctx);
    if (denied) return denied;
    const sb = supabaseForUser(ctx);
    try {
      const companyId = await callerCompanyId(sb, ctx.getUserId());
      let q = sb.from("channel_partners").select(query ? PARTNER_SELECT.replace("crm_companies(", "crm_companies!inner(") : PARTNER_SELECT, { count: "exact" })
        .eq("company_id", companyId).order("updated_at", { ascending: false }).range(offset, offset + limit - 1);
      if (stages?.length) q = q.in("stage", stages);
      if (owner_user_id) q = q.eq("owner_user_id", owner_user_id);
      if (query) q = q.ilike("crm_companies.name", `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
      const { data, error, count } = await q;
      if (error) return errorResult(error.message);
      const partners = await hydratePartners(sb, (data ?? []) as unknown as PartnerRow[], false);
      const total = count ?? partners.length;
      const next = offset + partners.length;
      const payload = { total_count: total, returned: partners.length, offset, next_offset: next < total ? next : null, has_more: next < total, partners };
      return textResult(payload, payload);
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  },
});
