import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { anthropicFetch } from "../_shared/anthropicUsage.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const AVAILABLE_NODE_TYPES = [
  { type: 'agent/llm_worker', label: 'LLM Agent', category: 'agent', description: 'LLM-backed worker' },
  { type: 'agent/planner', label: 'Planner Agent', category: 'agent', description: 'Decomposes tasks' },
  { type: 'agent/reviewer', label: 'Reviewer Agent', category: 'agent', description: 'Reviews output' },
  { type: 'tool/api_call', label: 'API Call', category: 'tool', description: 'HTTP request' },
  { type: 'tool/db_query', label: 'Database Query', category: 'tool', description: 'Query database' },
  { type: 'tool/slack', label: 'Slack Message', category: 'tool', description: 'Send Slack message' },
  { type: 'tool/email', label: 'Send Email', category: 'tool', description: 'Send email' },
  { type: 'tool/web_search', label: 'Web Search', category: 'tool', description: 'Search the web' },
  { type: 'tool/file_operation', label: 'File Operation', category: 'tool', description: 'File ops' },
  { type: 'memory/vector_store', label: 'Vector Search', category: 'memory', description: 'RAG search' },
  { type: 'memory/conversation', label: 'Conversation Memory', category: 'memory', description: 'Chat history' },
  { type: 'memory/long_term', label: 'Long-Term Memory', category: 'memory', description: 'Persistent memory' },
  { type: 'router/conditional', label: 'If / Else', category: 'router', description: 'Conditional routing' },
  { type: 'router/parallel', label: 'Parallel Split', category: 'router', description: 'Parallel execution' },
  { type: 'router/loop', label: 'Loop', category: 'router', description: 'Loop until condition' },
  { type: 'router/error_handler', label: 'Error Handler', category: 'router', description: 'Error handling' },
  { type: 'ui/approval', label: 'Approval Gate', category: 'ui', description: 'Human approval' },
  { type: 'ui/form_input', label: 'User Form', category: 'ui', description: 'Collect user input' },
  { type: 'ui/notification', label: 'User Notification', category: 'ui', description: 'Send notification' },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { description } = await req.json();

    if (!description || typeof description !== 'string') {
      return new Response(JSON.stringify({ error: 'description is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const systemPrompt = `You are an expert at designing multi-agent workflows. Given a natural language description, produce a JSON graph of nodes and edges.

Available node types:
${JSON.stringify(AVAILABLE_NODE_TYPES, null, 2)}

Rules:
- Use ONLY the node types listed above
- Each node needs: id (string), type (from list), label (string), x (number), y (number), config (object with relevant settings)
- Edges connect outputs to inputs: { source, sourceHandle, target, targetHandle }
- Layout nodes left-to-right, ~300px apart horizontally, vertically offset for branches
- Include appropriate config values (model selection for agents, channel for slack, table for db queries, etc.)
- For agent nodes, include a system_prompt in config that describes what the agent should do
- Keep solutions practical with 3-8 nodes`;

    const graphSchema = {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Name for the solution' },
                  nodes: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        type: { type: 'string' },
                        label: { type: 'string' },
                        x: { type: 'number' },
                        y: { type: 'number' },
                        config: { type: 'object' },
                      },
                      required: ['id', 'type', 'label', 'x', 'y'],
                    },
                  },
                  edges: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        source: { type: 'string' },
                        sourceHandle: { type: 'string' },
                        target: { type: 'string' },
                        targetHandle: { type: 'string' },
                      },
                      required: ['source', 'target'],
                    },
                  },
                },
                required: ['name', 'nodes', 'edges'],
                additionalProperties: false,
    };
    const response = await anthropicFetch({ feature: "generate-agent-graph" }, {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: description }],
        tools: [{ name: 'generate_graph', description: 'Generate a multi-agent workflow graph', input_schema: graphSchema }],
        tool_choice: { type: 'tool', name: 'generate_graph' },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded, please try again shortly.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted. Please add credits in Settings.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const t = await response.text();
      console.error('AI gateway error:', response.status, t);
      return new Response(JSON.stringify({ error: 'AI generation failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const toolUse = (data.content || []).find((b: any) => b.type === 'tool_use');
    if (!toolUse?.input) {
      return new Response(JSON.stringify({ error: 'AI did not return valid graph data' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const graphData = toolUse.input;

    return new Response(JSON.stringify(graphData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('generate-agent-graph error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
