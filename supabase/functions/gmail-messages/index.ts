import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NYLAS_API_KEY = Deno.env.get("NYLAS_API_KEY");
const NYLAS_API_URI = "https://api.us.nylas.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
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
  // Return 200 for transient upstream failures so the client never blank-screens.
  // The body carries `retryable: true` + `fallback: true` so callers can decide
  // whether to retry, surface a toast, or render cached data.
  const status = isTransient ? 200 : upstreamStatus;
  const body = {
    error: providerMessage || fallbackMessage,
    upstream_status: upstreamStatus,
    retryable: isTransient,
    ...(isTransient ? { fallback: true } : {}),
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
    const response = await nylasFetch(url, { headers });
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

function getMailLabels(msg: any): string[] {
  const values = [
    ...(Array.isArray(msg?.folders) ? msg.folders : []),
    ...(Array.isArray(msg?.labels) ? msg.labels : []),
    ...(Array.isArray(msg?.label_ids) ? msg.label_ids : []),
    ...(Array.isArray(msg?.labelIds) ? msg.labelIds : []),
  ];
  return Array.from(new Set(values.map((v: any) => String(
    v?.id ?? v?.name ?? v?.display_name ?? v?.label ?? v,
  )).filter(Boolean)));
}

function isReadFromProvider(msg: any): boolean {
  const labels = getMailLabels(msg).map((label) => label.toUpperCase());
  if (labels.includes("UNREAD")) return false;
  if (labels.length > 0) return true;
  if (typeof msg?.unread === "boolean") return !msg.unread;
  if (typeof msg?.read === "boolean") return msg.read;
  return true;
}

function nylasHeaders() {
  return {
    "Authorization": `Bearer ${NYLAS_API_KEY}`,
    "Accept": "application/json",
    "Content-Type": "application/json",
  };
}

/**
 * Wrap fetch with an AbortController-based timeout so a single hung Nylas
 * request can't pin the edge function until the 150s platform IDLE_TIMEOUT.
 * Default 25s mirrors the existing list-action ceiling.
 */
async function nylasFetch(
  input: string | URL,
  init: RequestInit = {},
  timeoutMs = 25_000,
): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

async function getGrantId(supabase: any, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("gmail_tokens")
    .select("grant_id, account_id, is_demo_seed")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;
  if (data.is_demo_seed || data.grant_id === "demo-seed") return "demo-seed";
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
 * Resolve a usable Microsoft Graph access token for the user, refreshing it
 * when expired. Mirrors the helper in `microsoft-sync-emails`.
 */
async function getMicrosoftAccessToken(supabase: any, userId: string): Promise<string | null> {
  const { data: row } = await supabase
    .from("microsoft_tokens")
    .select("user_id, access_token, refresh_token, expires_at, status")
    .eq("user_id", userId)
    .maybeSingle();
  if (!row || row.status === "disconnected" || !row.access_token) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() > Date.now() + 60_000) {
    return row.access_token;
  }
  if (!row.refresh_token) return null;
  const clientId = Deno.env.get("MICROSOFT_CLIENT_ID");
  const clientSecret = Deno.env.get("MICROSOFT_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;
  const resp = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: row.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data?.access_token) {
    console.error(`[gmail-messages][microsoft] token refresh failed user=${userId}`, data?.error || resp.status);
    return null;
  }
  await supabase
    .from("microsoft_tokens")
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? row.refresh_token,
      expires_at: new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString(),
      status: "connected",
    })
    .eq("user_id", userId);
  return data.access_token;
}

/**
 * The email sync only stores metadata ($select without `body`), so a cached
 * `emails.raw` row has no readable body — which surfaced in the viewer as
 * "Full message unavailable" for every Outlook message. Fetch the body on
 * demand from Graph and write it back into `raw` so subsequent opens are
 * instant.
 */
