import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NYLAS_API_KEY = Deno.env.get("NYLAS_API_KEY");
const NYLAS_API_URI = "https://api.us.nylas.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/**
 * Safely parse an upstream (Nylas) response. If the body is not JSON
 * (e.g. an HTML 502/429/Cloudflare error page) we return a normalized
 * object instead of throwing — otherwise the JSON parse error bubbles
 * up as a 500 with the cryptic "Unexpected token '<'" message.
 */
async function safeUpstreamJson(response: Response): Promise<any> {
  const ct = response.headers.get("content-type") || "";
  const text = await response.text();
  if (ct.includes("application/json")) {
    try { return JSON.parse(text); } catch { /* fall through */ }
  } else {
    try { return JSON.parse(text); } catch { /* not JSON */ }
  }
  const snippet = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
  return {
    __nonJson: true,
    message: `Upstream returned ${response.status} ${response.statusText}${snippet ? `: ${snippet}` : ""}`,
  };
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = Number(response.headers.get("retry-after") || "");
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
  return Math.min(1000 * 2 ** attempt, 8000);
}

async function fetchWithBackoff(url: string, init: RequestInit, label: string): Promise<{ response: Response; data: any; attempts: number }> {
  let lastResponse: Response | null = null;
  let lastData: any = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, init);
    const data = await safeUpstreamJson(response);
    lastResponse = response;
    lastData = data;

    if (response.ok) return { response, data, attempts: attempt + 1 };

    const shouldRetry = response.status === 429 || response.status >= 500;
    if (!shouldRetry || attempt === 2) break;

    const waitMs = retryDelayMs(response, attempt);
    console.warn(`[calendar-events] ${label} retrying after ${response.status} in ${waitMs}ms (attempt ${attempt + 1})`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  return { response: lastResponse!, data: lastData, attempts: 3 };
}

interface EventsRequest {
  action: "list" | "get" | "list_calendars" | "sync_all" | "create" | "update" | "delete" | "create_calendar";
  calendar_id?: string;
  // create_calendar
  calendar_name?: string;
  calendar_description?: string;
  event_id?: string;
  time_min?: string;
  time_max?: string;
  max_results?: number;
  page_token?: string;
  timezone?: string;
  event_data?: {
    summary: string;
    description?: string;
    location?: string;
    start: string;
    end: string;
    all_day?: boolean;
    attendees?: { email: string; name?: string }[];
    add_meet_link?: boolean;
  };
}

interface NormalizedEvent {
  id: string;
  calendar_id: string;
  summary: string;
  description: string | null;
  location: string | null;
  start: string;
  end: string;
  all_day: boolean;
  status: string;
  event_type?: string;
  updated: string | null;
  created: string | null;
  html_link: string | null;
  hangout_link: string | null;
  conference_data: any | null;
  attendees: {
    email: string;
    display_name: string | null;
    response_status: string;
    organizer: boolean;
    self: boolean;
  }[] | null;
  organizer: { email: string; displayName?: string } | null;
  color_id: string | null;
  hex_color?: string | null;
}

function nylasHeaders() {
  return {
    "Authorization": `Bearer ${NYLAS_API_KEY}`,
    "Accept": "application/json",
    "Content-Type": "application/json",
  };
}

