import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const DASHBOARD_CHAT_MODEL = "google/gemini-3-flash-preview";
const AI_GATEWAY_TIMEOUT_MS = 45_000;

async function logDashboardChatFailure(
  supabase: any,
  userId: string | null,
  companyId: string | null,
  errorMessage: string,
  promptPreview: string,
) {
  console.error('[dashboard-chat] request failed', {
    userId,
    companyId,
    errorMessage,
    promptPreview,
  });

  if (!userId || !companyId) return;

  try {
    await supabase.from('ai_usage_logs').insert({
      company_id: companyId,
      user_id: userId,
      feature: 'dashboard_chat',
      model: DASHBOARD_CHAT_MODEL,
      input_tokens: 0,
      output_tokens: 0,
      status: 'error',
      error_message: `${errorMessage} | prompt: ${promptPreview.slice(0, 300)}`,
    });
  } catch (logError) {
    console.error('[dashboard-chat] failed to persist ai_usage_logs row', logError);
  }
}

async function callAiGateway(
  apiKey: string,
  body: Record<string, unknown>,
  timeoutMs = AI_GATEWAY_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Dashboard AI timed out after ${Math.round(timeoutMs / 1000)}s`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

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

// ─── Multi-agent personas ───────────────────────────────────────────
const agentPersonas: Record<string, { name: string; icon: string; systemAddendum: string }> = {
  research: {
    name: "Research Analyst",
    icon: "🔍",
    systemAddendum: `You are now operating as the **Research Analyst** specialist. You excel at deep-dive company research, market analysis, competitive intelligence, and rate environment tracking. Always use the \`run_research\` tool proactively. Provide citations and data-driven insights. Structure findings with clear headers and actionable takeaways.`,
  },
  email: {
    name: "Email Drafter",
    icon: "📧",
    systemAddendum: `You are now operating as the **Email Drafter** specialist. You craft polished, professional lender outreach emails, follow-ups, and deal communications. Always use \`draft_email\` first, then offer to send. Match the user's communication style from memory. Suggest subject lines, key points, and appropriate tone.`,
  },
  analyst: {
    name: "Deal Analyst",
    icon: "📊",
    systemAddendum: `You are now operating as the **Deal Analyst** specialist. You provide deep pipeline analytics, deal comparisons, risk assessments, and revenue forecasting. Use \`pipeline_analytics\`, \`compare_deals\`, and \`generate_memo\` tools. Present data in markdown tables. Highlight anomalies, trends, and recommended actions.`,
  },
  executor: {
    name: "Action Executor",
    icon: "⚡",
    systemAddendum: `You are now operating as the **Action Executor** specialist. You efficiently execute platform actions: updating deal stages, managing lenders, completing milestones, creating tasks. Confirm actions before executing, report results with ✅, and suggest follow-up actions.`,
  },
};

// Intent detection patterns for multi-agent routing
function detectIntent(message: string): string | null {
  const lower = message.toLowerCase();
  // Research intent
  if (/\b(research|look up|find out about|what (is|are|does)|market|industry|competitor|rate environment|tell me about)\b/.test(lower) &&
      !/\b(draft|email|send|write|compose)\b/.test(lower)) {
    return "research";
  }
  // Email intent
  if (/\b(draft|email|send|write|compose|outreach|follow[- ]?up email|reach out)\b/.test(lower)) {
    return "email";
  }
  // Analytics/analyst intent
  if (/\b(analyz|analytics|forecast|compare|conversion|velocity|win.?loss|pipeline.?report|revenue|performance|benchmark|trend)\b/.test(lower)) {
    return "analyst";
  }
  // Action intent
  if (/\b(update stage|move.*(deal|stage)|complete milestone|create task|assign|mark.*complete|add lender|change.*stage)\b/.test(lower)) {
    return "executor";
  }
  return null; // General copilot
}

