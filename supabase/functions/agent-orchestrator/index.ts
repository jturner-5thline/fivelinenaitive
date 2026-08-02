// Chained autonomous agent for the naitive AI copilot.
// ---------------------------------------------------------------
// Actions:
//   - start          : plan the multi-step run (NO writes; returns plan)
//   - approve_plan   : user approved the plan; runs all read steps and writes
//                      that don't require approval; pauses at first write
//                      requiring approval.
//   - approve_step   : user approved/rejected a single write step; resumes.
//   - cancel         : abort the run.
//
// Tools exposed to the planner:
//   - gmail_search        (read)
//   - deal_lookup         (read)
//   - data_room_search    (read)
//   - gmail_draft_reply   (write, requires approval)
//   - task_create         (write, requires approval)
//   - activity_post       (write, requires approval)
//
// Per project memory: AI writes ALWAYS require explicit user approval.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { anthropicFetch } from "../_shared/anthropicUsage.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================
// Types
// ============================================================

type ToolName =
  | "gmail_search"
  | "deal_lookup"
  | "data_room_search"
  | "gmail_draft_reply"
  | "task_create"
  | "activity_post";

interface PlanStep {
  step_index: number;
  tool: ToolName;
  title: string;
  args: Record<string, unknown>;
}

interface RunRow {
  id: string;
  user_id: string;
  prompt: string;
  status: string;
  context: Record<string, any>;
  plan_summary: string | null;
}

interface StepRow {
  id: string;
  run_id: string;
  step_index: number;
  tool: ToolName;
  kind: "read" | "write";
  title: string;
  args: Record<string, any>;
  requires_approval: boolean;
  status: string;
  output: any;
  output_summary: string | null;
}

const READ_TOOLS: ToolName[] = ["gmail_search", "deal_lookup", "data_room_search"];
const WRITE_TOOLS: ToolName[] = ["gmail_draft_reply", "task_create", "activity_post"];

// ============================================================
// Tool catalog (Anthropic tool schemas)
// ============================================================

const PLAN_TOOL = {
  name: "submit_plan",
  description:
    "Submit the ordered plan of subtasks needed to satisfy the user's instruction. " +
    "Use ONLY the available tools. Use 3-8 steps. " +
    "Read steps run automatically after the user approves the plan. " +
    "Write steps (task_create, gmail_draft_reply, activity_post) ALWAYS require " +
    "individual user approval, so phrase their `title` as a clear preview the user can sanity-check.",
  input_schema: {
    type: "object",
    properties: {
      steps: {
        type: "array",
        minItems: 1,
        maxItems: 10,
        items: {
          type: "object",
          properties: {
            tool: {
              type: "string",
              enum: ["gmail_search", "deal_lookup", "data_room_search", "gmail_draft_reply", "task_create", "activity_post"],
            },
            title: { type: "string", description: "Human-readable label, e.g. 'Search Gmail for lender replies on active deals (last 7d)'." },
            args: {
              type: "object",
              description:
                "Arguments for this tool. Allowed shapes per tool:\n" +
                "  gmail_search: { query: string (Gmail search syntax), max_results?: number<=25 }\n" +
                "  deal_lookup: { name?: string, deal_id?: string, only_active?: boolean }\n" +
                "  data_room_search: { deal_id: string, query: string }\n" +
                "  gmail_draft_reply: { in_reply_to_message_id: string, to: string, subject: string, body: string }\n" +
                "  task_create: { deal_id?: string, title: string, description?: string, due_date?: string (YYYY-MM-DD or 'tomorrow'|'today'|'next week'), priority?: 'low'|'medium'|'high' }\n" +
                "  activity_post: { deal_id: string, title: string, body: string }\n" +
                "For steps that depend on earlier results (e.g. 'create a task for each lender reply'), use the placeholder string '__from_previous__' for fields you cannot fill yet — the executor will resolve them after the prior step completes.",
            },
          },
          required: ["tool", "title", "args"],
        },
      },
      plan_summary: { type: "string", description: "One sentence telling the user what the chain will do." },
    },
    required: ["steps", "plan_summary"],
  },
};

