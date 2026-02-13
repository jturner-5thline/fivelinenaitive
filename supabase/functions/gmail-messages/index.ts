import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UNIPILE_API_KEY = Deno.env.get("UNIPILE_API_KEY");
const UNIPILE_DSN = Deno.env.get("UNIPILE_DSN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface MessageRequest {
  action: "list" | "get" | "send" | "mark_read" | "mark_unread" | "star" | "unstar" | "trash" | "delete";
  message_id?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  body?: string;
  body_html?: string;
  max_results?: number;
  page_token?: string;
  query?: string;
}

function getUnipileBaseUrl(): string {
  return UNIPILE_DSN?.startsWith("http") ? UNIPILE_DSN : `https://${UNIPILE_DSN}`;
}

function unipileHeaders() {
  return {
    "X-API-KEY": UNIPILE_API_KEY!,
    "Accept": "application/json",
  };
}

async function getAccountId(supabase: any, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("gmail_tokens")
    .select("account_id, grant_id")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;
  return data.account_id || data.grant_id || null;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!UNIPILE_API_KEY || !UNIPILE_DSN) {
      return new Response(JSON.stringify({ error: "Unipile not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accountId = await getAccountId(supabase, user.id);
    if (!accountId) {
      return new Response(JSON.stringify({ error: "Gmail not connected. Please connect your Gmail account." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const requestData: MessageRequest = await req.json();
    const { action } = requestData;
    console.log(`Unipile messages action: ${action} for user: ${user.id}`);

    const baseUrl = getUnipileBaseUrl();
    const headers = unipileHeaders();

    switch (action) {
      case "list": {
        const { max_results = 20, page_token, query } = requestData;

        const params = new URLSearchParams({
          account_id: accountId,
          limit: String(max_results),
        });
        if (page_token) params.set("cursor", page_token);
        if (query) params.set("q", query);

        const listResponse = await fetch(
          `${baseUrl}/api/v1/emails?${params}`,
          { headers }
        );

        const listData = await listResponse.json();

        if (!listResponse.ok) {
          console.error("Unipile list error:", listData);
          return new Response(JSON.stringify({ error: listData.message || "Failed to list messages" }), {
            status: listResponse.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const items = listData.items || listData.data || listData || [];
        const messages = (Array.isArray(items) ? items : []).map((msg: any) => ({
          id: msg.id,
          thread_id: msg.thread_id || msg.id,
          subject: msg.subject || "",
          from_email: msg.from?.identifier || msg.from?.email || msg.from_attendee?.identifier || "",
          from_name: msg.from?.display_name || msg.from?.name || msg.from_attendee?.display_name || "",
          to_emails: (msg.to || msg.to_attendees || []).map((t: any) => t.identifier || t.email || ""),
          snippet: msg.body_plain?.substring(0, 200) || msg.snippet || "",
          is_read: msg.read !== undefined ? msg.read : !msg.unread,
          is_starred: msg.starred || false,
          labels: msg.folders || msg.labels || [],
          received_at: msg.date || msg.received_at || msg.created_at || null,
        }));

        return new Response(JSON.stringify({
          messages,
          next_page_token: listData.cursor || listData.next_cursor || null,
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "get": {
        const { message_id } = requestData;
        if (!message_id) {
          return new Response(JSON.stringify({ error: "Message ID required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const msgResponse = await fetch(
          `${baseUrl}/api/v1/emails/${message_id}`,
          { headers }
        );

        const msg = await msgResponse.json();

        if (!msgResponse.ok) {
          return new Response(JSON.stringify({ error: msg.message || "Failed to get message" }), {
            status: msgResponse.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const message = {
          id: msg.id,
          thread_id: msg.thread_id || msg.id,
          subject: msg.subject || "",
          from_email: msg.from?.identifier || msg.from?.email || msg.from_attendee?.identifier || "",
          from_name: msg.from?.display_name || msg.from?.name || msg.from_attendee?.display_name || "",
          to_emails: (msg.to || msg.to_attendees || []).map((t: any) => t.identifier || t.email || ""),
          cc_emails: (msg.cc || msg.cc_attendees || []).map((c: any) => c.identifier || c.email || ""),
          snippet: msg.body_plain?.substring(0, 200) || msg.snippet || "",
          body_text: msg.body_plain || msg.body || "",
          body_html: msg.body || msg.body_html || "",
          is_read: msg.read !== undefined ? msg.read : !msg.unread,
          is_starred: msg.starred || false,
          labels: msg.folders || msg.labels || [],
          received_at: msg.date || msg.received_at || msg.created_at || null,
        };

        return new Response(JSON.stringify({ message }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "send": {
        const { to, cc, bcc, subject, body, body_html } = requestData;

        if (!to || to.length === 0 || !subject) {
          return new Response(JSON.stringify({ error: "To and subject are required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Unipile send uses multipart/form-data or JSON
        const sendBody: any = {
          account_id: accountId,
          to: to.map(email => ({ identifier: email, display_name: email })),
          subject,
          body: body_html || body || "",
        };

        if (cc && cc.length > 0) {
          sendBody.cc = cc.map(email => ({ identifier: email, display_name: email }));
        }
        if (bcc && bcc.length > 0) {
          sendBody.bcc = bcc.map(email => ({ identifier: email, display_name: email }));
        }

        const sendResponse = await fetch(
          `${baseUrl}/api/v1/emails`,
          {
            method: "POST",
            headers: {
              ...headers,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(sendBody),
          }
        );

        const sendData = await sendResponse.json();

        if (!sendResponse.ok) {
          console.error("Unipile send error:", sendData);
          return new Response(JSON.stringify({ error: sendData.message || "Failed to send" }), {
            status: sendResponse.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Store sent message
        await supabase
          .from("gmail_sent_messages")
          .insert({
            user_id: user.id,
            gmail_message_id: sendData.id || sendData.message_id || "unknown",
            to_emails: to,
            cc_emails: cc || [],
            bcc_emails: bcc || [],
            subject,
            body_text: body,
            body_html,
            status: "sent",
            sent_at: new Date().toISOString(),
          });

        console.log(`Email sent via Unipile: ${sendData.id}`);
        return new Response(JSON.stringify({ success: true, message_id: sendData.id }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "mark_read":
      case "mark_unread": {
        const { message_id } = requestData;
        if (!message_id) {
          return new Response(JSON.stringify({ error: "Message ID required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const updateResponse = await fetch(
          `${baseUrl}/api/v1/emails/${message_id}`,
          {
            method: "PUT",
            headers: {
              ...headers,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ unread: action === "mark_unread" }),
          }
        );

        if (!updateResponse.ok) {
          const errData = await updateResponse.json();
          return new Response(JSON.stringify({ error: errData.message || "Failed to update" }), {
            status: updateResponse.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        await updateResponse.text();

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "star":
      case "unstar": {
        const { message_id } = requestData;
        if (!message_id) {
          return new Response(JSON.stringify({ error: "Message ID required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const updateResponse = await fetch(
          `${baseUrl}/api/v1/emails/${message_id}`,
          {
            method: "PUT",
            headers: {
              ...headers,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ starred: action === "star" }),
          }
        );

        if (!updateResponse.ok) {
          const errData = await updateResponse.json();
          return new Response(JSON.stringify({ error: errData.message || "Failed to update" }), {
            status: updateResponse.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        await updateResponse.text();

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "trash": {
        const { message_id } = requestData;
        if (!message_id) {
          return new Response(JSON.stringify({ error: "Message ID required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const trashResponse = await fetch(
          `${baseUrl}/api/v1/emails/${message_id}`,
          {
            method: "DELETE",
            headers,
          }
        );

        if (!trashResponse.ok) {
          const errData = await trashResponse.json().catch(() => ({}));
          return new Response(JSON.stringify({ error: errData.message || "Failed to trash" }), {
            status: trashResponse.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "delete": {
        const { message_id } = requestData;
        if (!message_id) {
          return new Response(JSON.stringify({ error: "Message ID required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const deleteResponse = await fetch(
          `${baseUrl}/api/v1/emails/${message_id}`,
          {
            method: "DELETE",
            headers,
          }
        );

        if (!deleteResponse.ok) {
          const errData = await deleteResponse.json().catch(() => ({}));
          return new Response(JSON.stringify({ error: errData.message || "Delete failed" }), {
            status: deleteResponse.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: "Invalid action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (error: any) {
    console.error("Unipile messages error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
