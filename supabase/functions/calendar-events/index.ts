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

  return {
    id: event.id,
    calendar_id: calendarId,
    summary: event.title || "(No title)",
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
    color_id: null,
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

    const { data: claimsData, error: authError } = await supabase.auth.getClaims(token);
    if (authError || !claimsData?.claims?.sub) {
      console.error("[calendar-events] auth error:", authError?.message || "no claims");
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = { id: claimsData.claims.sub as string };

    const grantId = await getGrantId(supabase, user.id);
    if (!grantId) {
      return new Response(JSON.stringify({ error: "Calendar not connected. Connect your Google account first." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: EventsRequest = await req.json();
    console.log("Calendar events action:", body.action, "for user:", user.id);

    const headers = nylasHeaders();
    const baseUrl = `${NYLAS_API_URI}/v3/grants/${grantId}`;

    switch (body.action) {
      case "list_calendars": {
        const response = await fetch(`${baseUrl}/calendars`, { headers });
        const data = await response.json();

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
        let cursor: string | null = body.page_token || null;
        let nextCursor: string | null = null;

        while (allRaw.length < requested) {
          const url = new URL(`${baseUrl}/events`);
          url.searchParams.set("calendar_id", calendarId);
          url.searchParams.set("start", String(startUnix));
          url.searchParams.set("end", String(endUnix));
          url.searchParams.set("limit", String(Math.min(pageLimit, requested - allRaw.length)));
          if (cursor) url.searchParams.set("page_token", cursor);

          const response = await fetch(url.toString(), { headers });
          const data = await response.json();

          if (!response.ok) {
            console.error("Nylas events error:", data);
            return new Response(JSON.stringify({ error: data.message || "Failed to list events" }), {
              status: response.status,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          const batch = data.data || [];
          allRaw.push(...batch);
          nextCursor = data.next_cursor || null;
          if (!nextCursor || batch.length === 0) break;
          cursor = nextCursor;
        }

        const events = allRaw.map((e: any) => normalizeNylasEvent(e, calendarId));

        return new Response(JSON.stringify({
          events,
          next_page_token: nextCursor,
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

        const response = await fetch(url.toString(), { headers });
        const data = await response.json();

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
        const calResponse = await fetch(`${baseUrl}/calendars`, { headers });
        const calData = await calResponse.json();

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

          const evResponse = await fetch(url.toString(), { headers });
          const evData = await evResponse.json();

          if (evResponse.ok && evData.data) {
            for (const e of evData.data) {
              allEvents.push(normalizeNylasEvent(e, cal.id));
            }
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
        const createData = await createResp.json();

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
        const updateData = await updateResp.json();

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
          const deleteData = await deleteResp.json();
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
