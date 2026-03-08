import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function fetchDealContext(supabase: any, entityId: string) {
  const [dealRes, lendersRes, milestonesRes, activityRes, tasksRes] = await Promise.all([
    supabase.from("deals").select("*").eq("id", entityId).single(),
    supabase.from("deal_lenders").select("id, name, stage, notes, tracking_status, created_at").eq("deal_id", entityId).order("created_at", { ascending: false }),
    supabase.from("deal_milestones").select("id, title, completed, due_date, created_at").eq("deal_id", entityId).order("due_date", { ascending: true }),
    supabase.from("activity_logs").select("activity_type, description, created_at, user_display_name").eq("deal_id", entityId).order("created_at", { ascending: false }).limit(10),
    supabase.from("tasks").select("id, title, status, priority, due_date").eq("deal_id", entityId).in("status", ["todo", "in_progress"]).order("due_date", { ascending: true }),
  ]);

  const deal = dealRes.data;
  if (!deal) return "Deal not found.";

  const lenders = lendersRes.data || [];
  const milestones = milestonesRes.data || [];
  const activities = activityRes.data || [];
  const tasks = tasksRes.data || [];

  return `DEAL: ${deal.company}
Value: $${deal.value?.toLocaleString() || "N/A"} | Stage: ${deal.stage || "N/A"} | Status: ${deal.status || "N/A"}
Type: ${deal.deal_type || "N/A"} | Created: ${deal.created_at?.slice(0, 10)}
Notes: ${deal.notes || "None"}
Narrative: ${deal.narrative || "None"}

LENDERS (${lenders.length}):
${lenders.map((l: any) => `- ${l.name} | Stage: ${l.stage || "N/A"} | Status: ${l.tracking_status || "N/A"}`).join("\n") || "None"}

MILESTONES (${milestones.length}):
${milestones.map((m: any) => `- [${m.completed ? "✓" : "○"}] ${m.title} (due: ${m.due_date || "N/A"})`).join("\n") || "None"}

RECENT ACTIVITY (${activities.length}):
${activities.map((a: any) => `- ${a.created_at?.slice(0, 10)}: ${a.description} (${a.activity_type})`).join("\n") || "None"}

OPEN TASKS (${tasks.length}):
${tasks.map((t: any) => `- [${t.priority}] ${t.title} (due: ${t.due_date || "N/A"})`).join("\n") || "None"}`;
}

async function fetchDealsListContext(supabase: any, userId: string) {
  const { data: deals } = await supabase
    .from("deals")
    .select("id, company, value, stage, status, updated_at")
    .order("updated_at", { ascending: false })
    .limit(200);

  if (!deals || deals.length === 0) return "No deals found.";

  const stageCounts: Record<string, number> = {};
  let totalValue = 0;
  const now = Date.now();
  const staleDays = 14 * 24 * 60 * 60 * 1000;
  const staleDeals: string[] = [];

  for (const d of deals) {
    stageCounts[d.stage || "Unknown"] = (stageCounts[d.stage || "Unknown"] || 0) + 1;
    totalValue += d.value || 0;
    if (d.updated_at && now - new Date(d.updated_at).getTime() > staleDays) {
      staleDeals.push(d.company);
    }
  }

  return `PIPELINE SUMMARY:
Total Deals: ${deals.length} | Total Value: $${totalValue.toLocaleString()}

BY STAGE:
${Object.entries(stageCounts).map(([s, c]) => `- ${s}: ${c}`).join("\n")}

STALE DEALS (no activity 14+ days): ${staleDeals.length}
${staleDeals.slice(0, 10).map((n) => `- ${n}`).join("\n") || "None"}`;
}

async function fetchTasksContext(supabase: any, userId: string) {
  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, status, priority, due_date")
    .eq("assigned_to", userId)
    .in("status", ["todo", "in_progress"])
    .order("due_date", { ascending: true })
    .limit(50);

  if (!tasks || tasks.length === 0) return "No open tasks.";

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const overdue = tasks.filter((t: any) => t.due_date && t.due_date < todayStr);
  const dueToday = tasks.filter((t: any) => t.due_date === todayStr);
  const dueWeek = tasks.filter((t: any) => t.due_date && t.due_date > todayStr && t.due_date <= weekEnd);

  return `TASKS OVERVIEW:
Total Open: ${tasks.length} | Overdue: ${overdue.length} | Due Today: ${dueToday.length} | Due This Week: ${dueWeek.length}

OVERDUE:
${overdue.map((t: any) => `- [${t.priority}] ${t.title} (due: ${t.due_date})`).join("\n") || "None"}

DUE TODAY:
${dueToday.map((t: any) => `- [${t.priority}] ${t.title}`).join("\n") || "None"}

DUE THIS WEEK:
${dueWeek.map((t: any) => `- [${t.priority}] ${t.title} (due: ${t.due_date})`).join("\n") || "None"}`;
}

