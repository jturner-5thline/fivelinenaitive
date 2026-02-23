import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const platformKnowledge = `
## Platform Overview
naitive is a commercial lending deal management platform by 5th Line Capital. It helps teams manage deals, lenders, analytics, and reporting.

## Navigation & Pages
- **Dashboard** (/dashboard): Overview of pipeline, flagged deals, notifications, and key metrics.
- **Deals** (/deals): All deals with filters by stage, status, deal type.
- **Deal Detail** (/deals/:id): View/edit deal, manage lenders, milestones, data room, activity.
- **Lenders** (/lenders): Master lender database with contact info and deal preferences.
- **Analytics** (/analytics): Pipeline analytics, performance trends, stage progression.
- **Metrics** (/metrics): Custom KPI dashboards with configurable widgets.
- **Insights** (/insights): AI-generated recommendations and risk alerts.
- **Reports** (/reports): Generate and export custom reports.
- **Research** (/research): AI-powered market research, lender matching, rate tracking.
- **Tasks** (/tasks): Task management with list, board, calendar, and timeline views.
- **Settings** (/settings): Deal stages, lender stages, milestones, notification preferences.
- **Company** (/company): Company profile, team members, invitations.

## Common Tasks
- **Create a Deal**: Deals page → "New Deal" → Fill in details → Save
- **Add a Lender to a Deal**: Open deal → Lenders tab → "Add Lender" → Search and select
- **Upload Documents**: Open deal → Data Room tab → Drag & drop or click Upload
- **Track Milestones**: Open deal → Milestones panel → Check off or add items
- **Create a Task**: Tasks page → "New Task" → Fill in title, description, priority
- **Invite Team Member**: Company → Members → "Invite" → Enter email and role
`;

