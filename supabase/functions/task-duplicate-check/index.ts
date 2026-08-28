import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-trigger-source, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const SYSTEM_PROMPT = `You are a task deduplication and consolidation analyst for a deal management platform.

Your job is to determine whether a newly created or updated task is potentially a duplicate of one or more existing tasks across deals, contacts, companies, and assignees.

Be conservative. Prefer false negatives over false positives. If uncertain, return "needs_review" rather than "duplicate". Repeating template language, common workflow phrases, or standard recurring tasks are NOT sufficient evidence of duplication.

Definitions:
- "duplicate" = two tasks represent the same underlying work item and should likely be consolidated.
- "related" = tasks are connected but should remain separate.
- "distinct" = tasks are different and should not be consolidated.
- "canonical task" = the task that should remain after consolidation, usually the most complete, active, or broadly linked record.

Strong duplicate signals: same objective with slightly different wording; same deliverable + customer/company/contact + overlapping timing; same assignee with nearly identical outcome; one task is a newer restatement of an older open one; one task has richer context than a thin stub.

Weak signals: same generic verbs ("follow up", "review"), same assignee only, same company only, same template across deals/contacts.

Canonical task selection: prefer more complete description; comments/attachments/subtasks/links; older still-active task with history; already referenced by other records. Do not pick completed/cancelled as canonical unless the other is clearly invalid.

Decision rules:
- High semantic + business overlap → "duplicate".
- Moderate overlap, context differs → "related" or "needs_review".
- Only generic workflow language → "distinct".
- Different deals but same contact/company → only "duplicate" if the same underlying work item.
- Different assignees alone is not proof of distinct (handoffs happen).
- One completed + one open → usually "needs_review" unless the open one is clearly a recreated dup.

Return ONLY a JSON tool call via the provided function. The candidate_task_id must equal the input candidate task id. canonical_task_id must be one of the compared task ids or null.`;

