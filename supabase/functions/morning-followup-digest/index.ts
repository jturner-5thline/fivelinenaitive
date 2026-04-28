import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Returns true if the user's local time is currently within ±10 min of their digest_time
function isAtDigestTime(tz: string, digestTime: string, nowUtc: Date): boolean {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit",
    });
    const parts = fmt.formatToParts(nowUtc);
    const h = Number(parts.find(p => p.type === "hour")?.value ?? "0");
    const m = Number(parts.find(p => p.type === "minute")?.value ?? "0");
    const [dH, dM] = digestTime.split(":").map(Number);
    const nowMin = h * 60 + m;
    const digMin = dH * 60 + dM;
    return Math.abs(nowMin - digMin) <= 10;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const now = new Date();

  // Pull all users with digest enabled
  const { data: profiles, error: profErr } = await supabase
    .from("profiles")
    .select("user_id, email, first_name, display_name, timezone, morning_digest_time, morning_digest_enabled")
    .eq("morning_digest_enabled", true);

  if (profErr) {
    console.error("[morning-digest] profile fetch error:", profErr);
    return new Response(JSON.stringify({ error: profErr.message }), { status: 500, headers: corsHeaders });
  }

  let sent = 0, skipped = 0;
  for (const p of profiles ?? []) {
    const tz = p.timezone || "America/New_York";
    const dt = p.morning_digest_time || "07:00:00";
    if (!isAtDigestTime(tz, dt, now)) { skipped++; continue; }

    // James Turner reads his follow-ups in the in-app Daily Briefing
    // (Pipeline & Clients tab → "Today's Follow-Ups" section) instead of
    // receiving the standalone "Your follow-ups for today" email. The
    // briefing UI re-runs the same wf_tasks + scheduled_followup_actions
    // query, so no content is lost — only the delivery surface changes.
    if ((p.email || "").toLowerCase() === "jturner@5thline.co") {
      skipped++;
      continue;
    }

    // Dedup: don't send twice in same local day
    const { count: alreadySent } = await supabase
      .from("notification_audit")
      .select("id", { count: "exact", head: true })
      .eq("recipient_user_id", p.user_id)
      .eq("trigger_key", "deal.followup.morning_digest")
      .gte("created_at", new Date(now.getTime() - 20 * 60 * 60 * 1000).toISOString());

    if ((alreadySent ?? 0) > 0) { skipped++; continue; }

    // Today's date range in user's tz → just use ±36h window of due tasks for simplicity
    const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    // Recurring follow-up tasks due today, assigned to this user
    const { data: tasks } = await supabase
      .from("wf_tasks")
      .select("id, title, due_at, deal_id")
      .eq("status", "open")
      .or(`assignee_id.eq.${p.user_id},workflow_owner_id.eq.${p.user_id}`)
      .lte("due_at", horizon)
      .limit(100);

    // +3-day scheduled actions due in the same window where this user is owner/manager of the deal
    const { data: scheduled } = await supabase
      .from("scheduled_followup_actions")
      .select("id, trigger_key, deal_id, scheduled_for")
      .eq("status", "pending")
      .lte("scheduled_for", horizon)
      .limit(100);

    // Resolve deal info for grouping
    const dealIds = Array.from(new Set([
      ...(tasks ?? []).map(t => t.deal_id).filter(Boolean),
      ...(scheduled ?? []).map(s => s.deal_id),
    ]));

    if (dealIds.length === 0) { skipped++; continue; }

    const { data: deals } = await supabase
      .from("deals")
      .select("id, company, stage, deal_owner, manager, user_id")
      .in("id", dealIds);

    const dealMap = new Map((deals ?? []).map(d => [d.id, d]));

    const items: string[] = [];
    for (const t of tasks ?? []) {
      const d = t.deal_id ? dealMap.get(t.deal_id) : null;
      if (!d) continue;
      items.push(`• ${d.company} (${d.stage ?? "—"}): ${t.title}`);
    }
    for (const s of scheduled ?? []) {
      const d = dealMap.get(s.deal_id);
      if (!d) continue;
      // only include if this user is owner / manager / creator
      if (d.user_id !== p.user_id) continue;
      items.push(`• ${d.company} (${d.stage ?? "—"}): 3-day follow-up due`);
    }

    if (items.length === 0) { skipped++; continue; }

    const digestBody = `You have ${items.length} follow-up${items.length === 1 ? "" : "s"} due today:\n\n${items.join("\n")}`;

    const { error: invokeErr } = await supabase.functions.invoke("notification-engine", {
      body: {
        triggerKey: "deal.followup.morning_digest",
        context: {
          tagged_user_id: p.user_id,
          digest_body: digestBody,
        },
      },
    });

    if (invokeErr) {
      console.error(`[morning-digest] invoke failed for ${p.user_id}:`, invokeErr);
    } else {
      sent++;
    }
  }

  console.log(`[morning-digest] sent=${sent} skipped=${skipped} total=${profiles?.length ?? 0}`);
  return new Response(JSON.stringify({ sent, skipped, total: profiles?.length ?? 0 }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
