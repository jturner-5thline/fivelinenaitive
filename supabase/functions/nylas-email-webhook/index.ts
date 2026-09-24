// Nylas webhook receiver: links new mailbox messages to deals whose client
// contacts (or company website domain) appear on the message. Runs entirely
// server-side, once per message — no browser work, no per-deal mailbox search.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const NYLAS_API_KEY = Deno.env.get("NYLAS_API_KEY");
const NYLAS_API_URI = "https://api.us.nylas.com";

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

const FREEMAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "hotmail.com", "outlook.com", "live.com", "msn.com",
  "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "pm.me", "gmx.com", "gmx.net",
  "ymail.com", "fastmail.com", "hey.com", "zoho.com", "yandex.com", "mail.com", "duck.com", "tutanota.com",
]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

type Participant = { email?: string; name?: string };
const addrs = (list: unknown): string[] =>
  Array.isArray(list)
    ? (list as Participant[]).map((p) => String(p?.email || "").trim().toLowerCase()).filter((e) => e.includes("@"))
    : [];

async function handleRegister(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);
  const { data: allowed } = await admin.rpc("is_5thline_user", { _user_id: user.id } as any);
  if (!allowed) return json({ error: "Forbidden" }, 403);
  if (!NYLAS_API_KEY) return json({ error: "Mail provider not configured" }, 500);

  const callback = `${SUPABASE_URL}/functions/v1/nylas-email-webhook`;
  const resp = await fetch(`${NYLAS_API_URI}/v3/webhooks`, {
    method: "POST",
    headers: { Authorization: `Bearer ${NYLAS_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      trigger_types: ["message.created"],
      webhook_url: callback,
      description: "Naitive deal email auto-linking",
    }),
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) return json({ error: body?.error?.message || "Webhook registration failed", status: resp.status }, 502);
  const wh = body?.data || {};
  const { error } = await admin.from("nylas_webhook_config").upsert({
    id: "default",
    webhook_id: wh.id,
    webhook_secret: wh.webhook_secret,
    callback_url: callback,
    updated_at: new Date().toISOString(),
  });
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, webhook_id: wh.id });
}

async function processMessage(obj: any) {
  const grantId = obj?.grant_id;
  const messageId = obj?.id;
  if (!grantId || !messageId) return { skipped: "missing_ids" };

  const { data: tok } = await admin
    .from("gmail_tokens")
    .select("user_id, email_address")
    .eq("grant_id", grantId)
    .maybeSingle();
  if (!tok?.user_id) return { skipped: "unknown_grant" };
  const userId = tok.user_id as string;
  const ownEmail = String(tok.email_address || "").toLowerCase();
  const ownDomain = ownEmail.split("@")[1] || "";

  const from = addrs(obj.from);
  const to = addrs(obj.to);
  const cc = addrs(obj.cc);
  const bcc = addrs(obj.bcc);
  const all = [...new Set([...from, ...to, ...cc, ...bcc])].filter((e) => e !== ownEmail);
  const external = all.filter((e) => (e.split("@")[1] || "") !== ownDomain);
  if (external.length === 0) return { skipped: "internal_only" };
  const domains = [...new Set(external.map((e) => e.split("@")[1]).filter((d) => d && !FREEMAIL.has(d)))];

  const { data: matches, error: matchErr } = await admin.rpc("match_deals_for_email", {
    _user_id: userId,
    _emails: external,
    _domains: domains,
  } as any);
  if (matchErr) throw matchErr;
  const dealIds = [...new Set(((matches || []) as any[]).map((m) => m.deal_id))];
  if (dealIds.length === 0) return { matched: 0 };

  // Store the message header so the deal's Communications list can show it.
  const receivedAt = obj.date ? new Date(Number(obj.date) * 1000).toISOString() : new Date().toISOString();
  const folders: string[] = Array.isArray(obj.folders) ? obj.folders : [];
  await admin.from("gmail_messages").upsert({
    user_id: userId,
    gmail_message_id: messageId,
    thread_id: obj.thread_id ?? null,
    subject: obj.subject ?? null,
    from_email: from[0] ?? null,
    from_name: Array.isArray(obj.from) ? obj.from[0]?.name ?? null : null,
    to_emails: to,
    cc_emails: cc,
    bcc_emails: bcc,
    snippet: obj.snippet ?? null,
    labels: folders,
    is_read: obj.unread === false,
    received_at: receivedAt,
  }, { onConflict: "user_id,gmail_message_id" });

  const { error: linkErr } = await admin.from("deal_emails").upsert(
    dealIds.map((deal_id) => ({
      deal_id,
      gmail_message_id: messageId,
      user_id: userId,
      link_source: "auto",
      notes: "Auto-linked: client contact or company domain on message",
    })),
    { onConflict: "deal_id,gmail_message_id", ignoreDuplicates: true },
  );
  if (linkErr) throw linkErr;
  return { matched: dealIds.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Nylas verification handshake.
  if (req.method === "GET") {
    const challenge = new URL(req.url).searchParams.get("challenge");
    return new Response(challenge ?? "ok", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const raw = await req.text();
  const signature = req.headers.get("x-nylas-signature");

  // Admin registration call (user JWT, no Nylas signature).
  if (!signature) {
    let parsed: any = {};
    try { parsed = JSON.parse(raw || "{}"); } catch { /* ignore */ }
    if (parsed?.action === "register") {
      return handleRegister(new Request(req.url, { method: "POST", headers: req.headers, body: raw }));
    }
    return json({ error: "Unauthorized" }, 401);
  }

  const { data: cfg } = await admin.from("nylas_webhook_config").select("webhook_secret").eq("id", "default").maybeSingle();
  if (!cfg?.webhook_secret) return json({ error: "Webhook not configured" }, 503);
  const expected = await hmacHex(cfg.webhook_secret, raw);
  if (!safeEqual(expected, signature.toLowerCase())) return json({ error: "Invalid signature" }, 401);

  let event: any;
  try { event = JSON.parse(raw); } catch { return json({ error: "Invalid JSON" }, 400); }
  const type = String(event?.type || "");
  if (!type.startsWith("message.created")) return json({ ok: true, ignored: type });

  try {
    const result = await processMessage(event?.data?.object);
    return json({ ok: true, ...result });
  } catch (err) {
    console.error("[nylas-email-webhook] processing failed", (err as Error)?.message);
    // 200 so Nylas doesn't retry-storm; failure is logged.
    return json({ ok: false, error: "processing_failed" });
  }
});
