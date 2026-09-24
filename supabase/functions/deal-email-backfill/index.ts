// Slow, rate-limit-safe catch-up: links the last 180 days of mailbox messages
// to deals whose client contacts / company domain appear on them.
// - `start` (5th Line user): enqueue one job per (connected mailbox, deal), then kick processing.
// - `process` (internal, service key): claims a small batch, paces Nylas calls,
//   then re-invokes itself while work remains. Stops automatically when drained.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const NYLAS_API_KEY = Deno.env.get("NYLAS_API_KEY")!;
const NYLAS_API_URI = "https://api.us.nylas.com";

const LOOKBACK_DAYS = 180;
const BATCH_SIZE = 6;          // deals per invocation
const CALL_GAP_MS = 700;       // ~1.4 Nylas calls/sec max
const TERMS_PER_QUERY = 8;     // addresses/domains per search
const MAX_PAGES = 5;           // 5 x 200 messages per query chunk
const MAX_ATTEMPTS = 5;

const admin = createClient(SUPABASE_URL, SERVICE_KEY);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const FREEMAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "hotmail.com", "outlook.com", "live.com", "msn.com",
  "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "pm.me", "gmx.com", "gmx.net",
  "ymail.com", "fastmail.com", "hey.com", "zoho.com", "yandex.com", "mail.com", "duck.com", "tutanota.com",
]);

class RateLimited extends Error { constructor(public retryAfterSec: number) { super("rate_limited"); } }

function normDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  const d = url.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].split("?")[0];
  return d && d.includes(".") && !FREEMAIL.has(d) ? d : null;
}
const addrs = (list: unknown): string[] =>
  Array.isArray(list) ? list.map((p: any) => String(p?.email || "").toLowerCase()).filter((e) => e.includes("@")) : [];

function kickNext() {
  // Fire-and-forget self-invocation; keeps the chain alive only while jobs remain.
  fetch(`${SUPABASE_URL}/functions/v1/deal-email-backfill`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "process" }),
  }).catch((e) => console.error("[deal-email-backfill] kick failed", e?.message));
}

async function nylasSearch(grantId: string, query: string, pageToken?: string) {
  const params = new URLSearchParams({ search_query_native: query, limit: "200" });
  if (pageToken) params.set("page_token", pageToken);
  const resp = await fetch(`${NYLAS_API_URI}/v3/grants/${encodeURIComponent(grantId)}/messages?${params}`, {
    headers: { Authorization: `Bearer ${NYLAS_API_KEY}`, Accept: "application/json" },
  });
  if (resp.status === 429) throw new RateLimited(Number(resp.headers.get("retry-after")) || 60);
  if (!resp.ok) throw new Error(`nylas_${resp.status}`);
  const body = await resp.json();
  return { data: (body?.data || []) as any[], next: body?.next_cursor as string | undefined };
}

async function processJob(job: any): Promise<number> {
  const [{ data: links }, { data: deal }, { data: tok }] = await Promise.all([
    admin.from("contact_deals").select("contact_id").eq("deal_id", job.deal_id),
    admin.from("deals").select("company_url").eq("id", job.deal_id).maybeSingle(),
    admin.from("gmail_tokens").select("email_address").eq("user_id", job.user_id).maybeSingle(),
  ]);
  const ownEmail = String(tok?.email_address || "").toLowerCase();
  const ownDomain = ownEmail.split("@")[1] || "";

  const emails = new Set<string>();
  const ids = (links || []).map((l: any) => l.contact_id).filter(Boolean);
  if (ids.length) {
    const { data: contacts } = await admin.from("contacts").select("email, additional_emails").in("id", ids);
    for (const c of contacts || []) {
      if (c.email) emails.add(String(c.email).toLowerCase().trim());
      for (const e of (c.additional_emails as string[] | null) || []) if (e) emails.add(String(e).toLowerCase().trim());
    }
  }
  const domains = new Set<string>();
  const dd = normDomain(deal?.company_url);
  if (dd) domains.add(dd);
  for (const e of emails) {
    const d = e.split("@")[1];
    if (d && !FREEMAIL.has(d)) domains.add(d);
  }
  domains.delete(ownDomain);
  // Domain terms already cover addresses on those domains.
  const terms = [
    ...[...domains].map((d) => `@${d}`),
    ...[...emails].filter((e) => e.includes("@") && e !== ownEmail && !domains.has(e.split("@")[1])),
  ];
  if (terms.length === 0) return 0;

  const after = new Date(Date.now() - LOOKBACK_DAYS * 86400000);
  const afterStr = `${after.getUTCFullYear()}/${after.getUTCMonth() + 1}/${after.getUTCDate()}`;
  const found = new Map<string, any>();

  for (let i = 0; i < terms.length; i += TERMS_PER_QUERY) {
    const chunk = terms.slice(i, i + TERMS_PER_QUERY);
    const parts = chunk.flatMap((t) => [`from:${t}`, `to:${t}`, `cc:${t}`]);
    const query = `(${parts.join(" OR ")}) after:${afterStr}`;
    let token: string | undefined;
    for (let p = 0; p < MAX_PAGES; p++) {
      const { data, next } = await nylasSearch(job.grant_id, query, token);
      for (const m of data) if (m?.id) found.set(m.id, m);
      await sleep(CALL_GAP_MS);
      if (!next) break;
      token = next;
    }
  }
  if (found.size === 0) return 0;

  const msgs = [...found.values()];
  const rows = msgs.map((m) => ({
    user_id: job.user_id,
    gmail_message_id: m.id,
    thread_id: m.thread_id ?? null,
    subject: m.subject ?? null,
    from_email: addrs(m.from)[0] ?? null,
    from_name: Array.isArray(m.from) ? m.from[0]?.name ?? null : null,
    to_emails: addrs(m.to),
    cc_emails: addrs(m.cc),
    bcc_emails: addrs(m.bcc),
    snippet: m.snippet ?? null,
    labels: Array.isArray(m.folders) ? m.folders : [],
    is_read: m.unread === false,
    received_at: m.date ? new Date(Number(m.date) * 1000).toISOString() : null,
  }));
  for (let i = 0; i < rows.length; i += 200) {
    await admin.from("gmail_messages").upsert(rows.slice(i, i + 200), { onConflict: "user_id,gmail_message_id", ignoreDuplicates: true });
  }
  const linkRows = msgs.map((m) => ({
    deal_id: job.deal_id,
    gmail_message_id: m.id,
    user_id: job.user_id,
    link_source: "auto",
    notes: "Auto-linked (180-day catch-up): client contact or company domain on message",
  }));
  for (let i = 0; i < linkRows.length; i += 200) {
    const { error } = await admin.from("deal_emails").upsert(linkRows.slice(i, i + 200), { onConflict: "deal_id,gmail_message_id", ignoreDuplicates: true });
    if (error) throw error;
  }
  return msgs.length;
}

