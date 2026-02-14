import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface EventsRequest {
  action: "list" | "get" | "list_calendars" | "sync_all";
  calendar_id?: string;
  event_id?: string;
  time_min?: string;
  time_max?: string;
  max_results?: number;
  page_token?: string;
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
}

function normalizeEvent(event: any, calendarId: string): NormalizedEvent {
  return {
    id: event.id,
    calendar_id: calendarId,
    summary: event.summary || "(No title)",
    description: event.description || null,
    location: event.location || null,
    start: event.start?.dateTime || event.start?.date,
    end: event.end?.dateTime || event.end?.date,
    all_day: !event.start?.dateTime,
    status: event.status,
    updated: event.updated || null,
    created: event.created || null,
    html_link: event.htmlLink || null,
    hangout_link: event.hangoutLink || null,
    conference_data: event.conferenceData || null,
    attendees: event.attendees?.map((a: any) => ({
      email: a.email,
      display_name: a.displayName || null,
      response_status: a.responseStatus,
      organizer: a.organizer || false,
      self: a.self || false,
    })) || null,
    organizer: event.organizer || null,
    color_id: event.colorId || null,
  };
}

async function getValidAccessToken(supabase: any, userId: string): Promise<string | null> {
  const { data: tokenRecord, error } = await supabase
    .from("calendar_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .single();

  if (error || !tokenRecord) return null;

  if (new Date(tokenRecord.expires_at) > new Date()) {
    return tokenRecord.access_token;
  }

  // Refresh expired token
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: tokenRecord.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  const tokenData = await tokenResponse.json();
  if (tokenData.error) {
    console.error("Token refresh failed:", tokenData);
    return null;
  }

  await supabase
    .from("calendar_tokens")
    .update({
      access_token: tokenData.access_token,
      expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return tokenData.access_token;
}

async function fetchAllEvents(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string,
  maxResults: number
): Promise<NormalizedEvent[]> {
  const allEvents: NormalizedEvent[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("maxResults", String(Math.min(maxResults, 2500)));
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await response.json();

    if (data.error) {
      console.error(`Events fetch error for ${calendarId}:`, data.error);
      break;
    }

    for (const item of data.items || []) {
      allEvents.push(normalizeEvent(item, calendarId));
    }

    pageToken = data.nextPageToken;
  } while (pageToken && allEvents.length < maxResults);

  return allEvents;
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

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await getValidAccessToken(supabase, user.id);
    if (!accessToken) {
      return new Response(JSON.stringify({ error: "Calendar not connected or token refresh failed" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: EventsRequest = await req.json();
    console.log("Calendar events action:", body.action, "for user:", user.id);

    switch (body.action) {
      case "list_calendars": {
        const response = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await response.json();

        if (data.error) {
          return new Response(JSON.stringify({ error: data.error.message }), {
            status: data.error.code || 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const calendars = (data.items || []).map((cal: any) => ({
          id: cal.id,
          summary: cal.summary,
          description: cal.description,
          primary: cal.primary || false,
          background_color: cal.backgroundColor,
          foreground_color: cal.foregroundColor,
          access_role: cal.accessRole,
          time_zone: cal.timeZone,
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
        const maxResults = body.max_results || 50;

        const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
        url.searchParams.set("timeMin", timeMin);
        url.searchParams.set("timeMax", timeMax);
        url.searchParams.set("maxResults", String(maxResults));
        url.searchParams.set("singleEvents", "true");
        url.searchParams.set("orderBy", "startTime");
        if (body.page_token) url.searchParams.set("pageToken", body.page_token);

        const response = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await response.json();

        if (data.error) {
          return new Response(JSON.stringify({ error: data.error.message }), {
            status: data.error.code || 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const events = (data.items || []).map((e: any) => normalizeEvent(e, calendarId));

        return new Response(JSON.stringify({
          events,
          next_page_token: data.nextPageToken,
          time_zone: data.timeZone,
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
        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(body.event_id)}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const event = await response.json();

        if (event.error) {
          return new Response(JSON.stringify({ error: event.error.message }), {
            status: event.error.code || 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ event: normalizeEvent(event, calendarId) }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "sync_all": {
        // Fetch all calendars, then all events from each
        const calResponse = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const calData = await calResponse.json();

        if (calData.error) {
          return new Response(JSON.stringify({ error: calData.error.message }), {
            status: calData.error.code || 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const calendars = (calData.items || []).map((cal: any) => ({
          id: cal.id,
          summary: cal.summary,
          description: cal.description,
          primary: cal.primary || false,
          background_color: cal.backgroundColor,
          foreground_color: cal.foregroundColor,
          access_role: cal.accessRole,
          time_zone: cal.timeZone,
        }));

        const now = new Date();
        const threeMonthsOut = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
        const timeMin = body.time_min || now.toISOString();
        const timeMax = body.time_max || threeMonthsOut.toISOString();
        const maxResults = body.max_results || 500;

        const allEvents: NormalizedEvent[] = [];
        for (const cal of calendars) {
          const events = await fetchAllEvents(accessToken, cal.id, timeMin, timeMax, maxResults);
          allEvents.push(...events);
        }

        // Sort all events by start time
        allEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

        return new Response(JSON.stringify({
          calendars,
          events: allEvents,
          synced_at: new Date().toISOString(),
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: "Invalid action. Allowed: list, get, list_calendars, sync_all" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
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
