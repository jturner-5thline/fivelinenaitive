import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_TOOL_TURNS = 10;

// Context fetchers removed — data is now lazy-loaded via tool calls

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
      description: "Move a deal to a different pipeline stage. HIGH RISK — returns a confirmation card.",
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
      description: "Create a task. Returns a confirmation card.",
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
      description: "Get recent activity/communications history for a deal or globally.",
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
  // ── MILESTONE TOOLS ──
  {
    type: "function",
    function: {
      name: "toggle_milestone",
      description: "Mark a deal milestone as complete or incomplete. LOW RISK — auto-executes immediately.",
      parameters: {
        type: "object",
        properties: {
          deal_id: { type: "string", description: "Deal UUID" },
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
      name: "add_milestone",
      description: "Add a new custom milestone to a deal. LOW RISK — auto-executes immediately.",
      parameters: {
        type: "object",
        properties: {
          deal_id: { type: "string", description: "Deal UUID" },
          title: { type: "string", description: "Milestone name" },
          due_date: { type: "string", description: "Optional due date YYYY-MM-DD" },
        },
        required: ["deal_id", "title"],
      },
    },
  },
  // ── OUTSTANDING ITEMS TOOLS ──
  {
    type: "function",
    function: {
      name: "create_outstanding_item",
      description: "Create a new outstanding item for a deal. LOW RISK — auto-executes immediately.",
      parameters: {
        type: "object",
        properties: {
          deal_id: { type: "string", description: "Deal UUID" },
          description: { type: "string", description: "Item description/name" },
          assigned_to: { type: "string", description: "Person name to assign to" },
          due_date: { type: "string", description: "Optional due date YYYY-MM-DD" },
          priority: { type: "string", enum: ["low", "medium", "high"], description: "Priority level" },
        },
        required: ["deal_id", "description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_outstanding_item",
      description: "Mark an outstanding item as complete. LOW RISK — auto-executes immediately.",
      parameters: {
        type: "object",
        properties: {
          deal_id: { type: "string", description: "Deal UUID" },
          item_id: { type: "string", description: "Outstanding item UUID" },
          item_description: { type: "string", description: "Item description for display" },
        },
        required: ["deal_id", "item_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_outstanding_item",
      description: "Delete an outstanding item. HIGH RISK — returns a confirmation card.",
      parameters: {
        type: "object",
        properties: {
          deal_id: { type: "string", description: "Deal UUID" },
          item_id: { type: "string", description: "Outstanding item UUID" },
          item_description: { type: "string", description: "Item description for display" },
        },
        required: ["deal_id", "item_id"],
      },
    },
  },
  // ── DEAL NOTES ──
  {
    type: "function",
    function: {
      name: "add_deal_note",
      description: "Add a note or status update to the deal's activity log. LOW RISK — auto-executes immediately.",
      parameters: {
        type: "object",
        properties: {
          deal_id: { type: "string", description: "Deal UUID" },
          note: { type: "string", description: "The note/update text" },
        },
        required: ["deal_id", "note"],
      },
    },
  },
  // ── DEAL FIELD UPDATES ──
  {
    type: "function",
    function: {
      name: "update_deal_fields",
      description: "Update deal fields like value/size, closing_date, or flag status. Value and closing_date are MEDIUM RISK (confirmation). Flag is LOW RISK (auto-execute).",
      parameters: {
        type: "object",
        properties: {
          deal_id: { type: "string", description: "Deal UUID" },
          deal_name: { type: "string", description: "Deal company name for display" },
          value: { type: "number", description: "New deal size/value" },
          closing_date: { type: "string", description: "New closing date YYYY-MM-DD or null to clear" },
          is_flagged: { type: "boolean", description: "Set flag true/false" },
          flag_notes: { type: "string", description: "Flag notes" },
        },
        required: ["deal_id", "deal_name"],
      },
    },
  },
  // ── LENDER STATUS ──
  {
    type: "function",
    function: {
      name: "update_lender_status",
      description: "Update a deal lender's stage or tracking status. HIGH RISK — returns a confirmation card.",
      parameters: {
        type: "object",
        properties: {
          deal_id: { type: "string" },
          lender_id: { type: "string" },
          lender_name: { type: "string" },
          stage: { type: "string", description: "New lender stage" },
          tracking_status: { type: "string", description: "New tracking status (active, on-hold, on-deck, passed)" },
          pass_reason: { type: "string", description: "Reason for passing (when marking as passed)" },
        },
        required: ["deal_id", "lender_id", "lender_name"],
      },
    },
  },
  // ── DATA ACCESS TOOLS ──
  {
    type: "function",
    function: {
      name: "get_outstanding_items",
      description: "Get outstanding items for a deal.",
      parameters: {
        type: "object",
        properties: {
          deal_id: { type: "string" },
          status: { type: "string", enum: ["open", "completed", "all"] },
        },
        required: ["deal_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_deal_milestones",
      description: "Get detailed milestone status for a deal.",
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
      name: "get_data_room_documents",
      description: "Get uploaded documents in the deal's data room.",
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
      name: "get_deal_memo",
      description: "Get the internal deal memo content.",
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
      name: "get_deal_writeup",
      description: "Get the deal writeup/company profile including management team.",
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
      name: "get_deal_health",
      description: "Get a comprehensive health check for a deal: overdue milestones, stale lenders, missing documents, unassigned outstanding items, and stale activity. Use when user asks 'what should I do next?', 'what needs attention?', 'what's the priority?', or anything about deal health.",
      parameters: {
        type: "object",
        properties: { deal_id: { type: "string" } },
        required: ["deal_id"],
      },
    },
  },
];

// ── Tool selection by context ──────────────────────────────────
function selectTools(page: string, entityType?: string) {
  // On deal pages, include all tools for full functionality
  if (entityType === "deal") return tools;

  const coreNames = new Set([
    "get_deal", "search_deals", "get_pipeline_summary", "get_activity_log",
    "draft_email", "create_task", "get_tasks",
  ]);

  if (page.includes("lender")) {
    ["get_deal_lenders", "search_lenders", "update_lender_status"].forEach(n => coreNames.add(n));
  } else if (page.includes("deals") || page.includes("pipeline")) {
    ["get_deal_lenders", "get_deal_health", "get_deal_milestones", "get_outstanding_items"].forEach(n => coreNames.add(n));
  } else if (page.includes("task")) {
    // Tasks page: core + task tools only
  } else {
    // Dashboard and other pages: core + some deal read tools
    ["get_deal_lenders", "get_deal_health"].forEach(n => coreNames.add(n));
  }

  return tools.filter(t => coreNames.has(t.function.name));
}

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

    // ── LOW RISK: Auto-execute milestone toggle ──
    case "toggle_milestone": {
      const { error } = await supabase.from("deal_milestones").update({
        completed: args.completed,
        completed_at: args.completed ? new Date().toISOString() : null,
      }).eq("id", args.milestone_id);
      if (error) return { error: `Failed to update milestone: ${error.message}` };
      // Verify
      const { data: verified } = await supabase.from("deal_milestones").select("completed, title").eq("id", args.milestone_id).single();
      if (!verified || verified.completed !== args.completed) {
        return { error: `Failed to ${args.completed ? 'complete' : 'uncomplete'} milestone "${args.milestone_title || 'Unknown'}". Please try manually.` };
      }
      // Log activity
      if (args.deal_id) {
        await supabase.from("activity_logs").insert({
          deal_id: args.deal_id, activity_type: "milestone_update",
          description: `Milestone "${verified.title}" marked as ${args.completed ? 'complete' : 'incomplete'} via AI Copilot`,
          user_id: userId,
        });
      }
      return {
        action: "auto_executed",
        action_type: "toggle_milestone",
        success: true,
        message: `✓ ${verified.title} marked as ${args.completed ? 'complete' : 'incomplete'}`,
        params: { deal_id: args.deal_id, milestone_id: args.milestone_id },
      };
    }

    // ── LOW RISK: Auto-execute add milestone ──
    case "add_milestone": {
      // Get max position
      const { data: existing } = await supabase.from("deal_milestones").select("position").eq("deal_id", args.deal_id).order("position", { ascending: false }).limit(1);
      const nextPos = (existing?.[0]?.position ?? -1) + 1;
      const { data: newMilestone, error } = await supabase.from("deal_milestones").insert({
        deal_id: args.deal_id, title: args.title, due_date: args.due_date || null,
        completed: false, position: nextPos,
      }).select("id, title").single();
      if (error || !newMilestone) return { error: `Failed to create milestone: ${error?.message || 'Unknown error'}` };
      await supabase.from("activity_logs").insert({
        deal_id: args.deal_id, activity_type: "milestone_added",
        description: `Milestone "${args.title}" added via AI Copilot`,
        user_id: userId,
      });
      return {
        action: "auto_executed",
        action_type: "add_milestone",
        success: true,
        message: `✓ Milestone "${args.title}" added${args.due_date ? ` (due: ${args.due_date})` : ''}`,
        params: { deal_id: args.deal_id, milestone_id: newMilestone.id },
      };
    }

    // ── LOW RISK: Auto-execute create outstanding item ──
    case "create_outstanding_item": {
      const { data: existing } = await supabase.from("outstanding_items").select("position").eq("deal_id", args.deal_id).order("position", { ascending: false }).limit(1);
      const nextPos = (existing?.[0]?.position ?? -1) + 1;
      const { data: newItem, error } = await supabase.from("outstanding_items").insert({
        deal_id: args.deal_id, description: args.description,
        assigned_to: args.assigned_to || null, due_date: args.due_date || null,
        priority: args.priority || "medium", status: "open", position: nextPos,
        user_id: userId,
      }).select("id, description").single();
      if (error || !newItem) return { error: `Failed to create outstanding item: ${error?.message || 'Unknown error'}` };
      await supabase.from("activity_logs").insert({
        deal_id: args.deal_id, activity_type: "outstanding_item_added",
        description: `Outstanding item "${args.description}" added via AI Copilot`,
        user_id: userId,
      });
      return {
        action: "auto_executed",
        action_type: "create_outstanding_item",
        success: true,
        message: `✓ Outstanding item "${args.description}" created`,
        params: { deal_id: args.deal_id, item_id: newItem.id },
      };
    }

    // ── LOW RISK: Auto-execute complete outstanding item ──
    case "complete_outstanding_item": {
      const { error } = await supabase.from("outstanding_items").update({ status: "completed" }).eq("id", args.item_id);
      if (error) return { error: `Failed to complete item: ${error.message}` };
      const { data: verified } = await supabase.from("outstanding_items").select("status, description").eq("id", args.item_id).single();
      if (!verified || verified.status !== "completed") {
        return { error: `Failed to complete "${args.item_description || 'item'}". Please try manually.` };
      }
      await supabase.from("activity_logs").insert({
        deal_id: args.deal_id, activity_type: "outstanding_item_completed",
        description: `Outstanding item "${verified.description}" completed via AI Copilot`,
        user_id: userId,
      });
      return {
        action: "auto_executed",
        action_type: "complete_outstanding_item",
        success: true,
        message: `✓ "${verified.description}" marked as complete`,
        params: { deal_id: args.deal_id, item_id: args.item_id },
      };
    }

    // ── HIGH RISK: Confirm delete outstanding item ──
    case "delete_outstanding_item": {
      const { data: item } = await supabase.from("outstanding_items").select("id, description").eq("id", args.item_id).single();
      if (!item) return { error: "Outstanding item not found" };
      return {
        action: "confirm",
        action_type: "delete_outstanding_item",
        description: `Delete outstanding item: "${item.description}"`,
        params: { deal_id: args.deal_id, item_id: args.item_id, item_description: item.description },
      };
    }

    // ── LOW RISK: Auto-execute add deal note ──
    case "add_deal_note": {
      const { error } = await supabase.from("activity_logs").insert({
        deal_id: args.deal_id, activity_type: "note",
        description: args.note, user_id: userId,
      });
      if (error) return { error: `Failed to add note: ${error.message}` };
      return {
        action: "auto_executed",
        action_type: "add_deal_note",
        success: true,
        message: `✓ Note added to deal activity log`,
        params: { deal_id: args.deal_id },
      };
    }

    // ── MIXED RISK: Deal field updates ──
    case "update_deal_fields": {
      const { data: deal } = await supabase.from("deals").select("id, company, value, closing_date, is_flagged").eq("id", args.deal_id).single();
      if (!deal) return { error: "Deal not found" };

      // Flag changes are LOW RISK — auto-execute
      if (args.is_flagged !== undefined && args.value === undefined && args.closing_date === undefined) {
        const { error } = await supabase.from("deals").update({
          is_flagged: args.is_flagged,
          flag_notes: args.flag_notes || null,
        }).eq("id", args.deal_id);
        if (error) return { error: `Failed to update flag: ${error.message}` };
        await supabase.from("activity_logs").insert({
          deal_id: args.deal_id, activity_type: "deal_flagged",
          description: `Deal ${args.is_flagged ? 'flagged' : 'unflagged'} via AI Copilot${args.flag_notes ? ': ' + args.flag_notes : ''}`,
          user_id: userId,
        });
        return {
          action: "auto_executed",
          action_type: "update_deal_flag",
          success: true,
          message: `✓ ${deal.company} ${args.is_flagged ? 'flagged' : 'unflagged'}`,
          params: { deal_id: args.deal_id },
        };
      }

      // Value or closing_date changes are MEDIUM RISK — confirmation required
      const changes: string[] = [];
      if (args.value !== undefined) changes.push(`Deal size: $${deal.value?.toLocaleString() || 0} → $${args.value.toLocaleString()}`);
      if (args.closing_date !== undefined) changes.push(`Close date: ${deal.closing_date || 'None'} → ${args.closing_date || 'None'}`);
      if (args.is_flagged !== undefined) changes.push(`Flag: ${args.is_flagged ? 'On' : 'Off'}`);

      return {
        action: "confirm",
        action_type: "update_deal_fields",
        description: `Update ${deal.company}: ${changes.join(', ')}`,
        params: {
          deal_id: args.deal_id, deal_name: deal.company,
          value: args.value, closing_date: args.closing_date,
          is_flagged: args.is_flagged, flag_notes: args.flag_notes,
          current_value: deal.value, current_closing_date: deal.closing_date,
        },
      };
    }

    // ── HIGH RISK: Confirm lender status update ──
    case "update_lender_status": {
      const { data: lender } = await supabase.from("deal_lenders").select("id, name, stage, tracking_status").eq("id", args.lender_id).single();
      if (!lender) return { error: "Lender not found" };
      const parts = [];
      if (args.stage) parts.push(`stage to "${args.stage}"`);
      if (args.tracking_status) parts.push(`status to "${args.tracking_status}"`);
      if (args.pass_reason) parts.push(`pass reason: "${args.pass_reason}"`);
      return {
        action: "confirm",
        action_type: "update_lender_status",
        description: `Update ${args.lender_name}: ${parts.join(' and ')}`,
        params: {
          lender_id: args.lender_id, lender_name: args.lender_name,
          stage: args.stage, tracking_status: args.tracking_status,
          pass_reason: args.pass_reason, deal_id: args.deal_id,
        },
      };
    }

    // ── DATA ACCESS TOOLS ──
    case "get_outstanding_items": {
      let q = supabase.from("outstanding_items").select("id, description, status, priority, assigned_to, due_date, eta, notes, lender_id, created_at").eq("deal_id", args.deal_id).order("position", { ascending: true });
      if (args.status === "open") q = q.in("status", ["open", "pending", "in_progress"]);
      else if (args.status === "completed") q = q.eq("status", "completed");
      const { data } = await q;
      const items = data || [];
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
      const formatSize = (bytes: number) => {
        if (!bytes) return "N/A";
        if (bytes < 1024) return `${bytes}B`;
        if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
        return `${(bytes / 1048576).toFixed(1)}MB`;
      };
      return {
        data_room_documents: attachments.map((a: any) => ({ name: a.name, category: a.category, type: a.content_type, size: formatSize(a.size_bytes), uploaded: a.created_at?.slice(0, 10), source: a.source })),
        deal_space_documents: spaceDocs.map((d: any) => ({ name: d.name, type: d.content_type, size: formatSize(d.size_bytes), uploaded: d.created_at?.slice(0, 10) })),
        checklist_items: checklistItems.map((c: any) => ({ label: c.label, category: c.category, required: c.is_required })),
        total_attachments: attachments.length,
        total_space_docs: spaceDocs.length,
      };
    }
    case "get_deal_memo": {
      const { data: memo } = await supabase.from("deal_memos").select("narrative, highlights, hurdles, analyst_notes, lender_notes, other_notes, approval_state, current_approval_level, submitted_at, approved_at, rejected_at, rejection_reason, updated_at").eq("deal_id", args.deal_id).single();
      if (!memo) return { has_memo: false, message: "No deal memo exists for this deal yet." };
      return {
        has_memo: true, narrative: memo.narrative || "Not written yet", highlights: memo.highlights || "None",
        hurdles: memo.hurdles || "None", analyst_notes: memo.analyst_notes || "None",
        lender_notes: memo.lender_notes || "None", other_notes: memo.other_notes || "None",
        approval_state: memo.approval_state, current_approval_level: memo.current_approval_level,
        submitted_at: memo.submitted_at, approved_at: memo.approved_at,
        rejected_at: memo.rejected_at, rejection_reason: memo.rejection_reason, last_updated: memo.updated_at,
      };
    }
    case "get_deal_writeup": {
      const { data: writeup } = await supabase.from("deal_writeups").select("company_name, description, industry, location, year_founded, headcount, deal_type, capital_ask, use_of_funds, revenue_type, billing_model, b2b_b2c, gross_margins, profitability, last_year_revenue, this_year_revenue, total_equity_raised, existing_debt_details, collateral_available, sponsorship, customer_base, team, company_highlights, key_items, financial_comments, company_url, linkedin_url").eq("deal_id", args.deal_id).single();
      if (!writeup) return { has_writeup: false, message: "No deal writeup exists for this deal." };
      return {
        has_writeup: true,
        company: { name: writeup.company_name, description: writeup.description, industry: writeup.industry, location: writeup.location, year_founded: writeup.year_founded, headcount: writeup.headcount, website: writeup.company_url, linkedin: writeup.linkedin_url },
        deal: { type: writeup.deal_type, capital_ask: writeup.capital_ask, use_of_funds: writeup.use_of_funds },
        financials: { revenue_type: writeup.revenue_type, billing_model: writeup.billing_model, b2b_b2c: writeup.b2b_b2c, gross_margins: writeup.gross_margins, profitability: writeup.profitability, last_year_revenue: writeup.last_year_revenue, this_year_revenue: writeup.this_year_revenue, total_equity_raised: writeup.total_equity_raised, existing_debt: writeup.existing_debt_details, collateral: writeup.collateral_available, sponsorship: writeup.sponsorship },
        management_team: writeup.team || [],
        highlights: writeup.company_highlights || [],
        key_items: writeup.key_items || [],
        financial_comments: writeup.financial_comments || [],
        customer_base: writeup.customer_base,
      };
    }
    // ── DEAL HEALTH CHECK ──
    case "get_deal_health": {
      const todayStr = new Date().toISOString().slice(0, 10);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

      const [dealRes, milestonesRes, outstandingRes, lendersRes, activityRes, attachmentsRes, checklistRes] = await Promise.all([
        supabase.from("deals").select("company, stage, status, value, updated_at, closing_date").eq("id", args.deal_id).single(),
        supabase.from("deal_milestones").select("id, title, completed, due_date, status").eq("deal_id", args.deal_id).order("position", { ascending: true }),
        supabase.from("outstanding_items").select("id, description, status, assigned_to, due_date, priority").eq("deal_id", args.deal_id).in("status", ["open", "pending", "in_progress"]),
        supabase.from("deal_lenders").select("id, name, stage, tracking_status, updated_at, created_at").eq("deal_id", args.deal_id),
        supabase.from("activity_logs").select("created_at").eq("deal_id", args.deal_id).order("created_at", { ascending: false }).limit(1),
        supabase.from("deal_attachments").select("id, category").eq("deal_id", args.deal_id),
        supabase.from("data_room_checklist_items").select("id, label, category, is_required").eq("is_required", true),
      ]);

      const deal = dealRes.data;
      const milestones = milestonesRes.data || [];
      const outstanding = outstandingRes.data || [];
      const lenders = lendersRes.data || [];
      const lastActivity = activityRes.data?.[0]?.created_at;
      const attachments = attachmentsRes.data || [];
      const requiredDocs = checklistRes.data || [];

      // Overdue milestones
      const overdueMilestones = milestones.filter((m: any) => !m.completed && m.due_date && m.due_date < todayStr);
      const incompleteMilestones = milestones.filter((m: any) => !m.completed);

      // Outstanding items issues
      const overdueItems = outstanding.filter((o: any) => o.due_date && o.due_date < todayStr);
      const unassignedItems = outstanding.filter((o: any) => !o.assigned_to);

      // Stale lenders (no update in 7+ days)
      const staleLenders = lenders.filter((l: any) => {
        const lastUpdate = l.updated_at || l.created_at;
        return lastUpdate && lastUpdate < sevenDaysAgo && l.tracking_status !== 'passed';
      });

      // Lenders needing response
      const activeLenders = lenders.filter((l: any) => l.tracking_status === 'active' || l.tracking_status === 'on-deck');

      // Stale deal activity
      const isStale = lastActivity ? lastActivity < fourteenDaysAgo : true;
      const daysSinceActivity = lastActivity ? Math.floor((Date.now() - new Date(lastActivity).getTime()) / (24 * 60 * 60 * 1000)) : null;

      // Missing required documents (simplified)
      const uploadedCategories = new Set(attachments.map((a: any) => a.category));
      const missingDocs = requiredDocs.filter((d: any) => !uploadedCategories.has(d.category));

      const issues: any[] = [];

      if (overdueMilestones.length > 0) {
        issues.push({
          priority: "high", category: "milestones",
          summary: `${overdueMilestones.length} overdue milestone(s)`,
          details: overdueMilestones.map((m: any) => `"${m.title}" was due ${m.due_date}`),
          suggestion: "Would you like me to update the due dates or mark any as complete?",
        });
      }

      if (overdueItems.length > 0) {
        issues.push({
          priority: "high", category: "outstanding_items",
          summary: `${overdueItems.length} overdue outstanding item(s)`,
          details: overdueItems.map((o: any) => `"${o.description}" was due ${o.due_date}`),
          suggestion: "Would you like me to reassign or complete any of these?",
        });
      }

      if (staleLenders.length > 0) {
        issues.push({
          priority: "medium", category: "lenders",
          summary: `${staleLenders.length} lender(s) with no update in 7+ days`,
          details: staleLenders.map((l: any) => l.name),
          suggestion: "Would you like me to draft follow-up messages for these lenders?",
        });
      }

      if (unassignedItems.length > 0) {
        issues.push({
          priority: "medium", category: "outstanding_items",
          summary: `${unassignedItems.length} unassigned outstanding item(s)`,
          details: unassignedItems.map((o: any) => o.description),
          suggestion: "Would you like me to assign these to a team member?",
        });
      }

      if (missingDocs.length > 0) {
        issues.push({
          priority: "medium", category: "data_room",
          summary: `${missingDocs.length} required document(s) missing`,
          details: missingDocs.slice(0, 10).map((d: any) => d.label),
          suggestion: "Would you like me to list all missing documents?",
        });
      }

      if (isStale) {
        issues.push({
          priority: "low", category: "activity",
          summary: `Deal activity is stale${daysSinceActivity ? ` (${daysSinceActivity} days since last update)` : ''}`,
          suggestion: "Would you like me to add a status update note?",
        });
      }

      if (incompleteMilestones.length > 0) {
        const nextMilestone = incompleteMilestones[0];
        issues.push({
          priority: "info", category: "milestones",
          summary: `Next milestone: "${nextMilestone.title}"${nextMilestone.due_date ? ` (due: ${nextMilestone.due_date})` : ' (no due date set)'}`,
          suggestion: nextMilestone.due_date ? "Would you like me to mark it as complete?" : "Would you like me to set a target date?",
        });
      }

      return {
        deal_name: deal?.company,
        stage: deal?.stage,
        value: deal?.value,
        closing_date: deal?.closing_date,
        total_issues: issues.filter((i: any) => i.priority !== "info").length,
        issues: issues.sort((a: any, b: any) => {
          const order: Record<string, number> = { high: 0, medium: 1, low: 2, info: 3 };
          return (order[a.priority] ?? 4) - (order[b.priority] ?? 4);
        }),
        milestone_progress: `${milestones.filter((m: any) => m.completed).length}/${milestones.length}`,
        open_outstanding_items: outstanding.length,
        active_lenders: activeLenders.length,
        total_lenders: lenders.length,
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
        return { success: false, error: `Failed to move "${params.deal_name}" to "${params.new_stage}". The stage is still "${verified?.stage || 'unknown'}".` };
      }
      await supabase.from("activity_logs").insert({
        deal_id: params.deal_id, activity_type: "stage_change",
        description: `Stage changed from "${params.current_stage}" to "${params.new_stage}"`,
        user_id: userId,
      });
      return { success: true, message: `Moved "${params.deal_name}" to "${params.new_stage}"`, actionType: "update_deal_stage", params: { deal_id: params.deal_id } };
    }
    case "create_task": {
      const { data: newTask, error } = await supabase.from("tasks").insert({
        title: params.title, description: params.description || null,
        deal_id: params.deal_id || null, priority: params.priority || "medium",
        due_date: params.due_date || null, status: "todo",
        assigned_to: userId, created_by: userId,
      }).select("id, title").single();
      if (error) return { success: false, error: error.message };
      if (!newTask) return { success: false, error: `Failed to create task "${params.title}".` };
      return { success: true, message: `Task "${params.title}" created`, actionType: "create_task", params: { task_id: newTask.id, deal_id: params.deal_id } };
    }
    case "update_milestone": {
      const { error } = await supabase.from("deal_milestones").update({ completed: params.completed, completed_at: params.completed ? new Date().toISOString() : null }).eq("id", params.milestone_id);
      if (error) return { success: false, error: error.message };
      const { data: verified } = await supabase.from("deal_milestones").select("completed").eq("id", params.milestone_id).single();
      if (!verified || verified.completed !== params.completed) {
        return { success: false, error: `Failed to update milestone "${params.milestone_title}".` };
      }
      if (params.deal_id) {
        await supabase.from("activity_logs").insert({
          deal_id: params.deal_id, activity_type: "milestone_update",
          description: `Milestone "${params.milestone_title}" marked as ${params.completed ? 'complete' : 'incomplete'}`,
          user_id: userId,
        });
      }
      return { success: true, message: `${params.milestone_title} marked as ${params.completed ? 'complete' : 'incomplete'}`, actionType: "update_milestone", params: { deal_id: params.deal_id } };
    }
    case "update_lender_status": {
      const updateFields: any = {};
      if (params.stage) updateFields.stage = params.stage;
      if (params.tracking_status) updateFields.tracking_status = params.tracking_status;
      if (params.pass_reason) updateFields.pass_reason = params.pass_reason;
      const { error } = await supabase.from("deal_lenders").update(updateFields).eq("id", params.lender_id);
      if (error) return { success: false, error: error.message };
      const { data: verified } = await supabase.from("deal_lenders").select("stage, tracking_status").eq("id", params.lender_id).single();
      if (!verified) return { success: false, error: `Failed to update lender "${params.lender_name}".` };
      if (params.deal_id) {
        await supabase.from("activity_logs").insert({
          deal_id: params.deal_id, activity_type: "lender_status_change",
          description: `Lender "${params.lender_name}" updated${params.stage ? ` stage to "${params.stage}"` : ''}${params.tracking_status ? ` status to "${params.tracking_status}"` : ''}${params.pass_reason ? ` (reason: ${params.pass_reason})` : ''}`,
          user_id: userId,
        });
      }
      return { success: true, message: `Updated ${params.lender_name}`, actionType: "update_lender_status", params: { deal_id: params.deal_id } };
    }
    case "delete_outstanding_item": {
      const { error } = await supabase.from("outstanding_items").delete().eq("id", params.item_id);
      if (error) return { success: false, error: error.message };
      if (params.deal_id) {
        await supabase.from("activity_logs").insert({
          deal_id: params.deal_id, activity_type: "outstanding_item_deleted",
          description: `Outstanding item "${params.item_description}" deleted via AI Copilot`,
          user_id: userId,
        });
      }
      return { success: true, message: `Deleted "${params.item_description}"`, actionType: "delete_outstanding_item", params: { deal_id: params.deal_id } };
    }
    case "update_deal_fields": {
      const updateFields: any = {};
      if (params.value !== undefined) updateFields.value = params.value;
      if (params.closing_date !== undefined) updateFields.closing_date = params.closing_date || null;
      if (params.is_flagged !== undefined) {
        updateFields.is_flagged = params.is_flagged;
        if (params.flag_notes !== undefined) updateFields.flag_notes = params.flag_notes;
      }
      const { error } = await supabase.from("deals").update(updateFields).eq("id", params.deal_id);
      if (error) return { success: false, error: error.message };
      const changes: string[] = [];
      if (params.value !== undefined) changes.push(`deal size to $${params.value.toLocaleString()}`);
      if (params.closing_date !== undefined) changes.push(`closing date to ${params.closing_date || 'none'}`);
      if (params.is_flagged !== undefined) changes.push(`flag ${params.is_flagged ? 'on' : 'off'}`);
      await supabase.from("activity_logs").insert({
        deal_id: params.deal_id, activity_type: "deal_updated",
        description: `Deal updated: ${changes.join(', ')} via AI Copilot`,
        user_id: userId,
      });
      return { success: true, message: `Updated ${params.deal_name}: ${changes.join(', ')}`, actionType: "update_deal_fields", params: { deal_id: params.deal_id } };
    }
    default:
      return { success: false, error: `Unknown action: ${actionType}` };
  }
}

// ── Stream parser: forwards content deltas to client, collects tool calls ──
async function consumeToolStream(
  response: Response,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  encoder: TextEncoder
): Promise<{ content: string; toolCalls: any[] }> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  const tcMap = new Map<number, { id: string; type: string; function: { name: string; arguments: string } }>();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      let line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.startsWith("data: ")) continue;
      const jsonStr = line.slice(6).trim();
      if (jsonStr === "[DONE]") continue;
      try {
        const p = JSON.parse(jsonStr);
        const delta = p.choices?.[0]?.delta;
        if (!delta) continue;
        // Forward content deltas to client immediately
        if (delta.content) {
          content += delta.content;
          await writer.write(encoder.encode(line + "\n\n"));
        }
        // Collect tool call deltas
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const i = tc.index ?? 0;
            if (!tcMap.has(i)) tcMap.set(i, { id: "", type: "function", function: { name: "", arguments: "" } });
            const e = tcMap.get(i)!;
            if (tc.id) e.id = tc.id;
            if (tc.function?.name) e.function.name = tc.function.name;
            if (tc.function?.arguments) e.function.arguments += tc.function.arguments;
          }
        }
      } catch { /* partial JSON, skip */ }
    }
  }
  return { content, toolCalls: Array.from(tcMap.values()).filter(tc => tc.function.name) };
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

    // Lightweight profile fetch only — all other data is lazy-loaded via tools
    const { data: profile } = await supabaseUser.from("profiles").select("display_name, email").eq("user_id", userId).single();
    const userName = profile?.display_name || profile?.email || "User";

    const page = context?.page || "unknown";
    const entityType = context?.entityType;
    const entityId = context?.entityId;
    const activeTab = context?.activeTab || null;
    const banners = context?.banners || [];

    const systemPrompt = `You are the nAItive AI Copilot — an intelligent digital worker embedded in a deal management platform for private credit and debt capital markets professionals. You autonomously run workflows for both single deals and multi-deal / portfolio reporting, not just a chat assistant.

CURRENT CONTEXT:
- Page: ${page}
- Active Tab: ${activeTab || "None"}
- Entity: ${entityType === "deal" && entityId ? `Deal (ID: ${entityId}) — use get_deal tool to fetch details` : "None"}
- Entity Details: ${context?.entityDetails ? JSON.stringify(context.entityDetails) : "None"}
- User: ${userName} (${context?.userRole || "member"})
${banners.length > 0 ? `\nACTIVE ALERTS/BANNERS ON PAGE:\n${banners.map((b: string) => `⚠️ ${b}`).join('\n')}` : ''}

DATA ACCESS — IMPORTANT:
You do NOT have pre-loaded data. Always use your tools to fetch current information before answering:
- Deal details → get_deal (with deal_id or search)
- Pipeline overview → get_pipeline_summary
- Tasks → get_tasks
- Lenders on a deal → get_deal_lenders
- Deal health → get_deal_health
- Activity history → get_activity_log
${entityType === "deal" && entityId ? `\nThe user is viewing deal ID: ${entityId}. Use this ID when calling deal-specific tools.` : ''}

CORE RESPONSIBILITIES:

Single-deal workflows:
- Extract and normalize key deal information from messy, unstructured inputs — especially emails, meeting notes, and credit memos.
- Produce clear, concise deal summaries (structure, parties, use of proceeds, covenants, risks, mitigants, status, next steps).
- Draft client-ready and lender-ready materials for that deal (short memos, update notes, deck outlines).

Multi-deal / portfolio workflows:
- Aggregate and compare multiple deals when the input contains information about more than one transaction.
- Generate internal and external reports (pipeline, portfolio, performance, watchlist) using consistent, reusable structures.
- Draft commentary and key messages suitable for MDs, IC, and external stakeholders.

AUTONOMOUS WORKFLOW (apply when processing memos, emails, or unstructured deal text):
1. PLAN: Interpret the request and classify as (a) single-deal, (b) multi-deal/portfolio, or (c) mixed. Break into concrete subtasks.
2. EXECUTE: For each subtask, extract, analyze, aggregate, and draft from the provided memos/emails and related text.
3. SYNTHESIZE: Assemble polished outputs tailored to professional financial-services audiences.

When processing unstructured input (emails, memos, call notes, IC writeups, status updates):
- Infer standard private credit / lender documentation structures and choose reasonable defaults — do NOT ask the user how to structure the output.
- When input contains multiple forwarded/replied email chains and overlapping deal descriptions, deduplicate and reconcile.
- Where information is missing or inconsistent across emails, clearly flag gaps and ambiguities instead of hallucinating values, and propose questions or data needed to complete the artifact.
- Maintain a professional, concise tone suitable for institutional investors, lenders, and internal IC readers.

TAB-AWARE BEHAVIOR:
${activeTab === 'lenders' ? '- User is on the Lenders tab. Prioritize lender interaction data, stage changes, and follow-ups when answering questions.' :
  activeTab === 'deal-info' ? '- User is on the Deal Info tab. Focus on deal details, milestones, outstanding items, and deal health.' :
  activeTab === 'deal-management' ? '- User is on the Management tab. Focus on team, flags, status, and deal governance.' :
  activeTab === 'deal-writeup' || activeTab === 'deal-write-up' ? '- User is on the Write Up tab. Focus on company profile, financials, management team.' :
  activeTab === 'data-room' ? '- User is on the Data Room tab. Focus on documents, uploads, missing requirements.' :
  activeTab === 'deal-space' ? '- User is on the Deal Space tab. Focus on collaborative content, notes, documents.' :
  activeTab === 'communication' ? '- User is on the Comms tab. Focus on communications, email drafts, activity history.' :
  '- Respond based on the general context.'}

RULES:
1. Always ground answers in actual data. Never fabricate deal names, lender names, amounts, or dates.
2. If asked about data you don't have, USE A TOOL to fetch it.
3. For WRITE actions, use the appropriate tool. The tool returns either:
   - "action": "confirm" → Include the JSON verbatim in a \`\`\`json block. The UI will render Confirm/Cancel buttons.
   - "action": "auto_executed" → Include the JSON verbatim in a \`\`\`json block. The UI will show a success indicator and trigger a refresh.
4. Keep responses concise and actionable. Use bullet points.
5. Reference entities by their actual names from the data.
6. Format financial figures with $ and commas.
7. You understand private credit terminology: DRL, LOI, term sheets, due diligence, ABL, mezzanine, facility types, covenants, EBITDA, leverage ratios, pricing (SOFR+, L+), etc.
8. When a tool returns "action": "confirm", wrap it in \`\`\`json ... \`\`\` so the frontend renders a confirmation card.
9. When a tool returns "action": "auto_executed", wrap it in \`\`\`json ... \`\`\` so the frontend renders a success indicator.
10. When drafting emails, return as \`\`\`json {"to_name": "...", "to_email": "...", "subject": "...", "body": "..."} \`\`\`.
11. ALWAYS prefer using tools over guessing.
12. CRITICAL: You MUST always provide a response. If you cannot perform an action, say so explicitly.
13. When presenting deal/lender/task/pipeline data, use responseType cards (deal_card, lender_card, task_card, pipeline_summary).
14. IMPORTANT: Use the IDs from the LIVE DATA context when calling write tools. The milestone IDs, lender IDs, and outstanding item IDs are listed in [id: ...] format.

DEAL MEMO & EMAIL WORKFLOW MODE:
When the user pastes or forwards emails, memos, call notes, IC writeups, or other unstructured deal text asking for a summary, analysis, report, or memo, activate this workflow. Follow the PLAN → EXECUTE → SYNTHESIZE process internally, but present the output as polished, human-readable markdown — like a senior associate or VP at an advisory firm writing a deal brief for their MD.

RESPONSE FORMAT FOR MEMO/EMAIL WORKFLOWS:
Your response MUST be beautifully formatted markdown text. Write like an experienced analyst — professional, concise, no fluff. Use the following structure:

1. Start with a one-line classification and plan summary in italics.
2. Present the deal analysis using clear markdown sections with headers, bold key terms, bullet lists, and tables where appropriate.
3. Do NOT include any JSON, code blocks, or structured data in the response. The response should be clean, human-readable markdown only.

REQUIRED MARKDOWN STRUCTURE:

*Single-deal workflow: [1-2 sentence plan description]*

---

## Deal Overview

| Field | Details |
|-------|---------|
| **Deal Name** | ... |
| **Sponsor / Borrower** | ... |
| **Facility Type** | ... |
| **Size** | ... |
| **Pricing** | ... |
| **Tenor** | ... |
| **Collateral** | ... |
| **Use of Proceeds** | ... |
| **Status** | sourcing / diligence / docs / closed / monitoring |

## Key Risks & Mitigants

**Risks:**
- ...

**Mitigants:**
- ...

## Status & Next Steps
- ...

---

## Lender Deck Outline

**1. Executive Summary**
- ...

**2. Transaction Overview**
- ...

**3. Business / Strategy Overview**
- ...

**4. Financial Profile and Key Metrics**
- ...

**5. Key Credit Considerations**
- ...

**6. Risks and Mitigants**
- ...

**7. Process, Timeline, and Next Steps**
- ...

---

## Internal Report Draft

### Overview
[prose paragraph]

### Deal Snapshot
[prose paragraph or table]

### Key Developments
[prose paragraph]

### Risks, Watchlist, and Upside
[prose paragraph]

### Next Actions
1. ...
2. ...


FEW-SHOT EXAMPLE — given input: "From: john@sponsor.com Subject: Project Atlas – $25M Senior Secured Revolver. Hi team, following up on our call. Atlas Corp (specialty chemicals, $40M revenue, $8M EBITDA) needs a $25M senior secured revolver for working capital. Pricing target SOFR+350, 3-year tenor, secured by AR and inventory. Key risk is customer concentration (top 3 = 60% revenue). Next step is management meeting next week."

Expected response:

*Single-deal workflow: Extracting deal structure from forwarded email regarding Project Atlas, a $25M senior secured revolver for Atlas Corp. Will normalize key fields, assess credit risks, and produce deal summary, deck outline, and internal report.*

---

## Deal Overview

| Field | Details |
|-------|---------|
| **Deal Name** | Project Atlas |
| **Sponsor / Borrower** | Atlas Corp |
| **Facility Type** | Senior Secured Revolver |
| **Size** | $25,000,000 |
| **Pricing** | SOFR + 350bps |
| **Tenor** | 3 years |
| **Collateral** | Accounts Receivable and Inventory |
| **Use of Proceeds** | Working capital |
| **Status** | Diligence |

**Financial Snapshot:** Revenue $40M · EBITDA $8M (20% margin) · Implied leverage ~3.1x

## Key Risks & Mitigants

**Risks:**
- **Customer concentration** — top 3 customers represent 60% of revenue
- Specialty chemicals sector cyclicality

**Mitigants:**
- Asset-based collateral (AR + inventory) provides structural downside protection
- Healthy EBITDA margin (~20%) for the sector
- Modest leverage (~3.1x) leaves headroom

## Status & Next Steps
- Management meeting scheduled next week
- Request detailed AR aging and customer concentration breakdown
- Obtain 3-year historical and projected financials

---

## Lender Deck Outline

**1. Executive Summary**
- $25M Sr Secured Revolver for Atlas Corp (specialty chemicals)
- SOFR+350, 3-year tenor, ABL structure
- $40M revenue, $8M EBITDA, ~3.1x leverage

**2. Transaction Overview**
- Facility: $25M senior secured revolver
- Security: First lien on AR and inventory
- Purpose: Working capital support

**3. Business / Strategy Overview**
- Specialty chemicals manufacturer with established market position
- Revenue: $40M

**4. Financial Profile and Key Metrics**
- Revenue: $40M | EBITDA: $8M (20% margin) | Leverage: ~3.1x

**5. Key Credit Considerations**
- Strong asset coverage via AR/inventory collateral
- Consistent EBITDA generation
- Manageable leverage profile

**6. Risks and Mitigants**
- Customer concentration (top 3 = 60%) mitigated by ABL structure

**7. Process, Timeline, and Next Steps**
- Management meeting next week → full diligence package to follow

---

## Internal Report Draft

### Overview
Project Atlas is a $25M senior secured revolving credit facility for Atlas Corp, a specialty chemicals company. The deal is in early diligence following initial sponsor outreach.

### Deal Snapshot
Borrower: Atlas Corp. Facility: $25M Sr Secured Revolver. Pricing: SOFR+350. Tenor: 3 years. Collateral: AR and Inventory. Revenue: $40M. EBITDA: $8M. Leverage: ~3.1x.

### Key Developments
Initial email received from sponsor. Management meeting scheduled for next week. Deal structure appears straightforward as an ABL facility.

### Risks, Watchlist, and Upside
Primary concern is customer concentration with top 3 customers at 60% of revenue. Collateral package (AR + inventory) provides structural protection. EBITDA margin of 20% is solid for the sector.

### Next Actions
1. Attend management meeting next week
2. Request detailed AR aging report and customer concentration breakdown
3. Obtain 3-year historical and projected financials
4. Assess borrowing base methodology

---

Would you like me to update the deal record with this information or draft a lender outreach email?

END OF FEW-SHOT EXAMPLE.

CRITICAL RULES FOR MEMO/EMAIL WORKFLOW:
- The response MUST be human-readable markdown ONLY. Never return raw JSON, code blocks with JSON, or <details> tags as part of memo/email workflow responses.
- Write in the tone of a senior associate or VP — professional, concise, structured. No filler.
- Use markdown tables for deal parameters, bullet lists for risks/mitigants/next actions, bold for key terms.
- Do NOT include any structured JSON metadata, hidden blocks, or code fences at the end of the response. The response should be clean markdown text only.
- Where information is missing or inconsistent, clearly flag gaps in the markdown text instead of hallucinating values.
- For multi-deal inputs, present both a portfolio-level summary and per-deal breakdowns.
- Always end with a proactive follow-up suggestion (e.g., "Would you like me to update the deal record?" or "Shall I draft a lender outreach email?").

DETECTING MEMO/EMAIL WORKFLOW:
Activate this mode when the user provides raw deal memos, forwarded emails, call notes, IC writeups, or unstructured deal text AND asks for a summary, analysis, brief, report, or memo. Also activate when the user says "Apply the Computer workflow". For regular copilot queries (deal lookups, pipeline summaries, lender tracking, task management), continue using the normal conversational response format with tools.

PROACTIVE SUGGESTIONS:
After answering a question or completing an action, ALWAYS offer ONE relevant follow-up suggestion. Examples:
- After showing lender statuses: "Would you like me to draft follow-up messages for the On-Deck lenders?"
- After marking a milestone complete: "The next milestone is [X]. Would you like me to set a target date?"
- When on a deal with alerts: Reference the active banners and offer to help address them.
- After completing an outstanding item: "Would you like me to check if there are other items that need attention?"
- After extracting deal info from an email: "Would you like me to draft a lender memo or update the deal record with this information?"
${banners.length > 0 ? `- IMPORTANT: Be aware of the active alerts shown above. If the user asks "what needs attention?" or similar, reference these alerts specifically and use the get_deal_health tool to provide a comprehensive analysis.` : ''}

"WHAT SHOULD I DO NEXT?" COMMAND:
When the user asks "what should I do next?", "what needs attention?", "what's the priority?", or similar:
1. Use the get_deal_health tool to scan for issues
2. Present a PRIORITIZED action list with the most critical items first
3. For each issue, offer an actionable suggestion the user can act on immediately
4. Group issues by category (Milestones, Lenders, Documents, Outstanding Items)

WRITE ACTION TOOLS:
- toggle_milestone: Mark milestone complete/incomplete (LOW RISK, auto-executes)
- add_milestone: Add new milestone to deal (LOW RISK, auto-executes)
- create_outstanding_item: Create outstanding item (LOW RISK, auto-executes)
- complete_outstanding_item: Complete outstanding item (LOW RISK, auto-executes)
- delete_outstanding_item: Delete outstanding item (HIGH RISK, needs confirmation)
- add_deal_note: Add note to activity log (LOW RISK, auto-executes)
- update_deal_fields: Update deal size, close date, flag (MEDIUM/LOW RISK, depends on field)
- update_deal_stage: Move deal to new stage (HIGH RISK, needs confirmation)
- update_lender_status: Update lender stage/status (HIGH RISK, needs confirmation)
- create_task: Create a task (needs confirmation)

READ TOOLS:
- get_outstanding_items, get_deal_milestones, get_data_room_documents, get_deal_memo, get_deal_writeup, get_activity_log, get_deal_lenders, get_tasks, get_deal, search_deals, search_lenders, get_pipeline_summary, get_deal_health`;

    const apiMessages: any[] = [
      { role: "system", content: systemPrompt },
      ...(history || []).map((m: any) => ({ role: m.role, content: m.content })),
      { role: "user", content: message },
    ];

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

    // ── Helper: convert already-fetched content into an SSE stream ──
    function contentToSSE(content: string): ReadableStream {
      const encoder = new TextEncoder();
      return new ReadableStream({
        start(controller) {
          // Send content in a single SSE chunk matching OpenAI format
          const chunk = {
            choices: [{ delta: { content }, index: 0, finish_reason: null }],
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        },
      });
    }

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
        continue;
      }

      // No tool calls — return the content we already have as SSE
      // This eliminates the previous double-call pattern (saves 3-5s)
      const content = msg.content || "";
      if (content) {
        return new Response(contentToSSE(content), {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });
      }

      // Edge case: no content AND no tool calls — make one final streaming call
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

    // Graceful fallback: force a final response without tools
    const fallbackResponse = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [...apiMessages, { role: "user", content: "Please provide your final answer now based on the information gathered so far. Do not call any more tools." }],
        temperature: 0.3,
        max_tokens: 2000,
        stream: true,
      }),
    });

    if (!fallbackResponse.ok) {
      return new Response(JSON.stringify({ error: "Unable to generate response. Please try a simpler question." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(fallbackResponse.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("copilot-chat error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