// ─── Tool definitions ───────────────────────────────────────────────
const tools = [
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Create a new task for the user or assign to a team member. Use for follow-up reminders too.",
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
  {
    type: "function",
    function: {
      name: "run_research",
      description: "Run AI-powered web research on a company, industry, market, or topic using Perplexity. Returns citations.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The research question or topic" },
          focus: { type: "string", enum: ["company", "industry", "market", "lender", "rate_environment", "competitive", "general"], description: "Research focus area" },
          company_name: { type: "string", description: "Company name if relevant" },
          industry: { type: "string", description: "Industry if relevant" },
        },
        required: ["query", "focus"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "draft_email",
      description: "Draft a professional email for lender outreach, follow-up, or deal communication. Returns the draft for review.",
      parameters: {
        type: "object",
        properties: {
          to_name: { type: "string", description: "Recipient name" },
          to_email: { type: "string", description: "Recipient email address" },
          subject: { type: "string" },
          purpose: { type: "string", enum: ["lender_outreach", "follow_up", "deal_update", "meeting_request", "term_sheet_request", "general"] },
          deal_id: { type: "string", description: "Deal ID for context (optional)" },
          key_points: { type: "string", description: "Key points to include in the email" },
          tone: { type: "string", enum: ["formal", "professional", "friendly"], description: "Email tone" },
        },
        required: ["to_name", "subject", "purpose", "key_points"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_email",
      description: "Send an email via the connected email account (Nylas). Use draft_email first to compose, then send.",
      parameters: {
        type: "object",
        properties: {
          to_email: { type: "string" },
          to_name: { type: "string" },
          subject: { type: "string" },
          body: { type: "string", description: "HTML email body" },
          reply_to_message_id: { type: "string", description: "Nylas message ID to reply to (optional)" },
        },
        required: ["to_email", "subject", "body"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pipeline_analytics",
      description: "Calculate pipeline analytics: conversion rates, deal velocity, revenue forecasting, stage distribution, win/loss analysis.",
      parameters: {
        type: "object",
        properties: {
          metric: {
            type: "string",
            enum: ["conversion_rates", "deal_velocity", "revenue_forecast", "stage_distribution", "win_loss_analysis", "lender_performance", "full_briefing"],
            description: "Which metric to calculate"
          },
          time_period: { type: "string", enum: ["30d", "90d", "6m", "1y", "all"], description: "Time window" },
        },
        required: ["metric"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_memo",
      description: "Generate a deal memo, meeting prep brief, or executive summary for a specific deal.",
      parameters: {
        type: "object",
        properties: {
          deal_id: { type: "string" },
          memo_type: { type: "string", enum: ["deal_memo", "meeting_prep", "executive_summary", "lender_update", "risk_assessment"] },
          additional_context: { type: "string", description: "Any extra context to include" },
        },
        required: ["deal_id", "memo_type"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_deals",
      description: "Compare two or more deals side by side on key metrics.",
      parameters: {
        type: "object",
        properties: {
          deal_ids: {
            type: "array",
            items: { type: "string" },
            description: "Array of deal IDs to compare (2-5)"
          },
          focus: { type: "string", enum: ["overview", "lenders", "financials", "timeline", "risk"], description: "Comparison focus" },
        },
        required: ["deal_ids"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_slack_message",
      description: "Send a message or update to a Slack channel.",
      parameters: {
        type: "object",
        properties: {
          channel: { type: "string", description: "Slack channel name or ID" },
          message: { type: "string", description: "Message text (supports Slack markdown)" },
        },
        required: ["channel", "message"],
        additionalProperties: false,
      },
    },
  },
  // ─── Lender-Deal lookup tool ───────────────────────────────────────
  {
    type: "function",
    function: {
      name: "lookup_deals_for_lender",
      description: "Look up all deals associated with a specific lender. Use this when a user asks 'What deals have I submitted to X?' or 'Where is X a lender?' Supports partial, case-insensitive name matching.",
      parameters: {
        type: "object",
        properties: {
          lender_name: { type: "string", description: "Lender name or partial name to search for (e.g., 'LAGO', 'Alignment Credit')" },
        },
        required: ["lender_name"],
        additionalProperties: false,
      },
    },
  },
  // ─── Memory tools ─────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "save_memory",
      description: "Save a user preference, communication style, or important fact to long-term memory. Use this to remember things the user tells you about their preferences, writing style, preferred lenders, deal criteria, or decisions.",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string", description: "Short descriptive key (e.g., 'email_tone', 'preferred_lenders', 'deal_criteria')" },
          value: { type: "string", description: "The value or information to remember" },
          memory_type: { type: "string", enum: ["preference", "style", "criteria", "decision", "fact"], description: "Type of memory" },
          importance: { type: "number", description: "Importance score 1-10 (10 = critical)" },
        },
        required: ["key", "value", "memory_type"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "recall_memory",
      description: "Retrieve stored memories and preferences. Use at start of conversations or when you need to recall user preferences.",
      parameters: {
        type: "object",
        properties: {
          memory_type: { type: "string", enum: ["preference", "style", "criteria", "decision", "fact", "all"], description: "Type of memory to recall" },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
];

// ─── Tool execution ─────────────────────────────────────────────────
async function executeTool(supabase: any, userId: string, companyId: string, name: string, args: any, ctx: any) {
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
      return { success: true, message: `Task "${args.title}" created with ${args.priority} priority${args.due_date ? ` (due ${args.due_date})` : ''}.` };
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
          name: l.name, type: l.lender_type, geo: l.geo, tier: l.tier,
          loan_types: l.loan_types, industries: l.industries,
          deal_size_range: l.min_deal_size && l.max_deal_size ? `$${(l.min_deal_size / 1e6).toFixed(0)}M-$${(l.max_deal_size / 1e6).toFixed(0)}M` : null,
          contact: l.contact_name, email: l.email,
        })),
      };
    }

    case "lookup_deals_for_lender": {
      const searchName = (args.lender_name || '').trim().toLowerCase();
      if (!searchName) return { success: false, error: "Lender name is required" };

      // Find all deal_lenders matching this name (case-insensitive, partial match)
      const allLenders = ctx.lenders || [];
      const matched = allLenders.filter((l: any) => {
        const name = (l.name || '').toLowerCase();
        return name.includes(searchName) || searchName.includes(name);
      });

      if (matched.length === 0) {
        // Try broader search across all company deals
        const { data: broadSearch } = await supabase
          .from("deal_lenders")
          .select("id, name, stage, substage, tracking_status, quote_amount, quote_rate, quote_term, notes, pass_reason, deal_id, created_at, updated_at, deals(id, company, stage, status, value, industry)")
          .eq("deals.company_id", companyId)
          .ilike("name", `%${searchName}%`)
          .limit(30);

        if (!broadSearch || broadSearch.length === 0) {
          console.log(`[lookup_deals_for_lender] No match for "${args.lender_name}" in company ${companyId}`);
          return { success: true, message: `No deals found with a lender matching "${args.lender_name}".`, results: [], query: args.lender_name };
        }

        // Deduplicate by lender name
        const lenderNames = [...new Set(broadSearch.map((l: any) => l.name))];
        const results = lenderNames.map(lName => {
          const lenderDeals = broadSearch.filter((l: any) => l.name === lName);
          return {
            lender_name: lName,
            deal_count: lenderDeals.length,
            deals: lenderDeals.map((l: any) => ({
              deal_name: l.deals?.company || 'Unknown',
              deal_id: l.deal_id,
              deal_stage: l.deals?.stage || 'Unknown',
              deal_status: l.deals?.status || 'Unknown',
              deal_value: l.deals?.value ? `$${(l.deals.value / 1e6).toFixed(1)}M` : null,
              lender_stage: l.stage,
              lender_tracking: l.tracking_status,
              quote_amount: l.quote_amount ? `$${(l.quote_amount / 1e6).toFixed(1)}M` : null,
              quote_rate: l.quote_rate ? `${l.quote_rate}%` : null,
              pass_reason: l.pass_reason || null,
              last_updated: l.updated_at,
              notes_preview: l.notes ? l.notes.slice(0, 100) : null,
            })),
          };
        });

        console.log(`[lookup_deals_for_lender] Query: "${args.lender_name}" → ${results.length} lender(s), ${broadSearch.length} deal(s)`);
        return { success: true, message: `Found ${broadSearch.length} deal(s) across ${lenderNames.length} lender(s) matching "${args.lender_name}".`, results, query: args.lender_name };
      }

      // Group matched lenders by name
      const lenderNames = [...new Set(matched.map((l: any) => l.name))] as string[];
      const results = lenderNames.map((lName: string) => {
        const lenderDeals = matched.filter((l: any) => l.name === lName);
        return {
          lender_name: lName,
          deal_count: lenderDeals.length,
          deals: lenderDeals.map((l: any) => ({
            deal_name: l.deals?.company || 'Unknown',
            deal_id: l.deal_id,
            lender_stage: l.stage,
            lender_tracking: l.tracking_status,
            quote_amount: l.quote_amount ? `$${(l.quote_amount / 1e6).toFixed(1)}M` : null,
            quote_rate: l.quote_rate ? `${l.quote_rate}%` : null,
            pass_reason: l.pass_reason || null,
            last_updated: l.updated_at,
            notes_preview: l.notes ? l.notes.slice(0, 100) : null,
          })),
        };
      });

      console.log(`[lookup_deals_for_lender] Query: "${args.lender_name}" → ${results.length} lender(s), ${matched.length} deal(s)`);
      return { success: true, message: `Found ${matched.length} deal(s) across ${lenderNames.length} lender(s) matching "${args.lender_name}".`, results, query: args.lender_name };
    }

    case "run_research": {
      const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
      if (!PERPLEXITY_API_KEY) return { success: false, error: "Research API not configured" };

      const focusPrompts: Record<string, string> = {
        company: `Provide a comprehensive business overview of ${args.company_name || args.query}. Include: revenue, employees, funding, market position, recent news, key products/services, competitive advantages.`,
        industry: `Analyze the ${args.industry || args.query} industry. Include: market size, growth trends, key players, regulatory environment, recent developments, outlook.`,
        market: `Provide market sizing and analysis for: ${args.query}. Include TAM/SAM/SOM estimates, growth rates, key segments, and competitive landscape.`,
        lender: `Research lending institutions active in ${args.query}. Include: lending criteria, typical deal sizes, preferred industries, recent transactions, contact approaches.`,
        rate_environment: `Analyze the current lending rate environment for: ${args.query}. Include: benchmark rates, spreads, trends, covenant trends, market outlook.`,
        competitive: `Provide competitive intelligence on: ${args.query}. Include: key competitors, market share, differentiation, pricing, recent moves.`,
        general: args.query,
      };

      const prompt = focusPrompts[args.focus] || args.query;

      try {
        const resp = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${PERPLEXITY_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "sonar-pro",
            messages: [
              { role: "system", content: "You are a financial research analyst specializing in commercial lending. Provide detailed, data-driven analysis with specific numbers, dates, and sources." },
              { role: "user", content: prompt },
            ],
          }),
        });

        if (!resp.ok) return { success: false, error: `Research API error: ${resp.status}` };
        const data = await resp.json();
        const content = data.choices?.[0]?.message?.content || "No results";
        const citations = data.citations || [];
        return { success: true, content, citations, message: `Research completed with ${citations.length} sources.` };
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Research failed" };
      }
    }

    case "draft_email": {
      let dealContext = "";
      if (args.deal_id) {
        const deal = ctx.deals.find((d: any) => d.id === args.deal_id);
        if (deal) {
          dealContext = `\nDeal: ${deal.company} | $${(deal.value / 1e6).toFixed(1)}M | ${deal.stage} | ${deal.industry || ''} | ${deal.deal_type || ''}`;
          const dealLenders = ctx.lenders.filter((l: any) => l.deal_id === args.deal_id);
          if (dealLenders.length > 0) dealContext += `\nActive lenders: ${dealLenders.map((l: any) => `${l.name} (${l.stage})`).join(', ')}`;
          const memo = ctx.memos.find((m: any) => m.deal_id === args.deal_id);
          if (memo?.highlights) dealContext += `\nHighlights: ${memo.highlights.slice(0, 200)}`;
        }
      }

      // Include user's email style from memory
      const styleMemory = (ctx.memories || []).find((m: any) => m.key === 'email_tone' || m.key === 'communication_style');
      const styleHint = styleMemory ? `\nUser's preferred style: ${styleMemory.value}` : '';

      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) return { success: false, error: "AI not configured for drafting" };

      const draftResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: `You are a professional commercial lending email writer. Write concise, professional emails. Tone: ${args.tone || 'professional'}. Return ONLY the email body (no subject line, no greeting instructions). Use proper HTML formatting with <p> tags.${styleHint}` },
            { role: "user", content: `Draft an email to ${args.to_name} (${args.to_email || ''}).\nSubject: ${args.subject}\nPurpose: ${args.purpose}\nKey points: ${args.key_points}${dealContext}` },
          ],
        }),
      });

      if (!draftResp.ok) return { success: false, error: "Failed to draft email" };
      const draftData = await draftResp.json();
      const emailBody = draftData.choices?.[0]?.message?.content || "";

      return {
        success: true,
        message: `Email draft ready for ${args.to_name}`,
        draft: { to_name: args.to_name, to_email: args.to_email, subject: args.subject, body: emailBody },
      };
    }

    case "send_email": {
      const NYLAS_API_KEY = Deno.env.get("NYLAS_API_KEY");
      if (!NYLAS_API_KEY) return { success: false, error: "Email integration not connected. Connect your email in Settings first." };

      const { data: token } = await supabase.from("gmail_tokens").select("grant_id").eq("user_id", userId).maybeSingle();
      if (!token?.grant_id) return { success: false, error: "No email account connected. Please connect your Gmail first." };

      try {
        const nylasResp = await fetch(`https://api.us.nylas.com/v3/grants/${token.grant_id}/messages/send`, {
          method: "POST",
          headers: { Authorization: `Bearer ${NYLAS_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            to: [{ name: args.to_name || "", email: args.to_email }],
            subject: args.subject,
            body: args.body,
            ...(args.reply_to_message_id ? { reply_to_message_id: args.reply_to_message_id } : {}),
          }),
        });

        if (!nylasResp.ok) {
          const err = await nylasResp.text();
          return { success: false, error: `Failed to send email: ${err}` };
        }

        return { success: true, message: `Email sent to ${args.to_name || args.to_email}: "${args.subject}"` };
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Email send failed" };
      }
    }

    case "pipeline_analytics": {
      const deals = ctx.deals || [];
      const lenders = ctx.lenders || [];
      const now = new Date();

      const periodMs: Record<string, number> = { "30d": 30 * 864e5, "90d": 90 * 864e5, "6m": 182 * 864e5, "1y": 365 * 864e5, "all": Infinity };
      const cutoff = now.getTime() - (periodMs[args.time_period || "all"] || Infinity);
      const filteredDeals = deals.filter((d: any) => new Date(d.created_at).getTime() >= cutoff);

      switch (args.metric) {
        case "conversion_rates": {
          const stages: Record<string, number> = {};
          filteredDeals.forEach((d: any) => { stages[d.stage] = (stages[d.stage] || 0) + 1; });
          const total = filteredDeals.length;
          const won = filteredDeals.filter((d: any) => d.status === 'won' || d.stage?.toLowerCase().includes('fund')).length;
          const lost = filteredDeals.filter((d: any) => d.status === 'lost' || d.stage?.toLowerCase().includes('lost')).length;
          return {
            success: true, message: "Conversion analysis",
            data: { total_deals: total, won, lost, active: total - won - lost, win_rate: total > 0 ? `${((won / total) * 100).toFixed(1)}%` : "N/A", loss_rate: total > 0 ? `${((lost / total) * 100).toFixed(1)}%` : "N/A", stage_distribution: stages },
          };
        }
        case "deal_velocity": {
          const closedDeals = filteredDeals.filter((d: any) => d.status === 'won' || d.stage?.toLowerCase().includes('fund'));
          const velocities = closedDeals.map((d: any) => ({ company: d.company, days: Math.floor((now.getTime() - new Date(d.created_at).getTime()) / 864e5), value: d.value }));
          const avgDays = velocities.length > 0 ? Math.round(velocities.reduce((s: number, v: any) => s + v.days, 0) / velocities.length) : 0;
          return { success: true, message: "Deal velocity analysis", data: { average_days_to_close: avgDays, closed_deal_count: closedDeals.length, fastest: velocities.sort((a: any, b: any) => a.days - b.days)[0] || null, slowest: velocities.sort((a: any, b: any) => b.days - a.days)[0] || null, details: velocities.slice(0, 10) } };
        }
        case "revenue_forecast": {
          const active = filteredDeals.filter((d: any) => d.status === 'active');
          const totalValue = active.reduce((s: number, d: any) => s + (d.value || 0), 0);
          const totalFees = active.reduce((s: number, d: any) => s + (d.closing_fee || 0), 0);
          const stageProb: Record<string, number> = { "New": 0.1, "Screening": 0.15, "Initial Review": 0.2, "Due Diligence": 0.35, "Diligence": 0.35, "Committee": 0.5, "IC": 0.5, "Term Sheet": 0.65, "Legal": 0.75, "Closing": 0.85, "Funded": 1.0 };
          const weightedValue = active.reduce((s: number, d: any) => s + (d.value || 0) * (stageProb[d.stage] || 0.25), 0);
          const weightedFees = active.reduce((s: number, d: any) => s + (d.closing_fee || 0) * (stageProb[d.stage] || 0.25), 0);
          return { success: true, message: "Revenue forecast", data: { active_deals: active.length, total_pipeline_value: `$${(totalValue / 1e6).toFixed(1)}M`, total_pipeline_fees: `$${(totalFees / 1e3).toFixed(0)}K`, weighted_forecast_value: `$${(weightedValue / 1e6).toFixed(1)}M`, weighted_forecast_fees: `$${(weightedFees / 1e3).toFixed(0)}K`, by_stage: Object.entries(active.reduce((acc: Record<string, any>, d: any) => { const stage = d.stage || 'Unknown'; if (!acc[stage]) acc[stage] = { count: 0, value: 0, fees: 0 }; acc[stage].count++; acc[stage].value += d.value || 0; acc[stage].fees += d.closing_fee || 0; return acc; }, {})).map(([stage, data]: [string, any]) => ({ stage, ...data, value: `$${(data.value / 1e6).toFixed(1)}M`, fees: `$${(data.fees / 1e3).toFixed(0)}K` })) } };
        }
        case "stage_distribution": {
          const dist: Record<string, { count: number; value: number }> = {};
          filteredDeals.forEach((d: any) => { const s = d.stage || 'Unknown'; if (!dist[s]) dist[s] = { count: 0, value: 0 }; dist[s].count++; dist[s].value += d.value || 0; });
          return { success: true, message: "Stage distribution", data: Object.entries(dist).map(([stage, d]) => ({ stage, count: d.count, value: `$${(d.value / 1e6).toFixed(1)}M` })) };
        }
        case "win_loss_analysis": {
          const won = filteredDeals.filter((d: any) => d.status === 'won' || d.stage?.toLowerCase().includes('fund'));
          const lost = filteredDeals.filter((d: any) => d.status === 'lost' || d.stage?.toLowerCase().includes('lost'));
          const passedLenders = lenders.filter((l: any) => l.stage === 'Passed' && l.pass_reason);
          const passReasons: Record<string, number> = {};
          passedLenders.forEach((l: any) => { passReasons[l.pass_reason] = (passReasons[l.pass_reason] || 0) + 1; });
          return { success: true, message: "Win/Loss analysis", data: { won: { count: won.length, value: `$${(won.reduce((s: number, d: any) => s + (d.value || 0), 0) / 1e6).toFixed(1)}M`, deals: won.map((d: any) => d.company) }, lost: { count: lost.length, value: `$${(lost.reduce((s: number, d: any) => s + (d.value || 0), 0) / 1e6).toFixed(1)}M`, deals: lost.map((d: any) => d.company) }, top_pass_reasons: Object.entries(passReasons).sort(([, a], [, b]) => (b as number) - (a as number)).slice(0, 5), lender_pass_count: passedLenders.length } };
        }
        case "lender_performance": {
          const lenderMap: Record<string, any> = {};
          lenders.forEach((l: any) => {
            if (!lenderMap[l.name]) lenderMap[l.name] = { deals: 0, active: 0, passed: 0, funded: 0, totalQuote: 0, quoteCount: 0 };
            lenderMap[l.name].deals++;
            if (l.stage === 'Passed') lenderMap[l.name].passed++;
            else if (l.stage === 'Funded') lenderMap[l.name].funded++;
            else lenderMap[l.name].active++;
            if (l.quote_amount) { lenderMap[l.name].totalQuote += l.quote_amount; lenderMap[l.name].quoteCount++; }
          });
          return { success: true, message: "Lender performance", data: Object.entries(lenderMap).sort(([, a], [, b]) => (b as any).deals - (a as any).deals).slice(0, 15).map(([name, d]: [string, any]) => ({ name, deals: d.deals, active: d.active, passed: d.passed, funded: d.funded, avg_quote: d.quoteCount > 0 ? `$${((d.totalQuote / d.quoteCount) / 1e6).toFixed(1)}M` : null, conversion: d.deals > 0 ? `${((d.funded / d.deals) * 100).toFixed(0)}%` : "0%" })) };
        }
        case "full_briefing": {
          const active = filteredDeals.filter((d: any) => d.status === 'active');
          const totalVal = active.reduce((s: number, d: any) => s + (d.value || 0), 0);
          const overdueMilestones = (ctx.milestones || []).filter((m: any) => !m.completed && m.due_date && new Date(m.due_date) < now);
          const staleLenders = lenders.filter((l: any) => { if (l.stage === 'Passed' || l.stage === 'Funded') return false; return Math.floor((now.getTime() - new Date(l.updated_at || l.created_at).getTime()) / 864e5) > 14; });
          return { success: true, message: "Full pipeline briefing", data: { active_deals: active.length, total_pipeline: `$${(totalVal / 1e6).toFixed(1)}M`, overdue_milestones: overdueMilestones.length, stale_lenders: staleLenders.length, recent_activity_count: (ctx.activities || []).length, anomaly_count: (ctx.anomalies || []).length } };
        }
        default:
          return { success: false, error: `Unknown metric: ${args.metric}` };
      }
    }

    case "generate_memo": {
      const deal = ctx.deals.find((d: any) => d.id === args.deal_id);
      if (!deal) return { success: false, error: "Deal not found" };
      const dealLenders = ctx.lenders.filter((l: any) => l.deal_id === args.deal_id);
      const dealMilestones = (ctx.milestones || []).filter((m: any) => m.deal_id === args.deal_id);
      const dealMemo = ctx.memos.find((m: any) => m.deal_id === args.deal_id);
      const dealOwnership = (ctx.ownership || []).filter((o: any) => o.deal_id === args.deal_id);
      const memoContext = [
        `Deal: ${deal.company} | $${(deal.value / 1e6).toFixed(1)}M | ${deal.stage} | ${deal.industry || 'N/A'} | ${deal.deal_type || 'N/A'} | ${deal.geography || 'N/A'}`,
        dealLenders.length > 0 ? `Lenders (${dealLenders.length}):\n${dealLenders.map((l: any) => `- ${l.name}: ${l.stage}${l.quote_amount ? ` $${(l.quote_amount / 1e6).toFixed(1)}M` : ''}${l.quote_rate ? ` @${l.quote_rate}%` : ''}${l.notes ? ` | ${l.notes.slice(0, 100)}` : ''}`).join('\n')}` : '',
        dealMilestones.length > 0 ? `Milestones:\n${dealMilestones.map((m: any) => `- ${m.title}: ${m.completed ? '✅' : '⬜'}${m.due_date ? ` (${m.due_date})` : ''}`).join('\n')}` : '',
        dealMemo ? `Existing memo highlights: ${dealMemo.highlights || 'None'}\nHurdles: ${dealMemo.hurdles || 'None'}` : '',
        dealOwnership.length > 0 ? `Ownership:\n${dealOwnership.map((o: any) => `- ${o.owner_name}: ${o.ownership_percentage}%`).join('\n')}` : '',
        args.additional_context || '',
      ].filter(Boolean).join('\n\n');
      const typePrompts: Record<string, string> = {
        deal_memo: "Write a comprehensive lender-ready deal memo with sections: Overview, Facility Request, Business Description, Key Risks & Hurdles, Lender Status, and Recommendation.",
        meeting_prep: "Create a meeting prep brief covering: Deal Status, Key Discussion Points, Open Items, Recent Activity, and Suggested Talking Points.",
        executive_summary: "Write a concise executive summary (1 page) covering: Deal Overview, Key Metrics, Status, Risks, and Next Steps.",
        lender_update: "Write a professional lender update email covering: Deal Progress, Recent Milestones, Current Lender Status, and Upcoming Actions.",
        risk_assessment: "Provide a detailed risk assessment covering: Financial Risks, Market Risks, Operational Risks, Timeline Risks, and Lender Concentration Risk. Rate each as Low/Medium/High.",
      };
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) return { success: false, error: "AI not configured" };
      const memoResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "google/gemini-3-flash-preview", messages: [{ role: "system", content: "You are a senior commercial lending analyst. Write professional, data-driven documents. Use specific numbers and facts from the context provided." }, { role: "user", content: `${typePrompts[args.memo_type]}\n\nContext:\n${memoContext}` }] }),
      });
      if (!memoResp.ok) return { success: false, error: "Failed to generate memo" };
      const memoData = await memoResp.json();
      return { success: true, message: `${args.memo_type.replace(/_/g, ' ')} generated for ${deal.company}`, content: memoData.choices?.[0]?.message?.content || "" };
    }

    case "compare_deals": {
      const compDeals = args.deal_ids.map((id: string) => ctx.deals.find((d: any) => d.id === id)).filter(Boolean);
      if (compDeals.length < 2) return { success: false, error: "Need at least 2 valid deal IDs" };
      const comparison = compDeals.map((d: any) => {
        const dl = ctx.lenders.filter((l: any) => l.deal_id === d.id);
        const ms = (ctx.milestones || []).filter((m: any) => m.deal_id === d.id);
        return { company: d.company, value: `$${(d.value / 1e6).toFixed(1)}M`, stage: d.stage, status: d.status, industry: d.industry || 'N/A', deal_type: d.deal_type || 'N/A', lender_count: dl.length, active_lenders: dl.filter((l: any) => l.stage !== 'Passed').length, best_quote: dl.filter((l: any) => l.quote_rate).sort((a: any, b: any) => a.quote_rate - b.quote_rate)[0]?.quote_rate || null, milestones_completed: ms.filter((m: any) => m.completed).length, milestones_total: ms.length, days_in_pipeline: Math.floor((Date.now() - new Date(d.created_at).getTime()) / 864e5), closing_fee: d.closing_fee ? `$${(d.closing_fee / 1e3).toFixed(0)}K` : null };
      });
      return { success: true, message: `Comparing ${comparison.length} deals`, data: comparison };
    }

    case "send_slack_message": {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      const SLACK_API_KEY = Deno.env.get("SLACK_API_KEY");
      if (!LOVABLE_API_KEY || !SLACK_API_KEY) return { success: false, error: "Slack not connected" };
      try {
        const resp = await fetch("https://connector-gateway.lovable.dev/slack/api/chat.postMessage", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "X-Connection-Api-Key": SLACK_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ channel: args.channel, text: args.message }),
        });
        const data = await resp.json();
        if (!resp.ok || !data.ok) return { success: false, error: `Slack error: ${data.error || resp.status}` };
        return { success: true, message: `Message sent to #${args.channel}` };
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Slack send failed" };
      }
    }

    // ─── Memory tools ─────────────────────────────────────────────
    case "save_memory": {
      // Use a fixed "copilot" agent ID for the dashboard copilot
      const COPILOT_AGENT_ID = "00000000-0000-0000-0000-000000000001";
      const { error } = await supabase.from("agent_memory").upsert({
        agent_id: COPILOT_AGENT_ID,
        user_id: userId,
        key: args.key,
        value: args.value,
        memory_type: args.memory_type || "preference",
        importance: args.importance || 5,
        updated_at: new Date().toISOString(),
      }, { onConflict: "agent_id,key,user_id" });
      if (error) {
        // If unique constraint doesn't exist, try insert
        const { error: insertErr } = await supabase.from("agent_memory").insert({
          agent_id: COPILOT_AGENT_ID,
          user_id: userId,
          key: args.key,
          value: args.value,
          memory_type: args.memory_type || "preference",
          importance: args.importance || 5,
        });
        if (insertErr) return { success: false, error: insertErr.message };
      }
      return { success: true, message: `✅ Remembered: "${args.key}" — I'll use this in future conversations.` };
    }

    case "recall_memory": {
      const COPILOT_AGENT_ID = "00000000-0000-0000-0000-000000000001";
      let query = supabase.from("agent_memory").select("key, value, memory_type, importance, updated_at").eq("agent_id", COPILOT_AGENT_ID).eq("user_id", userId);
      if (args.memory_type && args.memory_type !== "all") {
        query = query.eq("memory_type", args.memory_type);
      }
      const { data, error } = await query.order("importance", { ascending: false }).limit(20);
      if (error) return { success: false, error: error.message };
      if (!data || data.length === 0) return { success: true, message: "No stored memories found.", memories: [] };
      return { success: true, message: `Found ${data.length} stored memories.`, memories: data };
    }

    default:
      return { success: false, error: `Unknown tool: ${name}` };
  }
}

// ─── Anomaly detection ──────────────────────────────────────────────
function detectAnomalies(deals: any[], milestones: any[], lenders: any[]) {
  const alerts: string[] = [];
  const now = new Date();

  for (const d of deals) {
    if (d.status !== 'active') continue;
    const days = Math.floor((now.getTime() - new Date(d.created_at).getTime()) / 864e5);
    if (days > 60) alerts.push(`⚠️ "${d.company}" has been in pipeline for ${days} days`);
  }

  for (const m of milestones) {
    if (m.completed || !m.due_date) continue;
    if (new Date(m.due_date) < now) {
      const days = Math.floor((now.getTime() - new Date(m.due_date).getTime()) / 864e5);
      alerts.push(`🔴 Overdue milestone: "${m.title}" on ${m.deals?.company || 'Unknown'} (${days}d overdue)`);
    }
  }

  for (const l of lenders) {
    if (l.stage === 'Passed' || l.stage === 'Funded') continue;
    const days = Math.floor((now.getTime() - new Date(l.updated_at || l.created_at).getTime()) / 864e5);
    if (days > 14) alerts.push(`⏳ Stale: ${l.name} on ${l.deals?.company || 'Unknown'} (${days}d no update)`);
  }

  const dealLenderCounts: Record<string, number> = {};
  for (const l of lenders) { dealLenderCounts[l.deal_id] = (dealLenderCounts[l.deal_id] || 0) + 1; }
  for (const d of deals) {
    if (d.status !== 'active' || d.value < 5e6) continue;
    const count = dealLenderCounts[d.id] || 0;
    if (count < 3) alerts.push(`📋 "${d.company}" ($${(d.value / 1e6).toFixed(0)}M) has only ${count} lender(s)`);
  }

  const lenderDealCount: Record<string, string[]> = {};
  for (const l of lenders) {
    if (l.stage === 'Passed') continue;
    if (!lenderDealCount[l.name]) lenderDealCount[l.name] = [];
    lenderDealCount[l.name].push(l.deals?.company || l.deal_id);
  }
  for (const [name, dealNames] of Object.entries(lenderDealCount)) {
    if (dealNames.length >= 4) alerts.push(`🏦 Concentration risk: ${name} is active on ${dealNames.length} deals`);
  }

  return alerts.slice(0, 10);
}

// ─── Proactive alerts generation ────────────────────────────────────
function generateProactiveAlerts(ctx: any) {
  const alerts: Array<{ type: string; severity: 'info' | 'warning' | 'critical'; title: string; description: string; dealId?: string; actionLabel?: string; actionPrompt?: string }> = [];
  const now = new Date();

  // Stale deals
  for (const d of (ctx.deals || [])) {
    if (d.status !== 'active') continue;
    const days = Math.floor((now.getTime() - new Date(d.created_at).getTime()) / 864e5);
    if (days > 90) {
      alerts.push({ type: 'stale_deal', severity: 'critical', title: `${d.company} stalled`, description: `${days} days in pipeline with no movement`, dealId: d.id, actionLabel: 'Get recommendations', actionPrompt: `What should I do about ${d.company}? It's been stalled for ${days} days.` });
    } else if (days > 60) {
      alerts.push({ type: 'stale_deal', severity: 'warning', title: `${d.company} aging`, description: `${days} days in pipeline`, dealId: d.id, actionLabel: 'Review deal', actionPrompt: `Give me a status update on ${d.company} and suggest next steps.` });
    }
  }

  // Overdue milestones
  for (const m of (ctx.milestones || [])) {
    if (m.completed || !m.due_date) continue;
    const dueDate = new Date(m.due_date);
    if (dueDate < now) {
      const days = Math.floor((now.getTime() - dueDate.getTime()) / 864e5);
      if (days > 7) {
        alerts.push({ type: 'overdue_milestone', severity: 'critical', title: `Overdue: ${m.title}`, description: `${days}d overdue on ${m.deals?.company || 'Unknown'}`, dealId: m.deal_id, actionLabel: 'Complete or reschedule', actionPrompt: `Milestone "${m.title}" on ${m.deals?.company} is ${days} days overdue. Should I mark it complete or help reschedule?` });
      } else {
        alerts.push({ type: 'overdue_milestone', severity: 'warning', title: `Due: ${m.title}`, description: `${days}d overdue on ${m.deals?.company || 'Unknown'}`, dealId: m.deal_id, actionLabel: 'Take action', actionPrompt: `What should I do about the overdue milestone "${m.title}" on ${m.deals?.company}?` });
      }
    }
  }

  // Stale lenders needing follow-up
  const staleLenders: Array<{ name: string; dealCompany: string; days: number; dealId: string }> = [];
  for (const l of (ctx.lenders || [])) {
    if (l.stage === 'Passed' || l.stage === 'Funded') continue;
    const days = Math.floor((now.getTime() - new Date(l.updated_at || l.created_at).getTime()) / 864e5);
    if (days > 14) staleLenders.push({ name: l.name, dealCompany: l.deals?.company || 'Unknown', days, dealId: l.deal_id });
  }
  if (staleLenders.length > 0) {
    const top = staleLenders.sort((a, b) => b.days - a.days).slice(0, 3);
    alerts.push({ type: 'stale_lenders', severity: staleLenders.length > 5 ? 'critical' : 'warning', title: `${staleLenders.length} lenders need follow-up`, description: top.map(l => `${l.name} (${l.days}d)`).join(', '), actionLabel: 'Draft follow-ups', actionPrompt: `I have ${staleLenders.length} stale lenders. Draft follow-up emails for the most critical ones.` });
  }

  // Low lender coverage on high-value deals
  const dealLenderCounts: Record<string, number> = {};
  for (const l of (ctx.lenders || [])) { dealLenderCounts[l.deal_id] = (dealLenderCounts[l.deal_id] || 0) + 1; }
  for (const d of (ctx.deals || [])) {
    if (d.status !== 'active' || d.value < 5e6) continue;
    const count = dealLenderCounts[d.id] || 0;
    if (count < 3) {
      alerts.push({ type: 'low_coverage', severity: 'warning', title: `${d.company} needs lenders`, description: `Only ${count} lender(s) on $${(d.value / 1e6).toFixed(0)}M deal`, dealId: d.id, actionLabel: 'Find lenders', actionPrompt: `Find matching lenders for ${d.company} ($${(d.value / 1e6).toFixed(0)}M, ${d.industry || 'unknown industry'})` });
    }
  }

  // Sort by severity
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]).slice(0, 6);
}

