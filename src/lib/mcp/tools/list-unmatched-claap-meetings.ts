import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";

export default defineTool({
  name: "list_unmatched_claap_meetings",
  title: "List unmatched Claap meetings",
  description: "Read-only. Claap meetings with no confirmed funding-source match (unmatched, or only a suggested match awaiting review). Filter by date range, participant email or email domain, and title text. Returns meeting id, title, date, participants, recording URL and any suggested lender with its reason. Use link_claap_meeting_to_lender or update_claap_meeting_match to resolve.",
  inputSchema: {
    include: z.enum(["both", "unmatched", "suggested"]).default("both"),
    started_after: z.string().datetime({ offset: true }).optional(),
    started_before: z.string().datetime({ offset: true }).optional(),
    participant_email: z.string().trim().max(320).optional(),
    participant_domain: z.string().trim().max(253).optional().describe("e.g. firstncc.com"),
    title_contains: z.string().trim().max(200).optional(),
    limit: z.number().int().min(1).max(200).default(50),
    offset: z.number().int().min(0).default(0),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    const denied = requireAuth(ctx);
    if (denied) return denied;
    const sb = supabaseForUser(ctx);
    const statuses = input.include === "unmatched" ? ["unmatched"] : input.include === "suggested" ? ["needs_review"] : ["unmatched", "needs_review"];
    let ids: string[] | null = null;
    if (input.participant_email || input.participant_domain) {
      let pq = sb.from("claap_meeting_participants").select("meeting_id").limit(5000);
      if (input.participant_email) pq = pq.ilike("email", input.participant_email.replace(/[\\%_]/g, (c) => `\\${c}`));
      if (input.participant_domain) pq = pq.ilike("domain", input.participant_domain.replace(/^@/, "").replace(/[\\%_]/g, (c) => `\\${c}`));
      const { data, error } = await pq;
      if (error) return errorResult(error.message);
      ids = [...new Set(((data ?? []) as Array<{ meeting_id: string }>).map((r) => r.meeting_id))];
      if (!ids.length) return textResult({ total_count: 0, returned: 0, has_more: false, next_offset: null, meetings: [] });
    }
    let q = sb.from("claap_meetings")
      .select("id, claap_id, title, started_at, recording_url, match_status, matched_lender_id, match_reason, match_confidence, status", { count: "exact" })
      .in("match_status", statuses).order("started_at", { ascending: false, nullsFirst: false }).range(input.offset, input.offset + input.limit - 1);
    if (ids) q = q.in("id", ids.slice(0, 1000));
    if (input.started_after) q = q.gte("started_at", input.started_after);
    if (input.started_before) q = q.lt("started_at", input.started_before);
    if (input.title_contains) q = q.ilike("title", `%${input.title_contains.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    const { data, error, count } = await q;
    if (error) return errorResult(error.message);
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const meetingIds = rows.map((r) => r.id as string);
    const lenderIds = [...new Set(rows.map((r) => r.matched_lender_id).filter((v): v is string => typeof v === "string"))];
    const [partsRes, lendersRes] = await Promise.all([
      meetingIds.length ? sb.from("claap_meeting_participants").select("meeting_id, name, email, domain, is_internal").in("meeting_id", meetingIds) : Promise.resolve({ data: [], error: null }),
      lenderIds.length ? sb.from("master_lenders").select("id, name").in("id", lenderIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (partsRes.error) return errorResult(partsRes.error.message);
    if (lendersRes.error) return errorResult(lendersRes.error.message);
    const parts = (partsRes.data ?? []) as Array<Record<string, unknown>>;
    const lenderName = new Map(((lendersRes.data ?? []) as Array<{ id: string; name: string }>).map((l) => [l.id, l.name]));
    const meetings = rows.map((r) => ({
      meeting_id: r.id, claap_id: r.claap_id, title: r.title, started_at: r.started_at, recording_url: r.recording_url, match_status: r.match_status, review_status: r.status,
      participants: parts.filter((p) => p.meeting_id === r.id).map(({ meeting_id: _m, ...p }) => p),
      suggested_match: r.match_status === "needs_review" && r.matched_lender_id
        ? { lender_id: r.matched_lender_id, lender_name: lenderName.get(r.matched_lender_id as string) ?? null, reason: r.match_reason, confidence: r.match_confidence }
        : null,
    }));
    const total = count ?? meetings.length;
    const next = input.offset + meetings.length;
    const payload = { total_count: total, returned: meetings.length, offset: input.offset, next_offset: next < total ? next : null, has_more: next < total, meetings };
    return textResult(payload, payload);
  },
});
