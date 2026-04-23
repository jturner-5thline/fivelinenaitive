import type { AgentNodePaletteItem } from './types';

export const AGENT_NODE_REGISTRY: AgentNodePaletteItem[] = [
  // ── Triggers / Entry ──
  {
    type: 'trigger/webhook',
    label: 'Webhook Trigger',
    icon: '🌐',
    category: 'trigger',
    description: 'Start this agent via an HTTP webhook call',
    inputs: [],
    outputs: [
      { key: 'payload', type: 'json', label: 'Payload' },
      { key: 'headers', type: 'json', label: 'Headers' },
    ],
    configSchema: {
      method: {
        type: 'select',
        label: 'HTTP Method',
        required: true,
        options: [
          { value: 'POST', label: 'POST' },
          { value: 'GET', label: 'GET' },
          { value: 'PUT', label: 'PUT' },
        ],
      },
      path: { type: 'string', label: 'Path', placeholder: '/api/agent-webhook', hint: 'Webhook endpoint path' },
      auth_required: { type: 'boolean', label: 'Require Auth', default: true },
    },
    tags: ['entry', 'http', 'api'],
  },
  {
    type: 'trigger/schedule',
    label: 'Schedule Trigger',
    icon: '⏰',
    category: 'trigger',
    description: 'Run this agent on a recurring schedule (cron)',
    inputs: [],
    outputs: [
      { key: 'trigger_time', type: 'text', label: 'Trigger Time' },
      { key: 'context', type: 'json', label: 'Context' },
    ],
    configSchema: {
      cron: { type: 'string', label: 'Cron Expression', required: true, placeholder: '0 9 * * *', hint: 'e.g. "0 9 * * *" for daily at 9 AM' },
      timezone: { type: 'string', label: 'Timezone', default: 'UTC', placeholder: 'America/New_York' },
    },
    tags: ['entry', 'cron', 'schedule', 'recurring'],
  },
  {
    type: 'trigger/manual',
    label: 'Manual Test Run',
    icon: '▶️',
    category: 'trigger',
    description: 'Manually trigger for testing with sample input',
    inputs: [],
    outputs: [
      { key: 'input', type: 'json', label: 'Test Input' },
    ],
    configSchema: {
      sample_input: { type: 'textarea', label: 'Sample Input (JSON)', placeholder: '{"query": "test", "user_id": "123"}', hint: 'JSON payload to send when testing' },
    },
    tags: ['entry', 'test', 'debug'],
  },

  // ── Agents ──
  {
    type: 'agent/llm_worker',
    label: 'LLM Agent',
    icon: '🤖',
    category: 'agent',
    description: 'An LLM-backed worker that processes instructions and produces output',
    inputs: [{ key: 'context', type: 'any', label: 'Context' }],
    outputs: [
      { key: 'response', type: 'text', label: 'Response' },
      { key: 'tool_calls', type: 'json', label: 'Tool Calls' },
    ],
    configSchema: {
      model: {
        type: 'select',
        label: 'Model',
        required: true,
        options: [
          { value: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash (Fast)' },
          { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
          { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro (Best)' },
          { value: 'openai/gpt-5-mini', label: 'GPT-5 Mini' },
          { value: 'openai/gpt-5', label: 'GPT-5' },
        ],
        hint: 'Choose the AI model for this agent',
      },
      system_prompt: {
        type: 'textarea',
        label: 'System Prompt',
        required: true,
        placeholder: 'You are a helpful assistant that...',
        hint: 'Instructions that define the agent\'s behavior',
      },
      temperature: {
        type: 'number',
        label: 'Temperature',
        default: 0.7,
        hint: '0 = deterministic, 1 = creative',
      },
      preset: {
        type: 'select',
        label: 'Preset',
        options: [
          { value: '', label: 'None' },
          { value: 'research_agent', label: '🔬 Research Agent' },
          { value: 'email_draft', label: '📧 Email Draft Agent' },
          { value: 'deal_triage', label: '🎯 Deal Triage Agent' },
          { value: 'code_reviewer', label: '💻 Code Reviewer' },
          { value: 'data_analyst', label: '📊 Data Analyst' },
        ],
        hint: 'Load a preset prompt & tool config',
      },
    },
    tags: ['ai', 'llm', 'chat', 'reasoning'],
  },
  {
    type: 'agent/planner',
    label: 'Planner Agent',
    icon: '🧠',
    category: 'agent',
    description: 'Decomposes a complex task into sub-tasks and delegates to other agents',
    inputs: [{ key: 'goal', type: 'text', required: true, label: 'Goal' }],
    outputs: [
      { key: 'plan', type: 'json', label: 'Plan' },
      { key: 'subtasks', type: 'json', label: 'Sub-tasks' },
    ],
    configSchema: {
      model: {
        type: 'select',
        label: 'Model',
        required: true,
        options: [
          { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro (Recommended)' },
          { value: 'openai/gpt-5', label: 'GPT-5' },
        ],
        hint: 'Planners benefit from stronger reasoning models',
      },
      planning_prompt: {
        type: 'textarea',
        label: 'Planning Instructions',
        placeholder: 'Break down the goal into actionable steps...',
      },
      max_subtasks: { type: 'number', label: 'Max Sub-tasks', default: 5 },
    },
    tags: ['ai', 'planning', 'decomposition', 'orchestration'],
  },
  {
    type: 'agent/reviewer',
    label: 'Reviewer Agent',
    icon: '🔍',
    category: 'agent',
    description: 'Reviews and validates output from other agents before proceeding',
    inputs: [
      { key: 'content', type: 'text', required: true, label: 'Content to Review' },
      { key: 'criteria', type: 'text', label: 'Criteria' },
    ],
    outputs: [
      { key: 'approved', type: 'boolean', label: 'Approved' },
      { key: 'feedback', type: 'text', label: 'Feedback' },
    ],
    configSchema: {
      model: {
        type: 'select',
        label: 'Model',
        required: true,
        options: [
          { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
          { value: 'openai/gpt-5-mini', label: 'GPT-5 Mini' },
        ],
      },
      review_prompt: {
        type: 'textarea',
        label: 'Review Criteria',
        placeholder: 'Check that the output meets these standards...',
      },
    },
    tags: ['ai', 'review', 'validation', 'quality'],
  },

  // ── Tools ──
  {
    type: 'tool/api_call',
    label: 'API Call',
    icon: '🔗',
    category: 'tool',
    description: 'Make an HTTP request to an external API',
    inputs: [{ key: 'params', type: 'json', label: 'Parameters' }],
    outputs: [
      { key: 'response', type: 'json', label: 'Response' },
      { key: 'status', type: 'number', label: 'Status Code' },
    ],
    configSchema: {
      url: { type: 'string', label: 'URL', required: true, placeholder: 'https://api.example.com/...' },
      method: {
        type: 'select',
        label: 'Method',
        options: [
          { value: 'GET', label: 'GET' },
          { value: 'POST', label: 'POST' },
          { value: 'PUT', label: 'PUT' },
          { value: 'DELETE', label: 'DELETE' },
        ],
      },
      headers: { type: 'textarea', label: 'Headers (JSON)', placeholder: '{"Authorization": "Bearer ..."}' },
    },
    tags: ['http', 'rest', 'api', 'external'],
  },
  {
    type: 'tool/db_query',
    label: 'Database Query',
    icon: '🗄️',
    category: 'tool',
    description: 'Query the database for contextual data',
    inputs: [{ key: 'filter', type: 'json', label: 'Filter' }],
    outputs: [{ key: 'results', type: 'json', label: 'Results' }],
    configSchema: {
      table: {
        type: 'select',
        label: 'Data Source',
        required: true,
        options: [
          { value: 'deals', label: '📊 Deals' },
          { value: 'deal_lenders', label: '🏦 Lenders' },
          { value: 'activity_logs', label: '📋 Activity Logs' },
          { value: 'deal_milestones', label: '🎯 Milestones' },
          { value: 'tasks', label: '✅ Tasks' },
          { value: 'deal_attachments', label: '📁 Documents & Files' },
          { value: 'profiles', label: '👤 Contacts' },
          { value: 'deal_space_notes', label: '📝 Deal Notes' },
        ],
        hint: 'Select a naitive data table',
      },
      natural_query: { type: 'textarea', label: 'What do you want to find?', placeholder: 'Find all deals with no activity in the last 7 days', hint: 'Describe your query in plain English — the agent will translate it' },
      fields: { type: 'string', label: 'Fields (optional)', placeholder: 'company, value, stage' },
      limit: { type: 'number', label: 'Max Results', default: 10 },
    },
    tags: ['database', 'query', 'data'],
  },
  {
    type: 'tool/slack',
    label: 'Slack Message',
    icon: '💬',
    category: 'tool',
    description: 'Send a message to a Slack channel',
    inputs: [{ key: 'message', type: 'text', required: true, label: 'Message' }],
    outputs: [{ key: 'success', type: 'boolean' }],
    configSchema: {
      channel: { type: 'string', label: 'Channel', required: true, placeholder: '#general' },
    },
    tags: ['notify', 'slack', 'messaging'],
  },
  {
    type: 'tool/email',
    label: 'Send Email',
    icon: '📧',
    category: 'tool',
    description: 'Send an email notification',
    inputs: [{ key: 'body', type: 'text', required: true, label: 'Body' }],
    outputs: [{ key: 'success', type: 'boolean' }],
    configSchema: {
      to: { type: 'string', label: 'To', required: true, placeholder: 'user@example.com' },
      subject: { type: 'string', label: 'Subject', required: true },
    },
    tags: ['notify', 'email', 'messaging'],
  },
  {
    type: 'tool/web_search',
    label: 'Web Search',
    icon: '🌐',
    category: 'tool',
    description: 'Search the web for real-time information',
    inputs: [{ key: 'query', type: 'text', required: true, label: 'Query' }],
    outputs: [{ key: 'results', type: 'json', label: 'Results' }],
    configSchema: {
      max_results: { type: 'number', label: 'Max Results', default: 5 },
    },
    tags: ['search', 'web', 'rag', 'research'],
  },
  {
    type: 'tool/file_operation',
    label: 'File Operation',
    icon: '📁',
    category: 'tool',
    description: 'Read, write, or process files',
    inputs: [{ key: 'file', type: 'file', required: true, label: 'File' }],
    outputs: [{ key: 'content', type: 'text', label: 'Content' }],
    configSchema: {
      operation: {
        type: 'select',
        label: 'Operation',
        required: true,
        options: [
          { value: 'read', label: 'Read' },
          { value: 'parse', label: 'Parse (PDF/Doc)' },
          { value: 'summarize', label: 'Summarize' },
        ],
      },
    },
    tags: ['file', 'document', 'parse'],
  },

  // ── Memory ──
  {
    type: 'memory/vector_store',
    label: 'Vector Search',
    icon: '🧲',
    category: 'memory',
    description: 'Search a vector store for semantically similar content (RAG)',
    inputs: [{ key: 'query', type: 'text', required: true, label: 'Query' }],
    outputs: [{ key: 'matches', type: 'json', label: 'Matches' }],
    configSchema: {
      collection: { type: 'string', label: 'Collection', required: true, placeholder: 'deal_documents' },
      top_k: { type: 'number', label: 'Top K', default: 5 },
      threshold: { type: 'number', label: 'Similarity Threshold', default: 0.7 },
    },
    tags: ['rag', 'vector', 'search', 'embeddings'],
  },
  {
    type: 'memory/conversation',
    label: 'Conversation Memory',
    icon: '💭',
    category: 'memory',
    description: 'Persist and retrieve conversation history for context',
    inputs: [{ key: 'message', type: 'text', label: 'New Message' }],
    outputs: [{ key: 'history', type: 'json', label: 'History' }],
    configSchema: {
      max_messages: { type: 'number', label: 'Max Messages', default: 20 },
      summary_after: { type: 'number', label: 'Summarize After', default: 50, hint: 'Auto-summarize after N messages' },
    },
    tags: ['memory', 'chat', 'context', 'history'],
  },
  {
    type: 'memory/long_term',
    label: 'Long-Term Memory',
    icon: '🧠',
    category: 'memory',
    description: 'Store and recall key facts, preferences, and learned patterns',
    inputs: [{ key: 'fact', type: 'text', label: 'Fact to Store' }],
    outputs: [{ key: 'recalled', type: 'json', label: 'Recalled Facts' }],
    configSchema: {
      namespace: { type: 'string', label: 'Namespace', placeholder: 'user_preferences', hint: 'Isolate memories by category' },
    },
    tags: ['memory', 'knowledge', 'persistence'],
  },

  // ── Routers ──
  {
    type: 'router/conditional',
    label: 'If / Else',
    icon: '🔀',
    category: 'router',
    description: 'Route execution based on a condition',
    inputs: [{ key: 'value', type: 'any', required: true, label: 'Value' }],
    outputs: [
      { key: 'true', type: 'any', label: 'Yes' },
      { key: 'false', type: 'any', label: 'No' },
    ],
    configSchema: {
      condition: {
        type: 'select',
        label: 'Condition',
        required: true,
        options: [
          { value: 'equals', label: 'Equals' },
          { value: 'contains', label: 'Contains' },
          { value: 'gt', label: 'Greater Than' },
          { value: 'lt', label: 'Less Than' },
          { value: 'truthy', label: 'Is Truthy' },
        ],
      },
      compare_to: { type: 'string', label: 'Compare To', placeholder: 'Value...' },
    },
    tags: ['routing', 'condition', 'logic', 'branching'],
  },
  {
    type: 'router/parallel',
    label: 'Parallel Split',
    icon: '⚡',
    category: 'router',
    description: 'Execute multiple branches simultaneously and merge results',
    inputs: [{ key: 'trigger', type: 'any', required: true, label: 'Trigger' }],
    outputs: [
      { key: 'branch_a', type: 'any', label: 'Branch A' },
      { key: 'branch_b', type: 'any', label: 'Branch B' },
      { key: 'merged', type: 'json', label: 'Merged' },
    ],
    configSchema: {
      merge_strategy: {
        type: 'select',
        label: 'Merge Strategy',
        options: [
          { value: 'wait_all', label: 'Wait for All' },
          { value: 'first_success', label: 'First Success' },
        ],
      },
    },
    tags: ['routing', 'parallel', 'concurrent'],
  },
  {
    type: 'router/loop',
    label: 'Loop',
    icon: '🔁',
    category: 'router',
    description: 'Repeat a sequence until a condition is met or max iterations reached',
    inputs: [{ key: 'items', type: 'json', required: true, label: 'Items' }],
    outputs: [
      { key: 'current', type: 'any', label: 'Current Item' },
      { key: 'done', type: 'any', label: 'Complete' },
    ],
    configSchema: {
      max_iterations: { type: 'number', label: 'Max Iterations', default: 10 },
      exit_condition: { type: 'string', label: 'Exit When', placeholder: 'result.approved === true' },
    },
    tags: ['routing', 'loop', 'iteration', 'repeat'],
  },
  {
    type: 'router/error_handler',
    label: 'Error Handler',
    icon: '🛡️',
    category: 'router',
    description: 'Catch and handle errors from upstream nodes with retry or fallback logic',
    inputs: [{ key: 'trigger', type: 'any', required: true, label: 'Trigger' }],
    outputs: [
      { key: 'success', type: 'any', label: 'Success' },
      { key: 'error', type: 'any', label: 'Error' },
    ],
    configSchema: {
      max_retries: { type: 'number', label: 'Max Retries', default: 3 },
      backoff_ms: { type: 'number', label: 'Backoff (ms)', default: 1000 },
    },
    tags: ['error', 'retry', 'fallback', 'resilience'],
  },

  // ── UI / Human-in-the-loop ──
  {
    type: 'ui/approval',
    label: 'Approval Gate',
    icon: '✋',
    category: 'ui',
    description: 'Pause execution and wait for human approval before continuing',
    inputs: [{ key: 'request', type: 'any', required: true, label: 'Request' }],
    outputs: [
      { key: 'approved', type: 'any', label: 'Approved' },
      { key: 'rejected', type: 'any', label: 'Rejected' },
    ],
    configSchema: {
      approver: { type: 'string', label: 'Approver', placeholder: 'manager@company.com', hint: 'Who should approve this step?' },
      timeout_hours: { type: 'number', label: 'Timeout (hours)', default: 24 },
      notify_via: {
        type: 'select',
        label: 'Notify Via',
        options: [
          { value: 'email', label: 'Email' },
          { value: 'slack', label: 'Slack' },
          { value: 'in_app', label: 'In-App' },
        ],
      },
    },
    tags: ['approval', 'human', 'gate', 'review'],
  },
  {
    type: 'ui/form_input',
    label: 'User Form',
    icon: '📝',
    category: 'ui',
    description: 'Present a form to collect structured input from a user',
    inputs: [{ key: 'trigger', type: 'any', label: 'Trigger' }],
    outputs: [{ key: 'form_data', type: 'json', label: 'Form Data' }],
    configSchema: {
      form_title: { type: 'string', label: 'Form Title', required: true },
      fields_json: { type: 'textarea', label: 'Fields (JSON)', placeholder: '[{"name": "reason", "type": "text", "required": true}]' },
    },
    tags: ['form', 'input', 'human', 'collect'],
  },
  {
    type: 'ui/notification',
    label: 'User Notification',
    icon: '🔔',
    category: 'ui',
    description: 'Send a notification or status update to the user',
    inputs: [{ key: 'message', type: 'text', required: true, label: 'Message' }],
    outputs: [{ key: 'acknowledged', type: 'boolean' }],
    configSchema: {
      channel: {
        type: 'select',
        label: 'Channel',
        options: [
          { value: 'in_app', label: 'In-App Toast' },
          { value: 'email', label: 'Email' },
          { value: 'slack', label: 'Slack DM' },
        ],
      },
      priority: {
        type: 'select',
        label: 'Priority',
        options: [
          { value: 'low', label: 'Low' },
          { value: 'normal', label: 'Normal' },
          { value: 'urgent', label: 'Urgent' },
        ],
      },
    },
    tags: ['notify', 'alert', 'human'],
  },

  // ── Output / End ──
  {
    type: 'output/response',
    label: 'Output Response',
    icon: '📤',
    category: 'output',
    description: 'Define the agent\'s final response schema and return data',
    inputs: [
      { key: 'status', type: 'text', required: true, label: 'Status' },
      { key: 'message', type: 'text', label: 'Message' },
      { key: 'payload', type: 'json', label: 'Payload' },
    ],
    outputs: [],
    configSchema: {
      status_code: {
        type: 'select',
        label: 'Default Status',
        options: [
          { value: 'success', label: 'Success' },
          { value: 'partial', label: 'Partial Success' },
          { value: 'error', label: 'Error' },
        ],
        default: 'success',
      },
      response_schema: {
        type: 'textarea',
        label: 'Response Schema (JSON)',
        placeholder: '{"status": "string", "message": "string", "data": "object"}',
        hint: 'Define the expected output shape',
      },
    },
    tags: ['output', 'end', 'response', 'return'],
  },
];

export const AGENT_NODE_CATEGORIES = [
  { key: 'trigger', label: 'Triggers', color: 'hsl(var(--primary))' },
  { key: 'agent', label: 'Agents', color: 'hsl(var(--chart-4))' },
  { key: 'tool', label: 'Tools', color: 'hsl(var(--chart-1))' },
  { key: 'memory', label: 'Memory', color: 'hsl(var(--chart-2))' },
  { key: 'router', label: 'Routers', color: 'hsl(var(--chart-3))' },
  { key: 'ui', label: 'Human', color: 'hsl(var(--chart-5))' },
  { key: 'output', label: 'Output', color: 'hsl(var(--muted-foreground))' },
  { key: 'module', label: 'Modules', color: 'hsl(var(--primary))' },
] as const;

// Presets for LLM Agent
export const AGENT_PRESETS: Record<string, { system_prompt: string; temperature: number; suggested_tools: string[] }> = {
  research_agent: {
    system_prompt: 'You are a research analyst. Given a topic, search the web, gather information from multiple sources, and produce a structured summary with key findings, sources cited, and actionable recommendations.',
    temperature: 0.5,
    suggested_tools: ['tool/web_search', 'tool/db_query'],
  },
  email_draft: {
    system_prompt: 'You are a professional email writer. Given context about a deal, lender, or situation, draft a clear, professional email that is concise, actionable, and maintains the appropriate tone.',
    temperature: 0.6,
    suggested_tools: ['tool/email', 'tool/db_query'],
  },
  deal_triage: {
    system_prompt: 'You are a deal triage specialist. Analyze incoming deal information, assess fit against lender criteria, identify key risks and opportunities, and produce a structured triage report with a recommended next action.',
    temperature: 0.3,
    suggested_tools: ['tool/db_query', 'tool/slack'],
  },
  code_reviewer: {
    system_prompt: 'You are a code reviewer. Analyze the provided code for bugs, security issues, performance problems, and style violations. Provide specific, actionable feedback with line-level suggestions.',
    temperature: 0.2,
    suggested_tools: ['tool/file_operation'],
  },
  data_analyst: {
    system_prompt: 'You are a data analyst. Given a dataset or query results, perform analysis, identify trends and anomalies, and produce clear visualizations or summary tables with key insights.',
    temperature: 0.4,
    suggested_tools: ['tool/db_query', 'tool/web_search'],
  },
};
