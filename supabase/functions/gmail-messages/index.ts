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

/**
 * Normalize a failed Nylas response into a JSON error the client can reason about.
 * - Safely reads the body even if it's not JSON (e.g. an HTML 503 page).
 * - Maps transient upstream errors (429 rate-limit, 502/503/504) to a 503 with
 *   `retryable: true` so the client doesn't surface them as hard 4xx failures.
 */
async function forwardNylasError(resp: Response, fallbackMessage: string): Promise<Response> {
  const upstreamStatus = resp.status;
  let providerMessage: string | undefined;
  try {
    const ct = resp.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const j = await resp.json();
      providerMessage = j?.error?.message || j?.message || j?.error?.provider_error?.error?.message;
    } else {
      const t = await resp.text();
      providerMessage = t?.slice(0, 200);
    }
  } catch {
    /* body already consumed or invalid — ignore */
  }

  const isTransient = upstreamStatus === 429 || (upstreamStatus >= 500 && upstreamStatus <= 599);
  const retryAfter = resp.headers.get("retry-after");
  const status = isTransient ? 503 : upstreamStatus;
  const body = {
    error: providerMessage || fallbackMessage,
    upstream_status: upstreamStatus,
    retryable: isTransient,
    ...(retryAfter ? { retry_after: retryAfter } : {}),
  };
  console.error(`[gmail-messages] upstream error ${upstreamStatus}: ${body.error}`);
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...(retryAfter ? { "Retry-After": retryAfter } : {}),
    },
  });
}

interface MessageRequest {
  action: "list" | "get" | "get_thread" | "send" | "save_draft" | "mark_read" | "mark_unread" | "star" | "unstar" | "archive" | "move" | "trash" | "delete" | "sync_state" | "get_attachment";
  message_id?: string;
  thread_id?: string;
  message_ids?: string[];
  folder?: "inbox" | "archive" | "spam" | "trash" | "drafts";
  attachment_id?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  body?: string;
  body_html?: string;
  max_results?: number;
  page_token?: string;
  query?: string;
  /**
   * Outbound attachments. Each entry must include base64-encoded `content`
   * (no data: URI prefix). The total payload (after base64 expansion) is
   * capped at ~25MB by the client.
   */
  attachments?: Array<{
    filename: string;
    content_type?: string;
    content: string;
    size?: number;
    is_inline?: boolean;
    content_id?: string;
  }>;
  /** When set, include In-Reply-To/References threading via Nylas reply_to_message_id. */
  reply_to_message_id?: string;
  /**
   * Manual / user-initiated refresh. When true, the upstream Nylas URL
   * receives a per-request cachebuster so no intermediary (CDN, SW,
   * Cloudflare) can serve a stale list response. Has no effect on the
   * provider's own freshness — Nylas is already authoritative.
   */
  force_refresh?: boolean;
}

// Normalize Nylas attachment objects to a consistent shape.
// `content_id` is preserved so the client can resolve `cid:` references in
// HTML bodies (signature logos, embedded headshots, etc.).
function normalizeAttachments(raw: any[]): Array<{
  id: string;
  filename: string;
  content_type: string;
  size: number;
  is_inline: boolean;
  content_id?: string;
}> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a: any) => a && (a.id || a.filename))
    .map((a: any) => {
      // Nylas exposes content_id as either `content_id` or `contentId`. Strip
      // angle brackets that some providers wrap around the value.
      const rawCid = a.content_id || a.contentId || "";
      const cid = typeof rawCid === "string" ? rawCid.replace(/^<|>$/g, "") : "";
      // IMPORTANT: A bare `content_id` does NOT make a part inline. Many real
      // attachments (PDFs, decks, docs) carry a Content-ID even when their
      // disposition is `attachment`. Treat as inline only when the source
      // explicitly says so via `is_inline` or `content_disposition === "inline"`.
      const dispo = String(a.content_disposition || a.contentDisposition || "").toLowerCase();
      return {
        id: String(a.id || ""),
        filename: a.filename || a.name || "attachment",
        content_type: a.content_type || a.contentType || "application/octet-stream",
        size: Number(a.size || 0),
        is_inline: a.is_inline === true || dispo === "inline",
        content_id: cid || undefined,
      };
    });
}