async function handleProcess() {
  const { data: jobs, error } = await admin.rpc("claim_deal_email_backfill_jobs", { _limit: BATCH_SIZE } as any);
  if (error) return json({ error: error.message }, 500);
  let done = 0;
  for (const job of (jobs || []) as any[]) {
    try {
      const n = await processJob(job);
      await admin.from("deal_email_backfill_jobs").update({ status: "done", linked_count: n, last_error: null, updated_at: new Date().toISOString() }).eq("id", job.id);
      done++;
    } catch (e) {
      const rl = e instanceof RateLimited;
      const failed = !rl && job.attempts >= MAX_ATTEMPTS;
      const delaySec = rl ? (e as RateLimited).retryAfterSec : Math.min(60 * 2 ** job.attempts, 3600);
      await admin.from("deal_email_backfill_jobs").update({
        status: failed ? "failed" : "pending",
        attempts: rl ? Math.max(0, job.attempts - 1) : job.attempts,
        next_attempt_at: new Date(Date.now() + delaySec * 1000).toISOString(),
        last_error: String((e as Error)?.message || e).slice(0, 300),
        updated_at: new Date().toISOString(),
      }).eq("id", job.id);
      if (rl) {
        // Back off: release the rest of this batch and wait before continuing.
        const rest = (jobs as any[]).filter((j) => j.id !== job.id);
        if (rest.length) {
          await admin.from("deal_email_backfill_jobs").update({ status: "pending", next_attempt_at: new Date(Date.now() + delaySec * 1000).toISOString() }).in("id", rest.map((j) => j.id)).eq("status", "running");
        }
        await sleep(Math.min(delaySec, 30) * 1000);
        break;
      }
    }
  }

  const { count } = await admin.from("deal_email_backfill_jobs").select("id", { count: "exact", head: true }).in("status", ["pending", "running"]);
  if ((count || 0) > 0) {
    // If everything left is waiting on a backoff, pause briefly before the next pass.
    if (!jobs || jobs.length === 0) await sleep(20000);
    kickNext();
  }
  return json({ ok: true, processed: done, remaining: count || 0 });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const authHeader = req.headers.get("Authorization") || "";
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }

  if (body?.action === "process") {
    if (authHeader !== `Bearer ${SERVICE_KEY}`) return json({ error: "Unauthorized" }, 401);
    return handleProcess();
  }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);
  const { data: allowed } = await admin.rpc("is_5thline_user", { _user_id: user.id } as any);
  if (!allowed) return json({ error: "Forbidden" }, 403);

  if (body?.action === "start") {
    const { data: n, error } = await admin.rpc("enqueue_deal_email_backfill");
    if (error) return json({ error: error.message }, 500);
    kickNext();
    return json({ ok: true, queued: n });
  }
  if (body?.action === "status") {
    const { data } = await admin.from("deal_email_backfill_jobs").select("status, linked_count");
    const summary: Record<string, number> = {};
    let linked = 0;
    for (const r of data || []) { summary[r.status] = (summary[r.status] || 0) + 1; linked += r.linked_count || 0; }
    return json({ ok: true, summary, linked });
  }
  return json({ error: "Unknown action" }, 400);
});
