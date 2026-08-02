import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { anthropicFetch } from "../_shared/anthropicUsage.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface GraphNode {
  id: string;
  type: string;
  data: {
    nodeType: string;
    config: Record<string, any>;
    label: string;
    category: string;
    inputs: { key: string; type: string; required?: boolean }[];
    outputs: { key: string; type: string }[];
  };
}

interface GraphEdge {
  id: string;
  source: string;
  sourceHandle?: string;
  target: string;
  targetHandle?: string;
}

interface ExecutionContext {
  nodeOutputs: Record<string, Record<string, any>>;
  logs: { nodeId: string; level: string; message: string; timestamp: string }[];
  status: 'running' | 'completed' | 'failed' | 'paused';
  currentNodeId: string | null;
}

function getEntryNodes(nodes: GraphNode[], edges: GraphEdge[]): GraphNode[] {
  const targetIds = new Set(edges.map(e => e.target));
  return nodes.filter(n => !targetIds.has(n.id));
}

function getDownstreamNodes(nodeId: string, edges: GraphEdge[]): { nodeId: string; fromHandle?: string; toHandle?: string }[] {
  return edges
    .filter(e => e.source === nodeId)
    .map(e => ({ nodeId: e.target, fromHandle: e.sourceHandle, toHandle: e.targetHandle }));
}

function getUpstreamOutputs(nodeId: string, edges: GraphEdge[], ctx: ExecutionContext): Record<string, any> {
  const merged: Record<string, any> = {};
  const incoming = edges.filter(e => e.target === nodeId);
  for (const edge of incoming) {
    const outputs = ctx.nodeOutputs[edge.source];
    if (outputs) {
      const handleKey = edge.sourceHandle || 'response';
      if (outputs[handleKey] !== undefined) {
        const targetKey = edge.targetHandle || 'context';
        merged[targetKey] = outputs[handleKey];
      }
    }
  }
  return merged;
}

