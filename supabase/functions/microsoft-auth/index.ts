import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MICROSOFT_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "User.Read",
  "Mail.Read",
  "Mail.ReadWrite",
  "Mail.Send",
  "Calendars.ReadWrite",
  "Contacts.Read",
].join(" ");

// Default production redirect URI registered in Azure (no query string).
// The callback page distinguishes Microsoft via the `state` parameter (prefix `ms_`).
// The frontend may pass a different `redirect_uri` (e.g. preview/custom domains) that
// must also be registered in the Azure app for OAuth to succeed.
const DEFAULT_REDIRECT_URI = "https://naitive.co/integrations";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const MICROSOFT_CLIENT_ID = Deno.env.get("MICROSOFT_CLIENT_ID");
  const MICROSOFT_CLIENT_SECRET = Deno.env.get("MICROSOFT_CLIENT_SECRET");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const action = body.action as string | undefined;

  if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) {
    if (action === "check_status") {
      return new Response(JSON.stringify({ connected: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({ error: "Microsoft credentials not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    if (action === "get_auth_url") {
      const state = "ms_" + crypto.randomUUID();
      const redirectUri = (body.redirect_uri as string | undefined) || DEFAULT_REDIRECT_URI;
      const authUrl = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
      authUrl.searchParams.set("client_id", MICROSOFT_CLIENT_ID);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("scope", MICROSOFT_SCOPES);
      authUrl.searchParams.set("response_mode", "query");
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("prompt", "select_account");
      return new Response(JSON.stringify({ url: authUrl.toString(), state }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "exchange_code") {
      const { code, user_id, redirect_uri } = body as {
        code?: string;
        user_id?: string;
        redirect_uri?: string;
      };
      if (!code || !user_id) {
        return new Response(JSON.stringify({ error: "code and user_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const redirectUri = redirect_uri || DEFAULT_REDIRECT_URI;

      const tokenResp = await fetch(
        "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: MICROSOFT_CLIENT_ID,
            client_secret: MICROSOFT_CLIENT_SECRET,
            code,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
            scope: MICROSOFT_SCOPES,
          }),
        },
      );
      const tokens = await tokenResp.json();
      if (!tokenResp.ok) {
        console.error("MS token exchange failed:", tokens);
        return new Response(
          JSON.stringify({ error: "Token exchange failed", details: tokens }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const profileResp = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const profile = await profileResp.json();

      const { error: upsertError } = await supabase
        .from("microsoft_tokens")
        .upsert(
          {
            user_id,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token ?? null,
            expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
            email: profile.mail || profile.userPrincipalName,
            display_name: profile.displayName,
            connected_at: new Date().toISOString(),
            scopes: tokens.scope ?? MICROSOFT_SCOPES,
            status: "connected",
            sync_email_enabled: true,
            sync_calendar_enabled: true,
          },
          { onConflict: "user_id" },
        );

      if (upsertError) {
        console.error("Token upsert failed:", upsertError);
        return new Response(JSON.stringify({ error: "Failed to store tokens" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          email: profile.mail || profile.userPrincipalName,
          display_name: profile.displayName,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "check_status") {
      const { user_id } = body as { user_id?: string };
      if (!user_id) {
        return new Response(JSON.stringify({ connected: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data } = await supabase
        .from("microsoft_tokens")
        .select(
          "email, display_name, connected_at, expires_at, status, sync_email_enabled, sync_calendar_enabled, last_email_sync_at, last_calendar_sync_at",
        )
        .eq("user_id", user_id)
        .maybeSingle();

      if (!data || data.status === "disconnected") {
        return new Response(JSON.stringify({ connected: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({
          connected: true,
          email: data.email,
          display_name: data.display_name,
          connected_at: data.connected_at,
          is_expired: new Date(data.expires_at) < new Date(),
          sync_email_enabled: data.sync_email_enabled,
          sync_calendar_enabled: data.sync_calendar_enabled,
          last_email_sync_at: data.last_email_sync_at,
          last_calendar_sync_at: data.last_calendar_sync_at,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "set_sync_toggle") {
      const { user_id, sync_email_enabled, sync_calendar_enabled } = body as {
        user_id?: string;
        sync_email_enabled?: boolean;
        sync_calendar_enabled?: boolean;
      };
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const update: Record<string, unknown> = {};
      if (typeof sync_email_enabled === "boolean") update.sync_email_enabled = sync_email_enabled;
      if (typeof sync_calendar_enabled === "boolean") update.sync_calendar_enabled = sync_calendar_enabled;
      await supabase.from("microsoft_tokens").update(update).eq("user_id", user_id);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "disconnect") {
      const { user_id } = body as { user_id?: string };
      if (user_id) {
        await supabase.from("microsoft_tokens").delete().eq("user_id", user_id);
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "sync_emails" || action === "sync_calendar") {
      const { user_id } = body as { user_id?: string };
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: tokenRow, error: tokenErr } = await supabase
        .from("microsoft_tokens")
        .select("access_token, refresh_token, expires_at")
        .eq("user_id", user_id)
        .maybeSingle();

      if (tokenErr || !tokenRow) {
        return new Response(JSON.stringify({ error: "Microsoft not connected" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let accessToken = tokenRow.access_token as string;
      const expiresAt = tokenRow.expires_at ? new Date(tokenRow.expires_at).getTime() : 0;

      if (expiresAt - Date.now() < 60_000) {
        if (!tokenRow.refresh_token) {
          await supabase
            .from("microsoft_tokens")
            .update({ status: "disconnected" })
            .eq("user_id", user_id);
          return new Response(JSON.stringify({ error: "Token expired, reconnect required" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const refreshResp = await fetch(
          "https://login.microsoftonline.com/common/oauth2/v2.0/token",
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: MICROSOFT_CLIENT_ID,
              client_secret: MICROSOFT_CLIENT_SECRET,
              refresh_token: tokenRow.refresh_token as string,
              grant_type: "refresh_token",
              scope: MICROSOFT_SCOPES,
            }),
          },
        );
        const refreshed = await refreshResp.json();
        if (!refreshResp.ok) {
          console.error("MS token refresh failed:", refreshed);
          await supabase
            .from("microsoft_tokens")
            .update({ status: "disconnected" })
            .eq("user_id", user_id);
          return new Response(JSON.stringify({ error: "Token refresh failed" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        accessToken = refreshed.access_token;
        await supabase
          .from("microsoft_tokens")
          .update({
            access_token: refreshed.access_token,
            refresh_token: refreshed.refresh_token ?? tokenRow.refresh_token,
            expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
            status: "connected",
          })
          .eq("user_id", user_id);
      }

      async function graphFetch(url: string): Promise<Response> {
        let resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (resp.status === 429) {
          const retryAfter = Number(resp.headers.get("Retry-After") ?? "2");
          await new Promise((r) => setTimeout(r, Math.min(retryAfter, 10) * 1000));
          resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
        }
        return resp;
      }

      if (action === "sync_emails") {
        const url =
          "https://graph.microsoft.com/v1.0/me/messages?$select=id,subject,from,toRecipients,receivedDateTime,bodyPreview,isRead,hasAttachments,conversationId&$orderby=receivedDateTime%20desc&$top=50";
        const resp = await graphFetch(url);
        if (!resp.ok) {
          const text = await resp.text();
          console.error("Graph messages fetch failed", resp.status, text);
          return new Response(JSON.stringify({ error: `graph_${resp.status}` }), {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const data = await resp.json();
        const messages: any[] = data.value ?? [];
        const rows = messages.map((m) => ({
          user_id,
          provider: "microsoft",
          message_id: m.id,
          thread_id: m.conversationId ?? null,
          subject: m.subject ?? null,
          from_email: m.from?.emailAddress?.address ?? null,
          from_name: m.from?.emailAddress?.name ?? null,
          to_emails: (m.toRecipients ?? [])
            .map((r: any) => r?.emailAddress?.address)
            .filter(Boolean),
          preview: m.bodyPreview ?? null,
          received_at: m.receivedDateTime ?? null,
          is_read: !!m.isRead,
          has_attachments: !!m.hasAttachments,
        }));
        if (rows.length > 0) {
          const { error } = await supabase
            .from("emails")
            .upsert(rows, { onConflict: "user_id,provider,message_id" });
          if (error) {
            console.error("Email upsert failed", error);
            return new Response(JSON.stringify({ error: error.message }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
        await supabase
          .from("microsoft_tokens")
          .update({ last_email_sync_at: new Date().toISOString() })
          .eq("user_id", user_id);
        return new Response(JSON.stringify({ synced: rows.length }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // sync_calendar
      const startISO = new Date().toISOString();
      const endISO = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const url =
        `https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=${encodeURIComponent(startISO)}&endDateTime=${encodeURIComponent(endISO)}` +
        `&$select=id,subject,start,end,organizer,attendees,location,webLink,isOnlineMeeting,onlineMeeting,isAllDay,isCancelled&$top=100&$orderby=start/dateTime`;
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' },
      });
      let calResp = resp;
      if (calResp.status === 429) {
        const retryAfter = Number(calResp.headers.get("Retry-After") ?? "2");
        await new Promise((r) => setTimeout(r, Math.min(retryAfter, 10) * 1000));
        calResp = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' },
        });
      }
      if (!calResp.ok) {
        const text = await calResp.text();
        console.error("Graph calendar fetch failed", calResp.status, text);
        return new Response(JSON.stringify({ error: `graph_${calResp.status}` }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const calData = await calResp.json();
      const events: any[] = calData.value ?? [];
      const eventRows = events.map((e) => ({
        user_id,
        provider: "microsoft",
        event_id: e.id,
        title: e.subject ?? null,
        start_time: e.start?.dateTime ? new Date(e.start.dateTime + "Z").toISOString() : null,
        end_time: e.end?.dateTime ? new Date(e.end.dateTime + "Z").toISOString() : null,
        organizer_email: e.organizer?.emailAddress?.address ?? null,
        attendees: (e.attendees ?? [])
          .map((a: any) => a?.emailAddress?.address)
          .filter(Boolean),
        location: e.location?.displayName ?? null,
        meeting_url: e.isOnlineMeeting ? (e.onlineMeeting?.joinUrl ?? null) : null,
        is_all_day: !!e.isAllDay,
        is_cancelled: !!e.isCancelled,
      }));
      if (eventRows.length > 0) {
        const CHUNK = 25;
        for (let i = 0; i < eventRows.length; i += CHUNK) {
          const { error } = await supabase
            .from("calendar_events")
            .upsert(eventRows.slice(i, i + CHUNK), { onConflict: "user_id,provider,event_id" });
          if (error) {
            console.error("Calendar upsert failed", error);
            return new Response(JSON.stringify({ error: error.message }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      }
      await supabase
        .from("microsoft_tokens")
        .update({ last_calendar_sync_at: new Date().toISOString() })
        .eq("user_id", user_id);
      return new Response(JSON.stringify({ synced: eventRows.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("microsoft-auth error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});