function normalizeNylasEvent(event: any, calendarId: string): NormalizedEvent {
  const startTime = event.when?.start_time
    ? new Date(event.when.start_time * 1000).toISOString()
    : event.when?.start_date || "";
  const endTime = event.when?.end_time
    ? new Date(event.when.end_time * 1000).toISOString()
    : event.when?.end_date || "";
  const isAllDay = !event.when?.start_time && !!event.when?.start_date;

  const kind = event.event_type || "default";
  const fallbackTitle = kind === "outOfOffice"
    ? "Out of office"
    : kind === "focusTime"
      ? "Focus time"
      : kind === "workingLocation"
        ? "Working location"
        : "(No title)";

  return {
    id: event.id,
    calendar_id: calendarId,
    summary: event.title || fallbackTitle,
    event_type: kind,
    description: event.description || null,
    location: event.location || null,
    start: startTime,
    end: endTime,
    all_day: isAllDay,
    status: event.status || "confirmed",
    updated: event.updated_at ? new Date(event.updated_at * 1000).toISOString() : null,
    created: event.created_at ? new Date(event.created_at * 1000).toISOString() : null,
    html_link: event.html_link || null,
    hangout_link: event.conferencing?.details?.url || null,
    conference_data: event.conferencing || null,
    attendees: event.participants?.map((p: any) => ({
      email: p.email,
      display_name: p.name || null,
      response_status: p.status || "needsAction",
      organizer: false,
      self: false,
    })) || null,
    organizer: event.organizer_email ? { email: event.organizer_email } : null,
    // Per-event Google color ("Tomato", "Banana", ...). Nylas surfaces this
    // inconsistently depending on provider/version, so probe every known shape.
    color_id:
      event.color_id ??
      event.colorId ??
      event.metadata?.color_id ??
      event.metadata?.colorId ??
      event.resource?.colorId ??
      event.raw?.colorId ??
      null,
    hex_color: event.hex_color ?? event.background_color ?? null,
  };
}

async function getGrantId(supabase: any, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("gmail_tokens")
    .select("grant_id")
    .eq("user_id", userId)
    .single();

  if (error || !data?.grant_id) return null;
  return data.grant_id;
}

/**
 * Demo-seed short-circuit: when gmail_tokens.grant_id === "demo-seed"
 * (set by provisionDemoWorkspace / seedDemoInbox), serve calendar reads
 * directly from the seeded `calendar_events` rows (`provider = 'demo'`)
 * instead of calling Nylas — the demo tenant has no real Nylas grant.
 */
async function handleDemoCalendar(
  supabase: any,
  userId: string,
  body: EventsRequest,
): Promise<Response> {
  const json = (payload: any, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const mapRow = (e: any) => ({
    id: e.event_id,
    calendar_id: "primary",
    title: e.title || "(No title)",
    summary: e.title || "(No title)",
    description: null,
    location: e.location || null,
    start: e.start_time,
    end: e.end_time,
    all_day: !!e.is_all_day,
    status: e.is_cancelled ? "cancelled" : "confirmed",
    htmlLink: null,
    hangoutLink: e.meeting_url || null,
    attendees: Array.isArray(e.attendees)
      ? e.attendees.map((a: any) =>
          typeof a === "string"
            ? { email: a, display_name: null, response_status: "needsAction", organizer: false, self: false }
            : a,
        )
      : null,
    organizer: e.organizer_email ? { email: e.organizer_email } : null,
    color: null,
    provider: "demo",
  });

  if (body.action === "list_calendars") {
    return json({
      calendars: [{
        id: "primary",
        summary: "Demo Calendar",
        description: "Seeded demo calendar (read-only)",
        primary: true,
        background_color: null,
        foreground_color: null,
        access_role: "reader",
        time_zone: body.timezone || "UTC",
      }],
    });
  }

  if (body.action === "list" || body.action === "sync_all") {
    const now = new Date();
    const defaultEnd = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const timeMin = body.time_min || now.toISOString();
    const timeMax = body.time_max || defaultEnd.toISOString();
    const max = Math.min(body.max_results || 200, 500);
    const { data, error } = await supabase
      .from("calendar_events")
      .select("event_id, title, start_time, end_time, organizer_email, attendees, location, meeting_url, is_all_day, is_cancelled")
      .eq("user_id", userId)
      .eq("provider", "demo")
      .gte("start_time", timeMin)
      .lte("start_time", timeMax)
      .order("start_time", { ascending: true })
      .limit(max);
    if (error) {
      console.error(`[calendar-events][demo] read error user=${userId}: ${error.message}`);
      return json({ error: error.message, error_code: "demo_read_failed", provider: "demo" }, 500);
    }
    const events = (data || []).filter((e: any) => !e.is_cancelled).map(mapRow);
    if (body.action === "sync_all") {
      return json({
        calendars: [{ id: "primary", summary: "Demo Calendar", primary: true, access_role: "reader", time_zone: body.timezone || "UTC" }],
        events,
        synced_at: new Date().toISOString(),
      });
    }
    return json({ events, next_page_token: null, provider: "demo" });
  }

  if (body.action === "get") {
    if (!body.event_id) return json({ error: "event_id required" }, 400);
    const { data, error } = await supabase
      .from("calendar_events")
      .select("event_id, title, start_time, end_time, organizer_email, attendees, location, meeting_url, is_all_day, is_cancelled")
      .eq("user_id", userId)
      .eq("provider", "demo")
      .eq("event_id", body.event_id)
      .maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!data) return json({ error: "Event not found" }, 404);
    return json({ event: mapRow(data) });
  }

  // create / update / delete / create_calendar — demo inbox is read-only.
  return json({
    error: "Demo calendar is read-only.",
    error_code: "demo_read_only",
    provider: "demo",
  }, 400);
}

