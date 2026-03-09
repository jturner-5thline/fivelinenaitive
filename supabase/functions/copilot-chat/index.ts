import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_TOOL_TURNS = 5;

// ── Context fetchers ──────────────────────────────────────────────
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
  return `DEAL: ${deal.company}\nValue: $${deal.value?.toLocaleString() || "N/A"} | Stage: ${deal.stage || "N/A"} | Status: ${deal.status || "N/A"}\nType: ${deal.deal_type || "N/A"} | Created: ${deal.created_at?.slice(0, 10)}\nNotes: ${deal.notes || "None"}\nNarrative: ${deal.narrative || "None"}\n\nLENDERS (${lenders.length}):\n${lenders.map((l: any) => `- ${l.name} | Stage: ${l.stage || "N/A"} | Status: ${l.tracking_status || "N/A"}`).join("\n") || "None"}\n\nMILESTONES (${milestones.length}):\n${milestones.map((m: any) => `- [${m.completed ? "✓" : "○"}] ${m.title} (due: ${m.due_date || "N/A"})`).join("\n") || "None"}\n\nRECENT ACTIVITY (${activities.length}):\n${activities.map((a: any) => `- ${a.created_at?.slice(0, 10)}: ${a.description} (${a.activity_type})`).join("\n") || "None"}\n\nOPEN TASKS (${tasks.length}):\n${tasks.map((t: any) => `- [${t.priority}] ${t.title} (due: ${t.due_date || "N/A"})`).join("\n") || "None"}`;
}

async function fetchDealsListContext(supabase: any, _userId: string) {
  const { data: deals } = await supabase.from("deals").select("id, company, value, stage, status, updated_at").order("updated_at", { ascending: false }).limit(200);
  if (!deals || deals.length === 0) return "No deals found.";
  const stageCounts: Record<string, number> = {};
  let totalValue = 0;
  const now = Date.now();
  const staleDays = 14 * 24 * 60 * 60 * 1000;
  const staleDeals: string[] = [];
  for (const d of deals) {
    stageCounts[d.stage || "Unknown"] = (stageCounts[d.stage || "Unknown"] || 0) + 1;
    totalValue += d.value || 0;
    if (d.updated_at && now - new Date(d.updated_at).getTime() > staleDays) staleDeals.push(d.company);
  }
  return `PIPELINE SUMMARY:\nTotal Deals: ${deals.length} | Total Value: $${totalValue.toLocaleString()}\n\nBY STAGE:\n${Object.entries(stageCounts).map(([s, c]) => `- ${s}: ${c}`).join("\n")}\n\nSTALE DEALS (no activity 14+ days): ${staleDeals.length}\n${staleDeals.slice(0, 10).map((n) => `- ${n}`).join("\n") || "None"}`;
}

async function fetchTasksContext(supabase: any, userId: string) {
  const { data: tasks } = await supabase.from("tasks").select("id, title, status, priority, due_date").eq("assigned_to", userId).in("status", ["todo", "in_progress"]).order("due_date", { ascending: true }).limit(50);
  if (!tasks || tasks.length === 0) return "No open tasks.";
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const overdue = tasks.filter((t: any) => t.due_date && t.due_date < todayStr);
  const dueToday = tasks.filter((t: any) => t.due_date === todayStr);
  const dueWeek = tasks.filter((t: any) => t.due_date && t.due_date > todayStr && t.due_date <= weekEnd);
  return `TASKS OVERVIEW:\nTotal Open: ${tasks.length} | Overdue: ${overdue.length} | Due Today: ${dueToday.length} | Due This Week: ${dueWeek.length}\n\nOVERDUE:\n${overdue.map((t: any) => `- [${t.priority}] ${t.title} (due: ${t.due_date})`).join("\n") || "None"}\n\nDUE TODAY:\n${dueToday.map((t: any) => `- [${t.priority}] ${t.title}`).join("\n") || "None"}\n\nDUE THIS WEEK:\n${dueWeek.map((t: any) => `- [${t.priority}] ${t.title} (due: ${t.due_date})`).join("\n") || "None"}`;
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
  return `DASHBOARD:\nActive Deals: ${activeDeals.length} | Pipeline Value: $${pipelineValue.toLocaleString()}\nOpen Tasks: ${tasks.length} | Overdue: ${overdueTasks.length} | Due Today: ${dueTodayTasks.length}\n\nRECENT ACTIVITY:\n${activities.map((a: any) => `- ${a.created_at?.slice(0, 10)}: ${a.description}`).join("\n") || "None"}`;
}

