// sales-calls-refresh — recomputes the sales-calls cache for the current
// calendar year(s). Invoked by pg_cron on a daily cadence so the dashboard
// can serve from cache instantly.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const NYLAS_API_KEY = Deno.env.get("NYLAS_API_KEY");
const NYLAS_API_URI = "https://api.us.nylas.com";
const FIFTH_LINE_COMPANY_ID = "44556c46-9127-4b12-b14e-d6fee784afcf";

function domainOf(email?: string | null): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  return email.slice(at + 1).toLowerCase();
}

const TITLE_RE =
  /^\s*(.+?)\s*(?:<>|[-–—|:/])\s*5\s*th\s+line\s+financing\s+review\s*$/i;

function normalizeCompany(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[\s,.'`"()\[\]]+/g, " ")
    .replace(/\b(inc|llc|ltd|corp|co|group|holdings?)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface NylasCalendar { id: string; name: string | null; read_only?: boolean }

async function fetchCalendarsForGrant(grantId: string): Promise<NylasCalendar[]> {
  const resp = await fetch(`${NYLAS_API_URI}/v3/grants/${grantId}/calendars`, {
    headers: { Authorization: `Bearer ${NYLAS_API_KEY}`, Accept: "application/json" },
  });
  if (!resp.ok) return [{ id: "primary", name: "Primary" }];
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
): Promise<any[]> {
  const out: any[] = [];
  const calendars = await fetchCalendarsForGrant(grantId);
  const prioritized = calendars.filter((calendar, index) => {
    const id = calendar.id.toLowerCase();
    const name = (calendar.name || "").toLowerCase();
    const userEmail = (user.email || "").toLowerCase();
    return (
      index === 0 ||
      id === "primary" ||
      (!!userEmail && (id === userEmail || name === userEmail || id.includes(userEmail)))
    );
  });
  for (const calendar of prioritized.length > 0 ? prioritized : calendars) {
    let pageToken: string | null = null;
    let pages = 0;
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
      if (!resp.ok) break;
      const data = await resp.json();
      const raw = (data?.data || []) as any[];
      for (const e of raw) {
        if (e?.status === "cancelled") continue;
        const title: string = e?.title || "";
        const m = TITLE_RE.exec(title);
        if (!m) continue;
        const companyRaw = (m[1] || "").trim();
        const companyNorm = normalizeCompany(companyRaw);
        if (!companyNorm || companyNorm === "5th line") continue;
        const w = e?.when || {};
        const startIso = w.start_time ? new Date(w.start_time * 1000).toISOString() : (w.start_date || null);
        const endIso = w.end_time ? new Date(w.end_time * 1000).toISOString() : (w.end_date || null);
        const attendees = (e?.participants || e?.attendees || []) as any[];
        const attendeeDomains = attendees.map((a) => domainOf(a?.email)).filter((d): d is string => !!d);
        if (user.domain && attendeeDomains.length > 0 && attendeeDomains.every((d) => d === user.domain)) continue;
        const icalUid: string | null = e?.ical_uid || e?.master_event_id || null;
        const dedupe_key = icalUid
          ? `uid:${icalUid}`
          : `cx:${companyNorm}|${title.trim().toLowerCase().replace(/\s+/g, " ")}|${startIso || ""}|${endIso || ""}`;
        out.push({
          id: String(e.id), dedupe_key, title, company: companyRaw,
          start: startIso, end: endIso,
          calendar_id: calendar.id, calendar_name: calendar.name,
          user_email: user.email, user_name: user.name,
          html_link: e.html_link || null,
          attendee_domains: Array.from(new Set(attendeeDomains)),
        });
      }
      pageToken = (data?.next_cursor as string | null) || null;
      pages += 1;
    } while (pageToken && pages < 10);
  }
  return out;
}

async function refreshCompanyYear(supabase: any, companyId: string, year: number) {
  if (!NYLAS_API_KEY) throw new Error("Nylas not configured");

  const { data: members } = await supabase
    .from("company_members").select("user_id").eq("company_id", companyId);
  const targetUserIds = ((members || []) as any[]).map((m) => m.user_id).filter(Boolean);
  if (targetUserIds.length === 0) return { skipped: "no_members" };

  const { data: profiles } = await supabase
    .from("profiles").select("user_id, email, display_name, full_name");
  const { data: tokens } = await supabase
    .from("gmail_tokens").select("user_id, grant_id").in("user_id", targetUserIds);

  const profileById = new Map<string, { email: string | null; name: string | null }>();
  for (const p of (profiles || []) as any[]) {
    profileById.set(p.user_id, { email: p.email ?? null, name: p.display_name ?? p.full_name ?? null });
  }

  // Resolve company domain from any member profile.
  let companyDomain: string | null = null;
  for (const uid of targetUserIds) {
    const d = domainOf(profileById.get(uid)?.email ?? null);
    if (d) { companyDomain = d; break; }
  }

  const grants: { grantId: string; user: { email: string | null; name: string | null; domain: string | null } }[] = [];
  for (const t of (tokens || []) as any[]) {
    if (!t.grant_id) continue;
    const u = profileById.get(t.user_id) || { email: null, name: null };
    grants.push({ grantId: t.grant_id, user: { ...u, domain: companyDomain } });
  }

  const startUnix = Math.floor(Date.UTC(year, 0, 1) / 1000);
  const endUnix = Math.floor(Date.UTC(year, 11, 31, 23, 59, 59) / 1000);

  const perGrant = await Promise.all(
    grants.map((g) => fetchForGrant(g.grantId, startUnix, endUnix, g.user).catch(() => [] as any[])),
  );

  const merged = new Map<string, any>();
  for (const ev of perGrant.flat()) {
    const existing = merged.get(ev.dedupe_key);
    if (existing) {
      const already = existing.attendees.some(
        (a: any) => (a.email || "").toLowerCase() === (ev.user_email || "").toLowerCase(),
      );
      if (!already) existing.attendees.push({ email: ev.user_email, name: ev.user_name });
    } else {
      merged.set(ev.dedupe_key, { ...ev, attendees: [{ email: ev.user_email, name: ev.user_name }] });
    }
  }
  const events = Array.from(merged.values()).sort((a, b) => {
    const ta = a.start ? new Date(a.start).getTime() : 0;
    const tb = b.start ? new Date(b.start).getTime() : 0;
    return ta - tb;
  });

  const payload = {
    count: events.length,
    users: grants.length,
    source_company_id: companyId,
    source_user_ids: targetUserIds.length,
    events,
  };

  await supabase.from("sales_calls_cache").upsert(
    { company_id: companyId, year, payload, refreshed_at: new Date().toISOString() },
    { onConflict: "company_id,year" },
  );

  return { year, count: events.length, grants: grants.length };
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({} as any));
    const companyId: string = body?.company_id || FIFTH_LINE_COMPANY_ID;
    const now = new Date();
    const years: number[] = Array.isArray(body?.years) && body.years.length > 0
      ? body.years.map((y: any) => Number(y)).filter((n: number) => Number.isFinite(n))
      : [now.getUTCFullYear()];

    const results = [];
    for (const y of years) {
      try {
        results.push(await refreshCompanyYear(supabase, companyId, y));
      } catch (e: any) {
        results.push({ year: y, error: e?.message || String(e) });
      }
    }
    return new Response(JSON.stringify({ ok: true, company_id: companyId, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[sales-calls-refresh] error:", e?.message || e);
    return new Response(JSON.stringify({ error: e?.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});