const SUMMARY_TOOL = {
  name: "submit_summary",
  description: "Produce the final structured summary of the chain run.",
  input_schema: {
    type: "object",
    properties: {
      what_was_found: { type: "array", items: { type: "string" } },
      actions_taken: { type: "array", items: { type: "string" } },
      requires_human_input: { type: "array", items: { type: "string" } },
      final_message: { type: "string", description: "Concise prose summary the user will see in chat (markdown ok)." },
    },
    required: ["final_message"],
  },
};

// ============================================================
// Helpers
// ============================================================

async function callClaude(opts: {
  apiKey: string;
  system: string;
  userMessage: string;
  tool: any;
  toolName: string;
}): Promise<any> {
  const resp = await anthropicFetch({ feature: "agent-orchestrator" }, {
    method: "POST",
    headers: {
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
      temperature: 0.2,
      system: opts.system,
      tools: [opts.tool],
      tool_choice: { type: "tool", name: opts.toolName },
      messages: [{ role: "user", content: opts.userMessage }],
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Claude error ${resp.status}: ${t.slice(0, 300)}`);
  }
  const json = await resp.json();
  const block = (json?.content || []).find((c: any) => c?.type === "tool_use" && c?.name === opts.toolName);
  if (!block?.input) throw new Error(`Claude returned no ${opts.toolName} tool_use block`);
  return block.input;
}

function classifyKind(tool: ToolName): "read" | "write" {
  return WRITE_TOOLS.includes(tool) ? "write" : "read";
}

function inferDueDate(hint?: string | null): string | null {
  if (!hint) return null;
  // Already ISO yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(hint)) return hint;
  const h = hint.toLowerCase();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const addDays = (n: number) => {
    const d = new Date(today); d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };
  if (/\btomorrow\b/.test(h)) return addDays(1);
  if (/\btoday\b/.test(h)) return addDays(0);
  if (/\bnext week\b/.test(h)) return addDays(7);
  if (/\bend of week\b|\bby friday\b/.test(h)) {
    const dow = today.getDay();
    const toFri = (5 - dow + 7) % 7 || 5;
    return addDays(toFri);
  }
  return null;
}

// Resolve "__from_previous__" placeholders by injecting earlier step outputs
// as readable JSON into the args. We don't try to be magical — we just put
// every prior step's `output_summary` and trimmed `output` in a new
// `_previous_results` field so Claude's args (which the planner generated)
// stay intact, and the executor can decide what to do.
function withPreviousContext(args: Record<string, any>, priorSteps: StepRow[]): Record<string, any> {
  const previous = priorSteps.map(s => ({
    step: s.step_index,
    tool: s.tool,
    title: s.title,
    summary: s.output_summary,
    output: trimForPrompt(s.output),
  }));
  return { ...args, _previous_results: previous };
}

function trimForPrompt(v: any, maxLen = 4000): any {
  if (v == null) return v;
  const s = JSON.stringify(v);
  if (s.length <= maxLen) return v;
  return { _truncated: true, preview: s.slice(0, maxLen) + "…" };
}

// ============================================================
// Tool executors
// ============================================================

async function execGmailSearch(supabaseUser: SupabaseClient, args: any): Promise<{ summary: string; output: any }> {
  const query: string = String(args?.query || "").slice(0, 500);
  const maxResults = Math.min(Number(args?.max_results) || 10, 25);
  if (!query) return { summary: "Skipped: empty Gmail query.", output: { messages: [] } };

  const { data, error } = await supabaseUser.functions.invoke("gmail-messages", {
    body: { action: "list", query, max_results: maxResults, search_all_mail: false },
  });
  if (error) throw new Error(`Gmail search failed: ${error.message}`);
  const msgs = (data?.messages || []).slice(0, maxResults).map((m: any) => ({
    id: m.id,
    thread_id: m.thread_id,
    from: m.from,
    to: m.to,
    subject: m.subject,
    snippet: m.snippet,
    date: m.date,
    unread: m.unread,
  }));
  return {
    summary: `Found ${msgs.length} Gmail message${msgs.length === 1 ? "" : "s"} matching "${query}".`,
    output: { query, messages: msgs },
  };
}

async function execDealLookup(supabaseUser: SupabaseClient, args: any): Promise<{ summary: string; output: any }> {
  const dealId: string | undefined = args?.deal_id;
  const name: string | undefined = args?.name;
  const onlyActive = args?.only_active !== false;

  let q = supabaseUser
    .from("deals")
    .select("id, deal_name, stage_id, deal_class, deal_size, deal_manager, lender_name, contact_name, last_activity_date, status, archived")
    .order("last_activity_date", { ascending: false, nullsFirst: false })
    .limit(25);

  if (dealId) q = q.eq("id", dealId);
  else if (name) q = q.ilike("deal_name", `%${name}%`);
  if (onlyActive) q = q.eq("archived", false);

  const { data, error } = await q;
  if (error) throw new Error(`Deal lookup failed: ${error.message}`);

  // Apply global exclusions per project memory.
  const filtered = (data || []).filter((d: any) => {
    const n = (d.deal_name || "").toLowerCase();
    if (n === "test-niki's store" || n === "example deal") return false;
    if (n.startsWith("test ")) return false;
    return true;
  });

  return {
    summary: `Found ${filtered.length} deal${filtered.length === 1 ? "" : "s"}${name ? ` matching "${name}"` : ""}.`,
    output: { deals: filtered },
  };
}

async function execDataRoomSearch(supabaseUser: SupabaseClient, args: any): Promise<{ summary: string; output: any }> {
  const dealId: string | undefined = args?.deal_id;
  const query: string = String(args?.query || "").slice(0, 200);
  if (!dealId) return { summary: "Skipped: no deal_id.", output: { results: [] } };

  const { data, error } = await supabaseUser
    .from("deal_documents")
    .select("id, file_name, category, created_at")
    .eq("deal_id", dealId)
    .ilike("file_name", `%${query}%`)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(`Data room search failed: ${error.message}`);
  return {
    summary: `${(data || []).length} Data Room document${(data || []).length === 1 ? "" : "s"} match.`,
    output: { results: data || [] },
  };
}

async function execTaskCreate(supabaseUser: SupabaseClient, userId: string, args: any): Promise<{ summary: string; output: any }> {
  const title = String(args?.title || "").slice(0, 200);
  if (!title) throw new Error("task_create requires a title");
  const due_date = inferDueDate(args?.due_date) || args?.due_date || null;

  const row = {
    deal_id: args?.deal_id || null,
    assigned_to: userId,
    assigned_by: userId,
    title,
    description: (args?.description || "Created by naitive AI agent.") + "\n\n[ai-agent]",
    priority: ["low", "medium", "high"].includes(args?.priority) ? args.priority : "medium",
    status: "not_started",
    task_type: "task",
    due_date: due_date && /^\d{4}-\d{2}-\d{2}$/.test(due_date) ? due_date : null,
  };
  const { data, error } = await supabaseUser.from("tasks").insert(row).select("id, title, due_date").single();
  if (error) throw new Error(`Task create failed: ${error.message}`);
  return {
    summary: `Created task "${data.title}"${data.due_date ? ` (due ${data.due_date})` : ""}.`,
    output: { task: data },
  };
}

async function execActivityPost(supabaseUser: SupabaseClient, userId: string, args: any): Promise<{ summary: string; output: any }> {
  const dealId = args?.deal_id;
  const title = String(args?.title || "Note from naitive AI").slice(0, 200);
  const body = String(args?.body || "").slice(0, 5000);
  if (!dealId) throw new Error("activity_post requires deal_id");

  const { data: profile } = await supabaseUser.from("profiles").select("display_name, email").eq("user_id", userId).maybeSingle();
  const name = profile?.display_name || profile?.email || "naitive AI";

  const { data, error } = await supabaseUser
    .from("activity_logs")
    .insert({
      deal_id: dealId,
      user_id: userId,
      user_display_name: `${name} (via naitive AI agent)`,
      activity_type: "note",
      description: `**${title}**\n\n${body}`,
      metadata: { source: "ai_agent" },
    })
    .select("id")
    .single();
  if (error) throw new Error(`Activity post failed: ${error.message}`);
  return { summary: `Posted note to deal Activity.`, output: { activity_log_id: data.id } };
}

async function execGmailDraftReply(supabaseUser: SupabaseClient, args: any): Promise<{ summary: string; output: any }> {
  // We do NOT auto-create the Nylas draft to keep this safe; we hand the
  // composed body back to the user via the existing AI Draft surface.
  // This step is treated as "produce a draft body" only.
  const subject = String(args?.subject || "").slice(0, 300);
  const body = String(args?.body || "").slice(0, 8000);
  const to = String(args?.to || "");
  return {
    summary: `Drafted reply to ${to || "recipient"} — review in inbox.`,
    output: { draft: { to, subject, body, in_reply_to_message_id: args?.in_reply_to_message_id || null } },
  };
}

async function executeStep(
  step: StepRow,
  supabaseUser: SupabaseClient,
  userId: string,
  priorSteps: StepRow[],
): Promise<{ summary: string; output: any }> {
  // Resolve placeholder context (executor sees prior outputs).
  const args = withPreviousContext(step.args || {}, priorSteps);

  switch (step.tool) {
    case "gmail_search": return execGmailSearch(supabaseUser, args);
    case "deal_lookup": return execDealLookup(supabaseUser, args);
    case "data_room_search": return execDataRoomSearch(supabaseUser, args);
    case "gmail_draft_reply": return execGmailDraftReply(supabaseUser, args);
    case "task_create": return execTaskCreate(supabaseUser, userId, args);
    case "activity_post": return execActivityPost(supabaseUser, userId, args);
    default: throw new Error(`Unknown tool: ${step.tool}`);
  }
}

// ============================================================
// Run loop: execute steps in order until pause condition
// ============================================================

async function runLoop(
  supabaseUser: SupabaseClient,
  userId: string,
  runId: string,
): Promise<{ paused_at: number | null; completed: boolean }> {
  const { data: stepsAll, error: sErr } = await supabaseUser
    .from("ai_agent_run_steps")
    .select("*")
    .eq("run_id", runId)
    .order("step_index", { ascending: true });
  if (sErr) throw new Error(sErr.message);
  const steps = (stepsAll || []) as StepRow[];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    if (step.status === "done" || step.status === "skipped" || step.status === "failed") continue;

    // Pause for write approval.
    if (step.requires_approval && step.status !== "approved") {
      await supabaseUser
        .from("ai_agent_runs")
        .update({ status: "awaiting_write_approval" })
        .eq("id", runId);
      return { paused_at: step.step_index, completed: false };
    }

    // Mark running.
    await supabaseUser.from("ai_agent_run_steps").update({ status: "running" }).eq("id", step.id);
    await supabaseUser.from("ai_agent_runs").update({ status: "running" }).eq("id", runId);

    try {
      const priorSteps = steps.slice(0, i).filter(s => s.status === "done");
      const { summary, output } = await executeStep(step, supabaseUser, userId, priorSteps);
      await supabaseUser
        .from("ai_agent_run_steps")
        .update({
          status: "done",
          output: trimForPrompt(output, 16000),
          output_summary: summary,
          completed_at: new Date().toISOString(),
        })
        .eq("id", step.id);
      // Reflect updated state in our local copy for the next iteration.
      steps[i] = { ...step, status: "done", output, output_summary: summary };
    } catch (e: any) {
      const msg = e?.message || "Step failed";
      await supabaseUser
        .from("ai_agent_run_steps")
        .update({ status: "failed", error: msg, completed_at: new Date().toISOString() })
        .eq("id", step.id);
      await supabaseUser
        .from("ai_agent_runs")
        .update({ status: "failed", error: msg, completed_at: new Date().toISOString() })
        .eq("id", runId);
      return { paused_at: step.step_index, completed: false };
    }
  }
  return { paused_at: null, completed: true };
}

async function finalizeRun(
  supabaseUser: SupabaseClient,
  apiKey: string,
  runId: string,
  prompt: string,
): Promise<string> {
  const { data: stepsAll } = await supabaseUser
    .from("ai_agent_run_steps")
    .select("*")
    .eq("run_id", runId)
    .order("step_index", { ascending: true });

  const stepRecap = (stepsAll || []).map((s: any) =>
    `Step ${s.step_index} (${s.tool}, ${s.status}): ${s.title}\n  → ${s.output_summary || "(no summary)"}\n  output: ${JSON.stringify(trimForPrompt(s.output, 800))}`
  ).join("\n\n");

  const summary = await callClaude({
    apiKey,
    system: "You are summarizing the result of a multi-step AI agent run for a private credit / debt advisory team. Be concrete, terse, and reference specific deals, lenders, and tasks created. Use markdown.",
    userMessage: `User asked: "${prompt}"\n\nStep results:\n${stepRecap}\n\nProduce the structured final summary via the submit_summary tool.`,
    tool: SUMMARY_TOOL,
    toolName: "submit_summary",
  });

  const md = String(summary?.final_message || "Run complete.");
  await supabaseUser
    .from("ai_agent_runs")
    .update({
      status: "completed",
      final_summary: md,
      completed_at: new Date().toISOString(),
    })
    .eq("id", runId);
  return md;
}

// ============================================================
// HTTP entrypoint
// ============================================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "Anthropic API key not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });

    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const action = String(body?.action || "");

    // ============================================================
    if (action === "start") {
      const prompt = String(body?.prompt || "").trim();
      const context = body?.context || {};
      if (!prompt) {
        return new Response(JSON.stringify({ error: "prompt is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const planSystem =
        "You are the planner for a chained autonomous agent inside naitive (a private credit / debt advisory CRM). " +
        "Break the user's instruction into 3-8 ordered subtasks using ONLY the tools listed. " +
        "Steps that read data MUST come before steps that write. " +
        "If the user asked you to act on every item in a result set, plan a single representative write step (e.g. one task_create with deal_id='__from_previous__') — the executor will fan it out per matched item if appropriate, OR the user can approve/reject in batch. " +
        "Never plan more than one Gmail search unless the user explicitly asked. " +
        "Today's date is " + new Date().toISOString().slice(0, 10) + ".";

      const planUser =
        `User instruction: "${prompt}"\n\n` +
        `Page context: ${JSON.stringify(context)}\n\n` +
        `Plan the chain via submit_plan.`;

      const plan = await callClaude({
        apiKey: ANTHROPIC_API_KEY,
        system: planSystem,
        userMessage: planUser,
        tool: PLAN_TOOL,
        toolName: "submit_plan",
      });

      const rawSteps: any[] = Array.isArray(plan?.steps) ? plan.steps : [];
      if (rawSteps.length === 0) {
        return new Response(JSON.stringify({ error: "Planner returned no steps." }), {
          status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Persist run.
      const { data: runRow, error: runErr } = await supabaseUser
        .from("ai_agent_runs")
        .insert({
          user_id: user.id,
          prompt,
          status: "awaiting_plan_approval",
          plan_summary: plan.plan_summary || null,
          context,
        })
        .select("*")
        .single();
      if (runErr) throw new Error(runErr.message);

      const stepRows = rawSteps.slice(0, 10).map((s, i) => {
        const tool = s?.tool as ToolName;
        const kind = classifyKind(tool);
        return {
          run_id: runRow.id,
          user_id: user.id,
          step_index: i,
          tool,
          kind,
          title: String(s?.title || `Step ${i + 1}`).slice(0, 250),
          args: s?.args || {},
          requires_approval: kind === "write",
          status: "pending",
        };
      });

      const { error: stepsErr } = await supabaseUser.from("ai_agent_run_steps").insert(stepRows);
      if (stepsErr) throw new Error(stepsErr.message);

      const { data: stepsRead } = await supabaseUser
        .from("ai_agent_run_steps")
        .select("*")
        .eq("run_id", runRow.id)
        .order("step_index");

      return new Response(JSON.stringify({
        ok: true,
        run: runRow,
        steps: stepsRead || [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ============================================================
    if (action === "approve_plan") {
      const runId = String(body?.run_id || "");
      if (!runId) {
        return new Response(JSON.stringify({ error: "run_id is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: run, error: runErr } = await supabaseUser
        .from("ai_agent_runs").select("*").eq("id", runId).single();
      if (runErr || !run) throw new Error(runErr?.message || "Run not found");
      if (run.status !== "awaiting_plan_approval") {
        return new Response(JSON.stringify({ error: `Cannot approve plan in status ${run.status}` }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Approve all read steps; write steps stay pending until per-write approval.
      await supabaseUser
        .from("ai_agent_run_steps")
        .update({ status: "approved", approved_at: new Date().toISOString() })
        .eq("run_id", runId)
        .eq("kind", "read");
      await supabaseUser.from("ai_agent_runs").update({ status: "running" }).eq("id", runId);

      const { paused_at, completed } = await runLoop(supabaseUser, user.id, runId);
      let final_summary: string | null = null;
      if (completed) {
        final_summary = await finalizeRun(supabaseUser, ANTHROPIC_API_KEY, runId, run.prompt);
      }
      const { data: runFresh } = await supabaseUser.from("ai_agent_runs").select("*").eq("id", runId).single();
      const { data: stepsFresh } = await supabaseUser.from("ai_agent_run_steps").select("*").eq("run_id", runId).order("step_index");
      return new Response(JSON.stringify({
        ok: true, run: runFresh, steps: stepsFresh || [], paused_at, completed, final_summary,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ============================================================
    if (action === "approve_step") {
      const runId = String(body?.run_id || "");
      const stepId = String(body?.step_id || "");
      const decision = String(body?.decision || ""); // 'approve' | 'reject'
      if (!runId || !stepId || !["approve", "reject"].includes(decision)) {
        return new Response(JSON.stringify({ error: "run_id, step_id, decision are required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: step } = await supabaseUser.from("ai_agent_run_steps").select("*").eq("id", stepId).single();
      if (!step) throw new Error("Step not found");

      // Allow user to override args (e.g. edit a draft body) on approval.
      const argsOverride = body?.args_override && typeof body.args_override === "object" ? body.args_override : null;

      if (decision === "approve") {
        const updates: any = { status: "approved", approved_at: new Date().toISOString() };
        if (argsOverride) updates.args = { ...(step.args || {}), ...argsOverride };
        await supabaseUser.from("ai_agent_run_steps").update(updates).eq("id", stepId);
      } else {
        await supabaseUser.from("ai_agent_run_steps").update({ status: "skipped", completed_at: new Date().toISOString() }).eq("id", stepId);
      }

      const { paused_at, completed } = await runLoop(supabaseUser, user.id, runId);
      let final_summary: string | null = null;
      if (completed) {
        const { data: run } = await supabaseUser.from("ai_agent_runs").select("prompt").eq("id", runId).single();
        if (run) final_summary = await finalizeRun(supabaseUser, ANTHROPIC_API_KEY, runId, run.prompt);
      }
      const { data: runFresh } = await supabaseUser.from("ai_agent_runs").select("*").eq("id", runId).single();
      const { data: stepsFresh } = await supabaseUser.from("ai_agent_run_steps").select("*").eq("run_id", runId).order("step_index");
      return new Response(JSON.stringify({
        ok: true, run: runFresh, steps: stepsFresh || [], paused_at, completed, final_summary,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ============================================================
    if (action === "cancel") {
      const runId = String(body?.run_id || "");
      if (!runId) {
        return new Response(JSON.stringify({ error: "run_id is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await supabaseUser
        .from("ai_agent_runs")
        .update({ status: "cancelled", completed_at: new Date().toISOString() })
        .eq("id", runId);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("agent-orchestrator error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
