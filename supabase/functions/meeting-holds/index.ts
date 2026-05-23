/**
 * meeting-holds
 * -------------
 * Soft-hold tentative calendar events placed when the AI Email Assistant
 * inserts a multi-slot proposal in an outgoing email. Lifecycle:
 *
 *   create   → INSERT meeting_holds rows + Nylas tentative events (busy=false, status=tentative).
 *   confirm  → promote one row to 'confirmed', upgrade its event to status=confirmed,
 *              and release every other row in the same hold_group_id.
 *   release  → mark row(s) 'released' and DELETE the Nylas event(s).
 *   sweep    → bulk-release any 'held' rows whose expires_at < now() (called by cron).
 *
 * All routes are authenticated via supabase.auth.getClaims(token); the
 * sweep route additionally accepts a service-role bearer for the cron job.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NYLAS_API_KEY = Deno.env.get("NYLAS_API_KEY");
const NYLAS_API_URI = "https://api.us.nylas.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function ok(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function nylasHeaders() {
  return {
    Authorization: `Bearer ${NYLAS_API_KEY}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function getGrantId(svc: any, userId: string): Promise<string | null> {
  const { data } = await svc.from("gmail_tokens").select("grant_id").eq("user_id", userId).single();
  return data?.grant_id ?? null;
}

interface CreateBody {
  action: "create";
  slots: Array<{ start: string; end: string }>;
  title: string;
  description?: string;
  attendees?: Array<{ email: string; name?: string }>;
  timezone?: string;
  deal_id?: string | null;
  email_message_id?: string | null;
  org_company_id?: string | null;
  expires_at?: string;
}

interface ConfirmBody { action: "confirm"; hold_id: string; final_title?: string }
interface ReleaseBody { action: "release"; hold_id?: string; hold_group_id?: string }
interface SweepBody { action: "sweep" }

type Body = CreateBody | ConfirmBody | ReleaseBody | SweepBody;

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return ok({ error: "No authorization header" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = (await req.json().catch(() => ({}))) as Body;

    // Sweep allows service-role JWT (cron) — short-circuit auth check.
    if (body?.action === "sweep") {
      const isService = token === SUPABASE_SERVICE_ROLE_KEY;
      if (!isService) {
        const { data: claims } = await svc.auth.getClaims(token);
        if (!claims?.claims?.sub) return ok({ error: "Invalid token" }, 401);
      }
      return await runSweep(svc);
    }

    const { data: claims, error: authErr } = await svc.auth.getClaims(token);
    if (authErr || !claims?.claims?.sub) return ok({ error: "Invalid token" }, 401);
    const userId = claims.claims.sub as string;

    if (body?.action === "create") return await runCreate(svc, userId, body);
    if (body?.action === "confirm") return await runConfirm(svc, userId, body);
    if (body?.action === "release") return await runRelease(svc, userId, body);
    return ok({ error: "unknown action" }, 400);
  } catch (e) {
    console.error("[meeting-holds] error", e);
    return ok({ error: (e as Error).message || "unexpected" }, 500);
  }
});

async function runCreate(svc: any, userId: string, body: CreateBody): Promise<Response> {
  if (!Array.isArray(body.slots) || body.slots.length === 0) {
    return ok({ error: "slots required" }, 400);
  }
  if (!NYLAS_API_KEY) return ok({ error: "Nylas not configured" }, 500);

  const grantId = await getGrantId(svc, userId);
  if (!grantId) return ok({ error: "Calendar not connected", code: "no_grant" }, 401);

  const groupId = crypto.randomUUID();
  const expiresAt = body.expires_at
    ? new Date(body.expires_at)
    : (() => {
        const latest = Math.max(...body.slots.map((s) => new Date(s.start).getTime()));
        const sixHrAfterLatest = latest + 6 * 3600_000;
        const seventyTwoFromNow = Date.now() + 72 * 3600_000;
        return new Date(Math.min(sixHrAfterLatest, seventyTwoFromNow));
      })();

  const baseUrl = `${NYLAS_API_URI}/v3/grants/${grantId}`;
  const rows: any[] = [];

  for (const slot of body.slots) {
    const startUnix = Math.floor(new Date(slot.start).getTime() / 1000);
    const endUnix = Math.floor(new Date(slot.end).getTime() / 1000);
    const holdId = crypto.randomUUID();
    const title = `${body.title || "Proposed meeting"} — Pending`;
    const description =
      (body.description ? body.description + "\n\n" : "") +
      `Auto-hold placed by Naitive AI Email Assistant. This event will be confirmed when the recipient picks a time, or auto-released by ${expiresAt.toISOString()}.\nHold ID: ${holdId}`;

    let eventId: string | null = null;
    try {
      const url = new URL(`${baseUrl}/events`);
      url.searchParams.set("calendar_id", "primary");
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: nylasHeaders(),
        body: JSON.stringify({
          title,
          description,
          when: { start_time: startUnix, end_time: endUnix, start_timezone: body.timezone, end_timezone: body.timezone },
          status: "tentative",
          busy: false, // tentative — do NOT block other people's free/busy queries
          metadata: { naitive_hold_id: holdId, naitive_hold_group: groupId },
          participants: (body.attendees ?? []).map((a) => ({ email: a.email, name: a.name })),
        }),
      });
      const json = await res.json().catch(() => ({} as any));
      if (res.ok) {
        eventId = json?.data?.id ?? null;
      } else {
        console.warn("[meeting-holds] nylas create non-ok", res.status, json);
      }
    } catch (e) {
      console.error("[meeting-holds] nylas create error", e);
    }

    rows.push({
      id: holdId,
      hold_group_id: groupId,
      user_id: userId,
      org_company_id: body.org_company_id ?? null,
      deal_id: body.deal_id ?? null,
      email_message_id: body.email_message_id ?? null,
      slot_start_at: new Date(slot.start).toISOString(),
      slot_end_at: new Date(slot.end).toISOString(),
      google_event_id: eventId,
      attendees: body.attendees ?? [],
      state: "held",
      expires_at: expiresAt.toISOString(),
    });
  }

  const { error: insErr } = await svc.from("meeting_holds").insert(rows);
  if (insErr) {
    console.error("[meeting-holds] insert err", insErr);
    return ok({ error: insErr.message }, 500);
  }

  return ok({ hold_group_id: groupId, holds: rows });
}

async function deleteNylasEvent(grantId: string, eventId: string): Promise<void> {
  try {
    const url = new URL(`${NYLAS_API_URI}/v3/grants/${grantId}/events/${eventId}`);
    url.searchParams.set("calendar_id", "primary");
    await fetch(url.toString(), { method: "DELETE", headers: nylasHeaders() });
  } catch (e) {
    console.warn("[meeting-holds] nylas delete failed", e);
  }
}

async function runRelease(svc: any, userId: string, body: ReleaseBody): Promise<Response> {
  const q = svc.from("meeting_holds").select("id, user_id, google_event_id, hold_group_id, state").eq("state", "held");
  if (body.hold_id) q.eq("id", body.hold_id);
  else if (body.hold_group_id) q.eq("hold_group_id", body.hold_group_id);
  else return ok({ error: "hold_id or hold_group_id required" }, 400);
  const { data: rows, error } = await q;
  if (error) return ok({ error: error.message }, 500);

  const mine = (rows ?? []).filter((r: any) => r.user_id === userId);
  if (mine.length === 0) return ok({ released: 0 });

  const grantId = (await getGrantId(svc, userId)) || "";
  for (const r of mine) {
    if (grantId && r.google_event_id) await deleteNylasEvent(grantId, r.google_event_id);
  }
  await svc.from("meeting_holds").update({ state: "released", released_at: new Date().toISOString() }).in("id", mine.map((r: any) => r.id));
  return ok({ released: mine.length });
}

async function runConfirm(svc: any, userId: string, body: ConfirmBody): Promise<Response> {
  const { data: hold, error } = await svc
    .from("meeting_holds")
    .select("*")
    .eq("id", body.hold_id)
    .eq("user_id", userId)
    .single();
  if (error || !hold) return ok({ error: "hold not found" }, 404);

  const grantId = (await getGrantId(svc, userId)) || "";
  if (grantId && hold.google_event_id) {
    try {
      const url = new URL(`${NYLAS_API_URI}/v3/grants/${grantId}/events/${hold.google_event_id}`);
      url.searchParams.set("calendar_id", "primary");
      await fetch(url.toString(), {
        method: "PUT",
        headers: nylasHeaders(),
        body: JSON.stringify({
          status: "confirmed",
          busy: true,
          title: body.final_title || undefined,
        }),
      });
    } catch (e) {
      console.warn("[meeting-holds] confirm upgrade failed", e);
    }
  }

  await svc.from("meeting_holds").update({ state: "confirmed" }).eq("id", hold.id);

  // Release siblings in the same group.
  const { data: siblings } = await svc
    .from("meeting_holds")
    .select("id, google_event_id")
    .eq("hold_group_id", hold.hold_group_id)
    .eq("user_id", userId)
    .eq("state", "held")
    .neq("id", hold.id);
  for (const s of siblings ?? []) {
    if (grantId && s.google_event_id) await deleteNylasEvent(grantId, s.google_event_id);
  }
  if ((siblings ?? []).length > 0) {
    await svc
      .from("meeting_holds")
      .update({ state: "released", released_at: new Date().toISOString() })
      .in("id", (siblings ?? []).map((s: any) => s.id));
  }

  return ok({ confirmed: hold.id, released_siblings: (siblings ?? []).length });
}

async function runSweep(svc: any): Promise<Response> {
  const nowIso = new Date().toISOString();
  const { data: stale } = await svc
    .from("meeting_holds")
    .select("id, user_id, google_event_id")
    .eq("state", "held")
    .lt("expires_at", nowIso)
    .limit(500);
  let removed = 0;
  for (const row of stale ?? []) {
    const grantId = await getGrantId(svc, row.user_id);
    if (grantId && row.google_event_id) await deleteNylasEvent(grantId, row.google_event_id);
    removed += 1;
  }
  if ((stale ?? []).length > 0) {
    await svc
      .from("meeting_holds")
      .update({ state: "expired", released_at: nowIso })
      .in("id", (stale ?? []).map((s: any) => s.id));
  }
  return ok({ swept: removed });
}