async function executeAgentNode(node: GraphNode, inputs: Record<string, any>, ctx: ExecutionContext): Promise<Record<string, any>> {
  const { config } = node.data;
  // All agents are powered by Claude (Anthropic). Map any legacy/saved model
  // selection onto a Claude model so old graphs keep working.
  const rawModel: string = config.model || 'anthropic/claude-sonnet-4-5';
  const lower = rawModel.toLowerCase();
  let claudeModel = 'claude-sonnet-4-5';
  if (lower.includes('opus')) claudeModel = 'claude-opus-4-20250514';
  else if (lower.includes('haiku') || lower.includes('flash') || lower.includes('mini') || lower.includes('nano')) claudeModel = 'claude-haiku-4-5';
  else if (lower.includes('sonnet') || lower.includes('pro') || lower.includes('gpt-5') || lower.includes('gemini')) claudeModel = 'claude-sonnet-4-5';

  const systemPrompt = config.system_prompt || 'You are a helpful AI assistant.';
  const temperature = config.temperature ?? 0.7;

  const contextStr = Object.entries(inputs)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join('\n\n');

  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const response = await anthropicFetch({ feature: "execute-agent-graph" }, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: claudeModel,
      max_tokens: 4096,
      temperature,
      system: systemPrompt,
      messages: [{ role: 'user', content: contextStr || 'Begin.' }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude error (${response.status}): ${err}`);
  }

  const data = await response.json();
  const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');

  return { response: text, tool_calls: null, model: claudeModel };
}

async function executeToolNode(node: GraphNode, inputs: Record<string, any>, supabase: any): Promise<Record<string, any>> {
  const { config, nodeType } = node.data;

  switch (nodeType) {
    case 'tool/db_query': {
      const table = config.table || 'deals';
      const limit = config.limit || 10;
      const fields = config.fields || '*';
      const { data, error } = await supabase.from(table).select(fields).limit(limit);
      if (error) throw new Error(`DB query error: ${error.message}`);
      return { results: data };
    }
    case 'tool/web_search': {
      return { results: [{ note: 'Web search not yet connected — mock result returned', query: inputs.query }] };
    }
    case 'tool/slack': {
      return { success: true };
    }
    case 'tool/email': {
      return { success: true };
    }
    case 'tool/api_call': {
      const url = config.url;
      if (!url) throw new Error('API URL is required');
      const method = config.method || 'GET';
      let headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (config.headers) {
        try { headers = { ...headers, ...JSON.parse(config.headers) }; } catch {}
      }
      const resp = await fetch(url, { method, headers });
      const body = await resp.text();
      let parsed;
      try { parsed = JSON.parse(body); } catch { parsed = body; }
      return { response: parsed, status: resp.status };
    }
    default:
      return { result: `Tool ${nodeType} executed (stub)` };
  }
}

async function executeRouterNode(node: GraphNode, inputs: Record<string, any>): Promise<Record<string, any>> {
  const { config, nodeType } = node.data;
  
  switch (nodeType) {
    case 'router/conditional': {
      const value = inputs.value;
      const condition = config.condition || 'truthy';
      const compareTo = config.compare_to;
      let result = false;
      switch (condition) {
        case 'truthy': result = !!value; break;
        case 'equals': result = String(value) === String(compareTo); break;
        case 'contains': result = String(value).includes(String(compareTo)); break;
        case 'gt': result = Number(value) > Number(compareTo); break;
        case 'lt': result = Number(value) < Number(compareTo); break;
      }
      return result ? { true: value } : { false: value };
    }
    case 'router/parallel': {
      return { branch_a: inputs.trigger, branch_b: inputs.trigger };
    }
    default:
      return { success: inputs.trigger };
  }
}

async function executeNode(
  node: GraphNode,
  inputs: Record<string, any>,
  ctx: ExecutionContext,
  supabase: any
): Promise<Record<string, any>> {
  const { category } = node.data;

  switch (category) {
    case 'agent':
      return executeAgentNode(node, inputs, ctx);
    case 'tool':
      return executeToolNode(node, inputs, supabase);
    case 'router':
      return executeRouterNode(node, inputs);
    case 'memory':
      return { recalled: [], history: [] };
    case 'ui':
      return { approved: true, acknowledged: true, form_data: {} };
    default:
      return {};
  }
}

async function executeGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  supabase: any
): Promise<ExecutionContext> {
  const ctx: ExecutionContext = {
    nodeOutputs: {},
    logs: [],
    status: 'running',
    currentNodeId: null,
  };

  const entryNodes = getEntryNodes(nodes, edges);
  const executed = new Set<string>();
  const queue = entryNodes.map(n => n.id);

  const MAX_ITERATIONS = 50;
  let iterations = 0;

  while (queue.length > 0 && iterations < MAX_ITERATIONS) {
    iterations++;
    const nodeId = queue.shift()!;
    if (executed.has(nodeId)) continue;

    const node = nodes.find(n => n.id === nodeId);
    if (!node) continue;

    // Check all upstream are done
    const upstreamIds = edges.filter(e => e.target === nodeId).map(e => e.source);
    const allUpstreamDone = upstreamIds.every(id => executed.has(id));
    if (!allUpstreamDone) {
      queue.push(nodeId); // re-queue
      continue;
    }

    ctx.currentNodeId = nodeId;
    const inputs = getUpstreamOutputs(nodeId, edges, ctx);

    ctx.logs.push({
      nodeId,
      level: 'info',
      message: `Executing: ${node.data.label}`,
      timestamp: new Date().toISOString(),
    });

    try {
      const outputs = await executeNode(node, inputs, ctx, supabase);
      ctx.nodeOutputs[nodeId] = outputs;
      executed.add(nodeId);

      ctx.logs.push({
        nodeId,
        level: 'info',
        message: `Completed: ${node.data.label}`,
        timestamp: new Date().toISOString(),
      });

      // Queue downstream
      const downstream = getDownstreamNodes(nodeId, edges);
      for (const d of downstream) {
        if (!executed.has(d.nodeId)) queue.push(d.nodeId);
      }
    } catch (error: any) {
      ctx.logs.push({
        nodeId,
        level: 'error',
        message: `Failed: ${error.message}`,
        timestamp: new Date().toISOString(),
      });
      ctx.status = 'failed';
      return ctx;
    }
  }

  ctx.status = 'completed';
  ctx.currentNodeId = null;
  return ctx;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const userId = claimsData.claims.sub;

    const { agentId, dryRun } = await req.json();

    if (!agentId) {
      return new Response(JSON.stringify({ error: 'agentId is required' }), { status: 400, headers: corsHeaders });
    }

    // Fetch agent
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('*')
      .eq('id', agentId)
      .single();

    if (agentError || !agent) {
      return new Response(JSON.stringify({ error: 'Agent not found' }), { status: 404, headers: corsHeaders });
    }

    const graphConfig = agent.graph_config as { nodes?: GraphNode[]; edges?: GraphEdge[] } | null;
    if (!graphConfig?.nodes?.length) {
      return new Response(JSON.stringify({ error: 'Agent has no graph config' }), { status: 400, headers: corsHeaders });
    }

    // Create run record
    const { data: run, error: runError } = await supabase
      .from('agent_runs')
      .insert({
        agent_id: agentId,
        user_id: userId,
        status: 'running',
        started_at: new Date().toISOString(),
        input_context: { dryRun: !!dryRun },
      })
      .select()
      .single();

    if (runError) {
      return new Response(JSON.stringify({ error: 'Failed to create run record' }), { status: 500, headers: corsHeaders });
    }

    // Execute graph
    const result = await executeGraph(graphConfig.nodes, graphConfig.edges || [], supabase);

    // Update run
    await supabase
      .from('agent_runs')
      .update({
        status: result.status,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - new Date(run.started_at).getTime(),
        output_content: JSON.stringify(result.nodeOutputs),
        action_result: { logs: result.logs },
        error_message: result.status === 'failed' ? result.logs.find(l => l.level === 'error')?.message : null,
      })
      .eq('id', run.id);

    return new Response(JSON.stringify({
      runId: run.id,
      status: result.status,
      outputs: result.nodeOutputs,
      logs: result.logs,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});