async function fetchLendersContext(supabase: any) {
  const { data: lenders } = await supabase.from("deal_lenders").select("name, stage, tracking_status, deal_id").limit(500);
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
  return `LENDER STATS (${Object.keys(lenderMap).length} unique lenders, ${lenders.length} total relationships):\n\nTOP LENDERS:\n${sorted.map(([name, data]) => `- ${name}: ${data.count} deals (${Object.entries(data.stages).map(([s, c]) => `${s}: ${c}`).join(", ")})`).join("\n")}`;
}

// ── Tool definitions ──────────────────────────────────────────────
const tools = [
  {
    type: "function",
    function: {
      name: "get_deal",
      description: "Get details about a specific deal by ID or by searching company name.",
      parameters: {
        type: "object",
        properties: {
          deal_id: { type: "string", description: "Deal UUID" },
          search: { type: "string", description: "Company name to search for" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_deals",
      description: "Search/filter deals by status, stage, stale days, or deal type.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["active", "closed_won", "closed_lost", "archived", "won", "lost"] },
          stage: { type: "string" },
          stale_days: { type: "number", description: "No activity in N days" },
          deal_type: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_deal_stage",
      description: "Move a deal to a different pipeline stage. Returns a confirmation — does NOT execute immediately.",
      parameters: {
        type: "object",
        properties: {
          deal_id: { type: "string" },
          new_stage: { type: "string" },
        },
        required: ["deal_id", "new_stage"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_deal_lenders",
      description: "Get all lenders on a specific deal with stage and notes.",
      parameters: {
        type: "object",
        properties: { deal_id: { type: "string" } },
        required: ["deal_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_lenders",
      description: "Search the master lender database by keyword.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Create a task. Returns a confirmation — does NOT execute immediately.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          deal_id: { type: "string" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
          due_date: { type: "string", description: "ISO date string YYYY-MM-DD" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_tasks",
      description: "Get tasks filtered by status, deal, or time range.",
      parameters: {
        type: "object",
        properties: {
          filter: { type: "string", enum: ["overdue", "today", "this_week", "all"] },
          deal_id: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pipeline_summary",
      description: "Get pipeline summary: counts by stage, total value, key metrics.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "draft_email",
      description: "Generate an email draft. Returns the draft text — does NOT send.",
      parameters: {
        type: "object",
        properties: {
          email_type: { type: "string", enum: ["outreach", "follow_up", "status_update", "term_sheet_response", "introduction"] },
          recipient_name: { type: "string" },
          recipient_email: { type: "string" },
          deal_id: { type: "string" },
          context: { type: "string", description: "Additional context for the email" },
        },
        required: ["email_type", "recipient_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_activity_log",
      description: "Get recent activity for a deal, user, or company.",
      parameters: {
        type: "object",
        properties: {
          deal_id: { type: "string" },
          days: { type: "number" },
          activity_type: { type: "string" },
        },
      },
    },
  },
];

// ── Tool executors ──────────────────────────────────────────────
async function executeTool(supabase: any, name: string, args: any, userId: string): Promise<any> {
  switch (name) {
    case "get_deal": {
      if (args.deal_id) {
        const { data } = await supabase.from("deals").select("*").eq("id", args.deal_id).single();
        if (!data) return { error: "Deal not found" };
        const { data: lenders } = await supabase.from("deal_lenders").select("name, stage, notes, tracking_status").eq("deal_id", args.deal_id);
        const { data: milestones } = await supabase.from("deal_milestones").select("title, completed, due_date").eq("deal_id", args.deal_id);
        return { deal: data, lenders: lenders || [], milestones: milestones || [] };
      }
      if (args.search) {
        const { data } = await supabase.from("deals").select("id, company, value, stage, status, deal_type, updated_at").ilike("company", `%${args.search}%`).limit(5);
        return { results: data || [] };
      }
      return { error: "Provide deal_id or search" };
    }
    case "search_deals": {
      let q = supabase.from("deals").select("id, company, value, stage, status, deal_type, updated_at").order("updated_at", { ascending: false }).limit(50);
      if (args.status) q = q.eq("status", args.status);
      if (args.stage) q = q.ilike("stage", `%${args.stage}%`);
      if (args.deal_type) q = q.ilike("deal_type", `%${args.deal_type}%`);
      const { data } = await q;
      let results = data || [];
      if (args.stale_days && results.length > 0) {
        const cutoff = Date.now() - args.stale_days * 24 * 60 * 60 * 1000;
        results = results.filter((d: any) => d.updated_at && new Date(d.updated_at).getTime() < cutoff);
      }
      return { count: results.length, deals: results };
    }
    case "update_deal_stage": {
      // Look up the deal to get current info
      const { data: deal } = await supabase.from("deals").select("id, company, stage").eq("id", args.deal_id).single();
      if (!deal) return { error: "Deal not found" };
      return {
        action: "confirm",
        action_type: "update_deal_stage",
        description: `Move "${deal.company}" from "${deal.stage}" to "${args.new_stage}"`,
        params: { deal_id: args.deal_id, new_stage: args.new_stage, current_stage: deal.stage, deal_name: deal.company },
      };
    }
    case "get_deal_lenders": {
      const { data } = await supabase.from("deal_lenders").select("id, name, stage, notes, tracking_status, created_at").eq("deal_id", args.deal_id).order("created_at", { ascending: false });
      return { lenders: data || [] };
    }
    case "search_lenders": {
      const { data } = await supabase.from("master_lenders").select("id, name, lender_type, geo, tier, loan_types, industries").ilike("name", `%${args.query}%`).limit(10);
      return { lenders: data || [] };
    }
    case "create_task": {
      return {
        action: "confirm",
        action_type: "create_task",
        description: `Create task: "${args.title}"${args.due_date ? ` (due: ${args.due_date})` : ""}${args.priority ? ` [${args.priority}]` : ""}`,
        params: { title: args.title, description: args.description, deal_id: args.deal_id, priority: args.priority || "medium", due_date: args.due_date },
      };
    }
    case "get_tasks": {
      let q = supabase.from("tasks").select("id, title, status, priority, due_date, deal_id").eq("assigned_to", userId).in("status", ["todo", "in_progress"]).order("due_date", { ascending: true }).limit(50);
      if (args.deal_id) q = q.eq("deal_id", args.deal_id);
      const { data } = await q;
      let tasks = data || [];
      const todayStr = new Date().toISOString().slice(0, 10);
      const weekEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      if (args.filter === "overdue") tasks = tasks.filter((t: any) => t.due_date && t.due_date < todayStr);
      else if (args.filter === "today") tasks = tasks.filter((t: any) => t.due_date === todayStr);
      else if (args.filter === "this_week") tasks = tasks.filter((t: any) => t.due_date && t.due_date <= weekEnd);
      return { count: tasks.length, tasks };
    }
    case "get_pipeline_summary": {
      const { data: deals } = await supabase.from("deals").select("id, company, value, stage, status").limit(500);
      if (!deals) return { error: "No deals" };
      const stageCounts: Record<string, number> = {};
      let totalValue = 0;
      let active = 0;
      for (const d of deals) {
        stageCounts[d.stage || "Unknown"] = (stageCounts[d.stage || "Unknown"] || 0) + 1;
        totalValue += d.value || 0;
        if (d.status === "active") active++;
      }
      return { total: deals.length, active, totalValue, byStage: stageCounts };
    }
    case "draft_email": {
      // Return info so the LLM can compose the email. The LLM itself will generate the email body.
      let dealInfo = null;
      if (args.deal_id) {
        const { data } = await supabase.from("deals").select("company, value, stage, deal_type").eq("id", args.deal_id).single();
        dealInfo = data;
      }
      return {
        action: "draft_email",
        email_type: args.email_type,
        recipient_name: args.recipient_name,
        recipient_email: args.recipient_email || null,
        deal: dealInfo,
        instruction: "Generate the email subject and body. Return ONLY a JSON object with keys: to_name, to_email, subject, body (HTML). Wrap in ```json code block.",
      };
    }
    case "get_activity_log": {
      let q = supabase.from("activity_logs").select("activity_type, description, created_at, user_display_name, deal_id").order("created_at", { ascending: false }).limit(20);
      if (args.deal_id) q = q.eq("deal_id", args.deal_id);
      if (args.activity_type) q = q.eq("activity_type", args.activity_type);
      const { data } = await q;
      return { activities: data || [] };
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ── Confirm action executor ──────────────────────────────────────
async function executeConfirmAction(supabase: any, actionType: string, params: any, userId: string) {
  switch (actionType) {
    case "update_deal_stage": {
      const { error } = await supabase.from("deals").update({ stage: params.new_stage }).eq("id", params.deal_id);
      if (error) return { success: false, error: error.message };
      // Log activity
      await supabase.from("activity_logs").insert({
        deal_id: params.deal_id,
        activity_type: "stage_change",
        description: `Stage changed from "${params.current_stage}" to "${params.new_stage}"`,
        user_id: userId,
      });
      return { success: true, message: `Moved "${params.deal_name}" to "${params.new_stage}"` };
    }
    case "create_task": {
      const { error } = await supabase.from("tasks").insert({
        title: params.title,
        description: params.description || null,
        deal_id: params.deal_id || null,
        priority: params.priority || "medium",
        due_date: params.due_date || null,
        status: "todo",
        assigned_to: userId,
        created_by: userId,
      });
      if (error) return { success: false, error: error.message };
      return { success: true, message: `Task "${params.title}" created` };
    }
    default:
      return { success: false, error: `Unknown action: ${actionType}` };
  }
}

// ── Main handler ──────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = user.id;

    const body = await req.json();

    // ── Handle confirm action ──
    if (body.confirmAction) {
      const result = await executeConfirmAction(supabaseUser, body.confirmAction.action_type, body.confirmAction.params, userId);
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { message, context, history } = body;

    // Fetch user profile
    const { data: profile } = await supabaseUser.from("profiles").select("display_name, email").eq("user_id", userId).single();
    const userName = profile?.display_name || profile?.email || "User";

    // Fetch context-specific data
    let contextData = "";
    const page = context?.page || "unknown";
    const entityType = context?.entityType;
    const entityId = context?.entityId;

    try {
      if (entityType === "deal" && entityId) contextData = await fetchDealContext(supabaseUser, entityId);
      else if (page.includes("deals") || page.includes("pipeline")) contextData = await fetchDealsListContext(supabaseUser, userId);
      else if (page.includes("task")) contextData = await fetchTasksContext(supabaseUser, userId);
      else if (page.includes("lender")) contextData = await fetchLendersContext(supabaseUser);
      else contextData = await fetchDashboardContext(supabaseUser, userId);
    } catch (e) {
      console.error("Context fetch error:", e);
      contextData = "Unable to fetch context data.";
    }

    const systemPrompt = `You are the nAItive AI Copilot — an intelligent assistant embedded in a deal management platform for private credit professionals (brokers, advisors, and lenders).

You help users manage their deal pipeline, track lender relationships, create tasks, draft communications, analyze portfolio performance, and get instant answers about their data.

CURRENT CONTEXT:
- Page: ${page}
- Entity: ${context?.entityDetails ? JSON.stringify(context.entityDetails) : "None"}
- User: ${userName} (${context?.userRole || "member"})
- Company: ${context?.companyId || "Unknown"}

LIVE DATA:
${contextData}

RULES:
1. Always ground answers in the actual data provided. Never fabricate deal names, lender names, amounts, or dates.
2. If asked about data you don't have, say so and suggest what the user can do.
3. For WRITE actions (moving deals, creating tasks), USE THE APPROPRIATE TOOL. The tool will return a confirmation object — include it verbatim in your response.
4. Keep responses concise and actionable. Use bullet points and short paragraphs.
5. Reference deals, lenders, tasks, contacts by their actual names from the data.
6. Format financial figures with $ and commas (e.g., $2,500,000).
7. You understand private credit terminology: DRL, LOI, term sheets, due diligence, ABL, mezzanine debt, growth capital, CapEx financing.
8. When a tool returns an object with "action": "confirm", include it in your response as a JSON code block with \`\`\`json ... \`\`\` so the frontend can render a confirmation card.
9. When drafting emails, return the draft as a JSON code block with \`\`\`json {"to_name": "...", "to_email": "...", "subject": "...", "body": "..."} \`\`\`.
10. ALWAYS prefer using tools over guessing. If you can look up real data, do it.
11. CRITICAL: You MUST always provide a response to every user message. If you cannot perform a requested action, explicitly say so (e.g., "I can't do that yet, but here's how to do it manually: ..."). NEVER return an empty or blank response.
12. When presenting a SPECIFIC DEAL from tool results, wrap it in a \`\`\`json block with responseType "deal_card": \`\`\`json { "responseType": "deal_card", "data": { "deal": { "id": "uuid", "company": "Name", "stage": "Stage", "status": "active", "deal_type": "Type", "value": 1000000, "updated_at": "ISO" }, "milestones": [{"completed":true},{"completed":false}] } } \`\`\`
12. When presenting LENDER info, use responseType "lender_card": \`\`\`json { "responseType": "lender_card", "data": { "name": "...", "stage": "...", "notes": "...", "created_at": "..." } } \`\`\`
13. When presenting TASK info, use responseType "task_card": \`\`\`json { "responseType": "task_card", "data": { "id": "...", "title": "...", "priority": "...", "due_date": "...", "assignee": { "display_name": "..." } } } \`\`\`
14. When presenting PIPELINE SUMMARY, use responseType "pipeline_summary": \`\`\`json { "responseType": "pipeline_summary", "data": { "total": 10, "active": 5, "totalValue": 1000000, "byStage": { "Active": 5 } } } \`\`\`
15. You CAN include multiple JSON card blocks in one response, mixed with regular markdown text.`;

    const apiMessages: any[] = [
      { role: "system", content: systemPrompt },
      ...(history || []).map((m: any) => ({ role: m.role, content: m.content })),
      { role: "user", content: message },
    ];

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

    // ── Multi-turn tool calling loop ──
    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      const response = await fetch(AI_GATEWAY, {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: apiMessages,
          tools,
          temperature: 0.3,
          max_tokens: 2000,
          ...(turn === 0 ? {} : { stream: false }),
        }),
      });

      if (!response.ok) {
        if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (response.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const errText = await response.text();
        console.error("AI gateway error:", response.status, errText);
        throw new Error("AI gateway error");
      }

      const data = await response.json();
      const choice = data.choices?.[0];
      if (!choice) throw new Error("No choice in response");

      const msg = choice.message;

      // If the model made tool calls, execute them
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        apiMessages.push(msg);

        for (const tc of msg.tool_calls) {
          let args: any = {};
          try {
            args = typeof tc.function.arguments === "string" ? JSON.parse(tc.function.arguments) : tc.function.arguments;
          } catch { /* empty args */ }

          const result = await executeTool(supabaseUser, tc.function.name, args, userId);
          apiMessages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
        }
        continue; // Next turn
      }

      // No tool calls — stream the final answer
      const finalResponse = await fetch(AI_GATEWAY, {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: apiMessages,
          temperature: 0.3,
          max_tokens: 2000,
          stream: true,
        }),
      });

      if (!finalResponse.ok) throw new Error("AI stream error");

      return new Response(finalResponse.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // Fallback after max turns
    return new Response(JSON.stringify({ error: "Too many tool turns" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("copilot-chat error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
