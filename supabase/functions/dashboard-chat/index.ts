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
`;

// Tool definitions
const tools = [
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Create a new task for the user or assign to a team member.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
          due_date: { type: "string", description: "YYYY-MM-DD format" },
          assigned_to: { type: "string", description: "User ID to assign to (optional, defaults to current user)" },
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
      description: "Move a deal to a different stage.",
      parameters: {
        type: "object",
        properties: {
          deal_id: { type: "string" },
          new_stage: { type: "string" },
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
      description: "Add a note to a deal lender.",
      parameters: {
        type: "object",
        properties: {
          deal_lender_id: { type: "string" },
          note: { type: "string" },
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
          milestone_id: { type: "string" },
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
      description: "Update a lender's stage on a deal.",
      parameters: {
        type: "object",
        properties: {
          deal_lender_id: { type: "string" },
          new_stage: { type: "string" },
        },
        required: ["deal_lender_id", "new_stage"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_lenders",
      description: "Search the master lender database to find lenders matching criteria like industry, loan type, deal size, geography.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search terms (industry, loan type, geography, lender name, etc.)" },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
];

// Execute tool calls
async function executeTool(supabase: any, userId: string, companyId: string, name: string, args: any) {
  switch (name) {
    case "create_task": {
      const assignTo = args.assigned_to || userId;
      const { error } = await supabase.from("tasks").insert({
        title: args.title,
        description: args.description || null,
        priority: args.priority,
        due_date: args.due_date || null,
        status: "todo",
        user_id: userId,
        assigned_to: assignTo,
        assigned_by: userId,
        company_id: companyId,
      });
      if (error) return { success: false, error: error.message };
      return { success: true, message: `Task "${args.title}" created with ${args.priority} priority.` };
    }
    case "update_deal_stage": {
      const { data: deal } = await supabase.from("deals").select("company").eq("id", args.deal_id).single();
      const { error } = await supabase.from("deals").update({ stage: args.new_stage }).eq("id", args.deal_id).eq("company_id", companyId);
      if (error) return { success: false, error: error.message };
      return { success: true, message: `Deal "${deal?.company || args.deal_id}" moved to "${args.new_stage}".` };
    }
    case "add_lender_note": {
      const { data: dl } = await supabase.from("deal_lenders").select("id, notes, name").eq("id", args.deal_lender_id).single();
      if (!dl) return { success: false, error: "Lender not found" };
      const updatedNotes = dl.notes ? `${dl.notes}\n\n---\n${args.note}` : args.note;
      const { error } = await supabase.from("deal_lenders").update({ notes: updatedNotes }).eq("id", args.deal_lender_id);
      if (error) return { success: false, error: error.message };
      return { success: true, message: `Note added to ${dl.name}.` };
    }
    case "complete_milestone": {
      const { data: ms } = await supabase.from("deal_milestones").select("title").eq("id", args.milestone_id).single();
      const { error } = await supabase.from("deal_milestones").update({ completed: true, completed_at: new Date().toISOString() }).eq("id", args.milestone_id);
      if (error) return { success: false, error: error.message };
      return { success: true, message: `Milestone "${ms?.title || ''}" completed.` };
    }
    case "update_deal_lender_stage": {
      const { data: dl } = await supabase.from("deal_lenders").select("name").eq("id", args.deal_lender_id).single();
      const { error } = await supabase.from("deal_lenders").update({ stage: args.new_stage }).eq("id", args.deal_lender_id);
      if (error) return { success: false, error: error.message };
      return { success: true, message: `${dl?.name || 'Lender'} stage → "${args.new_stage}".` };
    }
    case "search_lenders": {
      const { data } = await supabase.rpc("search_lenders_keyword", { _search_query: args.query, _limit: 10 });
      if (!data || data.length === 0) return { success: true, message: "No matching lenders found.", results: [] };
      const lenderIds = data.map((r: any) => r.lender_id);
      const { data: lenders } = await supabase
        .from("master_lenders")
        .select("id, name, lender_type, geo, tier, loan_types, industries, min_deal_size, max_deal_size, contact_name, email")
        .in("id", lenderIds);
      return {
        success: true,
        message: `Found ${lenders?.length || 0} matching lenders.`,
        results: (lenders || []).map((l: any) => ({
          name: l.name,
          type: l.lender_type,
          geo: l.geo,
          tier: l.tier,
          loan_types: l.loan_types,
          industries: l.industries,
          deal_size_range: l.min_deal_size && l.max_deal_size ? `$${(l.min_deal_size / 1000000).toFixed(0)}M-$${(l.max_deal_size / 1000000).toFixed(0)}M` : null,
          contact: l.contact_name,
          email: l.email,
        })),
      };
    }
    default:
      return { success: false, error: `Unknown tool: ${name}` };
  }
}

// Anomaly detection
function detectAnomalies(deals: any[], milestones: any[], lenders: any[]) {
  const alerts: string[] = [];
  const now = new Date();

  // Deals stuck in stage
  for (const d of deals) {
    if (d.status !== 'active') continue;
    const created = new Date(d.created_at);
    const daysInPipeline = Math.floor((now.getTime() - created.getTime()) / 86400000);
    if (daysInPipeline > 60) alerts.push(`⚠️ "${d.company}" has been in pipeline for ${daysInPipeline} days`);
  }

  // Overdue milestones
  for (const m of milestones) {
    if (m.completed) continue;
    if (m.due_date && new Date(m.due_date) < now) {
      const daysOverdue = Math.floor((now.getTime() - new Date(m.due_date).getTime()) / 86400000);
      alerts.push(`🔴 Overdue milestone: "${m.title}" on ${m.deals?.company || 'Unknown'} (${daysOverdue} days overdue)`);
    }
  }

  // Stale lenders (no stage change in 14+ days)
  for (const l of lenders) {
    if (l.stage === 'Passed' || l.stage === 'Funded') continue;
    const updated = new Date(l.updated_at || l.created_at);
    const daysSinceUpdate = Math.floor((now.getTime() - updated.getTime()) / 86400000);
    if (daysSinceUpdate > 14) {
      alerts.push(`⏳ Stale lender: ${l.name} on ${l.deals?.company || 'Unknown'} (no update in ${daysSinceUpdate} days)`);
    }
  }

  // High-value deals without enough lenders
  const dealLenderCounts: Record<string, number> = {};
  for (const l of lenders) { dealLenderCounts[l.deal_id] = (dealLenderCounts[l.deal_id] || 0) + 1; }
  for (const d of deals) {
    if (d.status !== 'active' || d.value < 5000000) continue;
    const count = dealLenderCounts[d.id] || 0;
    if (count < 3) alerts.push(`📋 "${d.company}" ($${(d.value/1000000).toFixed(0)}M) has only ${count} lender(s)`);
  }

  return alerts.slice(0, 8);
}

// Fetch user context
async function fetchUserContext(supabase: any, userId: string, companyId: string) {
  const memberRes = await supabase.from("company_members").select("user_id").eq("company_id", companyId);
  const memberIds = memberRes.data?.map((m: any) => m.user_id) || [];

  const [dealsRes, tasksRes, teamRes, insightsRes] = await Promise.all([
    supabase.from("deals")
      .select("id, company, value, stage, status, deal_type, industry, geography, created_at, user_id, closing_fee, interest_rate")
      .eq("company_id", companyId).order("created_at", { ascending: false }).limit(30),
    supabase.from("tasks")
      .select("id, title, status, priority, due_date, description, assigned_to, created_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(30),
    supabase.from("profiles")
      .select("user_id, display_name, email, first_name, last_name")
      .in("user_id", memberIds),
    supabase.from("insights_history")
      .select("pipeline_health_score, pipeline_health_summary, total_value, active_deals, created_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(1),
  ]);

  const deals = dealsRes.data || [];
  const tasks = tasksRes.data || [];
  const team = teamRes.data || [];
  const latestInsight = insightsRes.data?.[0];
  const dealIds = deals.map((d: any) => d.id);

  if (dealIds.length === 0) {
    return { deals, tasks, team, latestInsight, lenderStats: [], activities: [], milestones: [], memos: [], attachments: [], lenders: [], ownership: [], research: [], emails: [], anomalies: [] };
  }

  const [lenderStatsRes, activitiesRes, milestonesRes, memosRes, attachmentsRes, lendersRes, ownershipRes, researchRes, emailsRes] = await Promise.all([
    supabase.rpc("get_lender_deal_stats", { _company_id: companyId, _limit: 20 }),
    supabase.from("activity_logs")
      .select("activity_type, description, created_at, deal_id, user_display_name, deals(company)")
      .in("deal_id", dealIds).order("created_at", { ascending: false }).limit(25),
    supabase.from("deal_milestones")
      .select("id, title, completed, due_date, deal_id, status, created_at, deals(company)")
      .in("deal_id", dealIds).order("due_date", { ascending: true }).limit(40),
    supabase.from("deal_memos")
      .select("deal_id, highlights, hurdles, narrative, analyst_notes, lender_notes, deals(company)")
      .in("deal_id", dealIds).limit(15),
    supabase.from("deal_attachments")
      .select("name, category, deal_id, created_at, deals(company)")
      .in("deal_id", dealIds).order("created_at", { ascending: false }).limit(30),
    supabase.from("deal_lenders")
      .select("id, name, stage, substage, quote_amount, quote_rate, quote_term, notes, tracking_status, pass_reason, deal_id, created_at, updated_at, deals(company)")
      .in("deal_id", dealIds).order("created_at", { ascending: false }).limit(60),
    supabase.from("deal_ownership")
      .select("owner_name, ownership_percentage, deal_id, deals(company)")
      .in("deal_id", dealIds).limit(30),
    supabase.from("deal_research_cache")
      .select("deal_id, research_type, content, created_at, deals(company)")
      .in("deal_id", dealIds).order("created_at", { ascending: false }).limit(20),
    supabase.from("deal_emails")
      .select("deal_id, gmail_message_id, notes, linked_at")
      .in("deal_id", dealIds).order("linked_at", { ascending: false }).limit(20),
  ]);

  const lenders = (lendersRes as any).data || [];
  const milestones = (milestonesRes as any).data || [];
  const anomalies = detectAnomalies(deals, milestones, lenders);

  return {
    deals, tasks, team, latestInsight,
    lenderStats: lenderStatsRes.data || [],
    activities: (activitiesRes as any).data || [],
    milestones,
    memos: (memosRes as any).data || [],
    attachments: (attachmentsRes as any).data || [],
    lenders,
    ownership: (ownershipRes as any).data || [],
    research: (researchRes as any).data || [],
    emails: (emailsRes as any).data || [],
    anomalies,
  };
}

function buildContextString(ctx: any, companyName: string, role: string) {
  const { deals, tasks, team, latestInsight, lenderStats, activities, milestones, memos, attachments, lenders, ownership, research, emails, anomalies } = ctx;
  const s: string[] = [];

  s.push(`## User Context\nCompany: ${companyName} | Role: ${role} | Date: ${new Date().toISOString().slice(0, 10)}`);

  // Anomalies / Alerts
  if (anomalies.length > 0) {
    s.push(`## ⚠️ Alerts & Anomalies\n${anomalies.join('\n')}`);
  }

  if (latestInsight) {
    s.push(`## Pipeline Health\nScore: ${latestInsight.pipeline_health_score}/100 | Active: ${latestInsight.active_deals} | Value: $${(latestInsight.total_value / 1000000).toFixed(1)}M\n${latestInsight.pipeline_health_summary || ''}`);
  }

  if (team.length > 0) {
    s.push(`## Team (${team.length})\n${team.map((t: any) => `- ${t.display_name} [${t.user_id}] (${t.email})`).join('\n')}`);
  }

  if (deals.length > 0) {
    s.push(`## Deals (${deals.length})\n${deals.slice(0, 20).map((d: any) =>
      `- [${d.id}] ${d.company}: $${(d.value / 1000000).toFixed(1)}M | ${d.stage} | ${d.status}${d.industry ? ` | ${d.industry}` : ''}${d.deal_type ? ` | ${d.deal_type}` : ''}${d.geography ? ` | ${d.geography}` : ''}`
    ).join('\n')}`);
  }

  if (lenders.length > 0) {
    s.push(`## Deal Lenders (${lenders.length})\n${lenders.slice(0, 30).map((l: any) =>
      `- [${l.id}] ${l.name} → ${l.deals?.company || '?'}: ${l.stage}${l.quote_amount ? ` $${(l.quote_amount / 1000000).toFixed(1)}M` : ''}${l.quote_rate ? ` @${l.quote_rate}%` : ''}${l.pass_reason ? ` PASSED: ${l.pass_reason}` : ''}`
    ).join('\n')}`);
  }

  if (milestones.length > 0) {
    const pending = milestones.filter((m: any) => !m.completed);
    s.push(`## Milestones (${pending.length} pending)\n${pending.slice(0, 15).map((m: any) =>
      `- [${m.id}] ${m.deals?.company || '?'}: ${m.title}${m.due_date ? ` (due ${m.due_date})` : ''}`
    ).join('\n')}`);
  }

  if (tasks.length > 0) {
    s.push(`## Tasks (${tasks.length})\n${tasks.slice(0, 15).map((t: any) =>
      `- [${t.status}] ${t.title} | ${t.priority}${t.due_date ? ` | due ${t.due_date}` : ''}`
    ).join('\n')}`);
  }

  if (memos.length > 0) {
    s.push(`## Deal Memos\n${memos.slice(0, 8).map((m: any) => {
      const p: string[] = [`**${m.deals?.company || '?'}**`];
      if (m.highlights) p.push(`Highlights: ${m.highlights.slice(0, 150)}`);
      if (m.hurdles) p.push(`Hurdles: ${m.hurdles.slice(0, 150)}`);
      return p.join(' | ');
    }).join('\n')}`);
  }

  if (attachments.length > 0) {
    const byCat: Record<string, number> = {};
    attachments.forEach((a: any) => { byCat[a.category] = (byCat[a.category] || 0) + 1; });
    s.push(`## Data Room (${attachments.length} files)\nCategories: ${Object.entries(byCat).map(([k, v]) => `${k}:${v}`).join(', ')}`);
  }

  if (ownership.length > 0) {
    s.push(`## Ownership\n${ownership.slice(0, 10).map((o: any) => `- ${o.deals?.company || '?'}: ${o.owner_name} (${o.ownership_percentage}%)`).join('\n')}`);
  }

  if (lenderStats.length > 0) {
    s.push(`## Top Lenders\n${lenderStats.slice(0, 10).map((l: any) => `- ${l.lender_name}: ${l.deal_count} deals, ${l.active_count} active, $${(l.total_volume / 1000000).toFixed(0)}M`).join('\n')}`);
  }

  if (activities.length > 0) {
    s.push(`## Recent Activity\n${activities.slice(0, 12).map((a: any) => `- ${a.activity_type}: ${a.description} (${a.deals?.company || ''})${a.user_display_name ? ` by ${a.user_display_name}` : ''}`).join('\n')}`);
  }

  if (emails.length > 0) {
    s.push(`## Linked Emails (${emails.length})\n${emails.slice(0, 10).map((e: any) => `- Deal email linked${e.notes ? `: ${e.notes}` : ''}`).join('\n')}`);
  }

  if (research.length > 0) {
    s.push(`## Research Cache\n${research.slice(0, 6).map((r: any) => `- ${r.deals?.company || '?'} [${r.research_type}]: ${r.content.slice(0, 150)}...`).join('\n')}`);
  }

  return s.join('\n\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { messages } = await req.json();
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Messages required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: membership } = await supabase.from('company_members').select('company_id, role, companies(name)').eq('user_id', user.id).maybeSingle();
    const companyId = membership?.company_id;
    const companyName = (membership as any)?.companies?.name || 'Unknown';

    const ctx = await fetchUserContext(supabase, user.id, companyId);
    const userContext = buildContextString(ctx, companyName, membership?.role || 'member');

    const systemPrompt = `You are nAItive Assistant, the intelligent AI for a commercial lending deal management platform. You have comprehensive access to the user's data and can take actions on their behalf.

${platformKnowledge}

${userContext}

## Capabilities
1. **Deep Data Access**: Deals, lenders, tasks, milestones, memos, documents, ownership, research, emails, activity logs, team info.
2. **Actions**: Create tasks (assign to any team member), update deal stages, add lender notes, complete milestones, update lender stages.
3. **Lender Matching**: Search the master lender database by industry, geography, loan type, deal size to find the best fit.
4. **Anomaly Detection**: Proactively flag overdue milestones, stale lenders, deals stuck in stages, under-lent deals.
5. **Team Awareness**: Know who's on the team, reference by name, assign tasks to specific members.

## Response Format
- Use **markdown tables** when comparing deals, lenders, or showing structured data. Example:
  | Deal | Value | Stage | Lenders |
  |------|-------|-------|---------|
  | Acme | $5M   | DD    | 3       |
- Use **bold** for key metrics and deal names.
- Include links: [View Deal](/deals/deal-id) or [Go to Tasks](/tasks)
- For lender matching results, present as a ranked table with key attributes.

## Action Rules
- Execute tools immediately when asked.
- For destructive actions (stage changes, milestone completion), confirm what you're about to do, then execute.
- After executing, confirm with ✅ what was done.
- When assigning tasks to team members, use their user_id from the Team context.

## Proactive Behavior
- If this is the first message and contains "briefing" or "morning", give a comprehensive daily briefing covering alerts, key metrics, and suggested actions.
- Always mention relevant anomalies/alerts when discussing affected deals.
- Suggest specific next steps after answering questions.`;

    const apiCall = async (msgs: any[], stream: boolean, includeTools = false) => {
      const body: any = {
        model: "google/gemini-3-flash-preview",
        messages: msgs,
        temperature: 0.4,
        stream,
      };
      if (includeTools) body.tools = tools;
      return fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    };

    const allMessages = [{ role: "system", content: systemPrompt }, ...messages.map((m: any) => ({ role: m.role, content: m.content }))];

    // First call with tools (non-streaming)
    const firstResponse = await apiCall(allMessages, false, true);

    if (!firstResponse.ok) {
      const status = firstResponse.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded." }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      console.error("AI error:", status, await firstResponse.text());
      return new Response(JSON.stringify({ error: "AI processing failed" }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const firstResult = await firstResponse.json();
    const choice = firstResult.choices?.[0];

    // Handle tool calls
    if (choice?.message?.tool_calls?.length > 0) {
      const toolResults: any[] = [];
      const actions: string[] = [];

      for (const tc of choice.message.tool_calls) {
        const args = JSON.parse(tc.function.arguments);
        const result = await executeTool(supabase, user.id, companyId, tc.function.name, args);
        toolResults.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
        actions.push(result.message || result.error || "Done");
      }

      // Stream response after tool execution
      const streamResp = await apiCall([...allMessages, choice.message, ...toolResults], true);
      if (!streamResp.ok) {
        const fallback = `Actions completed:\n${actions.map(a => `- ✅ ${a}`).join('\n')}`;
        return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: fallback } }] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return new Response(streamResp.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
    }

    // No tool calls - stream directly
    const streamResp = await apiCall(allMessages, true);
    if (!streamResp.ok) {
      const content = choice?.message?.content || "I couldn't generate a response.";
      return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    return new Response(streamResp.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });

  } catch (error: unknown) {
    console.error('Error in dashboard-chat:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