const TOOL = {
  type: "function",
  function: {
    name: "report_duplicate_assessment",
    description: "Return a structured duplicate assessment for the candidate task.",
    parameters: {
      type: "object",
      properties: {
        result: { type: "string", enum: ["duplicate", "related", "distinct", "needs_review"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        canonical_task_id: { type: ["string", "null"] },
        candidate_task_id: { type: "string" },
        reasons: { type: "array", items: { type: "string" }, maxItems: 6 },
        risk_flags: { type: "array", items: { type: "string" } },
        user_explanation: { type: "string" },
        suggested_action: { type: "string", enum: ["consolidate", "mark_related", "keep_separate", "manual_review"] },
      },
      required: ["result", "confidence", "candidate_task_id", "reasons", "user_explanation", "suggested_action"],
      additionalProperties: false,
    },
  },
};

function trim(s: string | null | undefined, n = 400): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function compactTask(t: any) {
  return {
    id: t.id,
    title: t.title,
    description: trim(t.description, 400),
    status: t.status,
    priority: t.priority,
    is_recurring: t.is_recurring,
    due_date: t.due_date,
    start_date: t.start_date,
    created_at: t.created_at,
    updated_at: t.updated_at,
    completed_at: t.completed_at,
    assigned_to: t.assigned_to,
    deal_id: t.deal_id,
    contact_id: t.contact_id,
    crm_company_id: t.crm_company_id,
    lender_id: t.lender_id,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const triggerSource = req.headers.get("x-trigger-source") || "client";
    const isDbTrigger = triggerSource === "db_trigger";

    // Auth: client calls require a valid user JWT; db_trigger calls are server-to-server.
    const authHeader = req.headers.get("Authorization") || "";
    let userId: string | null = null;
    if (!isDbTrigger) {
      if (!authHeader.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data, error } = await userClient.auth.getUser();
      if (error || !data?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = data.user.id;
    }

    const body = await req.json().catch(() => ({}));
    const taskId: string | undefined = body?.task_id;
    if (!taskId || typeof taskId !== "string") {
      return new Response(JSON.stringify({ error: "task_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role for reads + persisted writes (RLS-bypassing; we scope by company manually).
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 1) Load candidate task
    const { data: candidate, error: cErr } = await admin
      .from("tasks").select("*").eq("id", taskId).maybeSingle();
    if (cErr || !candidate) {
      return new Response(JSON.stringify({ error: "Task not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If client-triggered, ensure user is in the candidate's company.
    if (!isDbTrigger && userId && candidate.company_id) {
      const { data: m } = await admin.from("company_members")
        .select("company_id").eq("user_id", userId).eq("company_id", candidate.company_id).maybeSingle();
      if (!m) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!candidate.company_id) {
      return new Response(JSON.stringify({ result: "skipped", reason: "no_company" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Completed tasks are never duplicate candidates — clear any stale pending rows.
    const completedStatuses = ["complete", "completed", "done"];
    if (completedStatuses.includes(String(candidate.status || "").toLowerCase())) {
      await admin.from("task_duplicate_candidates")
        .update({ status: "dismissed", review_action: "auto_completed", reviewed_at: new Date().toISOString() })
        .eq("candidate_task_id", candidate.id)
        .eq("status", "pending");
      return new Response(JSON.stringify({ result: "skipped", reason: "task_completed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Pull candidate tasks: same company, sharing at least one linked entity, open, not the same task.
    const linkFilters: string[] = [];
    if (candidate.deal_id) linkFilters.push(`deal_id.eq.${candidate.deal_id}`);
    if (candidate.contact_id) linkFilters.push(`contact_id.eq.${candidate.contact_id}`);
    if (candidate.crm_company_id) linkFilters.push(`crm_company_id.eq.${candidate.crm_company_id}`);
    if (linkFilters.length === 0) {
      return new Response(JSON.stringify({ result: "skipped", reason: "no_linked_entities" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: peers, error: pErr } = await admin
      .from("tasks")
      .select("*")
      .eq("company_id", candidate.company_id)
      .neq("id", candidate.id)
      .is("archived_at", null)
      .not("status", "in", "(complete,completed,done)")
      .or(linkFilters.join(","))
      .order("updated_at", { ascending: false })
      .limit(20);

    if (pErr) {
      return new Response(JSON.stringify({ error: pErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!peers || peers.length === 0) {
      return new Response(JSON.stringify({ result: "skipped", reason: "no_peers" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3) Call Lovable AI gateway with tool calling for structured output.
    const userPayload = {
      candidate_task: compactTask(candidate),
      compared_tasks: peers.map(compactTask),
    };

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(userPayload) },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "report_duplicate_assessment" } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limits exceeded, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required, please add funds to your Lovable AI workspace." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResp.json();
    const toolCall = aiData?.choices?.[0]?.message?.tool_calls?.[0];
    const argsRaw = toolCall?.function?.arguments;
    if (!argsRaw) {
      console.error("No tool call in AI response", JSON.stringify(aiData).slice(0, 500));
      return new Response(JSON.stringify({ error: "AI returned no structured output" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let parsed: any;
    try { parsed = typeof argsRaw === "string" ? JSON.parse(argsRaw) : argsRaw; }
    catch (e) {
      return new Response(JSON.stringify({ error: "Failed to parse AI output" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate canonical_task_id is one of the compared peers (or null/candidate).
    const allowedIds = new Set<string>([candidate.id, ...peers.map((p: any) => p.id)]);
    let canonicalId: string | null = parsed.canonical_task_id ?? null;
    if (canonicalId && !allowedIds.has(canonicalId)) canonicalId = null;

    const result: string = ["duplicate", "related", "distinct", "needs_review"].includes(parsed.result)
      ? parsed.result : "needs_review";
    const suggested: string = ["consolidate", "mark_related", "keep_separate", "manual_review"].includes(parsed.suggested_action)
      ? parsed.suggested_action : "manual_review";

    const persistRow = {
      company_id: candidate.company_id,
      candidate_task_id: candidate.id,
      canonical_task_id: canonicalId,
      result,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons.slice(0, 6) : [],
      risk_flags: Array.isArray(parsed.risk_flags) ? parsed.risk_flags : [],
      user_explanation: typeof parsed.user_explanation === "string" ? parsed.user_explanation.slice(0, 1000) : null,
      suggested_action: suggested,
      compared_task_ids: peers.map((p: any) => p.id),
      trigger_source: triggerSource,
      status: "pending",
    };

    // Only persist actionable findings to avoid noise.
    let inserted: any = null;
    if (result === "duplicate" || result === "needs_review" || (result === "related" && persistRow.confidence >= 0.7)) {
      const { data: ins, error: iErr } = await admin
        .from("task_duplicate_candidates")
        .insert(persistRow)
        .select()
        .single();
      if (iErr) console.error("Persist error:", iErr);
      else inserted = ins;
    }

    return new Response(JSON.stringify({
      assessment: persistRow,
      candidate: inserted,
      compared_count: peers.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("task-duplicate-check error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});