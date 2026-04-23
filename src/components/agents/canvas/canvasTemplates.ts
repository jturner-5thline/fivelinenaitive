import type { Node, Edge } from '@xyflow/react';
import type { AgentCanvasNodeData } from './types';
import { AGENT_NODE_REGISTRY } from './agentNodeRegistry';

export interface CanvasTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  nodes: Node[];
  edges: Edge[];
}

function makeNode(
  id: string,
  registryType: string,
  x: number,
  y: number,
  configOverrides: Record<string, any> = {}
): Node {
  const item = AGENT_NODE_REGISTRY.find(n => n.type === registryType)!;
  return {
    id,
    type: 'agentNode',
    position: { x, y },
    data: {
      label: item.label,
      nodeType: item.type,
      icon: item.icon,
      category: item.category,
      inputs: item.inputs,
      outputs: item.outputs,
      configSchema: item.configSchema,
      config: configOverrides,
      description: item.description,
    } satisfies AgentCanvasNodeData as unknown as Record<string, unknown>,
  };
}

function makeEdge(id: string, source: string, sourceHandle: string, target: string, targetHandle: string): Edge {
  return {
    id,
    source,
    sourceHandle,
    target,
    targetHandle,
    animated: true,
    style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
  };
}

// naitive-specific patterns
const NAITIVE_TEMPLATES: CanvasTemplate[] = [
  {
    id: 'daily-health-check',
    name: 'Daily Health Check',
    description: 'Scheduled pipeline scan that queries deals, checks for stale activity, and sends a Slack alert.',
    icon: '🛡️',
    nodes: [
      makeNode('schedule', 'trigger/schedule', 0, 100, { cron: '0 7 * * *', timezone: 'America/New_York' }),
      makeNode('deals', 'tool/db_query', 300, 0, { table: 'deals', natural_query: 'Find all active deals with no activity in 7+ days', limit: 50 }),
      makeNode('milestones', 'tool/db_query', 300, 200, { table: 'deal_milestones', natural_query: 'Find all overdue milestones', limit: 50 }),
      makeNode('analyzer', 'agent/llm_worker', 600, 100, {
        model: 'google/gemini-2.5-flash',
        system_prompt: 'Analyze stale deals and overdue milestones. Produce a structured pipeline health report with CRITICAL, HIGH, and MEDIUM priority sections.',
      }),
      makeNode('slack', 'tool/slack', 900, 0, { channel: '#deal-alerts' }),
      makeNode('notify', 'ui/notification', 900, 200, { channel: 'in_app', priority: 'urgent' }),
    ],
    edges: [
      makeEdge('e1', 'schedule', 'context', 'deals', 'filter'),
      makeEdge('e2', 'schedule', 'context', 'milestones', 'filter'),
      makeEdge('e3', 'deals', 'results', 'analyzer', 'context'),
      makeEdge('e4', 'milestones', 'results', 'analyzer', 'context'),
      makeEdge('e5', 'analyzer', 'response', 'slack', 'message'),
      makeEdge('e6', 'analyzer', 'response', 'notify', 'message'),
    ],
  },
  {
    id: 'new-deal-workflow',
    name: 'New Deal Intake',
    description: 'Auto-screen new deals for completeness and create tasks for missing fields.',
    icon: '📋',
    nodes: [
      makeNode('trigger', 'trigger/webhook', 0, 100, { method: 'POST', path: '/deal-created' }),
      makeNode('dealData', 'tool/db_query', 300, 100, { table: 'deals', natural_query: 'Get the newly created deal with all fields', limit: 1 }),
      makeNode('screener', 'agent/llm_worker', 600, 100, {
        model: 'google/gemini-2.5-flash',
        system_prompt: 'Evaluate new deal data completeness. Check for missing: loan amount, property type, borrower name, LTV, asset class. Produce a completeness score and list missing required fields.',
      }),
      makeNode('output', 'output/response', 900, 100, { status_code: 'success' }),
    ],
    edges: [
      makeEdge('e1', 'trigger', 'payload', 'dealData', 'filter'),
      makeEdge('e2', 'dealData', 'results', 'screener', 'context'),
      makeEdge('e3', 'screener', 'response', 'output', 'message'),
    ],
  },
  {
    id: 'lender-followup-chain',
    name: 'Lender Follow-Up Chain',
    description: 'Check lender communication status and draft follow-up emails for silent lenders.',
    icon: '📞',
    nodes: [
      makeNode('trigger', 'trigger/manual', 0, 100, { sample_input: '{"deal_id": "xxx"}' }),
      makeNode('lenders', 'tool/db_query', 300, 0, { table: 'deal_lenders', natural_query: 'Get all lenders for this deal with their stages and last contact dates', limit: 20 }),
      makeNode('activity', 'tool/db_query', 300, 200, { table: 'activity_logs', natural_query: 'Get recent lender communication activity for this deal', limit: 50 }),
      makeNode('coach', 'agent/llm_worker', 600, 100, {
        model: 'google/gemini-2.5-pro',
        system_prompt: 'Analyze lender engagement. For each lender, determine: status (Active/At Risk/Silent based on days since contact), and draft a professional follow-up email for At Risk and Silent lenders.',
      }),
      makeNode('email', 'tool/email', 900, 100, { subject: 'Follow-up' }),
    ],
    edges: [
      makeEdge('e1', 'trigger', 'input', 'lenders', 'filter'),
      makeEdge('e2', 'trigger', 'input', 'activity', 'filter'),
      makeEdge('e3', 'lenders', 'results', 'coach', 'context'),
      makeEdge('e4', 'activity', 'results', 'coach', 'context'),
      makeEdge('e5', 'coach', 'response', 'email', 'body'),
    ],
  },
];