function flattenMessageParts(part: any): any[] {
  if (!part || typeof part !== "object") return [];
  const children = Array.isArray(part.parts)
    ? part.parts.flatMap((child: any) => flattenMessageParts(child))
    : [];
  return [part, ...children];
}

function extractAttachmentsFromParts(msg: any): Array<{
  id: string;
  filename: string;
  content_type: string;
  size: number;
  is_inline: boolean;
  content_id?: string;
}> {
  const roots = [msg?.payload, msg?.message_payload, msg?.mime, msg?.body].filter(Boolean);
  if (roots.length === 0) return [];

  const seen = new Set<string>();
  const extracted: Array<{
    id: string;
    filename: string;
    content_type: string;
    size: number;
    is_inline: boolean;
    content_id?: string;
  }> = [];

  for (const root of roots) {
    const parts = flattenMessageParts(root);
    for (const part of parts) {
      const body = part?.body || {};
      const attachmentId =
        body?.attachmentId || body?.attachment_id || part?.attachment_id || part?.attachmentId || part?.id || "";
      const filename = part?.filename || part?.name || body?.filename || "";
      const contentType = part?.mimeType || part?.mime_type || part?.content_type || "application/octet-stream";
      const disposition =
        part?.contentDisposition || part?.content_disposition || body?.contentDisposition || body?.content_disposition || "";
      const rawCid = part?.contentId || part?.content_id || body?.contentId || body?.content_id || "";
      const cid = typeof rawCid === "string" ? rawCid.replace(/^<|>$/g, "") : "";
      // A Content-ID alone does NOT mean a MIME part is inline. Real
      // attachments (PDFs forwarded along threads, decks, etc.) often carry
      // a Content-ID. Treat as inline ONLY when the disposition header
      // explicitly says so. Otherwise it's a user-visible attachment that
      // we additionally keep `content_id` on so the body renderer can still
      // resolve `cid:` references against it when needed.
      const isInline = String(disposition).toLowerCase() === "inline";
      const size = Number(body?.size || part?.size || 0);
      const isRealAttachment = !!attachmentId && !!filename;

      if (!isRealAttachment) continue;

      const key = `${attachmentId}::${filename}::${contentType}`;
      if (seen.has(key)) continue;
      seen.add(key);

      extracted.push({
        id: String(attachmentId),
        filename,
        content_type: contentType,
        size,
        is_inline: isInline,
        content_id: cid || undefined,
      });
    }
  }

  return extracted;
}

