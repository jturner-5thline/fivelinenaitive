import type { NodePaletteItem } from './types';

export const NODE_REGISTRY: NodePaletteItem[] = [
  // ── Triggers ──
  {
    type: 'trigger/lender_event',
    label: 'Lender Event',
    icon: '🔔',
    category: 'trigger',
    description: 'Fires when a lender stage or status changes',
    inputs: [],
    outputs: [
      { key: 'deal_id', type: 'uuid' },
      { key: 'lender_id', type: 'uuid' },
      { key: 'lender_name', type: 'string' },
      { key: 'old_stage', type: 'string' },
      { key: 'new_stage', type: 'string' },
      { key: 'pass_reason', type: 'string' },
      { key: 'user_id', type: 'uuid' },
    ],
    configSchema: {
      event: {
        type: 'select',
        label: 'Event Type',
        required: true,
        options: [
          { value: 'stage_change', label: 'Stage Change' },
          { value: 'created', label: 'Lender Created' },
          { value: 'updated', label: 'Lender Updated' },
        ],
      },
    },
  },
  {
    type: 'trigger/deal_event',
    label: 'Deal Event',
    icon: '📋',
    category: 'trigger',
    description: 'Fires when a deal is created, updated, or changes stage',
    inputs: [],
    outputs: [
      { key: 'deal_id', type: 'uuid' },
      { key: 'deal_name', type: 'string' },
      { key: 'old_stage', type: 'string' },
      { key: 'new_stage', type: 'string' },
      { key: 'user_id', type: 'uuid' },
    ],
    configSchema: {
      event: {
        type: 'select',
        label: 'Event Type',
        required: true,
        options: [
          { value: 'stage_change', label: 'Stage Change' },
          { value: 'created', label: 'Deal Created' },
          { value: 'closed', label: 'Deal Closed' },
        ],
      },
    },
  },
  {
    type: 'trigger/schedule',
    label: 'Schedule',
    icon: '⏰',
    category: 'trigger',
    description: 'Runs on a recurring schedule',
    inputs: [],
    outputs: [
      { key: 'timestamp', type: 'string' },
    ],
    configSchema: {
      frequency: {
        type: 'select',
        label: 'Frequency',
        required: true,
        options: [
          { value: 'hourly', label: 'Every Hour' },
          { value: 'daily', label: 'Daily' },
          { value: 'weekly', label: 'Weekly' },
          { value: 'monthly', label: 'Monthly' },
        ],
      },
      time: { type: 'string', label: 'Time (HH:MM)', placeholder: '09:00' },
    },
  },
  {
    type: 'trigger/webhook',
    label: 'Webhook',
    icon: '🌐',
    category: 'trigger',
    description: 'Receives data from an external HTTP request',
    inputs: [],
    outputs: [
      { key: 'body', type: 'object' },
      { key: 'headers', type: 'object' },
    ],
    configSchema: {
      method: {
        type: 'select',
        label: 'HTTP Method',
        options: [
          { value: 'POST', label: 'POST' },
          { value: 'GET', label: 'GET' },
        ],
      },
    },
  },

  // ── Conditions ──
  {
    type: 'condition/equals',
    label: 'If / Else',
    icon: '🔀',
    category: 'condition',
    description: 'Routes flow based on a value comparison',
    inputs: [{ key: 'value', type: 'string', required: true }],
    outputs: [
      { key: 'true', type: 'boolean', label: 'Yes' },
      { key: 'false', type: 'boolean', label: 'No' },
    ],
    configSchema: {
      operator: {
        type: 'select',
        label: 'Operator',
        required: true,
        options: [
          { value: 'equals', label: 'Equals' },
          { value: 'not_equals', label: 'Not Equals' },
          { value: 'contains', label: 'Contains' },
          { value: 'greater_than', label: 'Greater Than' },
          { value: 'less_than', label: 'Less Than' },
        ],
      },
      compareTo: { type: 'string', label: 'Compare To', required: true, placeholder: 'Value...' },
    },
  },
  {
    type: 'condition/switch',
    label: 'Switch',
    icon: '🔀',
    category: 'condition',
    description: 'Routes to multiple branches based on value',
    inputs: [{ key: 'value', type: 'string', required: true }],
    outputs: [
      { key: 'case_1', type: 'any', label: 'Case 1' },
      { key: 'case_2', type: 'any', label: 'Case 2' },
      { key: 'default', type: 'any', label: 'Default' },
    ],
    configSchema: {
      case_1: { type: 'string', label: 'Case 1 Value', placeholder: 'Match value...' },
      case_2: { type: 'string', label: 'Case 2 Value', placeholder: 'Match value...' },
    },
  },

  // ── Data ──
  {
    type: 'data/lookup',
    label: 'Lookup Data',
    icon: '🔍',
    category: 'data',
    description: 'Fetch additional data from a database table',
    inputs: [{ key: 'id', type: 'uuid', required: true }],
    outputs: [
      { key: 'result', type: 'object' },
    ],
    configSchema: {
      table: {
        type: 'select',
        label: 'Table',
        required: true,
        options: [
          { value: 'deals', label: 'Deals' },
          { value: 'deal_lenders', label: 'Lenders' },
          { value: 'profiles', label: 'Profiles' },
        ],
      },
      fields: { type: 'string', label: 'Fields (comma-separated)', placeholder: 'company, value, stage' },
    },
  },
  {
    type: 'data/template',
    label: 'Format Message',
    icon: '✏️',
    category: 'data',
    description: 'Build a formatted text message using variables',
    inputs: [
      { key: 'variables', type: 'object', required: true },
    ],
    outputs: [
      { key: 'message', type: 'string' },
    ],
    configSchema: {
      template: {
        type: 'textarea',
        label: 'Template',
        required: true,
        placeholder: '{{lender_name}} passed on {{deal_name}}. Reason: {{pass_reason}}',
      },
    },
  },
  {
    type: 'data/transform',
    label: 'Transform Data',
    icon: '🔄',
    category: 'data',
    description: 'Map, filter, or reshape data',
    inputs: [{ key: 'input', type: 'any', required: true }],
    outputs: [{ key: 'output', type: 'any' }],
    configSchema: {
      expression: { type: 'textarea', label: 'Transform Expression', placeholder: 'data.map(d => d.name)' },
    },
  },

  // ── Integrations ──
  {
    type: 'integration/slack',
    label: 'Send Slack Message',
    icon: '💬',
    category: 'integration',
    description: 'Post a message to a Slack channel',
    inputs: [{ key: 'message', type: 'string', required: true }],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'error', type: 'string' },
    ],
    configSchema: {
      channel: { type: 'string', label: 'Channel', required: true, placeholder: '#general' },
      username: { type: 'string', label: 'Bot Name', default: '5thLine Bot' },
    },
  },
  {
    type: 'integration/email',
    label: 'Send Email',
    icon: '📧',
    category: 'integration',
    description: 'Send an email notification',
    inputs: [{ key: 'body', type: 'string', required: true }],
    outputs: [{ key: 'success', type: 'boolean' }],
    configSchema: {
      to: { type: 'string', label: 'To', required: true, placeholder: 'email@example.com' },
      subject: { type: 'string', label: 'Subject', required: true },
    },
  },
  {
    type: 'integration/webhook',
    label: 'HTTP Request',
    icon: '🔗',
    category: 'integration',
    description: 'Make an HTTP request to an external URL',
    inputs: [{ key: 'body', type: 'object' }],
    outputs: [
      { key: 'response', type: 'object' },
      { key: 'status', type: 'number' },
    ],
    configSchema: {
      url: { type: 'string', label: 'URL', required: true, placeholder: 'https://...' },
      method: {
        type: 'select',
        label: 'Method',
        options: [
          { value: 'GET', label: 'GET' },
          { value: 'POST', label: 'POST' },
          { value: 'PUT', label: 'PUT' },
        ],
      },
    },
  },
  {
    type: 'integration/database_insert',
    label: 'Log to Database',
    icon: '📝',
    category: 'integration',
    description: 'Insert a record into a database table',
    inputs: [{ key: 'data', type: 'object', required: true }],
    outputs: [{ key: 'success', type: 'boolean' }],
    configSchema: {
      table: {
        type: 'select',
        label: 'Table',
        required: true,
        options: [
          { value: 'activity_logs', label: 'Activity Logs' },
          { value: 'deal_flag_notes', label: 'Deal Flag Notes' },
        ],
      },
      activity_type: { type: 'string', label: 'Activity Type', placeholder: 'lender_passed' },
    },
  },
  {
    type: 'integration/notification',
    label: 'In-App Notification',
    icon: '🔔',
    category: 'integration',
    description: 'Send an in-app notification to a user',
    inputs: [{ key: 'message', type: 'string', required: true }],
    outputs: [{ key: 'success', type: 'boolean' }],
    configSchema: {
      title: { type: 'string', label: 'Title', required: true },
      priority: {
        type: 'select',
        label: 'Priority',
        options: [
          { value: 'low', label: 'Low' },
          { value: 'normal', label: 'Normal' },
          { value: 'high', label: 'High' },
        ],
      },
    },
  },

  // ── Utility ──
  {
    type: 'utility/delay',
    label: 'Delay',
    icon: '⏳',
    category: 'utility',
    description: 'Wait for a specified duration before continuing',
    inputs: [{ key: 'trigger', type: 'any', required: true }],
    outputs: [{ key: 'continue', type: 'any' }],
    configSchema: {
      amount: { type: 'number', label: 'Duration', required: true },
      unit: {
        type: 'select',
        label: 'Unit',
        options: [
          { value: 'seconds', label: 'Seconds' },
          { value: 'minutes', label: 'Minutes' },
          { value: 'hours', label: 'Hours' },
        ],
      },
    },
  },
  {
    type: 'utility/retry',
    label: 'Retry on Error',
    icon: '🔁',
    category: 'utility',
    description: 'Retry a failed step with exponential backoff',
    inputs: [{ key: 'trigger', type: 'any', required: true }],
    outputs: [
      { key: 'success', type: 'any' },
      { key: 'exhausted', type: 'any' },
    ],
    configSchema: {
      maxRetries: { type: 'number', label: 'Max Retries', default: 3 },
      backoffMs: { type: 'number', label: 'Initial Backoff (ms)', default: 1000 },
    },
  },
];

export const NODE_CATEGORIES = [
  { key: 'trigger', label: 'Triggers', color: 'hsl(var(--chart-1))' },
  { key: 'condition', label: 'Conditions', color: 'hsl(var(--chart-3))' },
  { key: 'data', label: 'Data', color: 'hsl(var(--chart-2))' },
  { key: 'integration', label: 'Integrations', color: 'hsl(var(--chart-4))' },
  { key: 'utility', label: 'Utility', color: 'hsl(var(--chart-5))' },
] as const;