async function fetchMicrosoftMessageBody(
  supabase: any,
  userId: string,
  messageId: string,
): Promise<{ html: string; text: string; hasAttachments: boolean } | null> {
  const token = await getMicrosoftAccessToken(supabase, userId);
  if (!token) return null;
  const url =
    `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}` +
    `?$select=id,body,bodyPreview,hasAttachments`;
  let resp: Response;
  try {
    resp = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${token}` } }, 12_000);
  } catch (e) {
    console.error(`[gmail-messages][microsoft] body fetch error user=${userId} msg=${messageId}`, e);
    return null;
  }
  if (!resp.ok) {
    console.error(
      `[gmail-messages][microsoft] body fetch ${resp.status} user=${userId} msg=${messageId}`,
      (await resp.text()).slice(0, 200),
    );
    return null;
  }
  const m = await resp.json().catch(() => null);
  const contentType = String(m?.body?.contentType || "").toLowerCase();
  const content = String(m?.body?.content || "");
  const out = {
    html: contentType === "html" ? content : "",
    text: contentType === "html" ? "" : (content || m?.bodyPreview || ""),
    hasAttachments: !!m?.hasAttachments,
  };
  if (out.html || out.text) {
    // Cache back into the unified emails row so the next open is instant.
    try {
      const { data: existing } = await supabase
        .from("emails")
        .select("raw")
        .eq("user_id", userId)
        .eq("message_id", messageId)
        .maybeSingle();
      const nextRaw = { ...((existing?.raw as any) || {}), body: m?.body ?? null };
      await supabase
        .from("emails")
        .update({ raw: nextRaw })
        .eq("user_id", userId)
        .eq("message_id", messageId);
    } catch (e) {
      console.warn(`[gmail-messages][microsoft] body cache write failed msg=${messageId}`, e);
    }
  }
  return out;
}

/**
 * Demo-seed handler: when gmail_tokens.is_demo_seed=true, serve directly from
 * the seeded gmail_messages table instead of calling Nylas. Supports read
 * actions; write actions are no-ops returning ok so the UI doesn't blow up.
 */
async function handleDemoSeedAction(
  supabase: any,
  userId: string,
  requestData: MessageRequest,
): Promise<Response> {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
  const action = requestData.action;

  if (action === "list") {
    const max = Math.min((requestData as any).max_results || 50, 500);
    const labelIds = (requestData as any).label_ids as string[] | undefined;
    const folder = (requestData as any).folder as string | undefined;
    const wanted = (labelIds?.[0] || folder || "INBOX").toUpperCase();
    const pageToken = (requestData as any).page_token as string | undefined;
    let q = supabase
      .from("gmail_messages")
      .select("gmail_message_id, thread_id, subject, from_email, from_name, to_emails, snippet, received_at, is_read, is_starred, labels")
      .eq("user_id", userId)
      .eq("is_demo_seed", true)
      .order("received_at", { ascending: false })
      .limit(max);
    if (pageToken) q = q.lt("received_at", pageToken);
    const { data, error } = await q;
    if (error) return json({ error: error.message, error_code: "demo_seed_read_failed" }, 500);
    const filtered = (data || []).filter((m: any) => {
      const labels = (m.labels || []).map((l: string) => String(l).toUpperCase());
      if (wanted === "SENT") return labels.includes("SENT");
      if (wanted === "STARRED") return !!m.is_starred;
      if (wanted === "TRASH" || wanted === "SPAM" || wanted === "DRAFTS" || wanted === "ARCHIVE") return labels.includes(wanted);
      return labels.includes("INBOX") || labels.length === 0;
    });
    const messages = filtered.map((m: any) => ({
      id: m.gmail_message_id,
      thread_id: m.thread_id,
      subject: m.subject,
      from_email: m.from_email,
      from_name: m.from_name,
      to_emails: m.to_emails ?? [],
      snippet: m.snippet ?? "",
      received_at: m.received_at,
      is_read: !!m.is_read,
      is_starred: !!m.is_starred,
      labels: m.labels ?? ["INBOX"],
      has_attachments: false,
      provider: "demo-seed",
    }));
    const nextPageToken = messages.length === max && messages.length > 0
      ? messages[messages.length - 1].received_at ?? null
      : null;
    return json({ messages, next_page_token: nextPageToken, provider: "demo-seed" });
  }

  if (action === "get") {
    const id = requestData.message_id;
    if (!id) return json({ error: "message_id required" }, 400);
    const { data, error } = await supabase
      .from("gmail_messages")
      .select("gmail_message_id, thread_id, subject, from_email, from_name, to_emails, snippet, body_text, body_html, received_at, is_read, is_starred, labels")
      .eq("user_id", userId)
      .eq("gmail_message_id", id)
      .maybeSingle();
    if (error || !data) return json({ error: error?.message || "Message not found", error_code: "demo_seed_read_failed" }, error ? 500 : 404);
    return json({
      message: {
        id: data.gmail_message_id,
        thread_id: data.thread_id,
        subject: data.subject,
        from_email: data.from_email,
        from_name: data.from_name,
        to_emails: data.to_emails ?? [],
        snippet: data.snippet ?? "",
        body_text: data.body_text ?? "",
        body_html: data.body_html ?? "",
        is_read: !!data.is_read,
        is_starred: !!data.is_starred,
        labels: data.labels ?? ["INBOX"],
        received_at: data.received_at,
        has_attachments: false,
        provider: "demo-seed",
      },
      provider: "demo-seed",
    });
  }

  if (action === "get_thread") {
    const tid = requestData.thread_id;
    if (!tid) return json({ error: "thread_id required" }, 400);
    const { data, error } = await supabase
      .from("gmail_messages")
      .select("gmail_message_id, thread_id, subject, from_email, from_name, to_emails, snippet, body_text, body_html, received_at, is_read, is_starred, labels")
      .eq("user_id", userId)
      .eq("thread_id", tid)
      .order("received_at", { ascending: true });
    if (error) return json({ error: error.message, error_code: "demo_seed_read_failed" }, 500);
    const messages = (data || []).map((m: any) => ({
      id: m.gmail_message_id,
      thread_id: m.thread_id,
      subject: m.subject,
      from_email: m.from_email,
      from_name: m.from_name,
      to_emails: m.to_emails ?? [],
      snippet: m.snippet ?? "",
      body_text: m.body_text ?? "",
      body_html: m.body_html ?? "",
      is_read: !!m.is_read,
      is_starred: !!m.is_starred,
      labels: m.labels ?? ["INBOX"],
      received_at: m.received_at,
      has_attachments: false,
      provider: "demo-seed",
    }));
    return json({ thread_id: tid, messages, provider: "demo-seed" });
  }

  if (action === "mark_read" || action === "mark_unread" || action === "star" || action === "unstar") {
    const ids = requestData.message_ids?.length ? requestData.message_ids : (requestData.message_id ? [requestData.message_id] : []);
    if (ids.length === 0) return json({ ok: true, updated: 0, provider: "demo-seed" });
    const patch: Record<string, unknown> = {};
    if (action === "mark_read") patch.is_read = true;
    if (action === "mark_unread") patch.is_read = false;
    if (action === "star") patch.is_starred = true;
    if (action === "unstar") patch.is_starred = false;
    const { error } = await supabase
      .from("gmail_messages")
      .update(patch)
      .eq("user_id", userId)
      .in("gmail_message_id", ids);
    if (error) return json({ error: error.message, error_code: "demo_seed_write_failed" }, 500);
    return json({ ok: true, updated: ids.length, provider: "demo-seed" });
  }

  if (action === "sync_state") {
    return json({ ok: true, provider: "demo-seed", state_fetched_at: new Date().toISOString(), changes: [] });
  }

  // send / save_draft / archive / move / trash / delete — no-op for demo
  return json({
    ok: true,
    provider: "demo-seed",
    note: "Demo inbox is read-only; action accepted with no effect.",
  });
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
    // Match the Gmail/Nylas path's ceiling (1,000) so the inbox isn't
    // artificially capped at 200 for Outlook accounts.
    const max = Math.min((requestData as any).max_results || 50, 1000);
    const labelIds = (requestData as any).label_ids as string[] | undefined;
    // Keyset cursor: pageToken encodes the oldest `received_at` from the
    // previous page so we paginate older-than the last row we returned.
    const pageToken = (requestData as any).page_token as string | undefined;
    const explicit = labelIds?.[0]?.toUpperCase();
    // Only INBOX-style lists are supported today (Microsoft sync covers inbox).
    if (explicit && explicit !== "INBOX") {
      console.log(`[gmail-messages][microsoft] unsupported folder=${explicit} for user=${userId}; returning []`);
      return new Response(
        JSON.stringify({ messages: [], next_page_token: null, provider: "microsoft" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    let q = supabase
      .from("emails")
      .select("message_id, thread_id, subject, from_email, from_name, to_emails, preview, received_at, is_read, has_attachments")
      .eq("user_id", userId)
      .eq("provider", "microsoft")
      .order("received_at", { ascending: false })
      .limit(max);
    if (pageToken) {
      q = q.lt("received_at", pageToken);
    }
    const { data, error } = await q;
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
    // Emit a next_page_token whenever the page was full — it's the oldest
    // received_at we returned, used by the client as a keyset cursor on
    // the next call. When the page is short we know we've drained the
    // table and can return null.
    const nextPageToken = messages.length === max && messages.length > 0
      ? (messages[messages.length - 1].received_at ?? null)
      : null;
    return new Response(
      JSON.stringify({ messages, next_page_token: nextPageToken, provider: "microsoft" }),
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

    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    // Try fast local JWT verification via getClaims() first. If the project
    // is still issuing legacy HS256 tokens (or signing-key rollout is mid-
    // flight), getClaims will fail to verify — fall back to getUser() which
    // validates against the Auth server and works for both token formats.
    let userId: string | null = null;
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (!claimsError && claimsData?.claims?.sub) {
      userId = claimsData.claims.sub as string;
    } else {
      // getUser() hits the Auth server over the network; retry a couple times
      // on transient connection resets before declaring the token invalid.
      let userData: any = null;
      let userError: any = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await authClient.auth.getUser(token);
        userData = res.data;
        userError = res.error;
        if (!userError && userData?.user?.id) break;
        const msg = String(userError?.message || "");
        const transient = /connection reset|connection error|SendRequest|fetch failed|network|ECONNRESET|timeout/i.test(msg);
        if (!transient) break;
        await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
      }
      if (userError || !userData?.user?.id) {
        console.error("[gmail-messages] auth error:", claimsError?.message || userError?.message || "no claims");
        // Return 200 with a retryable envelope so the client doesn't blank-screen
        // when the user's access token expired mid-session. The client should
        // refresh the session and retry.
        return new Response(
          JSON.stringify({
            error: "auth_expired",
            message: "Session expired. Please refresh and try again.",
            retryable: true,
            fallback: true,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      userId = userData.user.id;
    }

    const user = { id: userId };
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const requestData: MessageRequest = await req.json();
    const { action } = requestData;

    const grantId = await getGrantId(supabase, user.id);
    if (grantId === "demo-seed") {
      return await handleDemoSeedAction(supabase, user.id, requestData);
    }
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
        const stateFetchedAt = new Date().toISOString();
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

        // Hard 25s timeout via AbortController so a hung Nylas request is
        // actually cancelled — a bare Promise.race left the socket open and
        // pinned the isolate until the platform killed it (surfacing as 502s,
        // including on CORS preflight). Returning a 200 with `partial: true`
        // lets the client render its in-memory cache instead of crashing.
        let listResponse: Response;
        try {
          listResponse = await nylasFetch(`${baseUrl}/messages?${params}`, { headers }, 25_000);
        } catch (err) {
          const isTimeout =
            (err as Error)?.name === "AbortError" || (err as Error)?.message === "timeout";
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
          // Drain body safely — may be JSON or HTML depending on the failure
          // mode. Capture both shapes so we can detect grant-expired errors.
          let providerCode = "";
          let providerMessage = "";
          let providerErrors: any[] = [];
          try {
            const ct = listResponse.headers.get("content-type") || "";
            if (ct.includes("application/json")) {
              const j: any = await listResponse.json();
              providerCode = String(j?.error?.type || j?.error?.code || j?.type || "");
              providerMessage = String(
                j?.error?.message || j?.message || j?.error?.provider_error?.message || "",
              );
              providerErrors = Array.isArray(j?.error?.errors) ? j.error.errors : [];
            } else {
              providerMessage = (await listResponse.text()).slice(0, 200);
            }
          } catch { /* ignore */ }

          console.error(
            `[gmail-messages] list upstream ${listResponse.status} code=${providerCode} msg=${providerMessage}`,
            providerErrors.length ? { errors: providerErrors } : undefined,
          );

          // Token-expired / grant invalidated on Nylas v3 — signal the client
          // to show a "Reconnect Gmail" CTA instead of crashing.
          const isAuth =
            listResponse.status === 401 ||
            /invalid[_ ]?grant|grant_invalid|grant.*expired|reauth|invalid_token|token.*expired/i.test(
              `${providerCode} ${providerMessage}`,
            );
          if (isAuth) {
            return new Response(JSON.stringify({
              messages: [],
              next_page_token: null,
              fallback: true,
              error: providerMessage || "Mailbox session expired.",
              error_code: "reauth_required",
              action: "reauth_required",
              upstream_status: listResponse.status,
            }), {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          if (isRateLimit || isServerError) {
            return new Response(JSON.stringify({
              error: isRateLimit ? "RATE_LIMITED" : "SERVICE_UNAVAILABLE",
              fallback: true,
              messages: [],
              next_page_token: null,
              upstream_status: listResponse.status,
              retryable: true,
            }), {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          // Other 4xx (malformed query, bad page_token, etc.) — return a
          // soft 200 so the frontend never throws to the error boundary.
          // The client can decide whether to clear filters / reset paging.
          const isMalformedQuery =
            /search_query|query|invalid.*param|bad.*request/i.test(
              `${providerCode} ${providerMessage}`,
            );
          return new Response(JSON.stringify({
            messages: [],
            next_page_token: null,
            fallback: true,
            error: providerMessage || "Failed to list messages",
            error_code: isMalformedQuery ? "malformed_query" : "list_failed",
            action: isMalformedQuery ? "clear_filters" : undefined,
            upstream_status: listResponse.status,
            retryable: false,
          }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
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
            is_read: isReadFromProvider(msg),
            is_starred: msg.starred || false,
            labels: getMailLabels(msg),
            received_at: msg.date ? new Date(msg.date * 1000).toISOString() : null,
            state_fetched_at: stateFetchedAt,
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
        let { message_id } = requestData;
        if (!message_id) {
          return new Response(JSON.stringify({ error: "Message ID required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const forceRefresh = (requestData as any).force_refresh === true;
        const STALE_AFTER_MS = 24 * 60 * 60 * 1000; // 24h

        // Some callers (e.g. the email-intelligence inbox built from
        // `email_cache`) pass the row PK (UUID) as `message_id` instead of
        // the Nylas provider id. Nylas would 404 on a UUID, surfacing as
        // "Full message unavailable". Resolve to the real provider id
        // before the cache lookup / live fetch.
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(message_id)) {
          try {
            const { data: row } = await supabase
              .from("email_cache")
              .select("gmail_message_id")
              .eq("user_id", user.id)
              .eq("id", message_id)
              .maybeSingle();
            if (row?.gmail_message_id) {
              console.log(
                `[gmail-messages:get] resolved row-uuid ${message_id} -> ${row.gmail_message_id}`,
              );
              message_id = row.gmail_message_id;
            }
          } catch (resolveErr) {
            console.warn(
              `[gmail-messages:get] uuid resolve failed for ${message_id}: ${(resolveErr as Error)?.message}`,
            );
          }
        }

        // Cache-first: serve body from public.email_cache when available so
        // repeat opens are instant and do not hit Nylas. The Microsoft path
        // already does this from public.emails.raw; this brings Gmail/Nylas
        // to parity. Background revalidation (>24h stale) keeps the cache
        // fresh without blocking the user.
        if (!forceRefresh) {
          try {
            const { data: cached } = await supabase
              .from("email_cache")
              .select(
                "gmail_message_id, thread_id, subject, from_email, from_name, to_emails, cc_emails, snippet, body_html, body_text, attachments, inline_attachments, is_read, is_starred, labels, received_at, body_fetched_at",
              )
              .eq("user_id", user.id)
              .eq("gmail_message_id", message_id)
              .not("body_fetched_at", "is", null)
              .maybeSingle();

            if (cached) {
              const ageMs = cached.body_fetched_at
                ? Date.now() - new Date(cached.body_fetched_at as string).getTime()
                : Number.POSITIVE_INFINITY;
              const isStale = ageMs > STALE_AFTER_MS;

              if (isStale) {
                // Fire-and-forget revalidation; do NOT await — user still
                // gets the cached body immediately.
                try {
                  // @ts-ignore — EdgeRuntime is available in Supabase Edge
                  EdgeRuntime.waitUntil(
                    (async () => {
                      try {
                        const r = await nylasFetch(`${baseUrl}/messages/${message_id}`, { headers });
                        if (!r.ok) return;
                        const j = await r.json();
                        const m = j.data || j;
                        const { body_html, body_text } = pickBodyHtmlAndText(m);
                        const all = mergeAndNormalizeAttachments(m);
                        await supabase
                          .from("email_cache")
                          .update({
                            body_html,
                            body_text,
                            attachments: all.filter((a: any) => !a.is_inline),
                            inline_attachments: all.filter((a: any) => a.is_inline),
                            is_read: isReadFromProvider(m),
                            is_starred: m.starred || false,
                            labels: getMailLabels(m),
                            body_fetched_at: new Date().toISOString(),
                          })
                          .eq("user_id", user.id)
                          .eq("gmail_message_id", message_id);
                      } catch (_) { /* swallow */ }
                    })(),
                  );
                } catch (_) { /* EdgeRuntime not available — skip */ }
              }

              return new Response(
                JSON.stringify({
                  message: {
                    id: cached.gmail_message_id,
                    thread_id: cached.thread_id || cached.gmail_message_id,
                    subject: cached.subject || "",
                    from_email: cached.from_email || "",
                    from_name: cached.from_name || "",
                    to_emails: cached.to_emails ?? [],
                    cc_emails: cached.cc_emails ?? [],
                    snippet: cached.snippet || "",
                    body_text: cached.body_text || "",
                    body_html: cached.body_html || "",
                    is_read: !!cached.is_read,
                    is_starred: !!cached.is_starred,
                    labels: cached.labels ?? [],
                    received_at: cached.received_at,
                    attachments: cached.attachments ?? [],
                    inline_attachments: cached.inline_attachments ?? [],
                    has_attachments:
                      Array.isArray(cached.attachments) && cached.attachments.length > 0,
                  },
                  cached: true,
                }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
              );
            }
          } catch (cacheErr) {
            console.warn(
              `[gmail-messages:get] cache read failed for ${message_id}: ${(cacheErr as Error)?.message}`,
            );
            // fall through to live fetch
          }
        }

        let msgResponse: Response;
        try {
          msgResponse = await nylasFetch(`${baseUrl}/messages/${message_id}`, { headers });
        } catch (netErr) {
          // Network-level failure (DNS, connection reset, fetch abort). Never
          // let this bubble — surface a soft fallback so the viewer renders a
          // friendly inline error + Retry instead of crashing.
          console.warn(
            `[gmail-messages:get] network error for ${message_id}: ${(netErr as Error)?.message}`,
          );
          return new Response(JSON.stringify({
            message: null,
            fallback: true,
            error: "SERVICE_UNAVAILABLE",
            error_message: "Message could not be loaded. Try again in a moment.",
            retryable: true,
          }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

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
          // Transient (429 rate-limit, 5xx upstream) — return a 200 soft
          // fallback so the viewer can render an inline "Message could not be
          // loaded. Try again in a moment." state with Retry, instead of
          // tripping the global error boundary with a non-2xx invoke error.
          const isTransient = msgResponse.status === 429 || msgResponse.status >= 500;
          if (isTransient) {
            const retryAfter = msgResponse.headers.get("retry-after");
            await msgResponse.text().catch(() => "");
            console.warn(
              `[gmail-messages:get] transient upstream ${msgResponse.status} for ${message_id}`,
            );
            return new Response(JSON.stringify({
              message: null,
              fallback: true,
              error: msgResponse.status === 429 ? "RATE_LIMITED" : "SERVICE_UNAVAILABLE",
              error_message: "Message could not be loaded. Try again in a moment.",
              upstream_status: msgResponse.status,
              retryable: true,
              ...(retryAfter ? { retry_after: retryAfter } : {}),
            }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
          is_read: isReadFromProvider(msg),
          is_starred: msg.starred || false,
          labels: getMailLabels(msg),
          received_at: msg.date ? new Date(msg.date * 1000).toISOString() : null,
          attachments: visibleAtts,
          inline_attachments: inlineAtts,
          has_attachments: visibleAtts.length > 0,
        };

        // Persist to email_cache so subsequent opens (any device, any
        // session) are served from Postgres in <200ms instead of a fresh
        // Nylas round-trip. Errors are non-fatal — log and continue.
        try {
          await supabase
            .from("email_cache")
            .upsert(
              {
                user_id: user.id,
                gmail_message_id: msg.id,
                thread_id: message.thread_id,
                subject: message.subject,
                from_email: message.from_email,
                from_name: message.from_name,
                to_emails: message.to_emails,
                cc_emails: message.cc_emails,
                snippet: message.snippet,
                body_text: message.body_text,
                body_html: message.body_html,
                attachments: message.attachments,
                inline_attachments: message.inline_attachments,
                is_read: message.is_read,
                is_starred: message.is_starred,
                labels: message.labels,
                received_at: message.received_at,
                provider: "gmail",
                body_fetched_at: new Date().toISOString(),
                fetched_at: new Date().toISOString(),
              },
              { onConflict: "user_id,gmail_message_id" },
            );
        } catch (writeErr) {
          console.warn(
            `[gmail-messages:get] cache write failed for ${msg.id}: ${(writeErr as Error)?.message}`,
          );
        }

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

        let threadResponse: Response;
        try {
          threadResponse = await nylasFetch(`${baseUrl}/threads/${thread_id}`, { headers });
        } catch (netErr) {
          console.warn(
            `[gmail-messages:get_thread] network error for ${thread_id}: ${(netErr as Error)?.message}`,
          );
          return new Response(JSON.stringify({
            thread: { id: thread_id, messages: [] },
            fallback: true,
            error: "SERVICE_UNAVAILABLE",
            error_message: "Conversation could not be loaded. Try again in a moment.",
            retryable: true,
          }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

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
          const isTransient = threadResponse.status === 429 || threadResponse.status >= 500;
          if (isTransient) {
            const retryAfter = threadResponse.headers.get("retry-after");
            await threadResponse.text().catch(() => "");
            console.warn(
              `[gmail-messages:get_thread] transient upstream ${threadResponse.status} for ${thread_id}`,
            );
            return new Response(JSON.stringify({
              thread: { id: thread_id, messages: [] },
              fallback: true,
              error: threadResponse.status === 429 ? "RATE_LIMITED" : "SERVICE_UNAVAILABLE",
              error_message: "Conversation could not be loaded. Try again in a moment.",
              upstream_status: threadResponse.status,
              retryable: true,
              ...(retryAfter ? { retry_after: retryAfter } : {}),
            }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
            is_read: isReadFromProvider(msg),
            is_starred: msg.starred || false,
            labels: getMailLabels(msg),
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

        const sendResponse = await nylasFetch(
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
        const draftResponse = await nylasFetch(`${baseUrl}/drafts`, {
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

        const updateResponse = await nylasFetch(
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

        const updateResponse = await nylasFetch(
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
        const trashResponse = await nylasFetch(
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

        const deleteResponse = await nylasFetch(
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
        const stateFetchedAt = new Date().toISOString();

        // Hard overall deadline so sync_state can never pin the function
        // until the 150s platform IDLE_TIMEOUT. Per-call timeout is also
        // tightened from the default 25s to 8s — these are cheap metadata
        // reads and slow ones are better skipped than blocking the batch.
        const SYNC_DEADLINE_MS = 60_000;
        const deadline = Date.now() + SYNC_DEADLINE_MS;

        // Fetch each message's metadata in parallel with a small concurrency
        // limit so we don't overwhelm Nylas.
        const CONCURRENCY = 8;
        const states: Array<{ id: string; is_read: boolean; is_starred: boolean; folders: string[]; missing?: boolean; state_fetched_at?: string }> = [];

        async function fetchOne(id: string) {
          try {
            if (Date.now() > deadline) return;
            const r = await nylasFetch(`${baseUrl}/messages/${id}?fields=standard`, { headers }, 8_000);
            if (r.status === 404) {
              states.push({ id, is_read: true, is_starred: false, folders: [], missing: true });
              return;
            }
            if (!r.ok) return; // swallow transient errors — we'll retry next poll
            const body = await r.json();
            const m = body.data || body;
            states.push({
              id,
              is_read: isReadFromProvider(m),
              is_starred: !!m.starred,
              folders: getMailLabels(m),
              state_fetched_at: stateFetchedAt,
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

        // Persist authoritative Gmail/Nylas read state into the local cache so
        // first-login / cold-open rows do not resurrect stale UNREAD labels
        // just because the message was read outside the platform.
        await Promise.allSettled(
          states
            .filter((s) => !s.missing)
            .map((s) => supabase
              .from("email_cache")
              .update({
                is_read: s.is_read,
                is_starred: s.is_starred,
                labels: s.folders || [],
                fetched_at: s.state_fetched_at || stateFetchedAt,
                updated_at: new Date().toISOString(),
              })
              .eq("user_id", user.id)
              .eq("gmail_message_id", s.id)),
        );

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
        const attResponse = await nylasFetch(
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
