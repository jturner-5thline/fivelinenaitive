import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const CLAUDE_TIMEOUT_MS = 55_000;

async function fetchUserContext(supabase: any, userId: string, companyId: string) {
  if (!companyId) {
    return {
      deals: [], tasks: [], lenders: [], milestones: [], activities: [],
      lenderStats: [], staleDeals: [],
    };
  }

  const [dealsRes, tasksRes] = await Promise.all([
    supabase.from("deals")
      .select("id, company, value, stage, status, deal_type, business_model, created_at, updated_at, user_id, deal_owner, manager, next_follow_up_at, notes_updated_at")
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false })
      .limit(80),
    supabase.from("tasks")
      .select("id, title, status, priority, due_date, description, assigned_to, created_at, deal_id")
      .eq("assigned_to", userId)
      .neq("status", "done")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(40),
  ]);

  if (dealsRes.error) {
    console.error("[claude-dashboard-chat] deals query error", {
      message: dealsRes.error.message,
      code: (dealsRes.error as any).code,
      companyId,
    });
  }
  if (tasksRes.error) {
    console.error("[claude-dashboard-chat] tasks query error", {
      message: tasksRes.error.message,
      code: (tasksRes.error as any).code,
    });
  }

  const allDeals = dealsRes.data || [];
  const deals = allDeals.filter((d: any) => {
    const n = (d.company || "").toLowerCase().trim();
    if (n.startsWith("test ")) return false;
    if (n === "test-niki's store" || n === "test-niki’s store") return false;
    if (n === "example deal") return false;
    return true;
  });

  const tasks = tasksRes.data || [];
  const dealIds = deals.map((d: any) => d.id);

  if (dealIds.length === 0) {
    return { deals, tasks, lenders: [], milestones: [], activities: [], lenderStats: [], staleDeals: [] };
  }

  const [lendersRes, milestonesRes, activitiesRes, lenderStatsRes] = await Promise.all([
    supabase.from("deal_lenders")
      .select("id, name, stage, substage, quote_amount, quote_rate, notes, pass_reason, deal_id, created_at, updated_at, deals(company)")
      .in("deal_id", dealIds)
      .order("updated_at", { ascending: false })
      .limit(150),
    supabase.from("deal_milestones")
      .select("id, title, completed, due_date, deal_id, status, created_at, deals(company)")
      .in("deal_id", dealIds)
      .eq("completed", false)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(60),
    supabase.from("activity_logs")
      .select("activity_type, description, created_at, deal_id, user_display_name, deals(company)")
      .in("deal_id", dealIds)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase.rpc("get_lender_deal_stats", { _company_id: companyId, _limit: 25 }).then((r: any) => r).catch(() => ({ data: [] })),
  ]);

  const lenders = lendersRes.data || [];
  const milestones = milestonesRes.data || [];
  const activities = activitiesRes.data || [];

  // Compute "last touch" per deal from the most recent of: deal updated_at,
  // notes_updated_at, latest activity_log, latest deal_lender update.
  const now = Date.now();
  const lastActivityByDeal = new Map<string, number>();
  for (const a of activities) {
    const t = new Date(a.created_at).getTime();
    const prev = lastActivityByDeal.get(a.deal_id) || 0;
    if (t > prev) lastActivityByDeal.set(a.deal_id, t);
  }
  for (const l of lenders) {
    const t = new Date(l.updated_at || l.created_at).getTime();
    const prev = lastActivityByDeal.get(l.deal_id) || 0;
    if (t > prev) lastActivityByDeal.set(l.deal_id, t);
  }

  // "Active" for staleness = pipeline-active deals only (exclude archived,
  // on-hold, dead, won, lost). on-hold deals are intentionally suppressed.
  const isActiveStatus = (s: string) =>
    !!s && !["archived", "on-hold", "on_hold", "closed-won", "closed-lost", "lost", "won", "dead"].includes(s);

  const staleDeals = deals
    .filter((d: any) => isActiveStatus(d.status))
    .map((d: any) => {
      // Use real activity signals (logs, lender touches, notes) — NOT the bulk
      // updated_at column, which can be touched en-masse by maintenance jobs.
      const candidates = [
        lastActivityByDeal.get(d.id) || 0,
        d.notes_updated_at ? new Date(d.notes_updated_at).getTime() : 0,
      ].filter(Boolean);
      const last = candidates.length ? Math.max(...candidates) : new Date(d.created_at).getTime();
      const days = Math.floor((now - last) / 86_400_000);
      return { ...d, days_since_activity: days };
    })
    .filter((d: any) => d.days_since_activity >= 14)
    .sort((a: any, b: any) => b.days_since_activity - a.days_since_activity);

  return {
    deals, tasks, lenders, milestones, activities,
    lenderStats: lenderStatsRes?.data || [],
    staleDeals,
  };
}

