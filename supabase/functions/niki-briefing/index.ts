// Niki's scoped daily briefing data: deals where Niki is Manager or Analyst,
// her tasks, recent lender activity on those deals, outstanding items, and
// today's calendar events (only when Niki is the caller).
//
// Authorization mirrors briefing-for-user: an allow-list of viewers may read
// Niki's data via service-role; Niki may self-view; nobody else can.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NIKI_BRIEFING_ALLOWED_EMAILS = new Set<string>([
  "jturner@5thline.co",
  "nheikali@5thline.co",
]);
const NIKI_USER_ID = "a757f375-7e93-4fc5-a49e-e371abb42fac";
const NIKI_EMAIL = "nheikali@5thline.co";
const NIKI_ASSIGNEE_NAME = "Niki Heikali";

const NYLAS_API_KEY = Deno.env.get("NYLAS_API_KEY");
const NYLAS_API_URI = "https://api.us.nylas.com";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isExcludedDealName(name?: string | null): boolean {
  if (!name) return false;
  const n = name.trim().toLowerCase();
  return (
    n === "test-niki's store" ||
    n === "example deal" ||
    n.startsWith("test ")
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401);

    const anon = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await anon.auth.getUser();
    if (userErr || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const callerEmail = (user.email || "").toLowerCase();
    if (!NIKI_BRIEFING_ALLOWED_EMAILS.has(callerEmail)) {
      return jsonResponse({ error: "Not authorized" }, 403);
    }
    const isSelf = user.id === NIKI_USER_ID || callerEmail === NIKI_EMAIL;

    const svc = createClient(supabaseUrl, serviceKey);

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const last24 = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const stale7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // ── 1. MY DEALS — manager or analyst is Niki ────────────────
    const { data: dealsRaw } = await svc
      .from("deals")
      .select(
        "id, company, stage, status, manager, analyst, updated_at, next_follow_up_at, closing_date, dashboard_closing_date, is_flagged, pipeline_id"
      )
      .or(`manager.ilike.%${NIKI_ASSIGNEE_NAME}%,analyst.ilike.%${NIKI_ASSIGNEE_NAME}%`);

    const deals = (dealsRaw || []).filter((d) => !isExcludedDealName(d.company));
    const dealIds = deals.map((d) => d.id);

    // Outstanding item counts per deal
    const { data: oiCounts } = await svc
      .from("outstanding_items")
      .select("deal_id, status, due_date, assigned_to, description")
      .in("deal_id", dealIds.length ? dealIds : ["00000000-0000-0000-0000-000000000000"]);

    const openByDeal = new Map<string, number>();
    (oiCounts || []).forEach((it: any) => {
      if (it.status !== "completed" && it.status !== "done") {
        openByDeal.set(it.deal_id, (openByDeal.get(it.deal_id) || 0) + 1);
      }
    });

    // Next milestone per deal (first incomplete by stage)
    const { data: milestones } = await svc
      .from("naitive_stage_milestones")
      .select("deal_id, stage, milestone_key, completed, updated_at")
      .in("deal_id", dealIds.length ? dealIds : ["00000000-0000-0000-0000-000000000000"])
      .eq("completed", false)
      .order("updated_at", { ascending: true });

    const nextMilestoneByDeal = new Map<string, string>();
    (milestones || []).forEach((m: any) => {
      if (!nextMilestoneByDeal.has(m.deal_id)) {
        nextMilestoneByDeal.set(m.deal_id, m.milestone_key);
      }
    });

    const myDeals = deals.map((d) => {
      const role =
        (d.manager || "").toLowerCase().includes("niki") ? "Manager" : "Analyst";
      const stale = d.updated_at && d.updated_at < stale7;
      const atRisk = d.is_flagged || (d.status || "").toLowerCase().includes("risk") || (d.status || "").toLowerCase().includes("off-track");
      return {
        id: d.id,
        company: d.company,
        stage: d.stage,
        status: d.status,
        role,
        outstandingCount: openByDeal.get(d.id) || 0,
        lastActivity: d.updated_at,
        nextMilestone: nextMilestoneByDeal.get(d.id) || null,
        nextFollowUpAt: d.next_follow_up_at,
        closingDate: d.dashboard_closing_date || d.closing_date,
        atRisk,
        stale,
      };
    });

    // ── 2. MY TASKS DUE TODAY / OVERDUE ─────────────────────────
    const { data: tasksRaw } = await svc
      .from("tasks")
      .select("id, title, due_date, deal_id, status, priority")
      .eq("assigned_to", NIKI_USER_ID)
      .is("archived_at", null)
      .in("status", ["not_started", "in_progress", "blocked"])
      .lte("due_date", todayStr)
      .not("due_date", "is", null);

    const taskDealIds = Array.from(new Set((tasksRaw || []).map((t: any) => t.deal_id).filter(Boolean)));
    const { data: taskDeals } = taskDealIds.length
      ? await svc.from("deals").select("id, company").in("id", taskDealIds)
      : { data: [] as any[] };
    const dealNameById = new Map<string, string>();
    (taskDeals || []).forEach((d: any) => dealNameById.set(d.id, d.company));
    // include "my deals" too
    deals.forEach((d) => dealNameById.set(d.id, d.company));

    const myTasks = (tasksRaw || []).map((t: any) => ({
      id: t.id,
      title: t.title,
      dueDate: t.due_date,
      dealId: t.deal_id,
      dealName: t.deal_id ? dealNameById.get(t.deal_id) || null : null,
      overdue: t.due_date && t.due_date < todayStr,
      priority: t.priority,
    })).filter((t) => !t.dealName || !isExcludedDealName(t.dealName));

    // ── 3. LENDER ACTIVITY ON MY DEALS (last 24h) ───────────────
    const { data: lenderActivity } = dealIds.length
      ? await svc
          .from("deal_lenders")
          .select("id, deal_id, name, stage, tracking_status, updated_at, last_contact_at")
          .in("deal_id", dealIds)
          .or(`updated_at.gte.${last24},last_contact_at.gte.${last24}`)
          .order("updated_at", { ascending: false })
          .limit(50)
      : { data: [] as any[] };

    const { data: claapRecent } = dealIds.length
      ? await svc
          .from("deal_claap_recordings")
          .select("id, deal_id, recording_title, recorder_name, linked_at")
          .in("deal_id", dealIds)
          .gte("linked_at", last24)
          .order("linked_at", { ascending: false })
          .limit(20)
      : { data: [] as any[] };

    const lenderSignals = [
      ...(lenderActivity || []).map((l: any) => ({
        kind: "lender" as const,
        lenderName: l.name,
        dealId: l.deal_id,
        dealName: dealNameById.get(l.deal_id) || "",
        change: `${l.name} updated to ${l.stage}${l.tracking_status ? ` (${l.tracking_status})` : ""}`,
        at: l.updated_at,
      })),
      ...(claapRecent || []).map((c: any) => ({
        kind: "claap" as const,
        lenderName: c.recorder_name || "Claap",
        dealId: c.deal_id,
        dealName: dealNameById.get(c.deal_id) || "",
        change: `New Claap recording on ${dealNameById.get(c.deal_id) || "deal"}: ${c.recording_title || "Untitled"}`,
        at: c.linked_at,
      })),
    ]
      .filter((s) => !isExcludedDealName(s.dealName))
      .sort((a, b) => (b.at || "").localeCompare(a.at || ""));

    // ── 4. OUTSTANDING ITEMS NEEDING ATTENTION ──────────────────
    const outstandingNeedsAttn = (oiCounts || [])
      .filter((it: any) => {
        if (it.status === "completed" || it.status === "done") return false;
        const overdue = it.due_date && it.due_date < todayStr;
        const noAssignee = !it.assigned_to || !String(it.assigned_to).trim();
        return overdue || noAssignee;
      })
      .map((it: any) => ({
        id: (it as any).id,
        description: it.description,
        dealId: it.deal_id,
        dealName: dealNameById.get(it.deal_id) || "",
        dueDate: it.due_date,
        assignedTo: it.assigned_to,
        overdue: it.due_date && it.due_date < todayStr,
      }))
      .filter((o) => !isExcludedDealName(o.dealName));

    // ── 5. TODAY'S MEETINGS — only when caller IS Niki (Nylas) ──
    let meetings: Array<{ id: string; title: string; start: string; end: string; attendees: { email: string; name: string | null }[]; linkedDeal: { id: string; company: string } | null; }> = [];
    let calendarConnected = false;
    let calendarReason: string | null = null;

    if (isSelf && NYLAS_API_KEY) {
      try {
        const { data: tok } = await svc
          .from("gmail_tokens")
          .select("grant_id")
          .eq("user_id", NIKI_USER_ID)
          .maybeSingle();
        if (tok?.grant_id) {
          calendarConnected = true;
          const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
          const url = new URL(`${NYLAS_API_URI}/v3/grants/${tok.grant_id}/events`);
          url.searchParams.set("calendar_id", "primary");
          url.searchParams.set("start", String(Math.floor(startOfDay.getTime() / 1000)));
          url.searchParams.set("end", String(Math.floor(endOfDay.getTime() / 1000)));
          url.searchParams.set("limit", "50");
          const evRes = await fetch(url.toString(), {
            headers: {
              Authorization: `Bearer ${NYLAS_API_KEY}`,
              Accept: "application/json",
            },
          });
          if (evRes.ok) {
            const evJson = await evRes.json();
            const events = (evJson.data || []) as any[];
            // attendee → deal match via deal contacts/lenders/contact emails
            const attendeeEmails = new Set<string>();
            events.forEach((e) =>
              (e.participants || []).forEach((p: any) => p.email && attendeeEmails.add(p.email.toLowerCase())),
            );

            // Lender emails on Niki's deals
            let emailToDeal = new Map<string, { id: string; company: string }>();
            if (dealIds.length && attendeeEmails.size) {
              const { data: lenderContacts } = await svc
                .from("lender_contacts")
                .select("email, lender_id");
              const { data: dealLendersForMap } = await svc
                .from("deal_lenders")
                .select("id, deal_id")
                .in("deal_id", dealIds);
              const lenderToDeal = new Map<string, string>();
              (dealLendersForMap || []).forEach((dl: any) => lenderToDeal.set(dl.id, dl.deal_id));
              (lenderContacts || []).forEach((lc: any) => {
                const dealId = lenderToDeal.get(lc.lender_id);
                if (dealId && lc.email) {
                  const company = dealNameById.get(dealId);
                  if (company) emailToDeal.set(lc.email.toLowerCase(), { id: dealId, company });
                }
              });
            }

            meetings = events.map((e: any) => {
              const startTs = e.when?.start_time
                ? new Date(e.when.start_time * 1000).toISOString()
                : e.when?.start_date || "";
              const endTs = e.when?.end_time
                ? new Date(e.when.end_time * 1000).toISOString()
                : e.when?.end_date || "";
              const atts = (e.participants || []).map((p: any) => ({ email: p.email, name: p.name || null }));
              const matched = atts.find((a: any) => a.email && emailToDeal.has(a.email.toLowerCase()));
              const linked = matched ? emailToDeal.get(matched.email.toLowerCase())! : null;
              return {
                id: e.id,
                title: e.title || "(No title)",
                start: startTs,
                end: endTs,
                attendees: atts,
                linkedDeal: linked || null,
              };
            }).sort((a, b) => a.start.localeCompare(b.start));
          } else {
            calendarReason = `Nylas events fetch failed (${evRes.status})`;
          }
        } else {
          calendarReason = "Calendar not connected";
        }
      } catch (e) {
        calendarReason = e instanceof Error ? e.message : "Calendar error";
      }
    } else if (!isSelf) {
      calendarReason = "Today's meetings are only visible when Niki is signed in";
    }

    return jsonResponse({
      myDeals,
      myTasks,
      lenderSignals,
      outstandingNeedsAttn,
      meetings,
      calendarConnected,
      calendarReason,
      generatedAt: new Date().toISOString(),
      isSelf,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[niki-briefing]", msg);
    return jsonResponse({ error: msg }, 500);
  }
});