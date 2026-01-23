import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

interface AgentConfig {
  id: string;
  name: string;
  system_prompt: string;
  personality: string;
  temperature: number;
  can_access_deals: boolean;
  can_access_lenders: boolean;
  can_access_activities: boolean;
  can_access_milestones: boolean;
  can_search_web: boolean;
}

interface DealContext {
  id?: string;
  company?: string;
  value?: number;
  stage?: string;
  status?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { messages, agentConfig, dealContext } = await req.json() as {
      messages: Message[];
      agentConfig: AgentConfig;
      dealContext?: DealContext;
    };

    if (!messages || !agentConfig) {
      return new Response(
        JSON.stringify({ error: "Messages and agent config are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build context based on agent permissions
    let contextInfo = "";

    if (dealContext?.id && agentConfig.can_access_deals) {
      const { data: deal } = await supabase
        .from("deals")
        .select("*")
        .eq("id", dealContext.id)
        .single();

      if (deal) {
        contextInfo += `\n\n## Current Deal Context\n`;
        contextInfo += `- Company: ${deal.company}\n`;
        contextInfo += `- Deal Value: $${deal.value?.toLocaleString() || 'N/A'}\n`;
        contextInfo += `- Stage: ${deal.stage}\n`;
        contextInfo += `- Status: ${deal.status}\n`;
        contextInfo += `- Deal Type: ${deal.deal_type || 'N/A'}\n`;
        if (deal.notes) contextInfo += `- Notes: ${deal.notes}\n`;
      }

      if (agentConfig.can_access_lenders) {
        const { data: lenders } = await supabase
          .from("deal_lenders")
          .select("*")
          .eq("deal_id", dealContext.id)
          .limit(10);

        if (lenders && lenders.length > 0) {
          contextInfo += `\n## Lenders (${lenders.length})\n`;
          lenders.forEach((l) => {
            contextInfo += `- ${l.name}: ${l.stage}${l.notes ? ` - ${l.notes}` : ''}\n`;
          });
        }
      }

      if (agentConfig.can_access_milestones) {
        const { data: milestones } = await supabase
          .from("deal_milestones")
          .select("*")
          .eq("deal_id", dealContext.id)
          .order("due_date", { ascending: true })
          .limit(10);

        if (milestones && milestones.length > 0) {
          contextInfo += `\n## Milestones\n`;
          milestones.forEach((m) => {
            const status = m.completed ? "✓" : "○";
            contextInfo += `- ${status} ${m.title}${m.due_date ? ` (due: ${m.due_date})` : ''}\n`;
          });
        }
      }

      if (agentConfig.can_access_activities) {
        const { data: activities } = await supabase
          .from("activity_logs")
          .select("*")
          .eq("deal_id", dealContext.id)
          .order("created_at", { ascending: false })
          .limit(5);

        if (activities && activities.length > 0) {
          contextInfo += `\n## Recent Activity\n`;
          activities.forEach((a) => {
            contextInfo += `- ${a.activity_type}: ${a.description}\n`;
          });
        }
      }
    }

    // Build personality instructions
    const personalityMap: Record<string, string> = {
      professional: "Be professional, concise, and business-focused. Use formal language.",
      friendly: "Be warm, approachable, and conversational. Use casual but respectful language.",
      analytical: "Be data-driven and precise. Focus on facts, numbers, and logical analysis.",
      creative: "Think outside the box. Offer innovative ideas and unique perspectives.",
      direct: "Be brief and to the point. No fluff or unnecessary explanations.",
    };

    const personalityInstruction = personalityMap[agentConfig.personality] || personalityMap.professional;

    // Build the full system prompt
    const fullSystemPrompt = `${agentConfig.system_prompt}

## Personality
${personalityInstruction}

## Your Capabilities
- Access to deal data: ${agentConfig.can_access_deals ? 'Yes' : 'No'}
- Access to lender data: ${agentConfig.can_access_lenders ? 'Yes' : 'No'}
- Access to activity logs: ${agentConfig.can_access_activities ? 'Yes' : 'No'}
- Access to milestones: ${agentConfig.can_access_milestones ? 'Yes' : 'No'}
- Web search: ${agentConfig.can_search_web ? 'Yes' : 'No'}

${contextInfo ? `## Available Context${contextInfo}` : ''}

Keep responses concise and actionable. Focus on providing value based on the context available to you.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: fullSystemPrompt },
          ...messages,
        ],
        temperature: agentConfig.temperature || 0.7,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("Failed to get AI response");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No response content from AI");
    }

    // Update agent usage stats
    await supabase
      .from("agents")
      .update({ 
        usage_count: agentConfig.id ? undefined : 0,
        last_used_at: new Date().toISOString() 
      })
      .eq("id", agentConfig.id);

    return new Response(
      JSON.stringify({ content }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Agent chat error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
