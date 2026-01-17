import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface EventData {
  summary: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  all_day?: boolean;
  attendees?: string[];
}

interface EventsRequest {
  action: "list" | "get" | "list_calendars" | "create" | "update" | "delete";
  calendar_id?: string;
  event_id?: string;
  time_min?: string;
  time_max?: string;
  max_results?: number;
  page_token?: string;
  event_data?: EventData;
}

async function getValidAccessToken(supabase: any, userId: string): Promise<string | null> {
  const { data: tokenRecord, error } = await supabase
    .from("calendar_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .single();

  if (error || !tokenRecord) {
    console.error("No calendar tokens found for user");
    return null;
  }

  const expiresAt = new Date(tokenRecord.expires_at);
  const now = new Date();

  // If token is not expired, return it
  if (expiresAt > now) {
    return tokenRecord.access_token;
  }

  // Token is expired, refresh it
  console.log("Calendar token expired, refreshing...");
  
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

  const newExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

  await supabase
    .from("calendar_tokens")
    .update({
      access_token: tokenData.access_token,
      expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return tokenData.access_token;
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
          console.error("Calendar list error:", data.error);
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
        }));

        return new Response(JSON.stringify({ calendars }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "list": {
        const calendarId = body.calendar_id || "primary";
        const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
        
        // Default to next 7 days if no time range specified
        const now = new Date();
        const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        
        url.searchParams.set("timeMin", body.time_min || now.toISOString());
        url.searchParams.set("timeMax", body.time_max || weekFromNow.toISOString());
        url.searchParams.set("maxResults", String(body.max_results || 50));
        url.searchParams.set("singleEvents", "true");
        url.searchParams.set("orderBy", "startTime");
        
        if (body.page_token) {
          url.searchParams.set("pageToken", body.page_token);
        }

        const response = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        const data = await response.json();

        if (data.error) {
          console.error("Events list error:", data.error);
          return new Response(JSON.stringify({ error: data.error.message }), {
            status: data.error.code || 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const events = (data.items || []).map((event: any) => ({
          id: event.id,
          summary: event.summary || "(No title)",
          description: event.description,
          location: event.location,
          start: event.start?.dateTime || event.start?.date,
          end: event.end?.dateTime || event.end?.date,
          all_day: !event.start?.dateTime,
          status: event.status,
          html_link: event.htmlLink,
          hangout_link: event.hangoutLink,
          conference_data: event.conferenceData,
          attendees: event.attendees?.map((a: any) => ({
            email: a.email,
            display_name: a.displayName,
            response_status: a.responseStatus,
            organizer: a.organizer,
            self: a.self,
          })),
          organizer: event.organizer,
          created: event.created,
          updated: event.updated,
          color_id: event.colorId,
        }));

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
          console.error("Event get error:", event.error);
          return new Response(JSON.stringify({ error: event.error.message }), {
            status: event.error.code || 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({
          event: {
            id: event.id,
            summary: event.summary || "(No title)",
            description: event.description,
            location: event.location,
            start: event.start?.dateTime || event.start?.date,
            end: event.end?.dateTime || event.end?.date,
            all_day: !event.start?.dateTime,
            status: event.status,
            html_link: event.htmlLink,
            hangout_link: event.hangoutLink,
            conference_data: event.conferenceData,
            attendees: event.attendees,
            organizer: event.organizer,
            created: event.created,
            updated: event.updated,
          },
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "create": {
        if (!body.event_data) {
          return new Response(JSON.stringify({ error: "event_data required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const calendarId = body.calendar_id || "primary";
        const eventPayload: any = {
          summary: body.event_data.summary,
          description: body.event_data.description,
          location: body.event_data.location,
        };

        if (body.event_data.all_day) {
          eventPayload.start = { date: body.event_data.start.split('T')[0] };
          eventPayload.end = { date: body.event_data.end.split('T')[0] };
        } else {
          eventPayload.start = { dateTime: body.event_data.start, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
          eventPayload.end = { dateTime: body.event_data.end, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
        }

        if (body.event_data.attendees && body.event_data.attendees.length > 0) {
          eventPayload.attendees = body.event_data.attendees.map(email => ({ email }));
        }

        const createResponse = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(eventPayload),
          }
        );

        const createdEvent = await createResponse.json();

        if (createdEvent.error) {
          console.error("Event create error:", createdEvent.error);
          return new Response(JSON.stringify({ error: createdEvent.error.message }), {
            status: createdEvent.error.code || 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({
          event: {
            id: createdEvent.id,
            summary: createdEvent.summary,
            html_link: createdEvent.htmlLink,
          },
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "update": {
        if (!body.event_id || !body.event_data) {
          return new Response(JSON.stringify({ error: "event_id and event_data required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const calendarId = body.calendar_id || "primary";
        const updatePayload: any = {
          summary: body.event_data.summary,
          description: body.event_data.description,
          location: body.event_data.location,
        };

        if (body.event_data.all_day) {
          updatePayload.start = { date: body.event_data.start.split('T')[0] };
          updatePayload.end = { date: body.event_data.end.split('T')[0] };
        } else {
          updatePayload.start = { dateTime: body.event_data.start, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
          updatePayload.end = { dateTime: body.event_data.end, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
        }

        if (body.event_data.attendees && body.event_data.attendees.length > 0) {
          updatePayload.attendees = body.event_data.attendees.map(email => ({ email }));
        }

        const updateResponse = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(body.event_id)}`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(updatePayload),
          }
        );

        const updatedEvent = await updateResponse.json();

        if (updatedEvent.error) {
          console.error("Event update error:", updatedEvent.error);
          return new Response(JSON.stringify({ error: updatedEvent.error.message }), {
            status: updatedEvent.error.code || 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({
          event: {
            id: updatedEvent.id,
            summary: updatedEvent.summary,
            html_link: updatedEvent.htmlLink,
          },
        }), {
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
        const deleteResponse = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(body.event_id)}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );

        if (!deleteResponse.ok && deleteResponse.status !== 204) {
          const errorData = await deleteResponse.json().catch(() => ({}));
          console.error("Event delete error:", errorData);
          return new Response(JSON.stringify({ error: errorData.error?.message || "Failed to delete event" }), {
            status: deleteResponse.status,
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
