// Auto-create "Follow up on <event>" tasks for calendar events that just
// ended and had at least one external attendee. Scheduled every 5 minutes
// via pg_cron. Skips cancelled events and events already processed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INTERNAL_DOMAIN = "@5thline.co";
const ASANA_PROJECT_GID = "1130343959659969";
const ASANA_SECTION_GID = "1204993066670286";
const ASANA_API = "https://app.asana.com/api/1.0";

// Simple in-memory cache for the warm instance
const asanaUserGidCache = new Map<string, string | null>(); // email -> gid
let asanaTokenCache: string | null = null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Load Asana token once per invocation.
  const asanaToken = await loadAsanaToken(admin);

  // ── 1. Find events whose end_time landed inside the 5-minute grace window. ──
  const nowMs = Date.now();
  const windowEnd = new Date(nowMs - 5 * 60_000).toISOString();
  const windowStart = new Date(nowMs - 10 * 60_000).toISOString();

  const { data: events, error: evErr } = await admin
    .from("calendar_events")
    .select("id, user_id, title, start_time, end_time, organizer_email, attendees, is_cancelled, follow_up_task_created")
    .gte("end_time", windowStart)
    .lte("end_time", windowEnd)
    .eq("is_cancelled", false)
    .eq("follow_up_task_created", false)
    .limit(200);

  if (evErr) return json({ error: evErr.message }, 500);

  const results: any[] = [];

  for (const ev of events || []) {
    try {
      // ── 2. Owner must be an internal (@5thline.co) user. ──
      const { data: authUser } = await admin.auth.admin.getUserById(ev.user_id);
      const ownerEmail = (authUser?.user?.email || "").toLowerCase();
      if (!ownerEmail.endsWith(INTERNAL_DOMAIN)) {
        results.push({ event_id: ev.id, skipped: "owner_not_internal" });
        await markProcessed(admin, ev.id);
        continue;
      }

      // ── 3. Need ≥1 external attendee (email not on the internal domain
      //    and not the owner themselves). ──
      const attendees: string[] = Array.isArray(ev.attendees) ? ev.attendees : [];
      const hasExternal = attendees.some((raw) => {
        const e = (raw || "").toLowerCase().trim();
        if (!e || !e.includes("@")) return false;
        if (e === ownerEmail) return false;
        return !e.endsWith(INTERNAL_DOMAIN);
      });
      if (!hasExternal) {
        results.push({ event_id: ev.id, skipped: "no_external_attendees" });
        await markProcessed(admin, ev.id);
        continue;
      }

      // ── 4. Insert the follow-up task on the owner's "My Tasks" list. ──
      //    "My Tasks" = tasks assigned to the user with no project/section.
      const eventTitle = (ev.title || "Untitled event").trim();
      const dueDate = (ev.start_time || ev.end_time || new Date().toISOString()).slice(0, 10);
      const taskTitle = `Followed up on ${eventTitle}`;

      const { data: inserted, error: insErr } = await admin
        .from("tasks")
        .insert({
          title: taskTitle,
          assigned_to: ev.user_id,
          assigned_by: ev.user_id,
          created_by: ev.user_id,
          due_date: dueDate,
          status: "not_started",
          task_type: "task",
          sync_source: "calendar_followup",
          nylas_event_id: ev.id,
          source_calendar_event_id: ev.id,
          source_calendar_event_title: eventTitle,
          asana_sync_status: asanaToken ? "pending" : "failed",
          asana_sync_error: asanaToken ? null : "Asana integration not configured",
        })
        .select("id")
        .single();

      if (insErr) {
        results.push({ event_id: ev.id, error: insErr.message });
        // Do NOT mark processed — retry on the next run.
        continue;
      }

      // ── 5. Create matching Asana task (best-effort). ──
      let asanaResult: { gid?: string; error?: string } = {};
      if (asanaToken) {
        asanaResult = await createAsanaTask(admin, {
          token: asanaToken,
          ownerEmail,
          userId: ev.user_id,
          title: taskTitle,
          dueDate,
        });
        await admin.from("tasks").update({
          asana_task_gid: asanaResult.gid ?? null,
          asana_sync_status: asanaResult.gid ? "synced" : "failed",
          asana_sync_error: asanaResult.error ?? null,
          asana_synced_at: asanaResult.gid ? new Date().toISOString() : null,
        }).eq("id", inserted.id);
      }

      // ── 6. Mark event processed so the next tick skips it. ──
      const marked = await markProcessed(admin, ev.id);
      results.push({
        event_id: ev.id,
        task_id: inserted.id,
        marked_ok: marked,
        asana_gid: asanaResult.gid ?? null,
        asana_error: asanaResult.error ?? null,
      });
    } catch (err) {
      results.push({ event_id: ev.id, error: (err as Error).message });
    }
  }

  return json({ ok: true, scanned: (events || []).length, results });
});

