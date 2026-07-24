// Auto-create "Follow up on <event>" tasks for calendar events that just
// ended and had at least one external attendee. Scheduled every 5 minutes
// via pg_cron. Skips cancelled events and events already processed.
//
// Two sources are scanned each tick:
//   1. `calendar_events` rows (demo tenants / seeded data)
//   2. Nylas primary calendar for every internal (@5thline.co) user with
//      a real `gmail_tokens.grant_id` — this is where real Google Calendar
//      meetings live for the production tenant. Idempotency comes from
//      `tasks.nylas_event_id` (never insert twice for the same event id).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INTERNAL_DOMAIN = "@5thline.co";
// Strict allowlist — auto follow-up tasks are ONLY created for these six
// 5th Line users. No other user (internal domain or otherwise) will ever
// have a follow-up task auto-created by this function.
const ALLOWED_OWNER_EMAILS = new Set<string>([
  "jturner@5thline.co",
  "nheikali@5thline.co",
  "jmoffitt@5thline.co",
  "swilliams@5thline.co",
  "ppina@5thline.co",
  "ffustinoni@5thline.co",
]);
const ASANA_PROJECT_GID = "1130343959659969";
const ASANA_SECTION_GID = "1200505058741223";
const ASANA_API = "https://app.asana.com/api/1.0";
const NYLAS_API_URI = "https://api.us.nylas.com";
const NYLAS_API_KEY = Deno.env.get("NYLAS_API_KEY");
// Look back this many minutes for recently-ended events. The cron runs
// every 5 min so 30 min gives a comfortable margin for retries / late
// invocations without spamming duplicate tasks (dedup by nylas_event_id).
const LOOKBACK_MINUTES = 30;

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

  // Optional overrides for on-demand backfill / testing.
  let overrideLookbackMin = LOOKBACK_MINUTES;
  try {
    if (req.method === "POST") {
      const body = await req.clone().json().catch(() => null);
      if (body && Number.isFinite(body.lookback_minutes)) {
        overrideLookbackMin = Math.max(5, Math.min(24 * 60, Number(body.lookback_minutes)));
      }
    }
  } catch (_) { /* ignore */ }

  const nowMs = Date.now();
  const windowStart = new Date(nowMs - overrideLookbackMin * 60_000).toISOString();
  const windowEnd = new Date(nowMs).toISOString();

  const results: any[] = [];

  // ── 1a. Legacy path: seeded `calendar_events` rows (demo tenants). ──
  const { data: events, error: evErr } = await admin
    .from("calendar_events")
    .select("id, user_id, title, start_time, end_time, organizer_email, attendees, is_cancelled, follow_up_task_created")
    .gte("end_time", windowStart)
    .lte("end_time", windowEnd)
    .eq("is_cancelled", false)
    .eq("follow_up_task_created", false)
    .limit(200);
  if (evErr) return json({ error: evErr.message }, 500);

  for (const ev of events || []) {
    try {
      // ── 2. Owner must be an internal (@5thline.co) user. ──
      const { data: authUser } = await admin.auth.admin.getUserById(ev.user_id);
      const ownerEmail = (authUser?.user?.email || "").toLowerCase();
      if (!ALLOWED_OWNER_EMAILS.has(ownerEmail)) {
        results.push({ event_id: ev.id, skipped: "owner_not_allowlisted" });
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
      const taskTitle = `Follow up on ${eventTitle}`;
      const description = buildAttendeesDescription(eventTitle, attendees, ownerEmail);

      const { data: inserted, error: insErr } = await admin
        .from("tasks")
        .insert({
          title: taskTitle,
          description,
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
          notes: description,
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

      // ── 7. Send email notification to the task owner (best-effort). ──
      let emailResult: { sent?: boolean; error?: string } = {};
      try {
        const { data: prof } = await admin
          .from("profiles")
          .select("full_name, first_name")
          .eq("id", ev.user_id)
          .maybeSingle();
        const assigneeName =
          (prof as any)?.first_name ||
          ((prof as any)?.full_name ? String((prof as any).full_name).split(" ")[0] : undefined);
        const dueLabel = new Date(dueDate + "T00:00:00").toLocaleDateString("en-US", {
          month: "long", day: "numeric", year: "numeric",
        });
        const { error: emailErr } = await admin.functions.invoke("send-transactional-email", {
          body: {
            templateName: "task-assigned",
            recipientEmail: ownerEmail,
            idempotencyKey: `auto-followup-task-${inserted.id}`,
            templateData: {
              assigneeName,
              taskTitle,
              dueDate: dueLabel,
              taskUrl: `https://fivelinenaitive.lovable.app/tasks?task=${inserted.id}`,
            },
          },
        });
        emailResult = emailErr ? { sent: false, error: emailErr.message } : { sent: true };
      } catch (err) {
        emailResult = { sent: false, error: (err as Error).message };
      }

      results.push({
        event_id: ev.id,
        task_id: inserted.id,
        marked_ok: marked,
        asana_gid: asanaResult.gid ?? null,
        asana_error: asanaResult.error ?? null,
        email_sent: emailResult.sent ?? false,
        email_error: emailResult.error ?? null,
      });
    } catch (err) {
      results.push({ event_id: ev.id, error: (err as Error).message });
    }
  }

  // ── 1b. Real Google Calendar via Nylas for internal users. ──
  const nylasResults = await scanNylasForInternalUsers(admin, {
    windowStartMs: nowMs - overrideLookbackMin * 60_000,
    windowEndMs: nowMs,
    asanaToken,
  });
  results.push(...nylasResults);

  return json({
    ok: true,
    scanned_calendar_events: (events || []).length,
    scanned_nylas: nylasResults.length,
    results,
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Nylas scan
// ─────────────────────────────────────────────────────────────────────────
async function scanNylasForInternalUsers(
  admin: any,
  args: { windowStartMs: number; windowEndMs: number; asanaToken: string | null },
): Promise<any[]> {
  const out: any[] = [];
  if (!NYLAS_API_KEY) {
    out.push({ nylas: "skipped", reason: "NYLAS_API_KEY missing" });
    return out;
  }

  // 1. All internal profiles with a real (non-demo) Nylas grant.
  const { data: tokens, error: tokErr } = await admin
    .from("gmail_tokens")
    .select("user_id, grant_id, email_address")
    .not("grant_id", "is", null)
    .neq("grant_id", "demo-seed");
  if (tokErr) {
    out.push({ nylas: "error", reason: tokErr.message });
    return out;
  }

  const startUnix = Math.floor(args.windowStartMs / 1000);
  const endUnix = Math.floor(args.windowEndMs / 1000);

  for (const tok of tokens || []) {
    const ownerEmail = (tok.email_address || "").toLowerCase();
    if (!ALLOWED_OWNER_EMAILS.has(ownerEmail)) continue;

    try {
      const url = new URL(`${NYLAS_API_URI}/v3/grants/${tok.grant_id}/events`);
      url.searchParams.set("calendar_id", "primary");
      url.searchParams.set("start", String(startUnix));
      url.searchParams.set("end", String(endUnix));
      url.searchParams.set("limit", "50");
      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${NYLAS_API_KEY}`,
          Accept: "application/json",
        },
      });
      if (!res.ok) {
        const body = await res.text();
        out.push({ nylas_user: ownerEmail, error: `Nylas ${res.status}: ${body.slice(0, 200)}` });
        continue;
      }
      const body = await res.json();
      const nylasEvents: any[] = body?.data || [];

      for (const ev of nylasEvents) {
        try {
          if (ev.status === "cancelled") continue;

          // Nylas `when` can be timespan (unix), date, or datespan.
          const endMs = extractEndMs(ev.when);
          if (endMs == null) continue;
          // Only events whose end already passed (meeting actually wrapped).
          if (endMs > args.windowEndMs) continue;
          if (endMs < args.windowStartMs) continue;

          // Need ≥1 external participant.
          const participants: any[] = Array.isArray(ev.participants) ? ev.participants : [];
          const hasExternal = participants.some((p) => {
            const e = (p?.email || "").toLowerCase().trim();
            if (!e || !e.includes("@")) return false;
            if (e === ownerEmail) return false;
            return !e.endsWith(INTERNAL_DOMAIN);
          });
          if (!hasExternal) {
            out.push({ nylas_event_id: ev.id, skipped: "no_external_attendees" });
            continue;
          }

          // Idempotency: skip if a task for this nylas event already exists.
          const { data: existing } = await admin
            .from("tasks")
            .select("id")
            .eq("nylas_event_id", ev.id)
            .eq("sync_source", "calendar_followup")
            .limit(1)
            .maybeSingle();
          if (existing?.id) {
            out.push({ nylas_event_id: ev.id, skipped: "already_created", task_id: existing.id });
            continue;
          }

          const eventTitle = (ev.title || "Untitled event").trim();
          const taskTitle = `Follow up on ${eventTitle}`;
          const startMs = extractStartMs(ev.when) ?? endMs;
          const dueDate = new Date(startMs).toISOString().slice(0, 10);
          const attendeeEmails = participants
            .map((p: any) => (p?.email || "").trim())
            .filter((e: string) => !!e);
          const description = buildAttendeesDescription(eventTitle, attendeeEmails, ownerEmail);

          const { data: inserted, error: insErr } = await admin
            .from("tasks")
            .insert({
              title: taskTitle,
              description,
              assigned_to: tok.user_id,
              assigned_by: tok.user_id,
              created_by: tok.user_id,
              due_date: dueDate,
              status: "not_started",
              task_type: "task",
              sync_source: "calendar_followup",
              nylas_event_id: ev.id,
              source_calendar_event_id: ev.id,
              source_calendar_event_title: eventTitle,
              asana_sync_status: args.asanaToken ? "pending" : "failed",
              asana_sync_error: args.asanaToken ? null : "Asana integration not configured",
            })
            .select("id")
            .single();
          if (insErr) {
            out.push({ nylas_event_id: ev.id, error: insErr.message });
            continue;
          }

          let asanaResult: { gid?: string; error?: string } = {};
          if (args.asanaToken) {
            asanaResult = await createAsanaTask(admin, {
              token: args.asanaToken,
              ownerEmail,
              userId: tok.user_id,
              title: taskTitle,
              dueDate,
              notes: description,
            });
            await admin.from("tasks").update({
              asana_task_gid: asanaResult.gid ?? null,
              asana_sync_status: asanaResult.gid ? "synced" : "failed",
              asana_sync_error: asanaResult.error ?? null,
              asana_synced_at: asanaResult.gid ? new Date().toISOString() : null,
            }).eq("id", inserted.id);
          }

          let emailResult: { sent?: boolean; error?: string } = {};
          try {
            const { data: prof } = await admin
              .from("profiles")
              .select("full_name, first_name")
              .eq("id", tok.user_id)
              .maybeSingle();
            const assigneeName =
              (prof as any)?.first_name ||
              ((prof as any)?.full_name ? String((prof as any).full_name).split(" ")[0] : undefined);
            const dueLabel = new Date(dueDate + "T00:00:00").toLocaleDateString("en-US", {
              month: "long", day: "numeric", year: "numeric",
            });
            const { error: emailErr } = await admin.functions.invoke("send-transactional-email", {
              body: {
                templateName: "task-assigned",
                recipientEmail: ownerEmail,
                idempotencyKey: `auto-followup-task-${inserted.id}`,
                templateData: {
                  assigneeName,
                  taskTitle,
                  dueDate: dueLabel,
                  taskUrl: `https://fivelinenaitive.lovable.app/tasks?task=${inserted.id}`,
                },
              },
            });
            emailResult = emailErr ? { sent: false, error: emailErr.message } : { sent: true };
          } catch (err) {
            emailResult = { sent: false, error: (err as Error).message };
          }

          out.push({
            nylas_event_id: ev.id,
            task_id: inserted.id,
            title: taskTitle,
            asana_gid: asanaResult.gid ?? null,
            asana_error: asanaResult.error ?? null,
            email_sent: emailResult.sent ?? false,
            email_error: emailResult.error ?? null,
          });
        } catch (err) {
          out.push({ nylas_event_id: ev?.id, error: (err as Error).message });
        }
      }
    } catch (err) {
      out.push({ nylas_user: ownerEmail, error: (err as Error).message });
    }
  }

  return out;
}

function extractEndMs(when: any): number | null {
  if (!when) return null;
  if (typeof when.end_time === "number") return when.end_time * 1000;
  if (typeof when.end_date === "string") {
    const d = new Date(when.end_date + "T23:59:59Z");
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  if (typeof when.date === "string") {
    const d = new Date(when.date + "T23:59:59Z");
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  return null;
}
function extractStartMs(when: any): number | null {
  if (!when) return null;
  if (typeof when.start_time === "number") return when.start_time * 1000;
  if (typeof when.start_date === "string") {
    const d = new Date(when.start_date + "T00:00:00Z");
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  if (typeof when.date === "string") {
    const d = new Date(when.date + "T00:00:00Z");
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  return null;
}

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