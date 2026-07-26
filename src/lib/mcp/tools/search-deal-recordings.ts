import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult, assertDealAccess } from "../supabase";

export default defineTool({
  name: "search_deal_recordings",
  title: "Search deal meeting recordings",
  description:
    "List Claap meeting recordings and transcripts linked to a deal. Returns recording title, duration, recorder, thumbnail/url, and — when include_transcript is true — the transcript text and summary from claap_transcripts. Optional query filters recording title/summary/transcript.",
  inputSchema: {
    deal_id: z.string().uuid(),
    query: z.string().trim().min(1).max(200).optional(),
    include_transcript: z.boolean().default(false),
    limit: z.number().int().min(1).max(50).default(20),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ deal_id, query, include_transcript, limit }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    const sb = supabaseForUser(ctx);
    const denied = await assertDealAccess(sb, ctx, deal_id, "search_deal_recordings");
    if (denied) return denied;
    let recQ = sb
      .from("deal_claap_recordings")
      .select(
        "id, recording_id, recording_title, recording_url, thumbnail_url, duration_seconds, recorder_name, recorder_email, linked_at, notes, created_at"
      )
      .eq("deal_id", deal_id)
      .order("linked_at", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (query) recQ = recQ.ilike("recording_title", `%${query}%`);
    const { data: recordings, error } = await recQ;
    if (error) return errorResult(error.message);

    let transcripts: any[] = [];
    if (include_transcript) {
      let tQ = sb
        .from("claap_transcripts")
        .select("id, claap_meeting_id, transcript_text, summary, participants, duration_seconds, recorded_at, call_type")
        .eq("deal_id", deal_id)
        .order("recorded_at", { ascending: false, nullsFirst: false })
        .limit(limit);
      if (query) {
        const like = `%${query}%`;
        tQ = tQ.or(`transcript_text.ilike.${like},summary.ilike.${like}`);
      }
      const tRes = await tQ;
      if (tRes.error) return errorResult(tRes.error.message);
      transcripts = tRes.data ?? [];
    }
    return textResult({ recordings: recordings ?? [], transcripts });
  },
});