// ─── Context fetching ───────────────────────────────────────────────
async function fetchUserContext(supabase: any, userId: string, companyId: string) {
  const memberRes = await supabase.from("company_members").select("user_id").eq("company_id", companyId);
  const memberIds = memberRes.data?.map((m: any) => m.user_id) || [];

  const COPILOT_AGENT_ID = "00000000-0000-0000-0000-000000000001";

  const [dealsRes, tasksRes, teamRes, insightsRes, memoriesRes] = await Promise.all([
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
    supabase.from("agent_memory")
      .select("key, value, memory_type, importance")
      .eq("agent_id", COPILOT_AGENT_ID).eq("user_id", userId)
      .order("importance", { ascending: false }).limit(20),
  ]);

  const deals = dealsRes.data || [];
  const tasks = tasksRes.data || [];
  const team = teamRes.data || [];
  const latestInsight = insightsRes.data?.[0];
  const memories = memoriesRes.data || [];
  const dealIds = deals.map((d: any) => d.id);

  if (dealIds.length === 0) {
    return { deals, tasks, team, latestInsight, memories, lenderStats: [], activities: [], milestones: [], memos: [], attachments: [], lenders: [], ownership: [], research: [], emails: [], anomalies: [] };
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
    deals, tasks, team, latestInsight, memories,
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
  const { deals, tasks, team, latestInsight, lenderStats, activities, milestones, memos, attachments, lenders, ownership, research, emails, anomalies, memories } = ctx;
  const s: string[] = [];

  s.push(`## User Context\nCompany: ${companyName} | Role: ${role} | Date: ${new Date().toISOString().slice(0, 10)}`);

  // Include user memories/preferences
  if (memories && memories.length > 0) {
    s.push(`## 🧠 User Preferences & Memory\n${memories.map((m: any) => `- **${m.key}** [${m.memory_type}]: ${m.value}`).join('\n')}\n\n*Use these preferences to personalize your responses. Match communication style, reference preferred lenders, and apply deal criteria.*`);
  }

  if (anomalies.length > 0) s.push(`## ⚠️ Alerts & Anomalies\n${anomalies.join('\n')}`);

  if (latestInsight) {
    s.push(`## Pipeline Health\nScore: ${latestInsight.pipeline_health_score}/100 | Active: ${latestInsight.active_deals} | Value: $${(latestInsight.total_value / 1e6).toFixed(1)}M\n${latestInsight.pipeline_health_summary || ''}`);
  }

  if (team.length > 0) s.push(`## Team (${team.length})\n${team.map((t: any) => `- ${t.display_name} [${t.user_id}] (${t.email})`).join('\n')}`);

  if (deals.length > 0) {
    s.push(`## Deals (${deals.length})\n${deals.slice(0, 20).map((d: any) =>
      `- [${d.id}] ${d.company}: $${(d.value / 1e6).toFixed(1)}M | ${d.stage} | ${d.status}${d.industry ? ` | ${d.industry}` : ''}${d.deal_type ? ` | ${d.deal_type}` : ''}${d.geography ? ` | ${d.geography}` : ''}`
    ).join('\n')}`);
  }

  if (lenders.length > 0) {
    s.push(`## Deal Lenders (${lenders.length})\n${lenders.slice(0, 30).map((l: any) =>
      `- [${l.id}] ${l.name} → ${l.deals?.company || '?'}: ${l.stage}${l.quote_amount ? ` $${(l.quote_amount / 1e6).toFixed(1)}M` : ''}${l.quote_rate ? ` @${l.quote_rate}%` : ''}${l.pass_reason ? ` PASSED: ${l.pass_reason}` : ''}`
    ).join('\n')}`);
  }

  if (milestones.length > 0) {
    const pending = milestones.filter((m: any) => !m.completed);
    s.push(`## Milestones (${pending.length} pending)\n${pending.slice(0, 15).map((m: any) =>
      `- [${m.id}] ${m.deals?.company || '?'}: ${m.title}${m.due_date ? ` (due ${m.due_date})` : ''}`
    ).join('\n')}`);
  }

  if (tasks.length > 0) s.push(`## Tasks (${tasks.length})\n${tasks.slice(0, 15).map((t: any) => `- [${t.status}] ${t.title} | ${t.priority}${t.due_date ? ` | due ${t.due_date}` : ''}`).join('\n')}`);
  if (memos.length > 0) s.push(`## Deal Memos\n${memos.slice(0, 8).map((m: any) => { const p: string[] = [`**${m.deals?.company || '?'}**`]; if (m.highlights) p.push(`Highlights: ${m.highlights.slice(0, 150)}`); if (m.hurdles) p.push(`Hurdles: ${m.hurdles.slice(0, 150)}`); return p.join(' | '); }).join('\n')}`);

  if (attachments.length > 0) {
    const byCat: Record<string, number> = {};
    attachments.forEach((a: any) => { byCat[a.category] = (byCat[a.category] || 0) + 1; });
    s.push(`## Data Room (${attachments.length} files)\nCategories: ${Object.entries(byCat).map(([k, v]) => `${k}:${v}`).join(', ')}`);
  }

  if (ownership.length > 0) s.push(`## Ownership\n${ownership.slice(0, 10).map((o: any) => `- ${o.deals?.company || '?'}: ${o.owner_name} (${o.ownership_percentage}%)`).join('\n')}`);
  if (lenderStats.length > 0) s.push(`## Top Lenders\n${lenderStats.slice(0, 10).map((l: any) => `- ${l.lender_name}: ${l.deal_count} deals, ${l.active_count} active, $${(l.total_volume / 1e6).toFixed(0)}M`).join('\n')}`);
  if (activities.length > 0) s.push(`## Recent Activity\n${activities.slice(0, 12).map((a: any) => `- ${a.activity_type}: ${a.description} (${a.deals?.company || ''})${a.user_display_name ? ` by ${a.user_display_name}` : ''}`).join('\n')}`);
  if (emails.length > 0) s.push(`## Linked Emails (${emails.length})\n${emails.slice(0, 10).map((e: any) => `- Deal email linked${e.notes ? `: ${e.notes}` : ''}`).join('\n')}`);
  if (research.length > 0) s.push(`## Research Cache\n${research.slice(0, 6).map((r: any) => `- ${r.deals?.company || '?'} [${r.research_type}]: ${r.content.slice(0, 150)}...`).join('\n')}`);

  return s.join('\n\n');
}

// ─── Main handler ───────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  let userId: string | null = null;
  let companyId: string | null = null;
  let lastUserPrompt = '';

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace('Bearer ', '');
    // Try remote claim verification first; if GoTrue is transiently unavailable
    // (e.g. SQLSTATE 53300 connection-slot exhaustion), fall back to decoding
    // the signed JWT payload locally so the dashboard chat does not 401 on
    // intermittent auth-service hiccups. RLS still enforces real access on
    // every downstream query because we pass the user's token to the client.
    let resolvedUserId: string | null = null;
    try {
      const { data: claimsData, error: authError } = await supabase.auth.getClaims(token);
      if (!authError && claimsData?.claims?.sub) {
        resolvedUserId = claimsData.claims.sub as string;
      } else if (authError) {
        console.warn('[dashboard-chat] getClaims failed, will try JWT fallback', authError.message);
      }
    } catch (e) {
      console.warn('[dashboard-chat] getClaims threw, will try JWT fallback', (e as Error)?.message);
    }

    if (!resolvedUserId) {
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          const padding = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
          const payload = JSON.parse(atob(padded + padding));
          if (payload?.sub && (!payload.exp || payload.exp * 1000 > Date.now())) {
            resolvedUserId = payload.sub as string;
          }
        }
      } catch (e) {
        console.error('[dashboard-chat] JWT fallback decode failed', (e as Error)?.message);
      }
    }

    if (!resolvedUserId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const user = { id: resolvedUserId };
    userId = user.id;

    const { messages, includeAlerts } = await req.json();

    // Handle alerts-only request
    if (includeAlerts) {
      const { data: membership } = await supabase.from('company_members').select('company_id, role, companies(name)').eq('user_id', user.id).maybeSingle();
      const companyId = membership?.company_id;
      const ctx = await fetchUserContext(supabase, user.id, companyId);
      const alerts = generateProactiveAlerts(ctx);
      return new Response(JSON.stringify({ alerts }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Messages required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: membership } = await supabase.from('company_members').select('company_id, role, companies(name)').eq('user_id', user.id).maybeSingle();
    companyId = membership?.company_id ?? null;
    const companyName = (membership as any)?.companies?.name || 'Unknown';

    const ctx = await fetchUserContext(supabase, user.id, companyId as string);
    const userContext = buildContextString(ctx, companyName, membership?.role || 'member');

    // Get user profile for personalization
    const { data: profile } = await supabase.from("profiles").select("display_name, first_name").eq("user_id", user.id).maybeSingle();
    const userName = profile?.first_name || profile?.display_name || 'there';

    // ─── Multi-agent routing ────────────────────────────────────
    const lastUserMsg = messages.filter((m: any) => m.role === 'user').pop()?.content || '';
    lastUserPrompt = lastUserMsg;
    const detectedIntent = detectIntent(lastUserMsg);
    const activePersona = detectedIntent ? agentPersonas[detectedIntent] : null;
    const personaAddendum = activePersona ? `\n\n## 🎯 Active Specialist: ${activePersona.icon} ${activePersona.name}\n${activePersona.systemAddendum}` : '';

    const systemPrompt = `You are naitive Copilot — the AI-powered deal intelligence copilot for commercial lending professionals. You are proactive, data-driven, and action-oriented. You don't just answer questions — you anticipate needs, surface insights, and execute tasks.

The user's name is ${userName}.
${activePersona ? `\nYou are currently operating as the **${activePersona.icon} ${activePersona.name}** specialist.` : ''}

${platformKnowledge}

${userContext}

## Your Copilot Capabilities

### 🧠 Memory & Personalization
- You can **remember** user preferences, communication styles, deal criteria, and decisions using the \`save_memory\` tool.
- You can **recall** stored memories to personalize responses using the \`recall_memory\` tool.
- Proactively save preferences when users express them (e.g., "I prefer formal emails", "I always work with X lenders").
- Use remembered preferences to tailor emails, recommendations, and analysis.

### 🔍 Research & Intelligence
- **Web Research**: Run real-time research on companies, industries, markets, lenders, and rate environments using Perplexity (use \`run_research\` tool).
- **Deal Analysis**: Deep analysis of any deal using all available context (memos, lenders, milestones, ownership, documents).
- **Competitive Intel**: Research competitors, market positioning, and industry trends.
- **Rate Tracking**: Current lending rates, market conditions, and benchmarks.

### 📧 Communication
- **Draft Emails**: Compose professional lender outreach, follow-ups, deal updates, meeting requests, and term sheet requests using deal context (use \`draft_email\` tool).
- **Send Emails**: Send emails directly via connected email account (use \`send_email\` tool after drafting).
- **Slack Messages**: Send updates to team Slack channels (use \`send_slack_message\` tool).

### 📊 Pipeline Analytics
- **Conversion Rates**: Win/loss ratios, stage conversion, and funnel analysis.
- **Deal Velocity**: Average time-to-close, fastest/slowest deals.
- **Revenue Forecasting**: Probability-weighted pipeline value and fee projections.
- **Win/Loss Analysis**: Pass reasons, lost deal patterns, and improvement areas.
- **Lender Performance**: Conversion rates, engagement levels, quote analysis by lender.
Use the \`pipeline_analytics\` tool with the appropriate metric.

### 📝 Document Generation
- **Deal Memos**: Generate lender-ready deal memos with full context.
- **Meeting Prep Briefs**: Prepare for lender or IC meetings with key talking points.
- **Executive Summaries**: Concise 1-page summaries for leadership.
- **Risk Assessments**: Comprehensive risk analysis across financial, market, operational dimensions.
- **Lender Updates**: Professional status updates for lender communication.
Use the \`generate_memo\` tool.

### ⚡ Actions
- Create tasks and assign to team members (with follow-up reminders)
- Update deal stages and lender stages
- Add lender notes
- Complete milestones
- Search the master lender database
- Compare deals side by side

## Response Format
- Use **markdown tables** for structured data comparisons.
- Use **bold** for key metrics and deal names.
- Include links: [View Deal](/deals/deal-id) or [Go to Tasks](/tasks)
- For research results, include citations with numbered references [1], [2].
- For email drafts, present in a formatted block for review before sending.
- For analytics, use tables and highlight key takeaways.
${activePersona ? `- Indicate your specialist role with "${activePersona.icon}" at the start of your first response.` : ''}

## Proactive Behavior
- After completing any action, suggest relevant next steps.
- When discussing a deal, proactively mention alerts/anomalies that affect it.
- If the user asks about a deal, also mention stale lenders, overdue milestones, or missing documents.
- For briefings, structure as: Alerts → Key Metrics → Deals Needing Attention → Suggested Actions.
- After sending an email, suggest creating a follow-up task.
- After research, suggest how findings impact current deals.
- **Proactively save user preferences** when they express communication styles, lender preferences, or deal criteria.

## Action Rules
- Execute tools immediately when the request is clear.
- For destructive actions (stage changes, sending emails), briefly confirm what you're about to do.
- After executing, confirm with ✅ what was done.
- For email sending: ALWAYS draft first and show the draft. Only send when explicitly confirmed.
- When multiple tools are needed, execute them in sequence and report results.
${personaAddendum}`;

    const apiCall = async (msgs: any[], stream: boolean, includeTools = false) => {
      const body: any = {
        model: DASHBOARD_CHAT_MODEL,
        messages: msgs,
        temperature: 0.4,
        stream,
      };
      if (includeTools) body.tools = tools;
      return callAiGateway(LOVABLE_API_KEY, body);
    };

    const allMessages = [{ role: "system", content: systemPrompt }, ...messages.map((m: any) => ({ role: m.role, content: m.content }))];

    // First call with tools (non-streaming) to check for tool calls
    const firstResponse = await apiCall(allMessages, false, true);

    if (!firstResponse.ok) {
      const status = firstResponse.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded." }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const errorText = await firstResponse.text();
      await logDashboardChatFailure(supabase, userId, companyId, `AI gateway returned ${status}: ${errorText.slice(0, 300)}`, lastUserPrompt);
      return new Response(JSON.stringify({ error: "AI processing failed" }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const firstResult = await firstResponse.json();
    const choice = firstResult.choices?.[0];
    if (!choice) {
      await logDashboardChatFailure(supabase, userId, companyId, 'AI gateway returned a malformed response payload', lastUserPrompt);
      return new Response(JSON.stringify({ error: 'AI returned a malformed response.' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Handle tool calls (supports multiple rounds)
    if (choice?.message?.tool_calls?.length > 0) {
      let currentMessages = [...allMessages, choice.message];
      let toolCallRound = 0;
      const maxRounds = 3;
      let lastChoice = choice;

      while (lastChoice?.message?.tool_calls?.length > 0 && toolCallRound < maxRounds) {
        const toolResults: any[] = [];

        for (const tc of lastChoice.message.tool_calls) {
          let args;
          try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }
          const result = await executeTool(supabase, user.id, companyId as string, tc.function.name, args, ctx);
          toolResults.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
        }

        currentMessages = [...currentMessages, ...toolResults];
        toolCallRound++;

        const nextResp = await apiCall(currentMessages, false, true);
        if (!nextResp.ok) break;
        const nextResult = await nextResp.json();
        lastChoice = nextResult.choices?.[0];
        if (lastChoice?.message?.tool_calls?.length > 0) {
          currentMessages.push(lastChoice.message);
        }
      }

      // Final streaming response after all tool calls
      const streamResp = await apiCall(
        lastChoice?.message?.tool_calls?.length > 0
          ? currentMessages
          : [...currentMessages, ...(lastChoice?.message ? [lastChoice.message] : [])],
        true
      );

      if (!streamResp.ok) {
        const fallback = lastChoice?.message?.content || "Actions completed.";
        await logDashboardChatFailure(supabase, userId, companyId, `Final stream request failed with ${streamResp.status}`, lastUserPrompt);
        return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: fallback } }] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return new Response(streamResp.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
    }

    // No tool calls - stream directly
    const streamResp = await apiCall(allMessages, true);
    if (!streamResp.ok) {
      const content = choice?.message?.content || "I couldn't generate a response.";
      await logDashboardChatFailure(supabase, userId, companyId, `Direct stream request failed with ${streamResp.status}`, lastUserPrompt);
      return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    return new Response(streamResp.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });

  } catch (error: unknown) {
    console.error('Error in dashboard-chat:', error);
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (supabaseUrl && supabaseAnonKey) {
      try {
        const loggingClient = createClient(supabaseUrl, supabaseAnonKey);
        await logDashboardChatFailure(
          loggingClient,
          userId,
          companyId,
          error instanceof Error ? error.message : 'Unknown error',
          lastUserPrompt,
        );
      } catch (loggingError) {
        console.error('[dashboard-chat] catch-path logging failed', loggingError);
      }
    }
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
