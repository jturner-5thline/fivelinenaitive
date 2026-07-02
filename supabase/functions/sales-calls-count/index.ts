// sales-calls-count — counts calendar events titled
// "[COMPANY] <> 5th Line Financing Review" (or close variations) across
// every 5th Line teammate's connected calendar, deduped so a single shared
// meeting counts once. Powers the Sales Calls metric on Sales Dashboard-V2.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NYLAS_API_KEY = Deno.env.get("NYLAS_API_KEY");
const NYLAS_API_URI = "https://api.us.nylas.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FIFTH_LINE_COMPANY_ID = "44556c46-9127-4b12-b14e-d6fee784afcf";

function domainOf(email?: string | null): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  return email.slice(at + 1).toLowerCase();
}

// "[Company] <sep> 5th Line Financing Review" — separators we tolerate:
// <>, -, –, —, |, :, /. Whitespace around separator is collapsed. Case-
// insensitive. Company portion is captured for dedupe + display.
// Debt variant: "[Company] <sep> 5th Line Financing Review".
// FinServ variant: "5th Line <sep> [Company] Financial Review".
const DEBT_FINANCING_RE = /5\s*th\s+line\s+financing\s+review/i;
const TITLE_RE_DEBT =
  /^\s*(.+?)\s*(?:<>|[-–—|:/])\s*5\s*th\s+line\s+financing\s+review\s*$/i;
const TITLE_RE_FINSERV =
  /^\s*5\s*th\s+line\s*(?:<>|[-–—|:/])\s*(.+?)\s+financial\s+review\s*$/i;

