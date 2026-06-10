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
  last_email_sync_cursor?: string | null;
  initial_backfill_done?: boolean | null;
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
  opts: { force_backfill?: boolean } = {},
): Promise<{ user_id: string; synced: number; error?: string }> {
  const token = await getValidAccessToken(supabase, row);
  if (!token) return { user_id: row.user_id, synced: 0, error: "no_token" };

  // ----------------------------------------------------------------------
  // Two sync modes:
  //   • Initial backfill (first connect, or `force_backfill`): pull up to
  //     BACKFILL_DAYS of history, paging through @odata.nextLink until the
  //     floor is reached or the page cap is hit.
  //   • Incremental: pull only messages received after the last cursor
  //     stored on `microsoft_tokens.last_email_sync_cursor`.
  //
  // The previous implementation was hard-capped at $top=50 with no paging,
  // which made the Naitive inbox effectively show only ~24h of mail for
  // active accounts.
  // ----------------------------------------------------------------------

  const PAGE_SIZE = 100;
  const BACKFILL_DAYS = 365;
  const MAX_PAGES_BACKFILL = 50;       // ~5,000 messages cap on first sync
  const MAX_PAGES_INCREMENTAL = 20;    // ~2,000 messages per incremental run

  const wantBackfill = opts.force_backfill || !row.initial_backfill_done;
  const sinceCursor = !wantBackfill && row.last_email_sync_cursor
    ? new Date(row.last_email_sync_cursor)
    : null;
  const backfillFloor = wantBackfill
    ? new Date(Date.now() - BACKFILL_DAYS * 24 * 60 * 60 * 1000)
    : null;
  // Lower bound for the Graph $filter — for incremental runs use the
  // cursor; for backfill use the historical floor.
  const filterFloor = sinceCursor ?? backfillFloor;

  const selectFields =
    "id,subject,from,toRecipients,receivedDateTime,bodyPreview,isRead,hasAttachments,conversationId";

  const baseParams = new URLSearchParams({
    $select: selectFields,
    $orderby: "receivedDateTime desc",
    $top: String(PAGE_SIZE),
  });
  if (filterFloor) {
    baseParams.set("$filter", `receivedDateTime ge ${filterFloor.toISOString()}`);
  }

  let nextUrl: string | null =
    `https://graph.microsoft.com/v1.0/me/messages?${baseParams.toString()}`;

  const maxPages = wantBackfill ? MAX_PAGES_BACKFILL : MAX_PAGES_INCREMENTAL;
  let totalSynced = 0;
  let newestReceivedAt: string | null = null;
  let pages = 0;

  while (nextUrl && pages < maxPages) {
    pages++;
    let resp = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.body-content-type="text"' },
    });
    if (resp.status === 429) {
      const retryAfter = Number(resp.headers.get("Retry-After") ?? "2");
      await new Promise((r) => setTimeout(r, Math.min(retryAfter, 10) * 1000));
      resp = await fetch(nextUrl, { headers: { Authorization: `Bearer ${token}` } });
    }
    if (!resp.ok) {
      const text = await resp.text();
      console.error("Graph messages fetch failed", row.user_id, resp.status, text);
      return { user_id: row.user_id, synced: totalSynced, error: `graph_${resp.status}` };
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
        return { user_id: row.user_id, synced: totalSynced, error: error.message };
      }
      totalSynced += rows.length;
      // Page is ordered desc, so the first received_at on the very first
      // page is the newest message we saw across the whole run.
      if (!newestReceivedAt && rows[0]?.received_at) {
        newestReceivedAt = rows[0].received_at as string;
      }
    }

    nextUrl = (data["@odata.nextLink"] as string | undefined) ?? null;
  }

  const update: Record<string, unknown> = {
    last_email_sync_at: new Date().toISOString(),
  };
  if (wantBackfill) update.initial_backfill_done = true;
  if (newestReceivedAt) update.last_email_sync_cursor = newestReceivedAt;

  await supabase
    .from("microsoft_tokens")
    .update(update)
    .eq("user_id", row.user_id);

  return { user_id: row.user_id, synced: totalSynced };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let body: { user_id?: string; force_backfill?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // no body — sync all (cron mode)
  }

  let query = supabase
    .from("microsoft_tokens")
    .select(
      "user_id, access_token, refresh_token, expires_at, sync_email_enabled, status, last_email_sync_cursor, initial_backfill_done",
    )
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
    results.push(await syncForUser(supabase, t as TokenRow, { force_backfill: body.force_backfill }));
  }
  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});