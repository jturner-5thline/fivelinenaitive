import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { anthropicFetch } from "../_shared/anthropicUsage.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/slack/api";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SLACK_API_KEY = Deno.env.get("SLACK_API_KEY");

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    if (!SLACK_API_KEY) throw new Error("SLACK_API_KEY is not configured");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { action } = body;

    // Route based on action type
    switch (action) {
      case "send_message":
        return await handleSendMessage(body, LOVABLE_API_KEY, SLACK_API_KEY);

      case "process_incoming":
        return await handleIncomingMessage(body, supabase, supabaseUrl, LOVABLE_API_KEY, SLACK_API_KEY);

      case "list_channels":
        return await handleListChannels(LOVABLE_API_KEY, SLACK_API_KEY);

      case "update_deal_status":
        return await handleDealStatusUpdate(body, supabase, LOVABLE_API_KEY, SLACK_API_KEY);

      case "send_sla_reminder":
        return await handleSLAReminder(body, supabase, LOVABLE_API_KEY, SLACK_API_KEY);

      case "draft_followup":
        return await handleDraftFollowup(body, supabase, supabaseUrl, LOVABLE_API_KEY, SLACK_API_KEY);

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error) {
    console.error("Slack agent gateway error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ─── Send a message to Slack ───────────────────────────────────────────────────
async function handleSendMessage(
  body: { channel: string; text: string; thread_ts?: string; username?: string; icon_emoji?: string },
  lovableKey: string,
  slackKey: string
) {
  const { channel, text, thread_ts, username, icon_emoji } = body;

  const payload: Record<string, unknown> = {
    channel,
    text,
    ...(thread_ts && { thread_ts }),
    ...(username && { username }),
    ...(icon_emoji && { icon_emoji }),
  };

  const resp = await fetch(`${GATEWAY_URL}/chat.postMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": slackKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await resp.json();
  if (!resp.ok || !data.ok) {
    throw new Error(`Slack chat.postMessage failed [${resp.status}]: ${JSON.stringify(data)}`);
  }

  return new Response(JSON.stringify({ success: true, ts: data.ts, channel: data.channel }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Process an incoming Slack message and route to the right agent ────────────
async function handleIncomingMessage(
  body: { channel_id: string; user_id: string; text: string; thread_ts?: string; event_ts: string },
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  lovableKey: string,
  slackKey: string
) {
  const { channel_id, user_id: slackUserId, text, thread_ts, event_ts } = body;

  // Find the agent route for this channel
  const { data: routes, error: routeError } = await supabase
    .from("slack_agent_routes")
    .select("*, agent:agents(*)")
    .eq("slack_channel_id", channel_id)
    .eq("is_active", true);

  if (routeError) throw routeError;
  if (!routes || routes.length === 0) {
    console.log(`No active agent route for channel ${channel_id}`);
    return new Response(JSON.stringify({ skipped: true, reason: "no_route" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const route = routes[0];
  const agent = route.agent;

  // Retrieve conversation memory for context
  const { data: memories } = await supabase
    .from("agent_memory")
    .select("key, value, memory_type")
    .eq("agent_id", agent.id)
    .eq("user_id", route.user_id)
    .order("importance", { ascending: false })
    .limit(20);

  const memoryContext = memories && memories.length > 0
    ? `\n\n## Remembered Context\n${memories.map((m: { key: string; value: string; memory_type: string }) => `- [${m.memory_type}] ${m.key}: ${m.value}`).join("\n")}`
    : "";

  // Build agent messages
  const messages = [
    {
      role: "user" as const,
      content: text,
    },
  ];

  // All agents are powered by Claude
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");
  const aiResponse = await anthropicFetch({ feature: "slack-agent-gateway" }, {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
      temperature: agent.temperature || 0.7,
      system: `${agent.system_prompt}\n\nYou are responding in a Slack channel. Keep messages concise and use Slack formatting (bold with *text*, code with \`code\`, lists with •).${memoryContext}\n\nIMPORTANT: If the user shares a preference, fact, or important context that should be remembered for future conversations, include it at the END of your response in this exact format:\n[MEMORY:type:key:value]\nFor example: [MEMORY:preference:timezone:EST]\nDo NOT mention this to the user.`,
      messages,
    }),
  });

  if (!aiResponse.ok) {
    const errText = await aiResponse.text();
    console.error("AI gateway error:", aiResponse.status, errText);

    if (aiResponse.status === 429) {
      await sendSlackMessage(channel_id, "⚠️ Rate limit reached. Please try again in a moment.", thread_ts || event_ts, lovableKey, slackKey, agent.name, agent.avatar_emoji);
      return new Response(JSON.stringify({ error: "rate_limited" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiResponse.status === 402) {
      await sendSlackMessage(channel_id, "⚠️ AI credits exhausted. Please add credits to continue.", thread_ts || event_ts, lovableKey, slackKey, agent.name, agent.avatar_emoji);
      return new Response(JSON.stringify({ error: "credits_exhausted" }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    throw new Error(`AI error: ${aiResponse.status}`);
  }

  const aiData = await aiResponse.json();
  let content = ((aiData.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n")) || "I couldn't generate a response.";

  // Extract and store memory markers
  const memoryRegex = /\[MEMORY:(\w+):([^:]+):([^\]]+)\]/g;
  let match;
  while ((match = memoryRegex.exec(content)) !== null) {
    const [, memType, key, value] = match;
    await supabase.from("agent_memory").upsert(
      {
        agent_id: agent.id,
        user_id: route.user_id,
        memory_type: memType,
        key,
        value,
      },
      { onConflict: "agent_id,user_id" }
    ).select();
    // Note: upsert on composite may need adjustment; inserting for now
    await supabase.from("agent_memory").insert({
      agent_id: agent.id,
      user_id: route.user_id,
      memory_type: memType,
      key,
      value,
    });
  }
  // Remove memory markers from visible response
  content = content.replace(memoryRegex, "").trim();

  // Send response back to Slack
  await sendSlackMessage(
    channel_id,
    content,
    thread_ts || event_ts,
    lovableKey,
    slackKey,
    agent.name,
    agent.avatar_emoji
  );

  // Update agent usage stats
  await supabase
    .from("agents")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", agent.id);

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── List Slack channels ──────────────────────────────────────────────────────
async function handleListChannels(lovableKey: string, slackKey: string) {
  const resp = await fetch(`${GATEWAY_URL}/conversations.list?types=public_channel&limit=200`, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": slackKey,
    },
  });

  const data = await resp.json();
  if (!resp.ok || !data.ok) {
    throw new Error(`Slack conversations.list failed [${resp.status}]: ${JSON.stringify(data)}`);
  }

  const channels = (data.channels || []).map((ch: { id: string; name: string; is_private: boolean; num_members: number }) => ({
    id: ch.id,
    name: ch.name,
    is_private: ch.is_private,
    num_members: ch.num_members,
  }));

  return new Response(JSON.stringify({ channels }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Update deal status and notify Slack ──────────────────────────────────────
async function handleDealStatusUpdate(
  body: { deal_id: string; new_stage?: string; new_status?: string; channel_id: string; user_id: string },
  supabase: ReturnType<typeof createClient>,
  lovableKey: string,
  slackKey: string
) {
  const { deal_id, new_stage, new_status, channel_id, user_id } = body;

  // Get current deal info
  const { data: deal, error: dealError } = await supabase
    .from("deals")
    .select("*")
    .eq("id", deal_id)
    .single();

  if (dealError || !deal) throw new Error("Deal not found");

  // Update deal
  const updates: Record<string, unknown> = {};
  if (new_stage) updates.stage = new_stage;
  if (new_status) updates.status = new_status;

  const { error: updateError } = await supabase
    .from("deals")
    .update(updates)
    .eq("id", deal_id);

  if (updateError) throw updateError;

  // Notify Slack
  const changeDesc = [
    new_stage ? `Stage: ${deal.stage} → *${new_stage}*` : "",
    new_status ? `Status: ${deal.status} → *${new_status}*` : "",
  ].filter(Boolean).join(" | ");

  const message = `📊 *Deal Updated: ${deal.company}*\n${changeDesc}`;

  await sendSlackMessage(channel_id, message, undefined, lovableKey, slackKey, "Deal Bot", "📊");

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Send SLA reminder ──────────────────────────────────────────────────────
async function handleSLAReminder(
  body: { rule_id: string },
  supabase: ReturnType<typeof createClient>,
  lovableKey: string,
  slackKey: string
) {
  const { rule_id } = body;

  const { data: rule, error: ruleError } = await supabase
    .from("deal_sla_rules")
    .select("*")
    .eq("id", rule_id)
    .single();

  if (ruleError || !rule) throw new Error("SLA rule not found");

  const conditions = rule.conditions as Record<string, unknown>;
  const staleDays = (conditions.stale_days as number) || 7;
  const staleDate = new Date();
  staleDate.setDate(staleDate.getDate() - staleDays);

  // Find deals violating this SLA
  let query = supabase
    .from("deals")
    .select("id, company, stage, status, updated_at, user_id")
    .eq("status", "active")
    .lt("updated_at", staleDate.toISOString());

  if (rule.company_id) {
    query = query.eq("company_id", rule.company_id);
  }

  const { data: staleDealsList, error: dealsError } = await query.limit(20);
  if (dealsError) throw dealsError;

  if (!staleDealsList || staleDealsList.length === 0) {
    // Update last checked
    await supabase
      .from("deal_sla_rules")
      .update({ last_checked_at: new Date().toISOString() })
      .eq("id", rule_id);

    return new Response(JSON.stringify({ success: true, deals_flagged: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Build Slack message
  const dealLines = staleDealsList.map((d: { company: string; stage: string; updated_at: string }) => {
    const daysStale = Math.floor((Date.now() - new Date(d.updated_at).getTime()) / (1000 * 60 * 60 * 24));
    return `• *${d.company}* — ${d.stage} — _${daysStale} days without update_`;
  });

  const message = `⏰ *SLA Alert: ${rule.name}*\n\n${staleDealsList.length} deal(s) need attention:\n\n${dealLines.join("\n")}`;

  if (rule.slack_channel_id) {
    await sendSlackMessage(rule.slack_channel_id, message, undefined, lovableKey, slackKey, "SLA Monitor", "⏰");
  }

  // Update last checked
  await supabase
    .from("deal_sla_rules")
    .update({ last_checked_at: new Date().toISOString() })
    .eq("id", rule_id);

  return new Response(JSON.stringify({ success: true, deals_flagged: staleDealsList.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Draft follow-up using AI ─────────────────────────────────────────────────
async function handleDraftFollowup(
  body: { deal_id: string; channel_id: string; agent_id?: string },
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  lovableKey: string,
  slackKey: string
) {
  const { deal_id, channel_id, agent_id } = body;

  // Get deal with lenders and recent activity
  const { data: deal } = await supabase
    .from("deals")
    .select("*")
    .eq("id", deal_id)
    .single();

  if (!deal) throw new Error("Deal not found");

  const { data: lenders } = await supabase
    .from("deal_lenders")
    .select("*")
    .eq("deal_id", deal_id)
    .limit(10);

  const { data: activities } = await supabase
    .from("activity_logs")
    .select("*")
    .eq("deal_id", deal_id)
    .order("created_at", { ascending: false })
    .limit(5);

  // Build context for AI
  const context = `Deal: ${deal.company} | Stage: ${deal.stage} | Value: $${deal.value?.toLocaleString() || "N/A"}
Lenders: ${(lenders || []).map((l: { name: string; stage: string }) => `${l.name} (${l.stage})`).join(", ") || "None"}
Recent Activity: ${(activities || []).map((a: { activity_type: string; description: string }) => `${a.activity_type}: ${a.description}`).join("; ") || "None"}`;

  const ANTHROPIC_API_KEY_FU = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY_FU) throw new Error("ANTHROPIC_API_KEY is not configured");
  const aiResponse = await anthropicFetch({ feature: "slack-agent-gateway" }, {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY_FU,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
      temperature: 0.7,
      system: "You are a deal follow-up assistant. Draft a concise, professional follow-up action plan based on the deal context. Use Slack formatting. Include specific next steps and suggested email/call scripts where appropriate.",
      messages: [{ role: "user", content: `Draft a follow-up plan for this deal:\n\n${context}` }],
    }),
  });

  if (!aiResponse.ok) {
    const errText = await aiResponse.text();
    console.error("AI error:", errText);
    throw new Error("Failed to generate follow-up");
  }

  const aiData = await aiResponse.json();
  const followup = ((aiData.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n")) || "Could not generate follow-up.";

  const message = `📝 *Follow-up Plan: ${deal.company}*\n\n${followup}`;

  await sendSlackMessage(channel_id, message, undefined, lovableKey, slackKey, "Deal Concierge", "📝");

  return new Response(JSON.stringify({ success: true, content: followup }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Helper: Send Slack message ───────────────────────────────────────────────
async function sendSlackMessage(
  channel: string,
  text: string,
  threadTs: string | undefined,
  lovableKey: string,
  slackKey: string,
  username?: string,
  iconEmoji?: string
) {
  const payload: Record<string, unknown> = {
    channel,
    text,
    ...(threadTs && { thread_ts: threadTs }),
    ...(username && { username }),
    ...(iconEmoji && { icon_emoji: iconEmoji }),
  };

  const resp = await fetch(`${GATEWAY_URL}/chat.postMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": slackKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await resp.json();
  if (!resp.ok || !data.ok) {
    console.error("Slack send failed:", data);
  }
  return data;
}