function normalizeCompany(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[\s,.'`"()\[\]]+/g, " ")
    .replace(/\b(inc|llc|ltd|corp|co|group|holdings?)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface ReqBody {
  time_min?: string;
  time_max?: string;
  force_refresh?: boolean;
  variant?: 'debt' | 'finserv';
}

interface SalesCallEvent {
  id: string;
  dedupe_key: string;
  title: string;
  company: string;
  start: string | null;
  end: string | null;
  calendar_id: string | null;
  calendar_name: string | null;
  user_email: string | null;
  user_name: string | null;
  html_link: string | null;
  attendee_domains: string[];
}

interface NylasCalendar {
  id: string;
  name: string | null;
  read_only?: boolean;
}

async function fetchCalendarsForGrant(grantId: string): Promise<NylasCalendar[]> {
  const resp = await fetch(`${NYLAS_API_URI}/v3/grants/${grantId}/calendars`, {
    headers: { Authorization: `Bearer ${NYLAS_API_KEY}`, Accept: "application/json" },
  });
  if (!resp.ok) {
    console.warn("[sales-calls-count] calendar list err", grantId, resp.status);
    return [{ id: "primary", name: "Primary" }];
  }

  const data = await resp.json();
  const raw = Array.isArray(data?.data) ? data.data : [];
  const calendars = raw
    .map((c: any) => ({
      id: String(c?.id || c?.calendar_id || "").trim(),
      name: c?.name || c?.summary || c?.display_name || null,
      read_only: !!c?.read_only,
    }))
    .filter((c: NylasCalendar) => !!c.id);

  return calendars.length > 0 ? calendars : [{ id: "primary", name: "Primary" }];
}

async function fetchForGrant(
  grantId: string,
  startUnix: number,
  endUnix: number,
  user: { email: string | null; name: string | null; domain: string | null },
  titleRe: RegExp,
  excludeTitleRe?: RegExp,
): Promise<SalesCallEvent[]> {
  const out: SalesCallEvent[] = [];
  const calendars = await fetchCalendarsForGrant(grantId);

  const prioritizedCalendars = calendars.filter((calendar, index) => {
    const id = calendar.id.toLowerCase();
    const name = (calendar.name || "").toLowerCase();
    const userEmail = (user.email || "").toLowerCase();
    return (
      index === 0 ||
      id === "primary" ||
      (!!userEmail && (id === userEmail || name === userEmail || id.includes(userEmail)))
    );
  });

  for (const calendar of prioritizedCalendars.length > 0 ? prioritizedCalendars : calendars) {
    let pageToken: string | null = null;
    let pagesFetched = 0;
    const MAX_PAGES = 10; // up to 2000 events per calendar per call
    do {
      const url = new URL(`${NYLAS_API_URI}/v3/grants/${grantId}/events`);
      url.searchParams.set("calendar_id", calendar.id);
      url.searchParams.set("start", String(startUnix));
      url.searchParams.set("end", String(endUnix));
      url.searchParams.set("limit", "200");
      url.searchParams.set("expand_recurring", "true");
      if (pageToken) url.searchParams.set("page_token", pageToken);
      const resp = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${NYLAS_API_KEY}`, Accept: "application/json" },
      });
      if (!resp.ok) {
        console.warn("[sales-calls-count] nylas err", grantId, calendar.id, resp.status);
        break;
      }
      const data = await resp.json();
      const raw = (data?.data || []) as any[];
      for (const e of raw) {
        if (e?.status === "cancelled") continue;
        const title: string = e?.title || "";
        if (excludeTitleRe?.test(title)) continue;
        const m = titleRe.exec(title);
        if (!m) continue;
        const companyRaw = (m[1] || "").trim();
        const companyNorm = normalizeCompany(companyRaw);
        if (!companyNorm || companyNorm === "5th line") continue;

        const w = e?.when || {};
        const startIso = w.start_time
          ? new Date(w.start_time * 1000).toISOString()
          : (w.start_date || null);
        const endIso = w.end_time
          ? new Date(w.end_time * 1000).toISOString()
          : (w.end_date || null);

        // Exclude internal-only meetings: every attendee shares the caller's
        // domain (no external "client" present). If there are no attendees
        // recorded at all, keep the event — the title alone qualifies it.
        const attendees = (e?.participants || e?.attendees || []) as any[];
        const attendeeDomains = attendees
          .map((a) => domainOf(a?.email))
          .filter((d): d is string => !!d);
        if (
          user.domain &&
          attendeeDomains.length > 0 &&
          attendeeDomains.every((d) => d === user.domain)
        ) {
          continue;
        }

        // Dedupe: prefer Nylas ical_uid / master_event_id (stable across all
        // attendees' calendars). Fall back to a normalized composite of
        // title + start + end + company.
        const icalUid: string | null = e?.ical_uid || e?.master_event_id || null;
        const dedupe_key = icalUid
          ? `uid:${icalUid}`
          : `cx:${companyNorm}|${title.trim().toLowerCase().replace(/\s+/g, " ")}|${startIso || ""}|${endIso || ""}`;

        out.push({
          id: String(e.id),
          dedupe_key,
          title,
          company: companyRaw,
          start: startIso,
          end: endIso,
          calendar_id: calendar.id,
          calendar_name: calendar.name,
          user_email: user.email,
          user_name: user.name,
          html_link: e.html_link || null,
          attendee_domains: Array.from(new Set(attendeeDomains)),
        });
      }
      pageToken = (data?.next_cursor as string | null) || null;
      pagesFetched += 1;
    } while (pageToken && pagesFetched < MAX_PAGES);
    }
  return out;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!NYLAS_API_KEY) {
      return new Response(JSON.stringify({ error: "Nylas not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: claimsData, error: authError } = await supabase.auth.getClaims(token);
    if (authError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = claimsData.claims.sub as string;
    const callerEmail = (claimsData.claims.email as string | undefined) || null;

    const body: ReqBody = await req.json().catch(() => ({} as ReqBody));
    if (!body.time_min || !body.time_max) {
      return new Response(JSON.stringify({ error: "time_min and time_max required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const variant: 'debt' | 'finserv' = body.variant === 'finserv' ? 'finserv' : 'debt';
    const titleRe = variant === 'finserv' ? TITLE_RE_FINSERV : TITLE_RE_DEBT;
    const excludeTitleRe = variant === 'finserv' ? DEBT_FINANCING_RE : undefined;

    let callerDomain = domainOf(callerEmail);
    if (!callerDomain) {
      const { data: p } = await supabase
        .from("profiles").select("email").eq("user_id", callerId).maybeSingle();
      callerDomain = domainOf(p?.email);
    }
    if (!callerDomain) {
      return new Response(JSON.stringify({ error: "Could not resolve caller domain" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerMemberships, error: membershipErr } = await supabase
      .from("company_members")
      .select("company_id")
      .eq("user_id", callerId);
    if (membershipErr) throw membershipErr;

    const callerCompanyIds = ((callerMemberships || []) as any[])
      .map((m) => m.company_id)
      .filter(Boolean);
    const targetCompanyId = callerCompanyIds.includes(FIFTH_LINE_COMPANY_ID)
      ? FIFTH_LINE_COMPANY_ID
      : callerCompanyIds[0] || null;

    // ---- Cache fast-path -----------------------------------------------
    // The dashboard requests a full calendar year. If we have a cached
    // payload for that (company, year), return it immediately instead of
    // re-scanning every teammate's Nylas calendar.
    const startD = new Date(body.time_min);
    const endD = new Date(body.time_max);
    const isFullYearRequest =
      startD.getUTCFullYear() === endD.getUTCFullYear() &&
      startD.getUTCMonth() === 0 && startD.getUTCDate() === 1 &&
      endD.getUTCMonth() === 11 && endD.getUTCDate() === 31;
    const requestedYear = startD.getUTCFullYear();

    if (variant === 'debt' && targetCompanyId && isFullYearRequest && !body.force_refresh) {
      const { data: cached } = await supabase
        .from("sales_calls_cache")
        .select("payload, refreshed_at")
        .eq("company_id", targetCompanyId)
        .eq("year", requestedYear)
        .maybeSingle();
      if (cached?.payload) {
        return new Response(
          JSON.stringify({ ...(cached.payload as any), cached: true, refreshed_at: cached.refreshed_at }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const { data: profiles, error: profErr } = await supabase
      .from("profiles").select("user_id, email, display_name, full_name");
    if (profErr) throw profErr;

    let targetUserIds: string[] = [];
    if (targetCompanyId) {
      const { data: members, error: membersErr } = await supabase
        .from("company_members")
        .select("user_id")
        .eq("company_id", targetCompanyId);
      if (membersErr) throw membersErr;
      targetUserIds = ((members || []) as any[]).map((m) => m.user_id).filter(Boolean);
    }

    // Fallback for older records/memberships: same company email domain.
    if (targetUserIds.length === 0) {
      targetUserIds = (profiles || [])
        .filter((p: any) => domainOf(p.email) === callerDomain)
        .map((p: any) => p.user_id);
    }

    if (targetUserIds.length === 0) {
      return new Response(JSON.stringify({ count: 0, users: 0, events: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tokens } = await supabase
      .from("gmail_tokens").select("user_id, grant_id").in("user_id", targetUserIds);
    const profileById = new Map<string, { email: string | null; name: string | null }>();
    for (const p of (profiles || []) as any[]) {
      profileById.set(p.user_id, {
        email: p.email ?? null,
        name: p.display_name ?? p.full_name ?? null,
      });
    }
    const grants: { grantId: string; user: { email: string | null; name: string | null; domain: string | null } }[] = [];
    for (const t of (tokens || []) as any[]) {
      if (!t.grant_id) continue;
      const u = profileById.get(t.user_id) || { email: null, name: null };
      grants.push({
        grantId: t.grant_id,
        user: { ...u, domain: callerDomain },
      });
    }

    const startUnix = Math.floor(new Date(body.time_min).getTime() / 1000);
    const endUnix = Math.floor(new Date(body.time_max).getTime() / 1000);

    const perGrant = await Promise.all(
      grants.map((g) =>
        fetchForGrant(g.grantId, startUnix, endUnix, g.user, titleRe, excludeTitleRe).catch(
          () => [] as SalesCallEvent[],
        ),
      ),
    );

    const merged = new Map<
      string,
      SalesCallEvent & { attendees: { email: string | null; name: string | null }[] }
    >();
    for (const ev of perGrant.flat()) {
      const existing = merged.get(ev.dedupe_key);
      if (existing) {
        const already = existing.attendees.some(
          (a) => (a.email || "").toLowerCase() === (ev.user_email || "").toLowerCase(),
        );
        if (!already) {
          existing.attendees.push({ email: ev.user_email, name: ev.user_name });
        }
      } else {
        merged.set(ev.dedupe_key, {
          ...ev,
          attendees: [{ email: ev.user_email, name: ev.user_name }],
        });
      }
    }
    const events = Array.from(merged.values()).sort((a, b) => {
      const ta = a.start ? new Date(a.start).getTime() : 0;
      const tb = b.start ? new Date(b.start).getTime() : 0;
      return ta - tb;
    });

    const responsePayload = {
      count: events.length,
      users: grants.length,
      source_company_id: targetCompanyId,
      source_user_ids: targetUserIds.length,
      events,
    };

    // Persist to cache when this is a full-year request so subsequent
    // dashboard loads serve instantly.
    if (variant === 'debt' && targetCompanyId && isFullYearRequest) {
      try {
        await supabase
          .from("sales_calls_cache")
          .upsert(
            {
              company_id: targetCompanyId,
              year: requestedYear,
              payload: responsePayload,
              refreshed_at: new Date().toISOString(),
            },
            { onConflict: "company_id,year" },
          );
      } catch (cacheErr) {
        console.warn("[sales-calls-count] cache write failed:", (cacheErr as any)?.message || cacheErr);
      }
    }

    return new Response(
      JSON.stringify({ ...responsePayload, cached: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("[sales-calls-count] error:", e?.message || e);
    return new Response(JSON.stringify({ error: e?.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});