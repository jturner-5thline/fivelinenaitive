import type { AgentNodePaletteItem } from './types';

export const AGENT_NODE_REGISTRY: AgentNodePaletteItem[] = [
  // ── Agents ──
  {
    type: 'agent/llm_worker',
    label: 'LLM Agent',
    icon: '🤖',
    category: 'agent',
    description: 'An LLM-backed worker that processes instructions and produces output',
    inputs: [{ key: 'context', type: 'any', label: 'Context' }],
    outputs: [
      { key: 'response', type: 'string', label: 'Response' },
      { key: 'tool_calls', type: 'object', label: 'Tool Calls' },
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
    },
  },
  {
    type: 'agent/planner',
    label: 'Planner Agent',
    icon: '🧠',
    category: 'agent',
    description: 'Decomposes a complex task into sub-tasks and delegates to other agents',
    inputs: [{ key: 'goal', type: 'string', required: true, label: 'Goal' }],
    outputs: [
      { key: 'plan', type: 'object', label: 'Plan' },
      { key: 'subtasks', type: 'object[]', label: 'Sub-tasks' },
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
      max_subtasks: {
        type: 'number',
        label: 'Max Sub-tasks',
        default: 5,
      },
    },
  },
  {
    type: 'agent/reviewer',
    label: 'Reviewer Agent',
    icon: '🔍',
    category: 'agent',
    description: 'Reviews and validates output from other agents before proceeding',
    inputs: [
      { key: 'content', type: 'string', required: true, label: 'Content to Review' },
      { key: 'criteria', type: 'string', label: 'Criteria' },
    ],
    outputs: [
      { key: 'approved', type: 'boolean', label: 'Approved' },
      { key: 'feedback', type: 'string', label: 'Feedback' },
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
  },

  // ── Tools ──
  {
    type: 'tool/api_call',
    label: 'API Call',
    icon: '🔗',
    category: 'tool',
    description: 'Make an HTTP request to an external API',
    inputs: [{ key: 'params', type: 'object', label: 'Parameters' }],
    outputs: [
      { key: 'response', type: 'object', label: 'Response' },
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
  },
  {
    type: 'tool/db_query',
    label: 'Database Query',
    icon: '🗄️',
    category: 'tool',
    description: 'Query the database for contextual data',
    inputs: [{ key: 'filter', type: 'object', label: 'Filter' }],
    outputs: [{ key: 'results', type: 'object[]', label: 'Results' }],
    configSchema: {
      table: {
        type: 'select',
        label: 'Table',
        required: true,
        options: [
          { value: 'deals', label: 'Deals' },
          { value: 'deal_lenders', label: 'Lenders' },
          { value: 'profiles', label: 'Profiles' },
          { value: 'activity_logs', label: 'Activity Logs' },
          { value: 'deal_milestones', label: 'Milestones' },
        ],
      },
      fields: { type: 'string', label: 'Fields', placeholder: 'company, value, stage' },
      limit: { type: 'number', label: 'Max Results', default: 10 },
    },
  },
  {
    type: 'tool/slack',
    label: 'Slack Message',
    icon: '💬',
    category: 'tool',
    description: 'Send a message to a Slack channel',
    inputs: [{ key: 'message', type: 'string', required: true, label: 'Message' }],
    outputs: [{ key: 'success', type: 'boolean' }],
    configSchema: {
      channel: { type: 'string', label: 'Channel', required: true, placeholder: '#general' },
    },
  },
  {
    type: 'tool/email',
    label: 'Send Email',
    icon: '📧',
    category: 'tool',
    description: 'Send an email notification',
    inputs: [{ key: 'body', type: 'string', required: true, label: 'Body' }],
    outputs: [{ key: 'success', type: 'boolean' }],
    configSchema: {
      to: { type: 'string', label: 'To', required: true, placeholder: 'user@example.com' },
      subject: { type: 'string', label: 'Subject', required: true },
    },
  },
  {
    type: 'tool/web_search',
    label: 'Web Search',
    icon: '🌐',
    category: 'tool',
    description: 'Search the web for real-time information',
    inputs: [{ key: 'query', type: 'string', required: true, label: 'Query' }],
    outputs: [{ key: 'results', type: 'object[]', label: 'Results' }],
    configSchema: {
      max_results: { type: 'number', label: 'Max Results', default: 5 },
    },
  },
  {
    type: 'tool/file_operation',
    label: 'File Operation',
    icon: '📁',
    category: 'tool',
    description: 'Read, write, or process files',
    inputs: [{ key: 'file', type: 'any', required: true, label: 'File' }],
    outputs: [{ key: 'content', type: 'string', label: 'Content' }],
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
  },

  // ── Memory ──
  {
    type: 'memory/vector_store',
    label: 'Vector Search',
    icon: '🧲',
    category: 'memory',
    description: 'Search a vector store for semantically similar content (RAG)',
    inputs: [{ key: 'query', type: 'string', required: true, label: 'Query' }],
    outputs: [{ key: 'matches', type: 'object[]', label: 'Matches' }],
    configSchema: {
      collection: { type: 'string', label: 'Collection', required: true, placeholder: 'deal_documents' },
      top_k: { type: 'number', label: 'Top K', default: 5 },
      threshold: { type: 'number', label: 'Similarity Threshold', default: 0.7 },
    },
  },
  {
    type: 'memory/conversation',
    label: 'Conversation Memory',
    icon: '💭',
    category: 'memory',
    description: 'Persist and retrieve conversation history for context',
    inputs: [{ key: 'message', type: 'string', label: 'New Message' }],
    outputs: [{ key: 'history', type: 'object[]', label: 'History' }],
    configSchema: {
      max_messages: { type: 'number', label: 'Max Messages', default: 20 },
      summary_after: { type: 'number', label: 'Summarize After', default: 50, hint: 'Auto-summarize after N messages' },
    },
  },
  {
    type: 'memory/long_term',
    label: 'Long-Term Memory',
    icon: '🧠',
    category: 'memory',
    description: 'Store and recall key facts, preferences, and learned patterns',
    inputs: [{ key: 'fact', type: 'string', label: 'Fact to Store' }],
    outputs: [{ key: 'recalled', type: 'object[]', label: 'Recalled Facts' }],
    configSchema: {
      namespace: { type: 'string', label: 'Namespace', placeholder: 'user_preferences', hint: 'Isolate memories by category' },
    },
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
      { key: 'merged', type: 'object', label: 'Merged' },
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
  },
  {
    type: 'router/loop',
    label: 'Loop',
    icon: '🔁',
    category: 'router',
    description: 'Repeat a sequence until a condition is met or max iterations reached',
    inputs: [{ key: 'items', type: 'any[]', required: true, label: 'Items' }],
    outputs: [
      { key: 'current', type: 'any', label: 'Current Item' },
      { key: 'done', type: 'any', label: 'Complete' },
    ],
    configSchema: {
      max_iterations: { type: 'number', label: 'Max Iterations', default: 10 },
      exit_condition: { type: 'string', label: 'Exit When', placeholder: 'result.approved === true' },
    },
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
  },
  {
    type: 'ui/form_input',
    label: 'User Form',
    icon: '📝',
    category: 'ui',
    description: 'Present a form to collect structured input from a user',
    inputs: [{ key: 'trigger', type: 'any', label: 'Trigger' }],
    outputs: [{ key: 'form_data', type: 'object', label: 'Form Data' }],
    configSchema: {
      form_title: { type: 'string', label: 'Form Title', required: true },
      fields_json: { type: 'textarea', label: 'Fields (JSON)', placeholder: '[{"name": "reason", "type": "text", "required": true}]' },
    },
  },
  {
    type: 'ui/notification',
    label: 'User Notification',
    icon: '🔔',
    category: 'ui',
    description: 'Send a notification or status update to the user',
    inputs: [{ key: 'message', type: 'string', required: true, label: 'Message' }],
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
  },
];

export const AGENT_NODE_CATEGORIES = [
  { key: 'agent', label: 'Agents', color: 'hsl(var(--chart-4))' },
  { key: 'tool', label: 'Tools', color: 'hsl(var(--chart-1))' },
  { key: 'memory', label: 'Memory', color: 'hsl(var(--chart-2))' },
  { key: 'router', label: 'Routers', color: 'hsl(var(--chart-3))' },
  { key: 'ui', label: 'Human', color: 'hsl(var(--chart-5))' },
] as const;
