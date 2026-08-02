import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { anthropicFetch } from "../_shared/anthropicUsage.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }

    const { objective, dataSources, goal, mode } = await req.json();

    // mode: "name" = just generate name, "full" = name + system prompt
    const dataSourceList = dataSources
      ? Object.entries(dataSources)
          .filter(([_, v]) => v)
          .map(([k]) => k.replace(/_/g, ' '))
          .join(', ')
      : '';

    let prompt = '';
    let tools: any[] | undefined;
    let tool_choice: any | undefined;

    if (mode === "name") {
      tools = [{
        type: "function",
        function: {
          name: "suggest_agent_name",
          description: "Return a creative, descriptive agent name and emoji based on the user's objective.",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string", description: "A creative 2-3 word agent name like 'Pipeline Guardian', 'Deal Health Monitor', 'Closing Coordinator', 'Risk Sentinel'. Do NOT use generic names like 'Custom Assistant'." },
              emoji: { type: "string", description: "A single emoji that represents this agent's purpose" },
              description: { type: "string", description: "A one-line description of what this agent does" }
            },
            required: ["name", "emoji", "description"],
            additionalProperties: false
          }
        }
      }];
      tool_choice = { type: "function", function: { name: "suggest_agent_name" } };
      prompt = `The user wants to create an AI agent for a commercial lending/deal management platform. Their objective is: "${objective}". Suggest a creative, specific agent name.`;
    } else {
      // Full mode: generate system prompt
      tools = [{
        type: "function",
        function: {
          name: "generate_agent_config",
          description: "Generate a complete agent configuration with name and expert system prompt.",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string", description: "A creative 2-3 word agent name" },
              emoji: { type: "string", description: "A single emoji" },
              description: { type: "string", description: "One-line description" },
              system_prompt: { type: "string", description: "A comprehensive, expert-level system prompt that defines the agent's role, data access, decision-making rules, output format, and tone. Should be 300-500 words." },
              personality: { type: "string", enum: ["professional", "friendly", "analytical", "creative", "direct"] }
            },
            required: ["name", "emoji", "description", "system_prompt", "personality"],
            additionalProperties: false
          }
        }
      }];
      tool_choice = { type: "function", function: { name: "generate_agent_config" } };
      prompt = `You are an expert prompt engineer for a commercial lending/deal management platform called naitive.

The user wants to create an AI agent with:
- Objective: "${objective}"
- Data Sources: ${dataSourceList || 'Not specified yet'}
- Goal: "${goal || 'Not specified yet'}"

Generate a comprehensive system prompt that:
1. Defines the agent's role and expertise clearly
2. Lists what data it can access and how to use it
3. Specifies decision-making rules and frameworks
4. Defines output format (use markdown, bullet points, tables where appropriate)
5. Sets the tone and communication style
6. Includes guardrails (what the agent should NOT do)
7. Provides example response patterns

The system prompt should be written in expert prompt engineering style - specific, actionable, and comprehensive.`;
    }

    // Convert OpenAI-style tool definition to Anthropic tool format
    const toolDef = tools![0].function;
    const claudeTools = [{
      name: toolDef.name,
      description: toolDef.description,
      input_schema: toolDef.parameters,
    }];
    const response = await anthropicFetch({ feature: "generate-agent-config" }, {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 2048,
        system: "You are an expert AI agent designer for a commercial lending platform.",
        messages: [{ role: "user", content: prompt }],
        tools: claudeTools,
        tool_choice: { type: "tool", name: toolDef.name },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("Failed to get AI response");
    }

    const data = await response.json();
    const toolUse = (data.content || []).find((b: any) => b.type === "tool_use");
    if (!toolUse) {
      throw new Error("No tool call in response");
    }
    const result = toolUse.input;

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-agent-config error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
