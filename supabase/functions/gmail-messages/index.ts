import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
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
  label_ids?: string[];
  query?: string;
}

async function getValidAccessToken(supabase: any, userId: string): Promise<string | null> {
  const { data: tokenData, error } = await supabase
    .from("gmail_tokens")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error || !tokenData) {
    console.error("No tokens found for user:", userId);
    return null;
  }

  // Check if token is expired
  const expiresAt = new Date(tokenData.expires_at);
  const now = new Date();

  if (expiresAt <= now) {
    console.log("Token expired, refreshing...");
    
    // Refresh the token
    const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: tokenData.refresh_token,
        client_id: GOOGLE_CLIENT_ID!,
        client_secret: GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
      }),
    });

    const refreshData = await refreshResponse.json();

    if (refreshData.error) {
      console.error("Token refresh failed:", refreshData);
      return null;
    }

    const newExpiresAt = new Date(Date.now() + (refreshData.expires_in * 1000));

    await supabase
      .from("gmail_tokens")
      .update({
        access_token: refreshData.access_token,
        expires_at: newExpiresAt.toISOString(),
      })
      .eq("user_id", userId);

    return refreshData.access_token;
  }

  return tokenData.access_token;
}

function parseEmailHeader(headers: any[], name: string): string {
  const header = headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase());
  return header?.value || "";
}

function parseEmailAddress(address: string): { email: string; name: string } {
  const match = address.match(/^(?:(.+?)\s*)?<([^>]+)>$/);
  if (match) {
    return { name: match[1]?.trim() || "", email: match[2] };
  }
  return { name: "", email: address };
}

