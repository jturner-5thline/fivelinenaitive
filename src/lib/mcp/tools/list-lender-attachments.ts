import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import { LENDER_ATTACHMENT_BUCKET } from "../lenderAttachments";

export default defineTool({
  name: "list_lender_attachments",
  title: "List funding source attachments",
  description:
    "List the documents attached to a funding source (NDAs, one-pagers, referral agreements…) with a signed download URL valid for 1 hour.",
  inputSchema: { lender_id: z.string().uuid() },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ lender_id }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    const { data: lender, error: lErr } = await sb.from("master_lenders").select("id, name, company_id").eq("id", lender_id).maybeSingle();
    if (lErr) return errorResult(lErr.message);
    if (!lender) return errorResult("lender_id: funding source not found (or not visible to this user).");

    let q = sb.from("lender_attachments").select("*").eq("lender_name", lender.name).order("created_at", { ascending: false }).limit(200);
    if (lender.company_id) q = q.eq("company_id", lender.company_id);
    const { data, error } = await q;
    if (error) return errorResult(error.message);

    const rows = await Promise.all(
      ((data ?? []) as Array<Record<string, unknown>>).map(async (r) => {
        const { data: signed } = await sb.storage.from(LENDER_ATTACHMENT_BUCKET).createSignedUrl(String(r.file_path), 3600);
        return { ...r, download_url: signed?.signedUrl ?? null };
      }),
    );
    return textResult({ lender_id, lender_name: lender.name, attachments: rows }, { count: rows.length });
  },
});
