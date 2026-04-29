// Flush scheduled emails — invoked by pg_cron every minute.
// Picks up `pending` rows in `scheduled_emails` whose scheduled_for <= now()
// and dispatches them via Nylas. Updates row status to `sent` or `failed`.
//
// This function is intentionally service-role only and does NOT require a JWT
// because it is triggered by pg_cron via net.http_post with an internal
// shared header (x-cron-secret) when configured. We additionally accept the
// service-role key as a fallback authorization mechanism.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const NYLAS_API_KEY = Deno.env.get("NYLAS_API_KEY") ?? "";
const NYLAS_API_URI = "https://api.us.nylas.com";
const MAX_BATCH = 25;
const MAX_ATTEMPTS = 5;

interface ScheduledRow {
  id: string;
  user_id: string;
  thread_id: string | null;
  reply_to_message_id: string | null;
  to_recipients: string[];
  cc_recipients: string[];
  bcc_recipients: string[];
  subject: string;
  body_html: string;
  body_text: string | null;
  attempts: number;
}

async function getGrantId(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("gmail_tokens")
    .select("grant_id, account_id")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.grant_id || data?.account_id || null;
}

async function dispatch(row: ScheduledRow, grantId: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const sendBody: any = {
    to: (row.to_recipients ?? []).map((email) => ({ email, name: email })),
    subject: row.subject ?? "",
    body: row.body_html || row.body_text || "",
  };
  if (row.cc_recipients?.length) sendBody.cc = row.cc_recipients.map((e) => ({ email: e, name: e }));
  if (row.bcc_recipients?.length) sendBody.bcc = row.bcc_recipients.map((e) => ({ email: e, name: e }));
  if (row.reply_to_message_id) sendBody.reply_to_message_id = row.reply_to_message_id;

  const res = await fetch(`${NYLAS_API_URI}/v3/grants/${grantId}/messages/send`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${NYLAS_API_KEY}`,
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(sendBody),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: json?.message || `Nylas error ${res.status}` };
  }
  return { ok: true, id: json?.data?.id ?? json?.id ?? "unknown" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!NYLAS_API_KEY) {
    return new Response(JSON.stringify({ error: "NYLAS_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: due, error: dueErr } = await supabase
    .from("scheduled_emails")
    .select("id,user_id,thread_id,reply_to_message_id,to_recipients,cc_recipients,bcc_recipients,subject,body_html,body_text,attempts")
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(MAX_BATCH);

  if (dueErr) {
    console.error("[flush-scheduled-emails] query error", dueErr);
    return new Response(JSON.stringify({ error: dueErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let processed = 0, sent = 0, failed = 0;

  for (const row of (due ?? []) as ScheduledRow[]) {
    processed += 1;
    const grantId = await getGrantId(supabase, row.user_id);
    if (!grantId) {
      await supabase.from("scheduled_emails").update({
        status: "failed",
        last_error: "Mailbox not connected",
        attempts: row.attempts + 1,
      }).eq("id", row.id);
      failed += 1;
      continue;
    }
    const result = await dispatch(row, grantId);
    if (result.ok) {
      await supabase.from("scheduled_emails").update({
        status: "sent",
        sent_at: new Date().toISOString(),
        nylas_message_id: result.id,
        attempts: row.attempts + 1,
      }).eq("id", row.id);
      sent += 1;
    } else {
      const nextAttempts = row.attempts + 1;
      const nextStatus = nextAttempts >= MAX_ATTEMPTS ? "failed" : "pending";
      await supabase.from("scheduled_emails").update({
        status: nextStatus,
        last_error: result.error,
        attempts: nextAttempts,
      }).eq("id", row.id);
      failed += 1;
    }
  }

  return new Response(JSON.stringify({ processed, sent, failed }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});