function createRawEmail(to: string[], subject: string, body: string, cc?: string[], bcc?: string[]): string {
  const headers = [
    `To: ${to.join(", ")}`,
    `Subject: ${subject}`,
    `Content-Type: text/html; charset=utf-8`,
  ];
  
  if (cc && cc.length > 0) {
    headers.push(`Cc: ${cc.join(", ")}`);
  }
  
  if (bcc && bcc.length > 0) {
    headers.push(`Bcc: ${bcc.join(", ")}`);
  }

  const email = `${headers.join("\r\n")}\r\n\r\n${body}`;
  
  // Base64url encode
  const base64 = btoa(unescape(encodeURIComponent(email)));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const requestData: MessageRequest = await req.json();
    const { action } = requestData;
    console.log(`Gmail messages action: ${action} for user: ${user.id}`);

    const accessToken = await getValidAccessToken(supabase, user.id);
    if (!accessToken) {
      return new Response(JSON.stringify({ error: "Gmail not connected. Please connect your Gmail account." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const gmailHeaders = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };

    switch (action) {
      case "list": {
        const { max_results = 20, page_token, label_ids, query } = requestData;
        
        const params = new URLSearchParams({
          maxResults: String(max_results),
        });
        
        if (page_token) params.set("pageToken", page_token);
        if (label_ids && label_ids.length > 0) {
          label_ids.forEach(id => params.append("labelIds", id));
        }
        if (query) params.set("q", query);

        const listResponse = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
          { headers: gmailHeaders }
        );

        const listData = await listResponse.json();

        if (listData.error) {
          console.error("Gmail list error:", listData);
          return new Response(JSON.stringify({ error: listData.error.message }), {
            status: listData.error.code || 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Fetch details for each message
        const messages = [];
        if (listData.messages) {
          for (const msg of listData.messages.slice(0, max_results)) {
            const msgResponse = await fetch(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
              { headers: gmailHeaders }
            );
            const msgData = await msgResponse.json();
            
            if (!msgData.error) {
              const fromHeader = parseEmailHeader(msgData.payload?.headers || [], "From");
              const { email, name } = parseEmailAddress(fromHeader);
              
              messages.push({
                id: msgData.id,
                thread_id: msgData.threadId,
                subject: parseEmailHeader(msgData.payload?.headers || [], "Subject"),
                from_email: email,
                from_name: name,
                snippet: msgData.snippet,
                is_read: !msgData.labelIds?.includes("UNREAD"),
                is_starred: msgData.labelIds?.includes("STARRED"),
                labels: msgData.labelIds,
                received_at: parseEmailHeader(msgData.payload?.headers || [], "Date"),
              });
            }
          }
        }

        return new Response(JSON.stringify({ 
          messages,
          next_page_token: listData.nextPageToken,
          result_size_estimate: listData.resultSizeEstimate,
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
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message_id}?format=full`,
          { headers: gmailHeaders }
        );

        const msgData = await msgResponse.json();

        if (msgData.error) {
          return new Response(JSON.stringify({ error: msgData.error.message }), {
            status: msgData.error.code || 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Extract body content
        let bodyText = "";
        let bodyHtml = "";

        const getBody = (part: any): void => {
          if (part.mimeType === "text/plain" && part.body?.data) {
            bodyText = atob(part.body.data.replace(/-/g, "+").replace(/_/g, "/"));
          } else if (part.mimeType === "text/html" && part.body?.data) {
            bodyHtml = atob(part.body.data.replace(/-/g, "+").replace(/_/g, "/"));
          }
          if (part.parts) {
            part.parts.forEach(getBody);
          }
        };

        if (msgData.payload) {
          getBody(msgData.payload);
        }

        const fromHeader = parseEmailHeader(msgData.payload?.headers || [], "From");
        const { email, name } = parseEmailAddress(fromHeader);

        const message = {
          id: msgData.id,
          thread_id: msgData.threadId,
          subject: parseEmailHeader(msgData.payload?.headers || [], "Subject"),
          from_email: email,
          from_name: name,
          to_emails: parseEmailHeader(msgData.payload?.headers || [], "To").split(",").map((e: string) => e.trim()),
          cc_emails: parseEmailHeader(msgData.payload?.headers || [], "Cc").split(",").filter(Boolean).map((e: string) => e.trim()),
          snippet: msgData.snippet,
          body_text: bodyText,
          body_html: bodyHtml,
          is_read: !msgData.labelIds?.includes("UNREAD"),
          is_starred: msgData.labelIds?.includes("STARRED"),
          labels: msgData.labelIds,
          received_at: parseEmailHeader(msgData.payload?.headers || [], "Date"),
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

        const rawEmail = createRawEmail(to, subject, body_html || body || "", cc, bcc);

        const sendResponse = await fetch(
          "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
          {
            method: "POST",
            headers: gmailHeaders,
            body: JSON.stringify({ raw: rawEmail }),
          }
        );

        const sendData = await sendResponse.json();

        if (sendData.error) {
          console.error("Gmail send error:", sendData);
          return new Response(JSON.stringify({ error: sendData.error.message }), {
            status: sendData.error.code || 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Store sent message in our database
        await supabase
          .from("gmail_sent_messages")
          .insert({
            user_id: user.id,
            gmail_message_id: sendData.id,
            to_emails: to,
            cc_emails: cc || [],
            bcc_emails: bcc || [],
            subject,
            body_text: body,
            body_html,
            status: "sent",
            sent_at: new Date().toISOString(),
          });

        console.log(`Email sent successfully: ${sendData.id}`);
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

        const modifyBody = action === "mark_read" 
          ? { removeLabelIds: ["UNREAD"] }
          : { addLabelIds: ["UNREAD"] };

        const modifyResponse = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message_id}/modify`,
          {
            method: "POST",
            headers: gmailHeaders,
            body: JSON.stringify(modifyBody),
          }
        );

        const modifyData = await modifyResponse.json();

        if (modifyData.error) {
          return new Response(JSON.stringify({ error: modifyData.error.message }), {
            status: modifyData.error.code || 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

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

        const modifyBody = action === "star" 
          ? { addLabelIds: ["STARRED"] }
          : { removeLabelIds: ["STARRED"] };

        const modifyResponse = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message_id}/modify`,
          {
            method: "POST",
            headers: gmailHeaders,
            body: JSON.stringify(modifyBody),
          }
        );

        const modifyData = await modifyResponse.json();

        if (modifyData.error) {
          return new Response(JSON.stringify({ error: modifyData.error.message }), {
            status: modifyData.error.code || 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

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
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message_id}/trash`,
          {
            method: "POST",
            headers: gmailHeaders,
          }
        );

        const trashData = await trashResponse.json();

        if (trashData.error) {
          return new Response(JSON.stringify({ error: trashData.error.message }), {
            status: trashData.error.code || 500,
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
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message_id}`,
          {
            method: "DELETE",
            headers: gmailHeaders,
          }
        );

        if (!deleteResponse.ok) {
          const errorData = await deleteResponse.json();
          return new Response(JSON.stringify({ error: errorData.error?.message || "Delete failed" }), {
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
    console.error("Gmail messages error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