async function loadAsanaToken(admin: any): Promise<string | null> {
  if (asanaTokenCache) return asanaTokenCache;
  const { data } = await admin
    .from("integrations")
    .select("config")
    .eq("type", "asana")
    .eq("status", "connected")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const token = (data?.config as any)?.api_token || (data?.config as any)?.access_token || null;
  if (!token) {
    // Fallback: any asana integration row
    const { data: any1 } = await admin
      .from("integrations")
      .select("config")
      .eq("type", "asana")
      .limit(1)
      .maybeSingle();
    asanaTokenCache = (any1?.config as any)?.api_token || null;
  } else {
    asanaTokenCache = token;
  }
  return asanaTokenCache;
}

async function resolveAsanaUserGid(
  admin: any,
  userId: string,
  email: string,
  token: string,
): Promise<string | null> {
  const key = email.toLowerCase();
  if (asanaUserGidCache.has(key)) return asanaUserGidCache.get(key)!;

  // 1. Check cached value on profile
  const { data: prof } = await admin
    .from("profiles")
    .select("asana_user_gid")
    .eq("id", userId)
    .maybeSingle();
  if (prof?.asana_user_gid) {
    asanaUserGidCache.set(key, prof.asana_user_gid);
    return prof.asana_user_gid;
  }

  // 2. Look up in Asana by email
  try {
    const res = await fetch(
      `${ASANA_API}/users/${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.ok) {
      const body = await res.json();
      const gid = body?.data?.gid ?? null;
      if (gid) {
        asanaUserGidCache.set(key, gid);
        await admin.from("profiles").update({ asana_user_gid: gid }).eq("id", userId);
        return gid;
      }
    }
  } catch (_) { /* ignore */ }

  asanaUserGidCache.set(key, null);
  return null;
}

async function createAsanaTask(
  admin: any,
  args: { token: string; ownerEmail: string; userId: string; title: string; dueDate: string },
): Promise<{ gid?: string; error?: string }> {
  const assigneeGid = await resolveAsanaUserGid(admin, args.userId, args.ownerEmail, args.token);

  const payload: Record<string, unknown> = {
    data: {
      name: args.title,
      due_on: args.dueDate,
      memberships: [
        { project: ASANA_PROJECT_GID, section: ASANA_SECTION_GID },
      ],
      projects: [ASANA_PROJECT_GID],
    },
  };
  if (assigneeGid) (payload.data as any).assignee = assigneeGid;

  try {
    const res = await fetch(`${ASANA_API}/tasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) {
      return { error: `Asana ${res.status}: ${text.slice(0, 500)}` };
    }
    const body = JSON.parse(text);
    const gid = body?.data?.gid;
    if (!gid) return { error: "Asana response missing gid" };
    return { gid };
  } catch (err) {
    return { error: `Asana request failed: ${(err as Error).message}` };
  }
}

async function markProcessed(admin: any, eventId: string): Promise<boolean> {
  const { error } = await admin
    .from("calendar_events")
    .update({ follow_up_task_created: true })
    .eq("id", eventId);
  return !error;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}