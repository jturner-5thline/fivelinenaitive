import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { REFERRAL_STAGES, type ReferralStage } from "../referralPipeline";
import { loadReferralClassification, fetchByIds, type ContactRow } from "../referralClassification";

export default defineTool({
  name: "list_referral_partners",
  title: "List referral partners",
  description:
    "Read-only. Lists the contacts currently in the Referral Source pipeline (Sales & BD dashboard) at stages Nurturing, Tier 3, Tier 2 and Tier 1 — the same classification the app shows — with real field values for building email lists: contact_id, first_name, last_name, email, title, company_name, company_id, stage, stage_entered_at, updated_at and owner. Scoped to the signed-in user's company. Sources without an email are skipped and counted in `missing_email`. Every response includes `stage_counts` (per stage, including skipped rows). Pagination: `limit` (default 200) and `offset`; response includes total_count, returned, next_offset and has_more. `stage_entered_at` is derived (no stage history is stored): Nurturing = date added to the pipeline; Tier N = date of the most recent referred deal behind that tier.",
  inputSchema: {
    stages: z.array(z.enum(REFERRAL_STAGES)).min(1).max(4).optional().describe('Stages to include. Defaults to all four: "Nurturing", "Tier 3", "Tier 2", "Tier 1".'),
    limit: z.number().int().min(1).max(1000).default(200),
    offset: z.number().int().min(0).default(0),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ stages, limit, offset }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    const userId = ctx.getUserId();
    try {
      const { data: member, error: mErr } = await sb.from("company_members").select("company_id").eq("user_id", userId).maybeSingle();
      if (mErr) return errorResult(mErr.message);
      if (!member?.company_id) return errorResult("forbidden: the signed-in user is not a member of a company.");
      const companyId = member.company_id as string;

      const { classified, contacts, companyNames } = await loadReferralClassification(sb, companyId, userId);

      const contactById = new Map(contacts.map((c) => [c.id, c]));
      const ownerIds = [...new Set(contacts.map((c) => c.owner_user_id).filter((v): v is string => !!v))];
      const owners = await fetchByIds<{ user_id: string; display_name: string | null; first_name: string | null; last_name: string | null }>(
        sb, "profiles_public", "user_id, display_name, first_name, last_name", "user_id", ownerIds);
      const ownerName = new Map(owners.map((o) => [o.user_id, o.display_name || [o.first_name, o.last_name].filter(Boolean).join(" ") || null]));

      const wanted = new Set<ReferralStage>(stages ?? REFERRAL_STAGES);
      const stage_counts: Record<string, number> = Object.fromEntries(REFERRAL_STAGES.filter((s) => wanted.has(s)).map((s) => [s, 0]));
      let missing_email = 0;
      const rows = [];
      for (const s of classified) {
        if (!wanted.has(s.stage)) continue;
        stage_counts[s.stage] += 1;
        const c = s.contact_id ? contactById.get(s.contact_id) : undefined;
        const email = (c?.email || s.manual_email || "").trim();
        if (!email) { missing_email += 1; continue; }
        const [fallbackFirst, ...rest] = s.name.split(/\s+/);
        const companyId = c?.crm_company_id ?? s.crm_company_id ?? null;
        rows.push({
          contact_id: s.contact_id,
          first_name: c ? c.first_name : fallbackFirst ?? null,
          last_name: c ? c.last_name : rest.join(" ") || null,
          email,
          title: c?.job_title ?? null,
          company_name: (companyId ? companyNames.get(companyId) : undefined) ?? s.manual_company ?? null,
          company_id: companyId,
          stage: s.stage,
          stage_entered_at: s.stage_entered_at,
          updated_at: c?.updated_at ?? s.manual_updated_at ?? null,
          owner_user_id: c?.owner_user_id ?? null,
          owner: c?.owner_user_id ? ownerName.get(c.owner_user_id) ?? null : null,
        });
      }
      const order = new Map(REFERRAL_STAGES.map((s, i) => [s, i]));
      rows.sort((a, b) => (order.get(b.stage)! - order.get(a.stage)!) || `${a.last_name ?? ""} ${a.first_name ?? ""}`.localeCompare(`${b.last_name ?? ""} ${b.first_name ?? ""}`));

      const page = rows.slice(offset, offset + limit);
      const next = offset + page.length;
      const payload = {
        total_count: rows.length,
        returned: page.length,
        offset,
        next_offset: next < rows.length ? next : null,
        has_more: next < rows.length,
        stage_counts,
        missing_email,
        partners: page,
      };
      return textResult(payload, payload);
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : "Failed to load referral partners");
    }
  },
});