// Tool definitions for actionable commands
const tools = [
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Create a new task for the user. Use when the user asks to create a task or you suggest one.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Task title" },
          description: { type: "string", description: "Task description" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"], description: "Priority level" },
          due_date: { type: "string", description: "Due date in YYYY-MM-DD format (optional)" },
        },
        required: ["title", "priority"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_deal_stage",
      description: "Move a deal to a different stage. Use when the user wants to advance or change a deal's stage.",
      parameters: {
        type: "object",
        properties: {
          deal_id: { type: "string", description: "UUID of the deal to update" },
          new_stage: { type: "string", description: "The new stage name to move the deal to" },
        },
        required: ["deal_id", "new_stage"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_lender_note",
      description: "Add a note to a specific deal lender. Use when the user wants to record notes about a lender on a deal.",
      parameters: {
        type: "object",
        properties: {
          deal_lender_id: { type: "string", description: "UUID of the deal_lender record" },
          note: { type: "string", description: "The note content to add" },
        },
        required: ["deal_lender_id", "note"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_milestone",
      description: "Mark a deal milestone as completed.",
      parameters: {
        type: "object",
        properties: {
          milestone_id: { type: "string", description: "UUID of the milestone to complete" },
        },
        required: ["milestone_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_deal_lender_stage",
      description: "Update the stage of a lender on a deal (e.g., Reached Out, NDA, Term Sheet, etc.).",
      parameters: {
        type: "object",
        properties: {
          deal_lender_id: { type: "string", description: "UUID of the deal_lender record" },
          new_stage: { type: "string", description: "New lender stage" },
        },
        required: ["deal_lender_id", "new_stage"],
        additionalProperties: false,
      },
    },
  },
];

// Execute a tool call
async function executeTool(supabase: any, userId: string, companyId: string, name: string, args: any) {
  switch (name) {
    case "create_task": {
      const { error } = await supabase.from("tasks").insert({
        title: args.title,
        description: args.description || null,
        priority: args.priority,
        due_date: args.due_date || null,
        status: "todo",
        user_id: userId,
        assigned_to: userId,
        assigned_by: userId,
        company_id: companyId,
      });
      if (error) return { success: false, error: error.message };
      return { success: true, message: `Task "${args.title}" created with ${args.priority} priority.` };
    }
    case "update_deal_stage": {
      const { error } = await supabase
        .from("deals")
        .update({ stage: args.new_stage })
        .eq("id", args.deal_id)
        .eq("company_id", companyId);
      if (error) return { success: false, error: error.message };
      return { success: true, message: `Deal moved to "${args.new_stage}" stage.` };
    }
    case "add_lender_note": {
      const { data: dl } = await supabase
        .from("deal_lenders")
        .select("id, notes")
        .eq("id", args.deal_lender_id)
        .single();
      if (!dl) return { success: false, error: "Lender not found" };
      const updatedNotes = dl.notes ? `${dl.notes}\n\n---\n${args.note}` : args.note;
      const { error } = await supabase
        .from("deal_lenders")
        .update({ notes: updatedNotes })
        .eq("id", args.deal_lender_id);
      if (error) return { success: false, error: error.message };
      return { success: true, message: "Note added to lender." };
    }
    case "complete_milestone": {
      const { error } = await supabase
        .from("deal_milestones")
        .update({ completed: true, completed_at: new Date().toISOString() })
        .eq("id", args.milestone_id);
      if (error) return { success: false, error: error.message };
      return { success: true, message: "Milestone marked as completed." };
    }
    case "update_deal_lender_stage": {
      const { error } = await supabase
        .from("deal_lenders")
        .update({ stage: args.new_stage })
        .eq("id", args.deal_lender_id);
      if (error) return { success: false, error: error.message };
      return { success: true, message: `Lender stage updated to "${args.new_stage}".` };
    }
    default:
      return { success: false, error: `Unknown tool: ${name}` };
  }
}

// Fetch comprehensive user context
async function fetchUserContext(supabase: any, userId: string, companyId: string) {
  // Batch 1: Core data
  const [dealsRes, tasksRes, teamRes, insightsRes] = await Promise.all([
    supabase
      .from("deals")
      .select("id, company, value, stage, status, deal_type, industry, geography, created_at, user_id, closing_fee, interest_rate")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("tasks")
      .select("id, title, status, priority, due_date, description, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("profiles")
      .select("user_id, display_name, email, first_name, last_name")
      .in("user_id", (
        await supabase.from("company_members").select("user_id").eq("company_id", companyId)
      ).data?.map((m: any) => m.user_id) || []),
    supabase
      .from("insights_history")
      .select("pipeline_health_score, pipeline_health_summary, total_value, active_deals, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const deals = dealsRes.data || [];
  const tasks = tasksRes.data || [];
  const team = teamRes.data || [];
  const latestInsight = insightsRes.data?.[0];
  const dealIds = deals.map((d: any) => d.id);

  if (dealIds.length === 0) {
    return { deals, tasks, team, latestInsight, lenderStats: [], activities: [], milestones: [], memos: [], attachments: [], lenders: [], ownership: [], research: [] };
  }

  // Batch 2: Deal-related data
  const [lenderStatsRes, activitiesRes, milestonesRes, memosRes, attachmentsRes, lendersRes, ownershipRes, researchRes] = await Promise.all([
    supabase.rpc("get_lender_deal_stats", { _company_id: companyId, _limit: 20 }),
    supabase
      .from("activity_logs")
      .select("activity_type, description, created_at, deal_id, deals(company)")
      .in("deal_id", dealIds)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("deal_milestones")
      .select("id, title, completed, due_date, deal_id, status, deals(company)")
      .in("deal_id", dealIds)
      .order("due_date", { ascending: true })
      .limit(30),
    supabase
      .from("deal_memos")
      .select("deal_id, highlights, hurdles, narrative, analyst_notes, lender_notes, deals(company)")
      .in("deal_id", dealIds)
      .limit(15),
    supabase
      .from("deal_attachments")
      .select("name, category, deal_id, created_at, deals(company)")
      .in("deal_id", dealIds)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("deal_lenders")
      .select("id, name, stage, substage, quote_amount, quote_rate, quote_term, notes, tracking_status, pass_reason, deal_id, deals(company)")
      .in("deal_id", dealIds)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("deal_ownership")
      .select("owner_name, ownership_percentage, deal_id, deals(company)")
      .in("deal_id", dealIds)
      .limit(30),
    supabase
      .from("deal_research_cache")
      .select("deal_id, research_type, content, created_at, deals(company)")
      .in("deal_id", dealIds)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return {
    deals,
    tasks,
    team,
    latestInsight,
    lenderStats: lenderStatsRes.data || [],
    activities: (activitiesRes as any).data || [],
    milestones: (milestonesRes as any).data || [],
    memos: (memosRes as any).data || [],
    attachments: (attachmentsRes as any).data || [],
    lenders: (lendersRes as any).data || [],
    ownership: (ownershipRes as any).data || [],
    research: (researchRes as any).data || [],
  };
}

function buildContextString(ctx: any, companyName: string, role: string) {
  const { deals, tasks, team, latestInsight, lenderStats, activities, milestones, memos, attachments, lenders, ownership, research } = ctx;

  const sections: string[] = [];

  sections.push(`## User Context\nCompany: ${companyName} | Role: ${role}`);

  // Pipeline Health
  if (latestInsight) {
    sections.push(`## Pipeline Health\nScore: ${latestInsight.pipeline_health_score}/100 | Active Deals: ${latestInsight.active_deals} | Total Value: $${(latestInsight.total_value / 1000000).toFixed(1)}M\nSummary: ${latestInsight.pipeline_health_summary || 'N/A'}`);
  }

  // Team
  if (team.length > 0) {
    sections.push(`## Team Members (${team.length})\n${team.map((t: any) => `- ${t.display_name} (${t.email})`).join('\n')}`);
  }

  // Deals with IDs for actions
  if (deals.length > 0) {
    sections.push(`## Deals (${deals.length} recent)\n${deals.slice(0, 15).map((d: any) =>
      `- [${d.id}] ${d.company}: $${(d.value / 1000000).toFixed(1)}M | ${d.stage} | ${d.status}${d.industry ? ` | ${d.industry}` : ''}${d.deal_type ? ` | ${d.deal_type}` : ''}`
    ).join('\n')}`);
  }

  // Deal Lenders with IDs
  if (lenders.length > 0) {
    sections.push(`## Deal Lenders (${lenders.length})\n${lenders.slice(0, 25).map((l: any) =>
      `- [${l.id}] ${l.name} on ${(l as any).deals?.company || 'Unknown'}: ${l.stage}${l.substage ? `/${l.substage}` : ''}${l.quote_amount ? ` | $${(l.quote_amount / 1000000).toFixed(1)}M` : ''}${l.quote_rate ? ` @ ${l.quote_rate}%` : ''}${l.tracking_status ? ` | ${l.tracking_status}` : ''}${l.pass_reason ? ` | PASSED: ${l.pass_reason}` : ''}`
    ).join('\n')}`);
  }

  // Milestones with IDs
  if (milestones.length > 0) {
    const pending = milestones.filter((m: any) => !m.completed);
    const completed = milestones.filter((m: any) => m.completed);
    sections.push(`## Milestones (${pending.length} pending, ${completed.length} completed)\n${pending.slice(0, 15).map((m: any) =>
      `- [${m.id}] ${(m as any).deals?.company || 'Unknown'}: ${m.title}${m.due_date ? ` (due ${m.due_date})` : ''}${m.status ? ` [${m.status}]` : ''}`
    ).join('\n')}`);
  }

  // Tasks
  if (tasks.length > 0) {
    sections.push(`## Tasks (${tasks.length} recent)\n${tasks.slice(0, 15).map((t: any) =>
      `- [${t.status}] ${t.title} | ${t.priority}${t.due_date ? ` | due ${t.due_date}` : ''}`
    ).join('\n')}`);
  }

  // Deal Memos (summaries)
  if (memos.length > 0) {
    sections.push(`## Deal Memos\n${memos.slice(0, 8).map((m: any) => {
      const parts: string[] = [`**${(m as any).deals?.company || 'Unknown'}**`];
      if (m.highlights) parts.push(`Highlights: ${m.highlights.slice(0, 200)}`);
      if (m.hurdles) parts.push(`Hurdles: ${m.hurdles.slice(0, 200)}`);
      if (m.narrative) parts.push(`Narrative: ${m.narrative.slice(0, 200)}`);
      return parts.join(' | ');
    }).join('\n')}`);
  }

  // Data Room Summary
  if (attachments.length > 0) {
    const byCat: Record<string, number> = {};
    attachments.forEach((a: any) => { byCat[a.category] = (byCat[a.category] || 0) + 1; });
    sections.push(`## Data Room (${attachments.length} files)\nBy category: ${Object.entries(byCat).map(([k, v]) => `${k}: ${v}`).join(', ')}\nRecent: ${attachments.slice(0, 10).map((a: any) => `${(a as any).deals?.company || ''} - ${a.name} (${a.category})`).join(', ')}`);
  }

  // Ownership
  if (ownership.length > 0) {
    sections.push(`## Ownership Structures\n${ownership.slice(0, 15).map((o: any) =>
      `- ${(o as any).deals?.company || 'Unknown'}: ${o.owner_name} (${o.ownership_percentage}%)`
    ).join('\n')}`);
  }

  // Top Lenders
  if (lenderStats.length > 0) {
    sections.push(`## Top Lenders (Platform-wide)\n${lenderStats.slice(0, 10).map((l: any) =>
      `- ${l.lender_name}: ${l.deal_count} deals (${l.active_count} active, ${l.funded_count} funded) | $${(l.total_volume / 1000000).toFixed(1)}M volume`
    ).join('\n')}`);
  }

  // Recent Activity
  if (activities.length > 0) {
    sections.push(`## Recent Activity\n${activities.slice(0, 10).map((a: any) =>
      `- ${a.activity_type}: ${a.description} (${(a as any).deals?.company || ''})`
    ).join('\n')}`);
  }

  // Research Cache
  if (research.length > 0) {
    sections.push(`## Cached Research\n${research.slice(0, 8).map((r: any) =>
      `- ${(r as any).deals?.company || 'Unknown'} [${r.research_type}]: ${r.content.slice(0, 200)}...`
    ).join('\n')}`);
  }

  return sections.join('\n\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { messages } = await req.json();
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Messages array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get company context
    const { data: membership } = await supabase
      .from('company_members')
      .select('company_id, role, companies(name)')
      .eq('user_id', user.id)
      .maybeSingle();

    const companyId = membership?.company_id;
    const companyName = (membership as any)?.companies?.name || 'Unknown';

    // Fetch comprehensive context
    const ctx = await fetchUserContext(supabase, user.id, companyId);
    const userContext = buildContextString(ctx, companyName, membership?.role || 'member');

    const systemPrompt = `You are nAItive Assistant, an intelligent AI assistant for a commercial lending deal management platform. You have deep access to the user's deals, lenders, tasks, memos, documents, ownership structures, research, and team data.

${platformKnowledge}

${userContext}

## Your Capabilities
1. **Deep Information Access**: You can search across deals, lenders, tasks, milestones, memos, documents, ownership, research, and activity. Reference specific data with IDs when relevant.
2. **Actionable Commands**: You can CREATE TASKS, UPDATE DEAL STAGES, ADD LENDER NOTES, COMPLETE MILESTONES, and UPDATE LENDER STAGES. Use the provided tools when the user asks you to perform actions or when you recommend an action.
3. **Deal Insights**: Analyze deal health, pipeline metrics, lender engagement, and provide strategic recommendations.
4. **Research**: Reference cached market research, company profiles, and industry data.
5. **Team Awareness**: You know who's on the team and can reference them.

## Action Guidelines
- When the user asks to create a task, update a stage, or perform an action, USE THE TOOL immediately.
- When you suggest an action, ask if the user wants you to execute it.
- After executing a tool, confirm what was done.
- Use deal IDs from the context when calling tools (they appear in brackets like [uuid]).

## Response Guidelines
- Use markdown formatting for readability.
- When referencing navigation, include links like: [Go to Deals](/deals) or [View Deal](/deals/deal-id)
- Be concise but thorough. Use bullet points for lists.
- When analyzing deals, consider stage, value, lender count, milestone completion, and data room completeness.
- Proactively flag risks: overdue milestones, stale lenders, missing documents, deals stuck in a stage.
- If you don't have enough information, ask clarifying questions.`;

    // First call with tools (non-streaming to handle tool calls)
    const firstResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map((m: any) => ({ role: m.role, content: m.content })),
        ],
        tools,
        temperature: 0.4,
      }),
    });

    if (!firstResponse.ok) {
      if (firstResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (firstResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const errorText = await firstResponse.text();
      console.error("AI gateway error:", firstResponse.status, errorText);
      return new Response(JSON.stringify({ error: "AI processing failed" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const firstResult = await firstResponse.json();
    const choice = firstResult.choices?.[0];

    // Check for tool calls
    if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
      const toolResults: any[] = [];
      const actionsSummary: string[] = [];

      for (const tc of choice.message.tool_calls) {
        const args = JSON.parse(tc.function.arguments);
        const result = await executeTool(supabase, user.id, companyId, tc.function.name, args);
        toolResults.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
        actionsSummary.push(result.message || result.error || "Action completed");
      }

      // Second call: stream the response after tool execution
      const streamResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            ...messages.map((m: any) => ({ role: m.role, content: m.content })),
            choice.message,
            ...toolResults,
          ],
          stream: true,
          temperature: 0.4,
        }),
      });

      if (!streamResponse.ok) {
        // Fallback: return the action results as text
        const fallback = `I performed the following actions:\n${actionsSummary.map(a => `- ✅ ${a}`).join('\n')}`;
        return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: fallback } }] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(streamResponse.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // No tool calls - stream the response directly
    const streamResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map((m: any) => ({ role: m.role, content: m.content })),
        ],
        stream: true,
        temperature: 0.4,
      }),
    });

    if (!streamResponse.ok) {
      // If streaming fails, return the non-streamed response
      const content = choice?.message?.content || "I couldn't generate a response.";
      return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(streamResponse.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });

  } catch (error: unknown) {
    console.error('Error in dashboard-chat:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
