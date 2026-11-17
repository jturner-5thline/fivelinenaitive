import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, requireAuth, textResult, errorResult } from "../supabase";
import type { AnySupabase } from "../../dashboardTiles/stageQueries";

type CalendarEvent = {
  id: string | number; title?: string | null; start?: string | null; end?: string | null; organizer_email?: string | null;
  attendees?: Array<{ email?: string | null; name?: string | null; displayName?: string | null } | string> | null;
  matched_contact_id?: string | null; matched_crm_company_id?: string | null; internal_emails?: string[] | null;
};

export default defineTool({
  name: "list_calendar_meetings",
  title: "List synced calendar meetings",
  description:
    "Read-only. Lists the synced team calendar meetings that the Sales & BD and Sales Dashboard tiles read (the same calendar-meetings-all source, scoped to the signed-in user's company and its approved team calendars). Returns id, title, start, end, organizer, attendee emails, matched contact/company ids and whether the meeting was manually removed from the referral-meeting count (referral_meeting_exclusions). Filters: from/to (required), optional contact_id (matched contact or attendee email), optional title substring. Paginated with limit/offset.",
  inputSchema: {
    from: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Start date YYYY-MM-DD (UTC, inclusive)."),
    to: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).describe("End date YYYY-MM-DD (UTC, inclusive)."),
    contact_id: z.string().uuid().optional(),
    title_contains: z.string().trim().min(1).max(200).optional(),
    limit: z.number().int().min(1).max(500).default(100),
    offset: z.number().int().min(0).default(0),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to, contact_id, title_contains, limit, offset }, ctx) => {
    const authErr = requireAuth(ctx);
    if (authErr) return authErr;
    if (from > to) return errorResult("from must be on or before to");
    const sb = supabaseForUser(ctx) as AnySupabase;
    const { data: member, error: mErr } = await sb.from("company_members").select("company_id").eq("user_id", ctx.getUserId()).maybeSingle();
    if (mErr) return errorResult(mErr.message);
    if (!member?.company_id) return errorResult("forbidden: the signed-in user is not a member of a company.");
    const companyId = member.company_id as string;

    const { data, error } = await sb.functions.invoke("calendar-meetings-all", {
      body: { company_id: companyId, time_min: `${from}T00:00:00.000Z`, time_max: `${to}T23:59:59.999Z` },
    });
    if (error) return errorResult(`Calendar unavailable: ${error.message}`);
    const { data: excl, error: eErr } = await sb.from("referral_meeting_exclusions").select("meeting_id").eq("company_id", companyId);
    if (eErr) return errorResult(eErr.message);
    const excluded = new Set((excl ?? []).map((r: { meeting_id: string }) => String(r.meeting_id)));

    let contactEmails = new Set<string>();
    if (contact_id) {
      const { data: c, error: cErr } = await sb.from("contacts").select("email, additional_emails").eq("id", contact_id).maybeSingle();
      if (cErr) return errorResult(cErr.message);
      contactEmails = new Set([c?.email, ...((c?.additional_emails as string[] | null) ?? [])].filter((e): e is string => !!e).map((e) => e.toLowerCase()));
    }

    const needle = title_contains?.toLowerCase();
    const rows = ((data?.events ?? []) as CalendarEvent[]).map((e) => {
      const attendees = (e.attendees ?? []).map((a) => (typeof a === "string" ? a : a?.email ?? "")).filter(Boolean).map((s) => s.toLowerCase());
      return {
        id: String(e.id), title: e.title ?? null, start: e.start ?? null, end: e.end ?? null,
        organizer: e.organizer_email ?? null, attendee_emails: attendees,
        matched_contact_ids: e.matched_contact_id ? [e.matched_contact_id] : [],
        matched_crm_company_id: e.matched_crm_company_id ?? null,
        is_excluded: excluded.has(String(e.id)),
      };
    }).filter((r) => {
      if (needle && !(r.title ?? "").toLowerCase().includes(needle)) return false;
      if (contact_id && !r.matched_contact_ids.includes(contact_id) && !r.attendee_emails.some((a) => contactEmails.has(a))) return false;
      return true;
    }).sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""));

    const page = rows.slice(offset, offset + limit);
    const next = offset + page.length;
    const payload = {
      range: { from, to, time_zone: "UTC" },
      total_count: rows.length, returned: page.length, offset,
      next_offset: next < rows.length ? next : null, has_more: next < rows.length,
      meetings: page,
    };
    return textResult(payload, payload);
  },
});