function buildContextString(ctx: any, companyName: string, userName: string) {
  const { deals, tasks, lenders, milestones, activities, lenderStats, staleDeals } = ctx;
  const today = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];

  lines.push(`## User Context\nUser: ${userName} | Company: ${companyName} | Date: ${today}`);

  if (deals.length > 0) {
    lines.push(`## Deals (${deals.length} total, showing active)`);
    const isActiveStatus = (s: string) =>
      !!s && !["archived", "on-hold", "on_hold", "closed-won", "closed-lost", "lost", "won"].includes(s);
    const activeDeals = deals.filter((d: any) => isActiveStatus(d.status)).slice(0, 30);
    activeDeals.forEach((d: any) => {
      const last = new Date(d.updated_at || d.created_at);
      const daysAgo = Math.floor((Date.now() - last.getTime()) / 86_400_000);
      const valueM = d.value ? `$${(d.value / 1e6).toFixed(1)}M` : "n/a";
      lines.push(`- ${d.company}: ${valueM} | stage: ${d.stage}${d.business_model ? ` | ${d.business_model}` : ""} | last update: ${daysAgo}d ago`);
    });
  }

  if (lenders.length > 0) {
    lines.push(`\n## Active Deal-Lender Relationships (${lenders.length})`);
    lenders.slice(0, 60).forEach((l: any) => {
      const last = new Date(l.updated_at || l.created_at);
      const daysAgo = Math.floor((Date.now() - last.getTime()) / 86_400_000);
      lines.push(`- ${l.name} on ${l.deals?.company || "?"} | stage: ${l.stage}${l.substage ? `/${l.substage}` : ""}${l.quote_amount ? ` | quote $${(l.quote_amount / 1e6).toFixed(1)}M` : ""}${l.pass_reason ? ` | PASSED: ${l.pass_reason}` : ""} | last touch ${daysAgo}d ago`);
    });
  }

  if (lenderStats.length > 0) {
    lines.push(`\n## Lender Activity Summary (top by deal count)`);
    lenderStats.slice(0, 20).forEach((l: any) => {
      lines.push(`- ${l.lender_name}: ${l.deal_count} total deals, ${l.active_count} active, $${(l.total_volume / 1e6).toFixed(0)}M total volume`);
    });
  }

  if (milestones.length > 0) {
    lines.push(`\n## Open Milestones / Outstanding Items (${milestones.length})`);
    milestones.slice(0, 40).forEach((m: any) => {
      lines.push(`- ${m.deals?.company || "?"}: ${m.title}${m.due_date ? ` (due ${m.due_date})` : ""}${m.status ? ` [${m.status}]` : ""}`);
    });
  }

  if (tasks.length > 0) {
    lines.push(`\n## My Open Tasks (assigned to ${userName}) — ${tasks.length}`);
    tasks.slice(0, 40).forEach((t: any) => {
      const dealCompany = deals.find((d: any) => d.id === t.deal_id)?.company;
      lines.push(`- [${t.priority || "normal"}] ${t.title}${t.due_date ? ` | due ${t.due_date}` : ""}${dealCompany ? ` | deal: ${dealCompany}` : ""}${t.status ? ` | ${t.status}` : ""}`);
    });
  }

  if (staleDeals.length > 0) {
    lines.push(`\n## Stale-Risk Deals (>=21 days no activity)`);
    staleDeals.slice(0, 15).forEach((d: any) => {
      const lendersOnDeal = lenders
        .filter((l: any) => l.deal_id === d.id && l.stage !== "Passed" && l.stage !== "Funded")
        .slice(0, 5)
        .map((l: any) => l.name);
      lines.push(`- ${d.company}: ${d.days_since_activity}d since activity | stage: ${d.stage}${lendersOnDeal.length ? ` | active lenders: ${lendersOnDeal.join(", ")}` : " | no active lenders"}`);
    });
  }

  if (activities.length > 0) {
    lines.push(`\n## Recent Activity (last 25)`);
    activities.slice(0, 25).forEach((a: any) => {
      lines.push(`- ${a.deals?.company || "?"} [${a.activity_type}]: ${a.description}${a.user_display_name ? ` (${a.user_display_name})` : ""}`);
    });
  }

  return lines.join("\n");
}

