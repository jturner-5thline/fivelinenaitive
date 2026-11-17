import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "link_claap_meeting_to_lender",
  title: "Link Claap meeting to funding source",
  description: "Manually link any Claap meeting to a funding source, even when no suggestion exists. Identify the meeting by meeting_id (claap_meetings.id) or recording_id (claap_recordings.id). Confirms the match (locked as a manual decision, audited) and optionally sets the matched contact (a CRM contact in the same workspace). Organizer/admin update permissions apply; no deal routing runs.",
  inputSchema: {
    meeting_id: z.string().uuid().optional(),
    recording_id: z.string().uuid().optional(),
    lender_id: z.string().uuid(),
    contact_id: z.string().uuid().optional().describe("Optional CRM contacts.id to record as the matched contact."),
    reason: z.string().max(10000).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ meeting_id, recording_id, lender_id, contact_id, reason }, ctx) => {
    const denied = requireAuth(ctx);
    if (denied) return denied;
    if (!meeting_id === !recording_id) return errorResult("Provide exactly one of meeting_id or recording_id.");
    const sb = supabaseForUser(ctx);
    let id = meeting_id;
    if (recording_id) {
      const { data: rec, error } = await sb.from("claap_recordings").select("id, external_id").eq("id", recording_id).maybeSingle();
      if (error) return errorResult(error.message);
      if (!rec?.external_id) return errorResult("Recording not found (or not visible to you).");
      const { data: m, error: mErr } = await sb.from("claap_meetings").select("id").eq("claap_id", rec.external_id).limit(1).maybeSingle();
      if (mErr) return errorResult(mErr.message);
      if (!m) return errorResult("No Claap meeting record exists for this recording yet.");
      id = m.id as string;
    }
    const { data, error } = await sb.rpc("mcp_update_claap_meeting_match", {
      p_meeting_id: id, p_matched_lender_id: lender_id, p_match_status: "matched", p_reason: reason ?? "Manually linked via connector", p_status: null,
    });
    if (error) return errorResult(error.message);
    let contact: unknown = null;
    if (contact_id) {
      const { data: meeting } = await sb.from("claap_meetings").select("company_id").eq("id", id as string).maybeSingle();
      const { data: c, error: cErr } = await sb.from("contacts").select("id, full_name, email, org_company_id").eq("id", contact_id).maybeSingle();
      if (cErr) return errorResult(`Lender linked, but contact lookup failed: ${cErr.message}`);
      if (!c || c.org_company_id !== meeting?.company_id) return errorResult("Lender linked, but the contact is not in the meeting's workspace; contact not set.");
      const { data: upd, error: uErr } = await sb.from("claap_meetings").update({ matched_contact_id: contact_id, updated_at: new Date().toISOString() }).eq("id", id as string).select("id");
      if (uErr || !upd?.length) return errorResult(`Lender linked, but setting the contact was denied: ${uErr?.message ?? "permission denied"}`);
      contact = c;
    }
    return textResult({ meeting_id: id, linked: true, result: data, contact }, { meeting_id: id as string });
  },
});
