// Auto-create "Follow up on <event>" tasks for calendar events that just
// ended and had at least one external attendee. Scheduled every 5 minutes
// via pg_cron. Skips cancelled events and events already processed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INTERNAL_DOMAIN = "@5thline.co";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

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

      const { data: inserted, error: insErr } = await admin
        .from("tasks")
        .insert({
          title: `Follow up on ${eventTitle}`,
          assigned_to: ev.user_id,
          assigned_by: ev.user_id,
          created_by: ev.user_id,
          due_date: dueDate,
          status: "not_started",
          task_type: "task",
          sync_source: "calendar_followup",
          nylas_event_id: ev.id,
        })
        .select("id")
        .single();

      if (insErr) {
        results.push({ event_id: ev.id, error: insErr.message });
        // Do NOT mark processed — retry on the next run.
        continue;
      }

      // ── 5. Mark event processed so the next tick skips it. ──
      const marked = await markProcessed(admin, ev.id);
      results.push({ event_id: ev.id, task_id: inserted.id, marked_ok: marked });
    } catch (err) {
      results.push({ event_id: ev.id, error: (err as Error).message });
    }
  }

  return json({ ok: true, scanned: (events || []).length, results });
});

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