function getPromptAddendum(userText: string): string {
  const t = userText.toLowerCase();
  if (/what are we waiting on|waiting on/.test(t)) {
    return `\n\n## Task: "What are we waiting on?"
Produce a brief, scannable list of outstanding items grouped by deal. For each deal with open items, write ONE concise line in the format:
**Deal Name** – what we're waiting on (lender, person, doc, or signal).
Use open milestones, lenders awaiting response, missing docs, and recent activity. Keep it under 8 deals. Be action-oriented. No headers, no preamble.`;
  }
  if (/most active lender|active lender/.test(t)) {
    return `\n\n## Task: "Who are our most active lenders?"
Return a short ranked list (top 6–10) of lenders with the most current activity. For each, ONE line:
**Lender Name** – active on N deals; brief context (e.g., "2 in term sheet / proposal", "3 new deals sent in last 30 days").
Use the Lender Activity Summary and Active Deal-Lender Relationships data. Rank by active deal count. No preamble.`;
  }
  if (/stale deal/.test(t)) {
    return `\n\n## Task: "Stale Deals Analysis"
For each deal flagged as stale-risk, give ONE concise line:
**Deal Name** – Xd since activity; current stage; key lenders involved (or "no active lenders"); brief risk note.
Limit to top 8. Order by days-since-activity descending. No preamble, no closing summary.`;
  }
  if (/to-?do list|my tasks|what do i need to do/.test(t)) {
    return `\n\n## Task: "To-Do List"
Summarize MY open tasks in a structured but conversational form. Group by urgency:
**Today** – inline list of today/overdue items with brief deal context.
**Next 3 days** – inline list of upcoming items.
**Later** – brief mention only if relevant.
Each item: short verb-led phrase + relevant counterparty/deal. No preamble.`;
  }
  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth-bound client for verifying the user
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service-role client for fetching context. We've already verified the user
    // and we explicitly scope every query by company_id / user_id below, so
    // using the service role here avoids RLS edge cases that have intermittently
    // returned empty results for users with valid company memberships.
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const body = await req.json();
    const messages = body.messages || [];
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "Messages required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: membership } = await supabase
      .from("company_members")
      .select("company_id, role, companies(name)")
      .eq("user_id", user.id)
      .maybeSingle();

    const companyId = membership?.company_id;
    const companyName = (membership as any)?.companies?.name || "your company";

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, first_name")
      .eq("user_id", user.id)
      .maybeSingle();
    const userName = profile?.first_name || profile?.display_name || "there";

    const ctx = await fetchUserContext(supabase, user.id, companyId);
    const userContext = buildContextString(ctx, companyName, userName);

    console.log("[claude-dashboard-chat] context loaded", {
      user_id: user.id,
      company_id: companyId,
      company_name: companyName,
      counts: {
        deals: ctx.deals?.length || 0,
        tasks: ctx.tasks?.length || 0,
        lenders: ctx.lenders?.length || 0,
        milestones: ctx.milestones?.length || 0,
        activities: ctx.activities?.length || 0,
        lenderStats: ctx.lenderStats?.length || 0,
        staleDeals: ctx.staleDeals?.length || 0,
      },
      context_chars: userContext.length,
    });

    const lastUserText = [...messages].reverse().find((m: any) => m.role === "user")?.content || "";
    const promptAddendum = getPromptAddendum(lastUserText);

    const systemPrompt = `You are nAItive Copilot — a Claude-powered deal intelligence assistant for commercial lending professionals at ${companyName}. You answer questions about deals, lenders, pipeline, tasks, and outstanding items using the user's actual data below.

The user's name is ${userName}.

## Your Style
- Concise, scannable, action-oriented. Skip preamble.
- Use **bold** deal/lender names. Prefer short lines over paragraphs.
- Use markdown for lists; do not over-format.
- Reference real entities from the data — never invent deals, lenders, or numbers.
- If the data doesn't contain the answer, say so briefly.

## User's Live Data
${userContext}
${promptAddendum}`;

    const anthropicMessages = messages
      .filter((m: any) => m.role === "user" || m.role === "assistant")
      .map((m: any) => ({ role: m.role, content: String(m.content || "") }));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);

    const anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 2048,
        temperature: 0.4,
        system: systemPrompt,
        messages: anthropicMessages,
        stream: true,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!anthropicResp.ok) {
      const errText = await anthropicResp.text().catch(() => "");
      console.error("[claude-dashboard-chat] Anthropic error:", anthropicResp.status, "model:", CLAUDE_MODEL, "body:", errText);
      if (anthropicResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({
          error: "AI service unavailable",
          upstream_status: anthropicResp.status,
          upstream_body: errText.slice(0, 1000),
          model: CLAUDE_MODEL,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!anthropicResp.body) {
      return new Response(JSON.stringify({ error: "Empty AI response" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const reader = anthropicResp.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(out) {
        let buf = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });

            let nl: number;
            while ((nl = buf.indexOf("\n")) !== -1) {
              const line = buf.slice(0, nl).replace(/\r$/, "");
              buf = buf.slice(nl + 1);
              if (!line.startsWith("data: ")) continue;
              const payload = line.slice(6).trim();
              if (!payload) continue;
              try {
                const evt = JSON.parse(payload);
                if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
                  const text = evt.delta.text || "";
                  if (text) {
                    const openaiChunk = {
                      choices: [{ delta: { content: text } }],
                    };
                    out.enqueue(encoder.encode(`data: ${JSON.stringify(openaiChunk)}\n\n`));
                  }
                } else if (evt.type === "message_stop") {
                  out.enqueue(encoder.encode(`data: [DONE]\n\n`));
                }
              } catch {
              }
            }
          }
          out.enqueue(encoder.encode(`data: [DONE]\n\n`));
        } catch (e) {
          console.error("[claude-dashboard-chat] stream error:", e);
        } finally {
          try { out.close(); } catch {}
        }
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (e) {
    console.error("[claude-dashboard-chat] error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
