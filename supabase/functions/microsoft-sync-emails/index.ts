import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MICROSOFT_CLIENT_ID = Deno.env.get("MICROSOFT_CLIENT_ID")!;
const MICROSOFT_CLIENT_SECRET = Deno.env.get("MICROSOFT_CLIENT_SECRET")!;

type TokenRow = {
  user_id: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
  sync_email_enabled: boolean;
  status: string;
};

async function getValidAccessToken(
  supabase: ReturnType<typeof createClient>,
  row: TokenRow,
): Promise<string | null> {
  if (new Date(row.expires_at).getTime() > Date.now() + 60_000) {
    return row.access_token;
  }
  if (!row.refresh_token) {
    await supabase.from("microsoft_tokens").update({ status: "disconnected" }).eq("user_id", row.user_id);
    return null;
  }
  const resp = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID,
      client_secret: MICROSOFT_CLIENT_SECRET,
      refresh_token: row.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    console.error("Refresh failed for user", row.user_id, data);
    await supabase.from("microsoft_tokens").update({ status: "disconnected" }).eq("user_id", row.user_id);
    return null;
  }
  await supabase
    .from("microsoft_tokens")
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? row.refresh_token,
      expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
      status: "connected",
    })
    .eq("user_id", row.user_id);
  return data.access_token;
}

async function syncForUser(
  supabase: ReturnType<typeof createClient>,
  row: TokenRow,
): Promise<{ user_id: string; synced: number; error?: string }> {
  const token = await getValidAccessToken(supabase, row);
  if (!token) return { user_id: row.user_id, synced: 0, error: "no_token" };

  const url =
    "https://graph.microsoft.com/v1.0/me/messages?$select=id,subject,from,toRecipients,receivedDateTime,bodyPreview,isRead,hasAttachments,conversationId&$orderby=receivedDateTime desc&$top=50";
  let resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (resp.status === 429) {
    const retryAfter = Number(resp.headers.get("Retry-After") ?? "2");
    await new Promise((r) => setTimeout(r, Math.min(retryAfter, 10) * 1000));
    resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  }
  if (!resp.ok) {
    const text = await resp.text();
    console.error("Graph messages fetch failed", row.user_id, resp.status, text);
    return { user_id: row.user_id, synced: 0, error: `graph_${resp.status}` };
  }
  const data = await resp.json();
  const messages: any[] = data.value ?? [];

  const rows = messages.map((m) => ({
    user_id: row.user_id,
    message_id: m.id,
    provider: "microsoft",
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
      console.error("Upsert failed", row.user_id, error);
      return { user_id: row.user_id, synced: 0, error: error.message };
    }
  }
  await supabase
    .from("microsoft_tokens")
    .update({ last_email_sync_at: new Date().toISOString() })
    .eq("user_id", row.user_id);

  return { user_id: row.user_id, synced: rows.length };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let body: { user_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    // no body — sync all (cron mode)
  }

  let query = supabase
    .from("microsoft_tokens")
    .select("user_id, access_token, refresh_token, expires_at, sync_email_enabled, status")
    .eq("sync_email_enabled", true)
    .neq("status", "disconnected");

  if (body.user_id) query = query.eq("user_id", body.user_id);

  const { data: tokens, error } = await query;
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results = [];
  for (const t of tokens ?? []) {
    results.push(await syncForUser(supabase, t as TokenRow));
  }
  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});