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
  const [dealRes, lendersRes, milestonesRes, activityRes, tasksRes, outstandingRes] = await Promise.all([
    supabase.from("deals").select("*").eq("id", entityId).single(),
    supabase.from("deal_lenders").select("id, name, stage, notes, tracking_status, created_at").eq("deal_id", entityId).order("created_at", { ascending: false }),
    supabase.from("deal_milestones").select("id, title, completed, due_date, created_at").eq("deal_id", entityId).order("due_date", { ascending: true }),
    supabase.from("activity_logs").select("activity_type, description, created_at, user_display_name").eq("deal_id", entityId).order("created_at", { ascending: false }).limit(10),
    supabase.from("tasks").select("id, title, status, priority, due_date").eq("deal_id", entityId).in("status", ["todo", "in_progress"]).order("due_date", { ascending: true }),
    supabase.from("outstanding_items").select("id, description, status, priority, assigned_to, due_date, eta, notes, lender_id").eq("deal_id", entityId).order("position", { ascending: true }),
  ]);
  const deal = dealRes.data;
  if (!deal) return "Deal not found.";
  const lenders = lendersRes.data || [];
  const milestones = milestonesRes.data || [];
  const activities = activityRes.data || [];
  const tasks = tasksRes.data || [];
  const outstanding = outstandingRes.data || [];
  return `DEAL: ${deal.company}\nValue: $${deal.value?.toLocaleString() || "N/A"} | Stage: ${deal.stage || "N/A"} | Status: ${deal.status || "N/A"}\nType: ${deal.deal_type || "N/A"} | Created: ${deal.created_at?.slice(0, 10)}\nNotes: ${deal.notes || "None"}\nNarrative: ${deal.narrative || "None"}\n\nLENDERS (${lenders.length}):\n${lenders.map((l: any) => `- ${l.name} | Stage: ${l.stage || "N/A"} | Status: ${l.tracking_status || "N/A"}`).join("\n") || "None"}\n\nMILESTONES (${milestones.length}):\n${milestones.map((m: any) => `- [${m.completed ? "✓" : "○"}] ${m.title} (due: ${m.due_date || "N/A"}) [id: ${m.id}]`).join("\n") || "None"}\n\nOUTSTANDING ITEMS (${outstanding.length}):\n${outstanding.map((o: any) => `- [${o.status}] ${o.description} | Priority: ${o.priority} | Due: ${o.due_date || "N/A"} | ETA: ${o.eta || "N/A"}`).join("\n") || "None"}\n\nRECENT ACTIVITY (${activities.length}):\n${activities.map((a: any) => `- ${a.created_at?.slice(0, 10)}: ${a.description} (${a.activity_type})`).join("\n") || "None"}\n\nOPEN TASKS (${tasks.length}):\n${tasks.map((t: any) => `- [${t.priority}] ${t.title} (due: ${t.due_date || "N/A"})`).join("\n") || "None"}`;
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
  const overdue = tasks.filter((t: any) => t.due_date && t.due_date < todayStr);
  const dueToday = tasks.filter((t: any) => t.due_date === todayStr);
  return `YOUR TASKS (${tasks.length}):\nOverdue: ${overdue.length} | Due Today: ${dueToday.length}\n\n${tasks.map((t: any) => `- [${t.priority}] ${t.title} | Status: ${t.status} | Due: ${t.due_date || "N/A"}`).join("\n")}`;
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
      description: "Get details about a specific deal by ID or by searching company name. Returns deal info, lenders, milestones, and outstanding items.",
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
      parameters: { type: "object", properties: {} },
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
      description: "Get recent activity/communications history for a deal or globally. Use for questions like 'when was the last update?' or 'what's recent activity?'",
      parameters: {
        type: "object",
        properties: {
          deal_id: { type: "string" },
          days: { type: "number", description: "Limit to last N days" },
          activity_type: { type: "string" },
          limit: { type: "number", description: "Max results (default 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_milestone",
      description: "Mark a deal milestone as complete or incomplete. Returns a confirmation — does NOT execute immediately.",
      parameters: {
        type: "object",
        properties: {
          deal_id: { type: "string", description: "Deal UUID the milestone belongs to" },
          milestone_id: { type: "string", description: "Milestone UUID" },
          milestone_title: { type: "string", description: "Milestone title for display" },
          completed: { type: "boolean", description: "true to mark complete, false for incomplete" },
        },
        required: ["deal_id", "milestone_id", "completed"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_lender_status",
      description: "Update a deal lender's stage or tracking status. Returns a confirmation — does NOT execute immediately.",
      parameters: {
        type: "object",
        properties: {
          deal_id: { type: "string" },
          lender_id: { type: "string" },
          lender_name: { type: "string" },
          stage: { type: "string", description: "New lender stage" },
          tracking_status: { type: "string", description: "New tracking status" },
        },
        required: ["deal_id", "lender_id", "lender_name"],
      },
    },
  },
  // ── NEW DATA ACCESS TOOLS ──
  {
    type: "function",
    function: {
      name: "get_outstanding_items",
      description: "Get outstanding items (action items, requests, follow-ups) for a deal. Use when user asks about outstanding items, open requests, or pending actions.",
      parameters: {
        type: "object",
        properties: {
          deal_id: { type: "string", description: "Deal UUID" },
          status: { type: "string", description: "Filter by status: open, completed, all", enum: ["open", "completed", "all"] },
        },
        required: ["deal_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_deal_milestones",
      description: "Get detailed milestone status for a deal including completion dates. Use when user asks about milestone progress, what's complete/incomplete.",
      parameters: {
        type: "object",
        properties: {
          deal_id: { type: "string", description: "Deal UUID" },
        },
        required: ["deal_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_data_room_documents",
      description: "Get uploaded documents in the deal's data room. Use when user asks 'what documents have been uploaded?', 'what documents are missing?', or about the data room.",
      parameters: {
        type: "object",
        properties: {
          deal_id: { type: "string", description: "Deal UUID" },
        },
        required: ["deal_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_deal_memo",
      description: "Get the internal deal memo content including narrative, highlights, hurdles, analyst notes, lender notes, and approval status. Use when user asks about the deal memo, narrative, key terms, or company description.",
      parameters: {
        type: "object",
        properties: {
          deal_id: { type: "string", description: "Deal UUID" },
        },
        required: ["deal_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_deal_writeup",
      description: "Get the deal writeup/company profile including management team, financials, industry info, and company details. Use when user asks about the management team, company background, or deal writeup.",
      parameters: {
        type: "object",
        properties: {
          deal_id: { type: "string", description: "Deal UUID" },
        },
        required: ["deal_id"],
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
        const [lendersRes, milestonesRes, outstandingRes] = await Promise.all([
          supabase.from("deal_lenders").select("id, name, stage, notes, tracking_status").eq("deal_id", args.deal_id),
          supabase.from("deal_milestones").select("id, title, completed, due_date").eq("deal_id", args.deal_id).order("position", { ascending: true }),
          supabase.from("outstanding_items").select("id, description, status, priority, assigned_to, due_date, eta, notes").eq("deal_id", args.deal_id).order("position", { ascending: true }),
        ]);
        return { deal: data, lenders: lendersRes.data || [], milestones: milestonesRes.data || [], outstanding_items: outstandingRes.data || [] };
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
      const maxResults = args.limit || 20;
      let q = supabase.from("activity_logs").select("activity_type, description, created_at, user_display_name, deal_id").order("created_at", { ascending: false }).limit(maxResults);
      if (args.deal_id) q = q.eq("deal_id", args.deal_id);
      if (args.activity_type) q = q.eq("activity_type", args.activity_type);
      if (args.days) {
        const cutoff = new Date(Date.now() - args.days * 24 * 60 * 60 * 1000).toISOString();
        q = q.gte("created_at", cutoff);
      }
      const { data } = await q;
      return { activities: data || [] };
    }
    case "update_milestone": {
      const { data: milestone } = await supabase.from("deal_milestones").select("id, title, completed").eq("id", args.milestone_id).single();
      if (!milestone) return { error: "Milestone not found" };
      const title = args.milestone_title || milestone.title;
      return {
        action: "confirm",
        action_type: "update_milestone",
        description: `${args.completed ? 'Mark' : 'Unmark'} "${title}" as ${args.completed ? 'complete' : 'incomplete'}`,
        params: { milestone_id: args.milestone_id, milestone_title: title, completed: args.completed, deal_id: args.deal_id },
      };
    }
    case "update_lender_status": {
      const { data: lender } = await supabase.from("deal_lenders").select("id, name, stage, tracking_status").eq("id", args.lender_id).single();
      if (!lender) return { error: "Lender not found" };
      const parts = [];
      if (args.stage) parts.push(`stage to "${args.stage}"`);
      if (args.tracking_status) parts.push(`status to "${args.tracking_status}"`);
      return {
        action: "confirm",
        action_type: "update_lender_status",
        description: `Update ${args.lender_name}: ${parts.join(' and ')}`,
        params: { lender_id: args.lender_id, lender_name: args.lender_name, stage: args.stage, tracking_status: args.tracking_status, deal_id: args.deal_id },
      };
    }
    // ── NEW DATA ACCESS TOOLS ──
    case "get_outstanding_items": {
      let q = supabase.from("outstanding_items").select("id, description, status, priority, assigned_to, due_date, eta, notes, lender_id, created_at").eq("deal_id", args.deal_id).order("position", { ascending: true });
      if (args.status === "open") q = q.in("status", ["open", "pending", "in_progress"]);
      else if (args.status === "completed") q = q.eq("status", "completed");
      const { data } = await q;
      const items = data || [];
      // Try to resolve lender names
      if (items.length > 0) {
        const lenderIds = [...new Set(items.filter((i: any) => i.lender_id).map((i: any) => i.lender_id))];
        if (lenderIds.length > 0) {
          const { data: lenders } = await supabase.from("deal_lenders").select("id, name").in("id", lenderIds);
          const lenderMap = new Map((lenders || []).map((l: any) => [l.id, l.name]));
          items.forEach((i: any) => { if (i.lender_id) i.lender_name = lenderMap.get(i.lender_id) || "Unknown"; });
        }
      }
      return { count: items.length, outstanding_items: items };
    }
    case "get_deal_milestones": {
      const { data } = await supabase.from("deal_milestones").select("id, title, completed, completed_at, due_date, position, status, created_at, updated_at").eq("deal_id", args.deal_id).order("position", { ascending: true });
      const milestones = data || [];
      const completed = milestones.filter((m: any) => m.completed).length;
      return { total: milestones.length, completed, incomplete: milestones.length - completed, milestones };
    }
    case "get_data_room_documents": {
      const [attachmentsRes, spaceDocsRes, checklistRes] = await Promise.all([
        supabase.from("deal_attachments").select("id, name, category, content_type, size_bytes, created_at, source").eq("deal_id", args.deal_id).order("created_at", { ascending: false }),
        supabase.from("deal_space_documents").select("id, name, content_type, size_bytes, created_at").eq("deal_id", args.deal_id).order("created_at", { ascending: false }),
        supabase.from("data_room_checklist_items").select("id, label, category, is_required").limit(100),
      ]);
      const attachments = attachmentsRes.data || [];
      const spaceDocs = spaceDocsRes.data || [];
      const checklistItems = checklistRes.data || [];

      // Format sizes
      const formatSize = (bytes: number) => {
        if (!bytes) return "N/A";
        if (bytes < 1024) return `${bytes}B`;
        if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
        return `${(bytes / 1048576).toFixed(1)}MB`;
      };

      return {
        data_room_documents: attachments.map((a: any) => ({
          name: a.name, category: a.category, type: a.content_type, size: formatSize(a.size_bytes), uploaded: a.created_at?.slice(0, 10), source: a.source,
        })),
        deal_space_documents: spaceDocs.map((d: any) => ({
          name: d.name, type: d.content_type, size: formatSize(d.size_bytes), uploaded: d.created_at?.slice(0, 10),
        })),
        checklist_items: checklistItems.map((c: any) => ({
          label: c.label, category: c.category, required: c.is_required,
        })),
        total_attachments: attachments.length,
        total_space_docs: spaceDocs.length,
      };
    }
    case "get_deal_memo": {
      const { data: memo } = await supabase.from("deal_memos").select("narrative, highlights, hurdles, analyst_notes, lender_notes, other_notes, approval_state, current_approval_level, submitted_at, approved_at, rejected_at, rejection_reason, updated_at").eq("deal_id", args.deal_id).single();
      if (!memo) return { has_memo: false, message: "No deal memo exists for this deal yet." };
      return {
        has_memo: true,
        narrative: memo.narrative || "Not written yet",
        highlights: memo.highlights || "None",
        hurdles: memo.hurdles || "None",
        analyst_notes: memo.analyst_notes || "None",
        lender_notes: memo.lender_notes || "None",
        other_notes: memo.other_notes || "None",
        approval_state: memo.approval_state,
        current_approval_level: memo.current_approval_level,
        submitted_at: memo.submitted_at,
        approved_at: memo.approved_at,
        rejected_at: memo.rejected_at,
        rejection_reason: memo.rejection_reason,
        last_updated: memo.updated_at,
      };
    }
    case "get_deal_writeup": {
      const { data: writeup } = await supabase.from("deal_writeups").select("company_name, description, industry, location, year_founded, headcount, deal_type, capital_ask, use_of_funds, revenue_type, billing_model, b2b_b2c, gross_margins, profitability, last_year_revenue, this_year_revenue, total_equity_raised, existing_debt_details, collateral_available, sponsorship, customer_base, team, company_highlights, key_items, financial_comments, company_url, linkedin_url").eq("deal_id", args.deal_id).single();
      if (!writeup) return { has_writeup: false, message: "No deal writeup exists for this deal." };
      return {
        has_writeup: true,
        company: {
          name: writeup.company_name,
          description: writeup.description,
          industry: writeup.industry,
          location: writeup.location,
          year_founded: writeup.year_founded,
          headcount: writeup.headcount,
          website: writeup.company_url,
          linkedin: writeup.linkedin_url,
        },
        deal: {
          type: writeup.deal_type,
          capital_ask: writeup.capital_ask,
          use_of_funds: writeup.use_of_funds,
        },
        financials: {
          revenue_type: writeup.revenue_type,
          billing_model: writeup.billing_model,
          b2b_b2c: writeup.b2b_b2c,
          gross_margins: writeup.gross_margins,
          profitability: writeup.profitability,
          last_year_revenue: writeup.last_year_revenue,
          this_year_revenue: writeup.this_year_revenue,
          total_equity_raised: writeup.total_equity_raised,
          existing_debt: writeup.existing_debt_details,
          collateral: writeup.collateral_available,
          sponsorship: writeup.sponsorship,
        },
        management_team: writeup.team || [],
        highlights: writeup.company_highlights || [],
        key_items: writeup.key_items || [],
        financial_comments: writeup.financial_comments || [],
        customer_base: writeup.customer_base,
      };
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
      const { data: verified } = await supabase.from("deals").select("stage").eq("id", params.deal_id).single();
      if (!verified || verified.stage !== params.new_stage) {
        return { success: false, error: `Failed to move "${params.deal_name}" to "${params.new_stage}". The stage is still "${verified?.stage || 'unknown'}". Please try again or do it manually.` };
      }
      await supabase.from("activity_logs").insert({
        deal_id: params.deal_id,
        activity_type: "stage_change",
        description: `Stage changed from "${params.current_stage}" to "${params.new_stage}"`,
        user_id: userId,
      });
      return { success: true, message: `Moved "${params.deal_name}" to "${params.new_stage}"`, actionType: "update_deal_stage", params: { deal_id: params.deal_id, new_stage: params.new_stage } };
    }
    case "create_task": {
      const { data: newTask, error } = await supabase.from("tasks").insert({
        title: params.title,
        description: params.description || null,
        deal_id: params.deal_id || null,
        priority: params.priority || "medium",
        due_date: params.due_date || null,
        status: "todo",
        assigned_to: userId,
        created_by: userId,
      }).select("id, title").single();
      if (error) return { success: false, error: error.message };
      if (!newTask) return { success: false, error: `Failed to create task "${params.title}". Please try again or create it manually.` };
      return { success: true, message: `Task "${params.title}" created`, actionType: "create_task", params: { task_id: newTask.id, deal_id: params.deal_id } };
    }
    case "update_milestone": {
      const { error } = await supabase.from("deal_milestones").update({ completed: params.completed, completed_at: params.completed ? new Date().toISOString() : null }).eq("id", params.milestone_id);
      if (error) return { success: false, error: error.message };
      const { data: verified } = await supabase.from("deal_milestones").select("completed").eq("id", params.milestone_id).single();
      if (!verified || verified.completed !== params.completed) {
        return { success: false, error: `Failed to ${params.completed ? 'complete' : 'uncomplete'} "${params.milestone_title}". Please try again or do it manually.` };
      }
      if (params.deal_id) {
        await supabase.from("activity_logs").insert({
          deal_id: params.deal_id,
          activity_type: "milestone_update",
          description: `Milestone "${params.milestone_title}" marked as ${params.completed ? 'complete' : 'incomplete'}`,
          user_id: userId,
        });
      }
      return { success: true, message: `${params.milestone_title} marked as ${params.completed ? 'complete' : 'incomplete'}`, actionType: "update_milestone", params: { deal_id: params.deal_id, milestone_id: params.milestone_id } };
    }
    case "update_lender_status": {
      const updateFields: any = {};
      if (params.stage) updateFields.stage = params.stage;
      if (params.tracking_status) updateFields.tracking_status = params.tracking_status;
      const { error } = await supabase.from("deal_lenders").update(updateFields).eq("id", params.lender_id);
      if (error) return { success: false, error: error.message };
      const { data: verified } = await supabase.from("deal_lenders").select("stage, tracking_status").eq("id", params.lender_id).single();
      if (!verified) return { success: false, error: `Failed to update lender "${params.lender_name}". Please try again or do it manually.` };
      return { success: true, message: `Updated ${params.lender_name}${params.stage ? ` stage to "${params.stage}"` : ''}${params.tracking_status ? ` status to "${params.tracking_status}"` : ''}`, actionType: "update_lender_status", params: { deal_id: params.deal_id, lender_id: params.lender_id } };
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
2. If asked about data you don't have, USE A TOOL to fetch it. You have tools for: outstanding items, milestones, data room documents, deal memo, deal writeup/management team, activity log, lenders, and tasks.
3. For WRITE actions (moving deals, creating tasks, updating milestones), USE THE APPROPRIATE TOOL. The tool will return a confirmation object — include it verbatim in your response.
4. Keep responses concise and actionable. Use bullet points and short paragraphs.
5. Reference deals, lenders, tasks, contacts by their actual names from the data.
6. Format financial figures with $ and commas (e.g., $2,500,000).
7. You understand private credit terminology: DRL, LOI, term sheets, due diligence, ABL, mezzanine debt, growth capital, CapEx financing.
8. When a tool returns an object with "action": "confirm", include it in your response as a JSON code block with \`\`\`json ... \`\`\` so the frontend can render a confirmation card.
9. When drafting emails, return the draft as a JSON code block with \`\`\`json {"to_name": "...", "to_email": "...", "subject": "...", "body": "..."} \`\`\`.
10. ALWAYS prefer using tools over guessing. If you can look up real data, do it.
11. CRITICAL: You MUST always provide a response to every user message. If you cannot perform a requested action, explicitly say so (e.g., "I can't do that yet, but here's how to do it manually: ..."). NEVER return an empty or blank response.
12. When presenting a SPECIFIC DEAL from tool results, wrap it in a \`\`\`json block with responseType "deal_card".
13. When presenting LENDER info, use responseType "lender_card".
14. When presenting TASK info, use responseType "task_card".
15. When presenting PIPELINE SUMMARY, use responseType "pipeline_summary".
16. You CAN include multiple JSON card blocks in one response, mixed with regular markdown text.

AVAILABLE DATA TOOLS (use these when the user asks about specific deal data):
- get_outstanding_items: For "what are the outstanding items?", "open requests", "pending actions"
- get_deal_milestones: For milestone progress, completion status
- get_data_room_documents: For "what documents are uploaded?", "what's in the data room?", "missing documents"
- get_deal_memo: For deal narrative, highlights, hurdles, analyst/lender notes, approval status
- get_deal_writeup: For management team, company background, financials, industry info
- get_activity_log: For "when was the last update?", "recent activity", communication history
- get_deal_lenders: For lender details on a deal
- get_tasks: For task lists and overdue items`;

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
