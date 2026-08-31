import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult, assertDealAccess, withStageLabels } from "../supabase";

function contactName(contact: {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  email?: string | null;
}) {
  const composed = [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim();
  if (composed) return composed;
  const fullName = contact.full_name?.trim();
  if (fullName && fullName.toLowerCase() !== contact.email?.toLowerCase()) return fullName;
  return contact.email ?? "Unnamed contact";
}

export default defineTool({
  name: "get_deal",
  title: "Get deal",
  description: "Fetch a single deal by id with its full record, linked client contacts, recent status notes, tasks, and attached lenders. Client contacts include name, email, job title, and is_primary. The deal includes stage_label / pipeline_name resolved from the deal's assigned pipeline — always report stage_label, not the raw stage id (ids are overloaded per pipeline).",
  inputSchema: {
    deal_id: z.string().uuid(),
    include_tasks: z.boolean().default(true),
    include_lenders: z.boolean().default(true),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ deal_id, include_tasks, include_lenders }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    const denied = await assertDealAccess(sb, ctx, deal_id, "get_deal");
    if (denied) return denied;
    const { data: deal, error } = await sb.from("deals").select("*").eq("id", deal_id).maybeSingle();
    if (error) return errorResult(error.message);
    if (!deal) return errorResult("Deal not found or you do not have access.");

    const [tasksRes, lendersRes, contactLinksRes] = await Promise.all([
      include_tasks
        ? sb
            .from("tasks")
            .select("id, title, status, due_date, priority, assigned_to, created_at")
            .eq("deal_id", deal_id)
            .order("created_at", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: null, error: null }),
      include_lenders
        ? sb
            .from("deal_lenders")
            .select("id, lender_id, status, stage, updated_at")
            .eq("deal_id", deal_id)
            .order("updated_at", { ascending: false })
            .limit(200)
        : Promise.resolve({ data: null, error: null }),
      sb
        .from("contact_deals")
        .select("contact_id, role, created_at")
        .eq("deal_id", deal_id)
        .order("created_at", { ascending: true }),
    ]);
    if (contactLinksRes.error) return errorResult(contactLinksRes.error.message);

    const contactLinks = contactLinksRes.data ?? [];
    const contactIds = contactLinks.map((link) => link.contact_id).filter(Boolean);
    let clientContacts: Array<{
      id: string;
      name: string;
      email: string | null;
      job_title: string | null;
      is_primary: boolean;
    }> = [];

    if (contactIds.length > 0) {
      const { data: contacts, error: contactsError } = await sb
        .from("contacts")
        .select("id, first_name, last_name, full_name, email, job_title")
        .in("id", contactIds);
      if (contactsError) return errorResult(contactsError.message);

      const contactsById = new Map((contacts ?? []).map((contact) => [contact.id, contact]));
      clientContacts = contactLinks
        .map((link) => {
          const contact = contactsById.get(link.contact_id);
          if (!contact) return null;
          return {
            id: contact.id,
            name: contactName(contact),
            email: contact.email ?? null,
            job_title: contact.job_title ?? null,
            is_primary: (link.role ?? "").toLowerCase() === "primary",
          };
        })
        .filter((contact): contact is NonNullable<typeof contact> => contact !== null)
        .sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
    }

    const [dealWithLabels] = await withStageLabels(sb, [deal as Record<string, unknown> & { stage?: string | null; pipeline_id?: string | null }]);
    return textResult({
      deal: dealWithLabels,
      client_contacts: clientContacts,
      tasks: tasksRes.data ?? [],
      lenders: lendersRes.data ?? [],
    });
  },
});