export const CANVAS_TEMPLATES: CanvasTemplate[] = [
  ...NAITIVE_TEMPLATES,
  {
    id: 'research-summarize',
    name: 'Research & Summarize',
    description: 'Search the web, collect information, and produce a structured summary with human review.',
    icon: '🔬',
    nodes: [
      makeNode('planner', 'agent/planner', 0, 100, { model: 'google/gemini-2.5-pro' }),
      makeNode('search', 'tool/web_search', 300, 0, { max_results: 10 }),
      makeNode('db', 'tool/db_query', 300, 200, { table: 'deals', limit: 5 }),
      makeNode('worker', 'agent/llm_worker', 600, 100, {
        model: 'google/gemini-2.5-flash',
        system_prompt: 'Synthesize the research results into a clear, actionable summary.',
      }),
      makeNode('review', 'ui/approval', 900, 100),
    ],
    edges: [
      makeEdge('e1', 'planner', 'subtasks', 'search', 'query'),
      makeEdge('e2', 'planner', 'subtasks', 'db', 'filter'),
      makeEdge('e3', 'search', 'results', 'worker', 'context'),
      makeEdge('e4', 'db', 'results', 'worker', 'context'),
      makeEdge('e5', 'worker', 'response', 'review', 'request'),
    ],
  },
  {
    id: 'deal-alert-pipeline',
    name: 'Deal Alert Pipeline',
    description: 'Monitor deals for stage changes, analyze impact, and notify the team via Slack and email.',
    icon: '🚨',
    nodes: [
      makeNode('db_check', 'tool/db_query', 0, 100, { table: 'deals', fields: 'company, stage, value', limit: 20 }),
      makeNode('analyzer', 'agent/llm_worker', 300, 100, {
        model: 'google/gemini-2.5-flash',
        system_prompt: 'Analyze the deal data and identify any urgent items that need attention.',
      }),
      makeNode('router', 'router/conditional', 600, 100, { condition: 'truthy' }),
      makeNode('slack', 'tool/slack', 900, 0, { channel: '#deal-alerts' }),
      makeNode('email', 'tool/email', 900, 200, { subject: 'Deal Alert' }),
    ],
    edges: [
      makeEdge('e1', 'db_check', 'results', 'analyzer', 'context'),
      makeEdge('e2', 'analyzer', 'response', 'router', 'value'),
      makeEdge('e3', 'router', 'true', 'slack', 'message'),
      makeEdge('e4', 'router', 'true', 'email', 'body'),
    ],
  },
  {
    id: 'approval-workflow',
    name: 'Approval Workflow',
    description: 'Collect user input, process with AI, get manager approval, then execute action.',
    icon: '✅',
    nodes: [
      makeNode('form', 'ui/form_input', 0, 100, { form_title: 'Request Details' }),
      makeNode('worker', 'agent/llm_worker', 300, 100, {
        model: 'openai/gpt-5-mini',
        system_prompt: 'Review the request and prepare a recommendation for the approver.',
      }),
      makeNode('approval', 'ui/approval', 600, 100, { notify_via: 'email', timeout_hours: 48 }),
      makeNode('action', 'tool/api_call', 900, 0, { method: 'POST' }),
      makeNode('notify', 'ui/notification', 900, 200, { channel: 'in_app', priority: 'normal' }),
    ],
    edges: [
      makeEdge('e1', 'form', 'form_data', 'worker', 'context'),
      makeEdge('e2', 'worker', 'response', 'approval', 'request'),
      makeEdge('e3', 'approval', 'approved', 'action', 'params'),
      makeEdge('e4', 'approval', 'rejected', 'notify', 'message'),
    ],
  },
  {
    id: 'rag-assistant',
    name: 'RAG Assistant',
    description: 'Retrieve context from vector store and conversation memory, then generate an informed response.',
    icon: '📚',
    nodes: [
      makeNode('memory', 'memory/conversation', 0, 0, { max_messages: 30 }),
      makeNode('vector', 'memory/vector_store', 0, 200, { collection: 'documents', top_k: 5 }),
      makeNode('worker', 'agent/llm_worker', 350, 100, {
        model: 'google/gemini-2.5-pro',
        system_prompt: 'Answer the user\'s question using the provided context. Cite sources where possible.',
      }),
      makeNode('reviewer', 'agent/reviewer', 650, 100, { model: 'google/gemini-2.5-flash' }),
    ],
    edges: [
      makeEdge('e1', 'memory', 'history', 'worker', 'context'),
      makeEdge('e2', 'vector', 'matches', 'worker', 'context'),
      makeEdge('e3', 'worker', 'response', 'reviewer', 'content'),
    ],
  },
];