async function hasMicrosoftConnection(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("microsoft_tokens")
    .select("user_id, status")
    .eq("user_id", userId)
    .maybeSingle();
  return !!data && data.status !== "disconnected";
}

/**
 * Microsoft fallback for calendar `list`. Reads from the unified
 * `calendar_events` table (populated by `microsoft-sync-calendar`) so users
 * connected only to Outlook still see their events in the canonical calendar.
 */
async function listMicrosoftEvents(
  supabase: any,
  userId: string,
  body: EventsRequest,
): Promise<Response> {
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const timeMin = body.time_min || now.toISOString();
  const timeMax = body.time_max || weekFromNow.toISOString();
  const max = Math.min(body.max_results || 200, 500);
  const { data, error } = await supabase
    .from("calendar_events")
    .select("event_id, title, start_time, end_time, organizer_email, attendees, location, meeting_url, is_all_day, is_cancelled")
    .eq("user_id", userId)
    .eq("provider", "microsoft")
    .gte("start_time", timeMin)
    .lte("start_time", timeMax)
    .order("start_time", { ascending: true })
    .limit(max);
  if (error) {
    console.error(`[calendar-events][microsoft] read error user=${userId}:`, error);
    return new Response(
      JSON.stringify({ error: error.message, error_code: "microsoft_read_failed", provider: "microsoft" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  console.log(`[calendar-events][microsoft] list user=${userId} count=${data?.length ?? 0} window=${timeMin}..${timeMax}`);
  const events = (data || [])
    .filter((e: any) => !e.is_cancelled)
    .map((e: any) => ({
      id: e.event_id,
      calendar_id: "primary",
      title: e.title || "(No title)",
      summary: e.title || "(No title)",
      description: null,
      location: e.location || null,
      start: e.start_time,
      end: e.end_time,
      all_day: !!e.is_all_day,
      status: "confirmed",
      htmlLink: null,
      hangoutLink: e.meeting_url || null,
      attendees: Array.isArray(e.attendees) ? e.attendees : null,
      organizer: e.organizer_email ? { email: e.organizer_email } : null,
      color: null,
      provider: "microsoft",
    }));
  return new Response(
    JSON.stringify({ events, next_page_token: null, provider: "microsoft" }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!NYLAS_API_KEY) {
      return new Response(JSON.stringify({ error: "Nylas not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // getClaims() verifies locally against the JWKS endpoint. That fetch can
    // fail transiently (TLS / connection reset), which previously surfaced to
    // the user as a hard 401 "Invalid token" + blank screen. Retry once, then
    // fall back to the Auth server (getUser) before rejecting the request.
    let userId: string | null = null;
    let lastAuthError = "";
    for (let attempt = 0; attempt < 2 && !userId; attempt += 1) {
      const { data: claimsData, error: authError } = await supabase.auth.getClaims(token);
      if (claimsData?.claims?.sub) {
        userId = claimsData.claims.sub as string;
        break;
      }
      lastAuthError = authError?.message || "no claims";
      if (attempt === 0) await new Promise((r) => setTimeout(r, 250));
    }
    if (!userId) {
      const { data: userData, error: userError } = await supabase.auth.getUser(token);
      if (userData?.user?.id) {
        userId = userData.user.id;
        console.warn("[calendar-events] getClaims failed, used getUser fallback:", lastAuthError);
      } else {
        console.error("[calendar-events] auth error:", lastAuthError, userError?.message || "");
        return new Response(JSON.stringify({ error: "Invalid token" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    const user = { id: userId };

    const body: EventsRequest = await req.json();
    console.log("Calendar events action:", body.action, "for user:", user.id);

    const grantId = await getGrantId(supabase, user.id);
    if (grantId === "demo-seed") {
      return await handleDemoCalendar(supabase, user.id, body);
    }
    if (!grantId) {
      const msConnected = await hasMicrosoftConnection(supabase, user.id);
      console.log(`[calendar-events] no Nylas grant user=${user.id} ms_connected=${msConnected} action=${body.action}`);
      if (msConnected && body.action === "list") {
        return await listMicrosoftEvents(supabase, user.id, body);
      }
      if (msConnected) {
        return new Response(
          JSON.stringify({
            error: `Calendar action '${body.action}' is not supported for Microsoft yet.`,
            error_code: "microsoft_action_unsupported",
            provider: "microsoft",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          error: "Calendar not connected. Connect Google or Microsoft in Integrations.",
          error_code: "calendar_not_connected",
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const headers = nylasHeaders();
    const baseUrl = `${NYLAS_API_URI}/v3/grants/${grantId}`;

    switch (body.action) {
      case "list_calendars": {
        const { response, data } = await fetchWithBackoff(`${baseUrl}/calendars`, { headers }, "list_calendars");

        if (!response.ok) {
          console.error("Nylas calendars error:", data);
          return new Response(JSON.stringify({ error: data.message || "Failed to list calendars" }), {
            status: response.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const calendars = (data.data || []).map((cal: any) => ({
          id: cal.id,
          summary: cal.name || cal.id,
          description: cal.description || null,
          primary: cal.is_primary || false,
          background_color: cal.hex_color || null,
          foreground_color: cal.hex_foreground_color || null,
          access_role: cal.read_only ? "reader" : "owner",
          time_zone: cal.timezone || null,
        }));

        return new Response(JSON.stringify({ calendars }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "list": {
        const calendarId = body.calendar_id || "primary";
        const now = new Date();
        const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const timeMin = body.time_min || now.toISOString();
        const timeMax = body.time_max || weekFromNow.toISOString();
        // Nylas caps page size at 200 — paginate internally to satisfy larger requests.
        const requested = body.max_results || 50;
        const pageLimit = Math.min(requested, 200);

        const startUnix = Math.floor(new Date(timeMin).getTime() / 1000);
        const endUnix = Math.floor(new Date(timeMax).getTime() / 1000);

        const allRaw: any[] = [];
        let nextCursor: string | null = null;
        let rateLimited = false;
        let hardError: { status: number; message: string } | null = null;

        /**
         * Nylas (Google) returns ONLY `default` events unless `event_type` is
         * set explicitly, so out-of-office / focus time / working location
         * blocks silently disappear from the calendar. Fetch each type and
         * merge. Non-default types page independently; only the default page
         * cursor is returned to the caller.
         */
        const fetchType = async (eventType: string | null, budget: number): Promise<any[]> => {
          const collected: any[] = [];
          let cursor: string | null = eventType ? null : (body.page_token || null);
          while (collected.length < budget) {
            const url = new URL(`${baseUrl}/events`);
            url.searchParams.set("calendar_id", calendarId);
            url.searchParams.set("start", String(startUnix));
            url.searchParams.set("end", String(endUnix));
            url.searchParams.set("limit", String(Math.min(pageLimit, budget - collected.length)));
            if (eventType) url.searchParams.set("event_type", eventType);
            if (cursor) url.searchParams.set("page_token", cursor);

            const { response, data } = await fetchWithBackoff(url.toString(), { headers }, `list:${calendarId}:${eventType || "default"}`);

            if (!response.ok) {
              console.error("Nylas events error:", eventType || "default", data);
              if (response.status === 429) { rateLimited = true; break; }
              // Non-default types may be unsupported for non-Google providers —
              // never fail the whole request because of them.
              if (eventType) break;
              hardError = { status: response.status, message: data.message || "Failed to list events" };
              break;
            }

            const batch = data.data || [];
            collected.push(...batch);
            const cur = data.next_cursor || null;
            if (!eventType) nextCursor = cur;
            if (!cur || batch.length === 0) break;
            cursor = cur;
          }
          return collected;
        };

        allRaw.push(...(await fetchType(null, requested)));

        if (!hardError && !rateLimited) {
          const extraTypes = ["outOfOffice", "focusTime", "workingLocation"];
          const extras = await Promise.all(extraTypes.map((t) => fetchType(t, Math.min(pageLimit, 200))));
          for (const list of extras) allRaw.push(...list);
        }

        if (hardError) {
          return new Response(JSON.stringify({ error: hardError.message }), {
            status: hardError.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const seen = new Set<string>();
        const events = allRaw
          .filter((e: any) => {
            const key = e?.id ?? JSON.stringify(e);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .map((e: any) => normalizeNylasEvent(e, calendarId))
          .sort((a, b) => (a.start || "").localeCompare(b.start || ""));

        return new Response(JSON.stringify({
          events,
          ...(rateLimited ? { rate_limited: true, warning: 'calendar_rate_limited' } : {}),
          next_page_token: rateLimited ? null : nextCursor,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "get": {
        if (!body.event_id) {
          return new Response(JSON.stringify({ error: "event_id required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const calendarId = body.calendar_id || "primary";
        const url = new URL(`${baseUrl}/events/${body.event_id}`);
        url.searchParams.set("calendar_id", calendarId);

        const { response, data } = await fetchWithBackoff(url.toString(), { headers }, `get:${body.event_id}`);

        if (!response.ok) {
          return new Response(JSON.stringify({ error: data.message || "Failed to get event" }), {
            status: response.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ event: normalizeNylasEvent(data.data, calendarId) }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "sync_all": {
        // Fetch all calendars
        const { response: calResponse, data: calData } = await fetchWithBackoff(`${baseUrl}/calendars`, { headers }, "sync_all_calendars");

        if (!calResponse.ok) {
          return new Response(JSON.stringify({ error: calData.message || "Failed to list calendars" }), {
            status: calResponse.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const calendars = (calData.data || []).map((cal: any) => ({
          id: cal.id,
          summary: cal.name || cal.id,
          description: cal.description || null,
          primary: cal.is_primary || false,
          background_color: cal.hex_color || null,
          foreground_color: cal.hex_foreground_color || null,
          access_role: cal.read_only ? "reader" : "owner",
          time_zone: cal.timezone || null,
        }));

        const now = new Date();
        const threeMonthsOut = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
        const startUnix = Math.floor(new Date(body.time_min || now.toISOString()).getTime() / 1000);
        const endUnix = Math.floor(new Date(body.time_max || threeMonthsOut.toISOString()).getTime() / 1000);
        const maxResults = body.max_results || 500;

        const allEvents: NormalizedEvent[] = [];
        for (const cal of calendars) {
          const url = new URL(`${baseUrl}/events`);
          url.searchParams.set("calendar_id", cal.id);
          url.searchParams.set("start", String(startUnix));
          url.searchParams.set("end", String(endUnix));
          url.searchParams.set("limit", String(Math.min(maxResults, 200)));

          const { response: evResponse, data: evData } = await fetchWithBackoff(url.toString(), { headers }, `sync_all:${cal.id}`);

          if (evResponse.ok && evData.data) {
            for (const e of evData.data) {
              allEvents.push(normalizeNylasEvent(e, cal.id));
            }
          } else if (evResponse.status === 429) {
            console.warn(`[calendar-events] sync_all rate limited for calendar ${cal.id}`);
          }
        }

        allEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

        return new Response(JSON.stringify({
          calendars,
          events: allEvents,
          synced_at: new Date().toISOString(),
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "create": {
        if (!body.event_data?.summary) {
          return new Response(JSON.stringify({ error: "event_data with summary required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const calendarId = body.calendar_id || "primary";
        const ed = body.event_data;
        const userTz = body.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        const nylasEvent: any = {
          title: ed.summary,
          description: ed.description || undefined,
          location: ed.location || undefined,
        };

        if (ed.all_day) {
          nylasEvent.when = { start_date: ed.start, end_date: ed.end };
        } else {
          nylasEvent.when = {
            start_time: Math.floor(new Date(ed.start).getTime() / 1000),
            end_time: Math.floor(new Date(ed.end).getTime() / 1000),
            start_timezone: userTz,
            end_timezone: userTz,
          };
        }

        // Optional attendees — Nylas auto-emails invites to participants.
        if (Array.isArray(ed.attendees) && ed.attendees.length > 0) {
          nylasEvent.participants = ed.attendees
            .filter((a) => a && a.email)
            .map((a) => ({ email: a.email, name: a.name || undefined }));
        }

        // Optional Google Meet link via Nylas autocreate conferencing.
        if (ed.add_meet_link) {
          nylasEvent.conferencing = {
            provider: "Google Meet",
            autocreate: {},
          };
        }

        const createUrl = new URL(`${baseUrl}/events`);
        createUrl.searchParams.set("calendar_id", calendarId);
        // Ensure invite emails go out to attendees.
        if (Array.isArray(ed.attendees) && ed.attendees.length > 0) {
          createUrl.searchParams.set("notify_participants", "true");
        }

        const createResp = await fetch(createUrl.toString(), {
          method: "POST",
          headers,
          body: JSON.stringify(nylasEvent),
        });
        const createData = await safeUpstreamJson(createResp);

        if (!createResp.ok) {
          console.error("Nylas create event error:", createData);
          return new Response(JSON.stringify({ error: createData.message || "Failed to create event" }), {
            status: createResp.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ event: normalizeNylasEvent(createData.data, calendarId) }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "update": {
        if (!body.event_id || !body.event_data?.summary) {
          return new Response(JSON.stringify({ error: "event_id and event_data required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const calendarId = body.calendar_id || "primary";
        const ed = body.event_data;
        const userTz = body.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        const nylasUpdate: any = {
          title: ed.summary,
          description: ed.description || "",
          location: ed.location || "",
        };

        if (ed.all_day) {
          nylasUpdate.when = { start_date: ed.start, end_date: ed.end };
        } else {
          nylasUpdate.when = {
            start_time: Math.floor(new Date(ed.start).getTime() / 1000),
            end_time: Math.floor(new Date(ed.end).getTime() / 1000),
            start_timezone: userTz,
            end_timezone: userTz,
          };
        }

        const updateUrl = new URL(`${baseUrl}/events/${body.event_id}`);
        updateUrl.searchParams.set("calendar_id", calendarId);

        const updateResp = await fetch(updateUrl.toString(), {
          method: "PUT",
          headers,
          body: JSON.stringify(nylasUpdate),
        });
        const updateData = await safeUpstreamJson(updateResp);

        if (!updateResp.ok) {
          console.error("Nylas update event error:", updateData);
          return new Response(JSON.stringify({ error: updateData.message || "Failed to update event" }), {
            status: updateResp.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ event: normalizeNylasEvent(updateData.data, calendarId) }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "delete": {
        if (!body.event_id) {
          return new Response(JSON.stringify({ error: "event_id required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const calendarId = body.calendar_id || "primary";
        const deleteUrl = new URL(`${baseUrl}/events/${body.event_id}`);
        deleteUrl.searchParams.set("calendar_id", calendarId);

        const deleteResp = await fetch(deleteUrl.toString(), {
          method: "DELETE",
          headers,
        });

        if (!deleteResp.ok) {
          const deleteData = await safeUpstreamJson(deleteResp);
          console.error("Nylas delete event error:", deleteData);
          return new Response(JSON.stringify({ error: deleteData.message || "Failed to delete event" }), {
            status: deleteResp.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "create_calendar": {
        if (!body.calendar_name) {
          return new Response(JSON.stringify({ error: "calendar_name required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const response = await fetch(`${baseUrl}/calendars`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            name: body.calendar_name,
            description: body.calendar_description ?? null,
            timezone: body.timezone ?? null,
          }),
        });
        const data = await safeUpstreamJson(response);
        if (!response.ok) {
          console.error("Nylas create calendar error:", data);
          return new Response(JSON.stringify({ error: data.message || "Failed to create calendar" }), {
            status: response.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({ id: data?.data?.id, name: data?.data?.name }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      default:
        return new Response(JSON.stringify({ error: "Invalid action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

      // (case must precede default — keeping it below for diff locality)
    }
  } catch (error: unknown) {
    console.error("Calendar events error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