function mergeAndNormalizeAttachments(msg: any) {
  const normalized = normalizeAttachments(msg.attachments || msg.files || []);
  const fromParts = extractAttachmentsFromParts(msg);
  const merged = [...normalized];
  const seen = new Set(merged.map((att) => `${att.id}::${att.filename}::${att.content_type}`));

  for (const att of fromParts) {
    const key = `${att.id}::${att.filename}::${att.content_type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(att);
  }

  return merged;
}

async function fetchThreadMessagesFallback(baseUrl: string, headers: Record<string, string>, threadId: string) {
  const attempts = [
    `${baseUrl}/messages?limit=100&thread_id=${encodeURIComponent(threadId)}`,
    `${baseUrl}/messages?limit=100&threadId=${encodeURIComponent(threadId)}`,
  ];

  for (const url of attempts) {
    const response = await fetch(url, { headers });
    const data = await response.json();
    if (!response.ok) continue;

    const messages = Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.messages)
        ? data.messages
        : [];

    if (messages.length > 0) {
      return messages;
    }
  }

  return [];
}

function pickBodyHtmlAndText(msg: any): { body_html: string; body_text: string } {
  // Nylas v3 returns a single `body` field that is usually HTML when available.
  // Be defensive: accept several shapes.
  const rawBody = typeof msg.body === "string" ? msg.body : "";
  const looksHtml = /<\w+[\s\S]*>/.test(rawBody);
  const html = msg.body_html || (looksHtml ? rawBody : "") || "";
  const text = msg.body_text || msg.plain_body || (!looksHtml ? rawBody : "") || "";
  return { body_html: html, body_text: text };
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

async function hasMicrosoftConnection(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("microsoft_tokens")
    .select("user_id, status")
    .eq("user_id", userId)
    .maybeSingle();
  return !!data && data.status !== "disconnected";
}

/**
 * Microsoft fallback for the `list` and `get` actions. Reads from the unified
 * `emails` table (populated by `microsoft-sync-emails`) so users connected to
 * Outlook (and not Nylas/Gmail) still get inbox + message body responses with
 * the same shape the UI already consumes.
 */
async function handleMicrosoftAction(
  supabase: any,
  userId: string,
  requestData: MessageRequest,
): Promise<Response | null> {
  const action = requestData.action;
  if (action === "list") {
    const max = Math.min((requestData as any).max_results || 50, 200);
    const labelIds = (requestData as any).label_ids as string[] | undefined;
    const explicit = labelIds?.[0]?.toUpperCase();
    // Only INBOX-style lists are supported today (Microsoft sync covers inbox).
    if (explicit && explicit !== "INBOX") {
      console.log(`[gmail-messages][microsoft] unsupported folder=${explicit} for user=${userId}; returning []`);
      return new Response(
        JSON.stringify({ messages: [], next_page_token: null, provider: "microsoft" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { data, error } = await supabase
      .from("emails")
      .select("message_id, thread_id, subject, from_email, from_name, to_emails, preview, received_at, is_read, has_attachments")
      .eq("user_id", userId)
      .eq("provider", "microsoft")
      .order("received_at", { ascending: false })
      .limit(max);
    if (error) {
      console.error(`[gmail-messages][microsoft] list error user=${userId}:`, error);
      return new Response(
        JSON.stringify({ error: error.message, error_code: "microsoft_read_failed", provider: "microsoft" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    console.log(`[gmail-messages][microsoft] list user=${userId} count=${data?.length ?? 0}`);
    const messages = (data || []).map((m: any) => ({
      id: m.message_id,
      thread_id: m.thread_id,
      subject: m.subject,
      from_email: m.from_email,
      from_name: m.from_name,
      to_emails: m.to_emails ?? [],
      snippet: m.preview ?? "",
      received_at: m.received_at,
      is_read: !!m.is_read,
      is_starred: false,
      labels: ["INBOX"],
      has_attachments: !!m.has_attachments,
      provider: "microsoft",
    }));
    return new Response(
      JSON.stringify({ messages, next_page_token: null, provider: "microsoft" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  if (action === "get") {
    const messageId = (requestData as any).message_id as string | undefined;
    if (!messageId) {
      return new Response(JSON.stringify({ error: "message_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data, error } = await supabase
      .from("emails")
      .select("message_id, thread_id, subject, from_email, from_name, to_emails, preview, received_at, is_read, has_attachments, raw")
      .eq("user_id", userId)
      .eq("provider", "microsoft")
      .eq("message_id", messageId)
      .maybeSingle();
    if (error || !data) {
      console.error(`[gmail-messages][microsoft] get error user=${userId} msg=${messageId}:`, error);
      return new Response(
        JSON.stringify({ error: error?.message || "Message not found", error_code: "microsoft_read_failed", provider: "microsoft" }),
        { status: error ? 500 : 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const raw = (data.raw as any) || {};
    const bodyHtml = raw?.body?.contentType === "html"
      ? raw?.body?.content
      : raw?.body?.content || "";
    return new Response(
      JSON.stringify({
        message: {
          id: data.message_id,
          thread_id: data.thread_id,
          subject: data.subject,
          from_email: data.from_email,
          from_name: data.from_name,
          to_emails: data.to_emails ?? [],
          snippet: data.preview ?? "",
          body_text: raw?.body?.contentType === "text" ? raw?.body?.content : "",
          body_html: bodyHtml,
          is_read: !!data.is_read,
          is_starred: false,
          labels: ["INBOX"],
          received_at: data.received_at,
          has_attachments: !!data.has_attachments,
          provider: "microsoft",
        },
        provider: "microsoft",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  // Write actions (send/mark/star/move/trash/archive) not yet supported on
  // Microsoft path — surface a structured error the UI can act on.
  console.log(`[gmail-messages][microsoft] unsupported action=${action} user=${userId}`);
  return new Response(
    JSON.stringify({
      error: `Action '${action}' is not yet supported for Microsoft mail.`,
      error_code: "microsoft_action_unsupported",
      provider: "microsoft",
    }),
    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
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
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);

    if (claimsError || !claimsData?.claims?.sub) {
      console.error("[gmail-messages] auth error:", claimsError?.message || "no claims");
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;
    const user = { id: userId } as { id: string };

    const requestData: MessageRequest = await req.json();
    const { action } = requestData;

    const grantId = await getGrantId(supabase, user.id);
    if (!grantId) {
      const msConnected = await hasMicrosoftConnection(supabase, user.id);
      console.log(`[gmail-messages] no Nylas grant for user=${user.id} ms_connected=${msConnected} action=${action}`);
      if (msConnected) {
        return await handleMicrosoftAction(supabase, user.id, requestData);
      }
      return new Response(
        JSON.stringify({
          error: "Mail not connected. Please connect Gmail or Microsoft in Integrations.",
          error_code: "mail_not_connected",
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    console.log(`Nylas messages action: ${action} for user: ${user.id}`);

    const headers = nylasHeaders();
    const baseUrl = `${NYLAS_API_URI}/v3/grants/${grantId}`;

    switch (action) {
      case "list": {
        const { max_results = 20, page_token, query } = requestData;
        const labelIds = (requestData as any).label_ids as string[] | undefined;
        // When the caller explicitly passes `search_all_mail: true`, OR is
        // running a free-text search WITHOUT specifying a folder, we drop
        // the default INBOX restriction so the query matches archived mail
        // and any user labels (Censys, Lenders, etc.) — same behavior as
        // typing the query into the Gmail search bar.
        const searchAllMail = (requestData as any).search_all_mail === true;

        const params = new URLSearchParams({
          limit: String(max_results),
        });
        if (page_token) params.set("page_token", page_token);
        if (query) params.set("search_query_native", query);
        // Cachebuster for manual refresh — only on the first page so
        // pagination tokens stay deterministic.
        if ((requestData as any).force_refresh && !page_token) {
          params.set("_cb", String(Date.now()));
        }

        // Folder/label filter:
        //   • If caller supplied an explicit label_ids[0], honor it.
        //   • Else if caller asked to search across all mail (search), omit
        //     `in=` entirely so Gmail returns matches from every label
        //     (including archived mail and user labels).
        //   • Otherwise default to INBOX so the inbox view stays clean
        //     (no spam/trash/sent).
        const explicitFolder = labelIds?.[0];
        if (explicitFolder) {
          params.set("in", explicitFolder);
        } else if (!searchAllMail) {
          params.set("in", "INBOX");
        }

        // Hard 25s timeout: Nylas occasionally hangs for very large mailboxes
        // and the function would otherwise hit the platform 60s limit and
        // surface as an HTTP 504 in the email AI sidebar. Returning a 200
        // with `partial: true` lets the client render its in-memory cache
        // and show a "Loading more emails…" hint instead of crashing.
        let listResponse: Response;
        try {
          listResponse = await Promise.race([
            fetch(`${baseUrl}/messages?${params}`, { headers }),
            new Promise<Response>((_, reject) =>
              setTimeout(() => reject(new Error("timeout")), 25_000)
            ),
          ]);
        } catch (err) {
          const isTimeout = (err as Error)?.message === "timeout";
          console.warn(`[gmail-messages] list ${isTimeout ? "timeout" : "error"}: ${(err as Error)?.message}`);
          return new Response(JSON.stringify({
            messages: [],
            next_page_token: null,
            error: isTimeout ? "timeout" : "fetch_failed",
            partial: true,
            fallback: true,
          }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (!listResponse.ok) {
          const isRateLimit = listResponse.status === 429;
          const isServerError = listResponse.status >= 500;
          // Drain body safely (Nylas may return HTML on 5xx)
          await listResponse.text().catch(() => "");
          if (isRateLimit || isServerError) {
            return new Response(JSON.stringify({
              error: isRateLimit ? "RATE_LIMITED" : "SERVICE_UNAVAILABLE",
              fallback: true,
              messages: [],
              next_page_token: null,
            }), {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          return forwardNylasError(listResponse, "Failed to list messages");
        }
        const listData = await listResponse.json();

        const items = listData.data || [];
        const messages = items.map((msg: any) => {
          const atts = mergeAndNormalizeAttachments(msg);
          const visibleAtts = atts.filter((a) => !a.is_inline);
          return {
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
            has_attachments: visibleAtts.length > 0,
            attachment_count: visibleAtts.length,
          };
        });

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

        if (!msgResponse.ok) {
          // 404 = message no longer exists in mailbox (deleted, moved, or stale ID).
          // Return a soft null so the client can skip it rather than treating it as a runtime error.
          if (msgResponse.status === 404) {
            await msgResponse.text().catch(() => "");
            return new Response(JSON.stringify({ message: null, not_found: true }), {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          return forwardNylasError(msgResponse, "Failed to get message");
        }
        const msgData = await msgResponse.json();

        const msg = msgData.data || msgData;
        const { body_html, body_text } = pickBodyHtmlAndText(msg);
        const allAtts = mergeAndNormalizeAttachments(msg);
        const visibleAtts = allAtts.filter((a) => !a.is_inline);
        // Inline attachments power CID resolution for embedded images
        // (signature logos, headshots). Surfaced separately so the client
        // can rewrite `cid:` references without showing them as files.
        const inlineAtts = allAtts.filter((a) => a.is_inline);
        console.log("[gmail-messages:get] attachment-debug", JSON.stringify({
          message_id: msg.id,
          thread_id: msg.thread_id || msg.id,
          has_attachments: visibleAtts.length > 0,
          parsed_filenames: visibleAtts.map((a) => a.filename),
          attachment_ids: visibleAtts.map((a) => a.id),
          inline_filenames: inlineAtts.map((a) => a.filename),
        }));
        const message = {
          id: msg.id,
          thread_id: msg.thread_id || msg.id,
          subject: msg.subject || "",
          from_email: msg.from?.[0]?.email || "",
          from_name: msg.from?.[0]?.name || "",
          to_emails: (msg.to || []).map((t: any) => t.email || ""),
          cc_emails: (msg.cc || []).map((c: any) => c.email || ""),
          snippet: msg.snippet || "",
          body_text,
          body_html,
          is_read: !msg.unread,
          is_starred: msg.starred || false,
          labels: msg.folders || msg.labels || [],
          received_at: msg.date ? new Date(msg.date * 1000).toISOString() : null,
          attachments: visibleAtts,
          inline_attachments: inlineAtts,
          has_attachments: visibleAtts.length > 0,
        };

        return new Response(JSON.stringify({ message }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "get_thread": {
        const { thread_id } = requestData;
        if (!thread_id) {
          return new Response(JSON.stringify({ error: "Thread ID required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const threadResponse = await fetch(
          `${baseUrl}/threads/${thread_id}`,
          { headers }
        );

        if (!threadResponse.ok) {
          // 404 = thread no longer exists upstream (deleted, archived, or
          // stale provider id from a cached/mock record). Return an empty
          // thread instead of bubbling a hard error so callers (summarize,
          // detail view) can fall back to whatever they already have.
          if (threadResponse.status === 404) {
            await threadResponse.text().catch(() => {});
            return new Response(
              JSON.stringify({ thread: { id: thread_id, messages: [] }, not_found: true }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
          return forwardNylasError(threadResponse, "Failed to get thread");
        }
        const threadData = await threadResponse.json();

        const rawThread = threadData.data || threadData;
        let rawMessages = Array.isArray(rawThread?.messages)
          ? rawThread.messages
          : Array.isArray(rawThread?.data)
            ? rawThread.data
            : [];

        if (rawMessages.length === 0) {
          rawMessages = await fetchThreadMessagesFallback(baseUrl, headers, thread_id);
          console.log("[gmail-messages:get_thread] fallback-list", JSON.stringify({
            thread_id,
            fallback_message_count: rawMessages.length,
          }));
        }

        const messages = rawMessages.map((msg: any) => {
          const { body_html, body_text } = pickBodyHtmlAndText(msg);
          const allAtts = mergeAndNormalizeAttachments(msg);
          const visibleAtts = allAtts.filter((a) => !a.is_inline);
          const inlineAtts = allAtts.filter((a) => a.is_inline);
          console.log("[gmail-messages:get_thread] attachment-debug", JSON.stringify({
            message_id: msg.id,
            thread_id: msg.thread_id || thread_id,
            has_attachments: visibleAtts.length > 0,
            parsed_filenames: visibleAtts.map((a) => a.filename),
            attachment_ids: visibleAtts.map((a) => a.id),
          }));
          return {
            id: msg.id,
            thread_id: msg.thread_id || thread_id,
            subject: msg.subject || "",
            from_email: msg.from?.[0]?.email || "",
            from_name: msg.from?.[0]?.name || "",
            to_emails: (msg.to || []).map((t: any) => t.email || ""),
            cc_emails: (msg.cc || []).map((c: any) => c.email || ""),
            snippet: msg.snippet || "",
            body_text,
            body_html,
            is_read: !msg.unread,
            is_starred: msg.starred || false,
            labels: msg.folders || msg.labels || [],
            received_at: msg.date ? new Date(msg.date * 1000).toISOString() : null,
            attachments: visibleAtts,
            inline_attachments: inlineAtts,
            has_attachments: visibleAtts.length > 0,
          };
        });

        return new Response(JSON.stringify({ thread: { id: thread_id, messages } }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "send": {
        const { to, cc, bcc, subject, body, body_html, attachments, reply_to_message_id, deal_id, thread_id: hintThreadId } = requestData;

        // Defensive recipient normalization — Nylas v3 rejects comma-joined
        // strings (e.g. "a@x.co, b@x.co"). Always coerce to a clean string[]
        // and validate each address, no matter what shape the caller sent.
        const EMAIL_RE = /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/;
        const normalizeRecipients = (input: unknown): string[] => {
          if (input == null) return [];
          const arr = Array.isArray(input) ? input : [input];
          const out: string[] = [];
          for (const item of arr) {
            if (!item) continue;
            const raw = typeof item === "string"
              ? item
              : (item as any)?.email ?? "";
            if (!raw) continue;
            for (const part of String(raw).split(/[,;]/)) {
              const m = part.match(/<([^>]+)>/);
              const cleaned = (m ? m[1] : part).trim().replace(/^["']|["']$/g, "");
              if (cleaned) out.push(cleaned);
            }
          }
          return Array.from(new Set(out));
        };

        const toList = normalizeRecipients(to);
        const ccList = normalizeRecipients(cc);
        const bccList = normalizeRecipients(bcc);

        if (toList.length === 0 || !subject) {
          return new Response(JSON.stringify({ error: "To and subject are required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const invalid = [...toList, ...ccList, ...bccList].filter((e) => !EMAIL_RE.test(e));
        if (invalid.length > 0) {
          return new Response(
            JSON.stringify({ error: `Invalid recipient address(es): ${invalid.join(", ")}` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        const sendBody: any = {
          to: toList.map((email) => ({ email, name: email })),
          subject,
          body: body_html || body || "",
        };

        if (ccList.length > 0) {
          sendBody.cc = ccList.map((email) => ({ email, name: email }));
        }
        if (bccList.length > 0) {
          sendBody.bcc = bccList.map((email) => ({ email, name: email }));
        }

        // Outbound attachments — Nylas v3 expects base64-encoded `content`.
        if (Array.isArray(attachments) && attachments.length > 0) {
          const TOTAL_CAP = 25 * 1024 * 1024; // 25MB raw, matches Gmail
          let runningTotal = 0;
          const normalizedAttachments = attachments
            .filter((a) => a && a.filename && typeof a.content === "string" && a.content.length > 0)
            .map((a) => {
              // Approx raw size from base64 length when not provided.
              const approxSize = typeof a.size === "number" && a.size > 0
                ? a.size
                : Math.floor((a.content.length * 3) / 4);
              runningTotal += approxSize;
              return {
                filename: a.filename,
                content_type: a.content_type || "application/octet-stream",
                content: a.content,
                size: approxSize,
                is_inline: !!a.is_inline,
                ...(a.content_id ? { content_id: a.content_id } : {}),
              };
            });
          if (runningTotal > TOTAL_CAP) {
            return new Response(
              JSON.stringify({ error: `Attachments exceed 25MB (got ~${Math.round(runningTotal / (1024 * 1024))}MB).` }),
              { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
          if (normalizedAttachments.length > 0) {
            sendBody.attachments = normalizedAttachments;
          }
        }

        // Threading — when replying, instruct Nylas to set proper headers.
        if (typeof reply_to_message_id === "string" && reply_to_message_id.length > 0) {
          sendBody.reply_to_message_id = reply_to_message_id;
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
          console.error("Nylas send error:", JSON.stringify(sendData));
          const nylasErr =
            sendData?.error?.message ||
            sendData?.error?.type ||
            sendData?.message ||
            (typeof sendData?.error === "string" ? sendData.error : null) ||
            `Nylas returned ${sendResponse.status}`;
          return new Response(
            JSON.stringify({ error: nylasErr, details: sendData?.error ?? sendData }),
            {
              status: sendResponse.status,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        const sentMsg = sendData.data || sendData;

        // Store sent message
        await supabase
          .from("gmail_sent_messages")
          .insert({
            user_id: user.id,
            gmail_message_id: sentMsg.id || "unknown",
            to_emails: toList,
            cc_emails: ccList,
            bcc_emails: bccList,
            subject,
            body_text: body,
            body_html,
            status: "sent",
            sent_at: new Date().toISOString(),
          });

        // #5b — first-class outbound activity row. Only writes when the
        // caller supplied a deal_id (otherwise nothing to attach to). The
        // unique partial index on activity_logs.message_id makes this
        // idempotent if the function is retried.
        if (deal_id && sentMsg.id) {
          try {
            const senderEmail = (sentMsg.from?.[0]?.email as string | undefined) ?? null;
            await supabase.from("activity_logs").insert({
              deal_id,
              user_id: user.id,
              activity_type: "email",
              direction: "outbound",
              subject: subject ?? null,
              body: body_html || body || null,
              from_address: senderEmail,
              to_addresses: toList,
              cc_addresses: ccList,
              bcc_addresses: bccList,
              sent_at: new Date().toISOString(),
              message_id: sentMsg.id,
              thread_id: sentMsg.thread_id ?? hintThreadId ?? null,
              in_reply_to: reply_to_message_id ?? null,
              provider: "gmail",
              description: (subject ?? "Email").slice(0, 240),
              metadata: { source: "gmail-messages-send" },
            });
          } catch (logErr) {
            console.warn("[gmail-messages.send] activity_log insert failed", logErr);
          }
        }

        console.log(`Email sent via Nylas: ${sentMsg.id}`);
        return new Response(JSON.stringify({ success: true, message_id: sentMsg.id }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "save_draft": {
        // Create a Nylas v3 draft so it lands in the user's Gmail Drafts folder.
        // Does NOT send. Mirrors the `send` action's recipient normalization.
        const { to, cc, bcc, subject, body, body_html, attachments, reply_to_message_id } = requestData as any;
        const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const normalizeRecipients = (input: any): string[] => {
          if (!input) return [];
          const arr = Array.isArray(input) ? input : [input];
          const out: string[] = [];
          for (const item of arr) {
            if (typeof item === "string") {
              out.push(...item.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean));
            } else if (item && typeof item === "object" && typeof item.email === "string") {
              out.push(item.email.trim());
            }
          }
          return Array.from(new Set(out));
        };
        const toList = normalizeRecipients(to);
        const ccList = normalizeRecipients(cc);
        const bccList = normalizeRecipients(bcc);
        if (toList.length === 0 || !subject) {
          return new Response(JSON.stringify({ error: "To and subject are required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const invalid = [...toList, ...ccList, ...bccList].filter((e) => !EMAIL_RE.test(e));
        if (invalid.length > 0) {
          return new Response(
            JSON.stringify({ error: `Invalid recipient address(es): ${invalid.join(", ")}` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        const draftBody: any = {
          to: toList.map((email) => ({ email, name: email })),
          subject,
          body: body_html || body || "",
        };
        if (ccList.length > 0) draftBody.cc = ccList.map((email) => ({ email, name: email }));
        if (bccList.length > 0) draftBody.bcc = bccList.map((email) => ({ email, name: email }));
        if (Array.isArray(attachments) && attachments.length > 0) {
          draftBody.attachments = attachments
            .filter((a: any) => a && a.filename && typeof a.content === "string")
            .map((a: any) => ({
              filename: a.filename,
              content_type: a.content_type || "application/octet-stream",
              content: a.content,
              size: typeof a.size === "number" ? a.size : Math.floor((a.content.length * 3) / 4),
              is_inline: !!a.is_inline,
            }));
        }
        if (typeof reply_to_message_id === "string" && reply_to_message_id.length > 0) {
          draftBody.reply_to_message_id = reply_to_message_id;
        }
        const draftResponse = await fetch(`${baseUrl}/drafts`, {
          method: "POST",
          headers,
          body: JSON.stringify(draftBody),
        });
        const draftData = await draftResponse.json();
        if (!draftResponse.ok) {
          console.error("Nylas draft error:", JSON.stringify(draftData));
          return new Response(
            JSON.stringify({ error: draftData?.error?.message || `Nylas returned ${draftResponse.status}` }),
            { status: draftResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        const draft = draftData.data || draftData;
        return new Response(JSON.stringify({ success: true, draft_id: draft.id }), {
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
          // 404 = message no longer exists upstream (archived externally,
          // deleted, or stale ID). Treat as a no-op success so the client
          // can prune its cache instead of surfacing a hard error.
          if (updateResponse.status === 404) {
            await updateResponse.text().catch(() => "");
            return new Response(JSON.stringify({ success: true, missing: true }), {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          return await forwardNylasError(updateResponse, "Failed to mark read/unread");
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
          if (updateResponse.status === 404) {
            await updateResponse.text().catch(() => "");
            return new Response(JSON.stringify({ success: true, missing: true }), {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          return await forwardNylasError(updateResponse, "Failed to star/unstar");
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

      case "sync_state": {
        // Lightweight delta sync: given a list of message IDs already loaded
        // in the client, return the current is_read / is_starred / folders
        // state for each. Used to reconcile read-state changes that happened
        // in Gmail (or another mail client) since the messages were fetched.
        const ids = (requestData.message_ids || []).filter(Boolean);
        if (ids.length === 0) {
          return new Response(JSON.stringify({ states: [] }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Cap to protect against runaway requests. Client should batch.
        const capped = ids.slice(0, 200);

        // Fetch each message's metadata in parallel with a small concurrency
        // limit so we don't overwhelm Nylas.
        const CONCURRENCY = 8;
        const states: Array<{ id: string; is_read: boolean; is_starred: boolean; folders: string[]; missing?: boolean }> = [];

        async function fetchOne(id: string) {
          try {
            const r = await fetch(`${baseUrl}/messages/${id}?fields=standard`, { headers });
            if (r.status === 404) {
              states.push({ id, is_read: true, is_starred: false, folders: [], missing: true });
              return;
            }
            if (!r.ok) return; // swallow transient errors — we'll retry next poll
            const body = await r.json();
            const m = body.data || body;
            states.push({
              id,
              is_read: !m.unread,
              is_starred: !!m.starred,
              folders: m.folders || m.labels || [],
            });
          } catch {
            // Ignore single-message failures so the batch still succeeds.
          }
        }

        // Simple worker pool
        let cursor = 0;
        const workers = Array.from({ length: Math.min(CONCURRENCY, capped.length) }, async () => {
          while (cursor < capped.length) {
            const i = cursor++;
            await fetchOne(capped[i]);
          }
        });
        await Promise.all(workers);

        return new Response(JSON.stringify({ states }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "get_attachment": {
        const { message_id, attachment_id } = requestData;
        if (!message_id || !attachment_id) {
          return new Response(JSON.stringify({ error: "message_id and attachment_id required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Nylas v3: download attachment binary; we proxy as base64 + content-type
        const attResponse = await fetch(
          `${baseUrl}/attachments/${attachment_id}/download?message_id=${encodeURIComponent(message_id)}`,
          { headers: { Authorization: `Bearer ${NYLAS_API_KEY}`, Accept: "*/*" } }
        );

        if (!attResponse.ok) {
          const errText = await attResponse.text().catch(() => "");
          return new Response(JSON.stringify({ error: errText || "Failed to download attachment" }), {
            status: attResponse.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const contentType = attResponse.headers.get("content-type") || "application/octet-stream";
        const buf = new Uint8Array(await attResponse.arrayBuffer());
        // Base64-encode for safe JSON transport
        let binary = "";
        const chunkSize = 0x8000;
        for (let i = 0; i < buf.length; i += chunkSize) {
          binary += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + chunkSize)));
        }
        const base64 = btoa(binary);

        return new Response(JSON.stringify({ content_type: contentType, data: base64, size: buf.length }), {
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
