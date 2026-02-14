import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NYLAS_API_KEY = Deno.env.get("NYLAS_API_KEY");
const NYLAS_API_URI = "https://api.us.nylas.com";
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

function nylasHeaders() {
  return {
    "Authorization": `Bearer ${NYLAS_API_KEY}`,
    "Accept": "application/json",
    "Content-Type": "application/json",
  };
}

async function getGrantId(supabase: any, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("gmail_tokens")
    .select("grant_id, account_id")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;
  return data.grant_id || data.account_id || null;
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

    if (!NYLAS_API_KEY) {
      return new Response(JSON.stringify({ error: "Nylas not configured" }), {
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

    const grantId = await getGrantId(supabase, user.id);
    if (!grantId) {
      return new Response(JSON.stringify({ error: "Gmail not connected. Please connect your Gmail account." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const requestData: MessageRequest = await req.json();
    const { action } = requestData;
    console.log(`Nylas messages action: ${action} for user: ${user.id}`);

    const headers = nylasHeaders();
    const baseUrl = `${NYLAS_API_URI}/v3/grants/${grantId}`;

    switch (action) {
      case "list": {
        const { max_results = 20, page_token, query } = requestData;

        const params = new URLSearchParams({
          limit: String(max_results),
        });
        if (page_token) params.set("page_token", page_token);
        if (query) params.set("search_query_native", query);

        const listResponse = await fetch(
          `${baseUrl}/messages?${params}`,
          { headers }
        );

        const listData = await listResponse.json();

        if (!listResponse.ok) {
          console.error("Nylas list error:", listData);
          return new Response(JSON.stringify({ error: listData.message || "Failed to list messages" }), {
            status: listResponse.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const items = listData.data || [];
        const messages = items.map((msg: any) => ({
          id: msg.id,
          thread_id: msg.thread_id || msg.id,
          subject: msg.subject || "",
          from_email: msg.from?.[0]?.email || "",
          from_name: msg.from?.[0]?.name || "",
          to_emails: (msg.to || []).map((t: any) => t.email || ""),
          snippet: msg.snippet || "",
          is_read: !msg.unread,
          is_starred: msg.starred || false,
          labels: msg.folders || msg.labels || [],
          received_at: msg.date ? new Date(msg.date * 1000).toISOString() : null,
        }));

        return new Response(JSON.stringify({
          messages,
          next_page_token: listData.next_cursor || null,
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
          `${baseUrl}/messages/${message_id}`,
          { headers }
        );

        const msgData = await msgResponse.json();

        if (!msgResponse.ok) {
          return new Response(JSON.stringify({ error: msgData.message || "Failed to get message" }), {
            status: msgResponse.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const msg = msgData.data || msgData;
        const message = {
          id: msg.id,
          thread_id: msg.thread_id || msg.id,
          subject: msg.subject || "",
          from_email: msg.from?.[0]?.email || "",
          from_name: msg.from?.[0]?.name || "",
          to_emails: (msg.to || []).map((t: any) => t.email || ""),
          cc_emails: (msg.cc || []).map((c: any) => c.email || ""),
          snippet: msg.snippet || "",
          body_text: msg.body || "",
          body_html: msg.body || "",
          is_read: !msg.unread,
          is_starred: msg.starred || false,
          labels: msg.folders || msg.labels || [],
          received_at: msg.date ? new Date(msg.date * 1000).toISOString() : null,
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

        const sendBody: any = {
          to: to.map(email => ({ email, name: email })),
          subject,
          body: body_html || body || "",
        };

        if (cc && cc.length > 0) {
          sendBody.cc = cc.map(email => ({ email, name: email }));
        }
        if (bcc && bcc.length > 0) {
          sendBody.bcc = bcc.map(email => ({ email, name: email }));
        }

        const sendResponse = await fetch(
          `${baseUrl}/messages/send`,
          {
            method: "POST",
            headers,
            body: JSON.stringify(sendBody),
          }
        );

        const sendData = await sendResponse.json();

        if (!sendResponse.ok) {
          console.error("Nylas send error:", sendData);
          return new Response(JSON.stringify({ error: sendData.message || "Failed to send" }), {
            status: sendResponse.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const sentMsg = sendData.data || sendData;

        // Store sent message
        await supabase
          .from("gmail_sent_messages")
          .insert({
            user_id: user.id,
            gmail_message_id: sentMsg.id || "unknown",
            to_emails: to,
            cc_emails: cc || [],
            bcc_emails: bcc || [],
            subject,
            body_text: body,
            body_html,
            status: "sent",
            sent_at: new Date().toISOString(),
          });

        console.log(`Email sent via Nylas: ${sentMsg.id}`);
        return new Response(JSON.stringify({ success: true, message_id: sentMsg.id }), {
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
          `${baseUrl}/messages/${message_id}`,
          {
            method: "PUT",
            headers,
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
          `${baseUrl}/messages/${message_id}`,
          {
            method: "PUT",
            headers,
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

        // Nylas v3: Move to trash by updating folders
        const trashResponse = await fetch(
          `${baseUrl}/messages/${message_id}`,
          {
            method: "PUT",
            headers,
            body: JSON.stringify({ folders: ["TRASH"] }),
          }
        );

        if (!trashResponse.ok) {
          const errData = await trashResponse.json().catch(() => ({}));
          return new Response(JSON.stringify({ error: errData.message || "Failed to trash" }), {
            status: trashResponse.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        await trashResponse.text();

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
          `${baseUrl}/messages/${message_id}`,
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
    console.error("Nylas messages error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