async function fetchDashboardContext(supabase: any, userId: string) {
  const [dealsRes, tasksRes, activityRes] = await Promise.all([
    supabase.from("deals").select("id, company, value, stage, status").limit(500),
    supabase.from("tasks").select("id, title, status, priority, due_date").eq("assigned_to", userId).in("status", ["todo", "in_progress"]).order("due_date", { ascending: true }).limit(50),
    supabase.from("activity_logs").select("activity_type, description, created_at, user_display_name").order("created_at", { ascending: false }).limit(5),
  ]);

  const deals = dealsRes.data || [];
  const tasks = tasksRes.data || [];
  const activities = activityRes.data || [];

  const activeDeals = deals.filter((d: any) => d.status === "active");
  const pipelineValue = deals.reduce((sum: number, d: any) => sum + (d.value || 0), 0);
  const todayStr = new Date().toISOString().slice(0, 10);
  const overdueTasks = tasks.filter((t: any) => t.due_date && t.due_date < todayStr);
  const dueTodayTasks = tasks.filter((t: any) => t.due_date === todayStr);

  return `DASHBOARD:
Active Deals: ${activeDeals.length} | Pipeline Value: $${pipelineValue.toLocaleString()}
Open Tasks: ${tasks.length} | Overdue: ${overdueTasks.length} | Due Today: ${dueTodayTasks.length}

RECENT ACTIVITY:
${activities.map((a: any) => `- ${a.created_at?.slice(0, 10)}: ${a.description}`).join("\n") || "None"}`;
}

async function fetchLendersContext(supabase: any) {
  const { data: lenders } = await supabase
    .from("deal_lenders")
    .select("name, stage, tracking_status, deal_id")
    .limit(500);

  if (!lenders || lenders.length === 0) return "No lender data.";

  const lenderMap: Record<string, { count: number; stages: Record<string, number> }> = {};
  for (const l of lenders) {
    const name = l.name || "Unknown";
    if (!lenderMap[name]) lenderMap[name] = { count: 0, stages: {} };
    lenderMap[name].count++;
    const stage = l.stage || "Unknown";
    lenderMap[name].stages[stage] = (lenderMap[name].stages[stage] || 0) + 1;
  }

  const sorted = Object.entries(lenderMap).sort((a, b) => b[1].count - a[1].count).slice(0, 20);

  return `LENDER STATS (${Object.keys(lenderMap).length} unique lenders, ${lenders.length} total relationships):

TOP LENDERS:
${sorted.map(([name, data]) => `- ${name}: ${data.count} deals (${Object.entries(data.stages).map(([s, c]) => `${s}: ${c}`).join(", ")})`).join("\n")}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;

    const { message, context, history } = await req.json();

    // Fetch user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, email")
      .eq("user_id", userId)
      .single();

    const userName = profile?.display_name || profile?.email || "User";

    // Fetch context-specific data
    let contextData = "";
    const page = context?.page || "unknown";
    const entityType = context?.entityType;
    const entityId = context?.entityId;

    try {
      if (entityType === "deal" && entityId) {
        contextData = await fetchDealContext(supabase, entityId);
      } else if (page.includes("deals") || page.includes("pipeline")) {
        contextData = await fetchDealsListContext(supabase, userId);
      } else if (page.includes("task")) {
        contextData = await fetchTasksContext(supabase, userId);
      } else if (page.includes("lender")) {
        contextData = await fetchLendersContext(supabase);
      } else {
        contextData = await fetchDashboardContext(supabase, userId);
      }
    } catch (e) {
      console.error("Context fetch error:", e);
      contextData = "Unable to fetch context data.";
    }

    const entityDetails = context?.entityDetails
      ? JSON.stringify(context.entityDetails)
      : "None";

    const systemPrompt = `You are the nAItive AI Copilot — an intelligent assistant embedded in a deal management platform for private credit professionals (brokers, advisors, and lenders).

You help users manage their deal pipeline, track lender relationships, create tasks, draft communications, analyze portfolio performance, and get instant answers about their data.

CURRENT CONTEXT:
- Page: ${page}
- Entity: ${entityDetails}
- User: ${userName} (${context?.userRole || "member"})
- Company: ${context?.companyId || "Unknown"}

LIVE DATA:
${contextData}

RULES:
1. Always ground answers in the actual data provided. Never fabricate deal names, lender names, amounts, or dates.
2. If asked about data you don't have, say so and suggest what the user can do.
3. When suggesting write actions (update a deal, create a task), describe what you'll do and ask for confirmation before executing.
4. Keep responses concise and actionable. Use bullet points and short paragraphs.
5. Reference deals, lenders, tasks, contacts by their actual names from the data.
6. Format financial figures with $ and commas (e.g., $2,500,000).
7. You understand private credit terminology: DRL, LOI, term sheets, due diligence, ABL, mezzanine debt, growth capital, CapEx financing.`;

    const apiMessages = [
      { role: "system", content: systemPrompt },
      ...(history || []).map((m: any) => ({ role: m.role, content: m.content })),
      { role: "user", content: message },
    ];

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: apiMessages,
        stream: true,
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("AI gateway error");
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("copilot-chat error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
