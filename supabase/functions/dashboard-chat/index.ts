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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'AI not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Messages array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch user context
    const { data: membership } = await supabase
      .from('company_members')
      .select('company_id, role, companies(name)')
      .eq('user_id', user.id)
      .maybeSingle();

    const companyId = membership?.company_id;
    const companyName = (membership as any)?.companies?.name || 'Unknown';

    // Parallel data fetches
    const [dealsRes, tasksRes] = await Promise.all([
      supabase
        .from('deals')
        .select('id, company, value, stage, status, deal_type, created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('tasks')
        .select('id, title, status, priority, due_date, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    const deals = dealsRes.data || [];
    const tasks = tasksRes.data || [];

    // Get lender stats and recent activity
    const dealIds = deals.map(d => d.id);
    const [lenderStatsRes, activitiesRes, milestonesRes] = await Promise.all([
      supabase.rpc('get_lender_deal_stats', { _company_id: companyId, _limit: 15 }),
      dealIds.length > 0
        ? supabase
            .from('activity_logs')
            .select('activity_type, description, created_at, deals(company)')
            .in('deal_id', dealIds)
            .order('created_at', { ascending: false })
            .limit(10)
        : Promise.resolve({ data: [] }),
      dealIds.length > 0
        ? supabase
            .from('deal_milestones')
            .select('title, completed, due_date, deal_id')
            .in('deal_id', dealIds)
            .eq('completed', false)
            .order('due_date', { ascending: true })
            .limit(10)
        : Promise.resolve({ data: [] }),
    ]);

    const userContext = `
## User Context
Company: ${companyName} | Role: ${membership?.role || 'member'}

## Deals (${deals.length} recent)
${deals.slice(0, 10).map(d => `- ${d.company}: $${(d.value / 1000000).toFixed(1)}M | ${d.stage} | ${d.status}`).join('\n') || 'None'}

## Tasks (${tasks.length} recent)
${tasks.slice(0, 10).map(t => `- [${t.status}] ${t.title} | ${t.priority} priority${t.due_date ? ` | due ${t.due_date}` : ''}`).join('\n') || 'None'}

## Top Lenders
${(lenderStatsRes.data || []).slice(0, 10).map((l: any) => `- ${l.lender_name}: ${l.deal_count} deals (${l.active_count} active)`).join('\n') || 'None'}

## Recent Activity
${((activitiesRes as any).data || []).slice(0, 5).map((a: any) => `- ${a.activity_type}: ${a.description}`).join('\n') || 'None'}

## Upcoming Milestones
${((milestonesRes as any).data || []).slice(0, 5).map((m: any) => `- ${m.title}${m.due_date ? ` (due ${m.due_date})` : ''}`).join('\n') || 'None'}
`;

    const systemPrompt = `You are nAItive Assistant, an intelligent AI assistant for a commercial lending deal management platform. You help users by chatting naturally, finding information, suggesting tasks, and answering questions.

${platformKnowledge}

${userContext}

## Your Capabilities
1. **Finding Information**: Search across deals, lenders, tasks, milestones, activities, and documents. Reference specific data when relevant.
2. **Suggesting Tasks**: When appropriate, suggest actionable tasks the user could create. Format them clearly with titles and priorities.
3. **Answering Questions**: Answer platform questions, explain features, guide navigation.
4. **Conversational**: Maintain context across the conversation. Be helpful and concise.

## Response Guidelines
- Use markdown formatting for readability (headers, bold, lists, etc.)
- When suggesting tasks, format as: **Suggested Task:** [title] (Priority: [high/medium/low])
- When referencing navigation, include links like: [Go to Deals](/deals)
- Be concise but thorough. Use bullet points for lists.
- If you don't have enough information, ask clarifying questions.
- Reference specific deal names, lender names, or data points when available.`;

    // Stream the response
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds." }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI processing failed" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(response.body, {
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
