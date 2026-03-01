export type AgentNodeCategory = 'trigger' | 'agent' | 'tool' | 'memory' | 'router' | 'ui' | 'output' | 'module';

export type AgentCanvasNodeType =
  // Triggers / Entry
  | 'trigger/webhook'
  | 'trigger/schedule'
  | 'trigger/manual'
  // Agents
  | 'agent/llm_worker'
  | 'agent/planner'
  | 'agent/reviewer'
  // Tools
  | 'tool/api_call'
  | 'tool/db_query'
  | 'tool/slack'
  | 'tool/email'
  | 'tool/web_search'
  | 'tool/file_operation'
  // Memory
  | 'memory/vector_store'
  | 'memory/conversation'
  | 'memory/long_term'
  // Router
  | 'router/conditional'
  | 'router/parallel'
  | 'router/loop'
  | 'router/error_handler'
  // UI / Human-in-the-loop
  | 'ui/approval'
  | 'ui/form_input'
  | 'ui/notification'
  // Output / End
  | 'output/response'
  // Module (subflow)
  | 'module/custom';

export type PortDataType = 'text' | 'json' | 'number' | 'boolean' | 'file' | 'vector' | 'any';

export const PORT_TYPE_COLORS: Record<PortDataType, string> = {
  text: 'hsl(var(--chart-1))',
  json: 'hsl(var(--chart-2))',
  number: 'hsl(var(--chart-3))',
  boolean: 'hsl(var(--chart-4))',
  file: 'hsl(var(--chart-5))',
  vector: 'hsl(var(--primary))',
  any: 'hsl(var(--muted-foreground))',
};

export interface AgentNodePort {
  key: string;
  type: string;
  required?: boolean;
  label?: string;
}

export interface AgentNodeConfigField {
  type: 'string' | 'textarea' | 'select' | 'number' | 'boolean' | 'string[]';
  label?: string;
  required?: boolean;
  default?: any;
  options?: { value: string; label: string }[];
  placeholder?: string;
  hint?: string;
}

export interface AgentCanvasNodeData {
  label: string;
  nodeType: AgentCanvasNodeType;
  icon: string;
  category: AgentNodeCategory;
  inputs: AgentNodePort[];
  outputs: AgentNodePort[];
  configSchema: Record<string, AgentNodeConfigField>;
  config: Record<string, any>;
  description?: string;
  permissions?: {
    scopes?: string[];
    requiresUserApproval?: boolean;
  };
  errorHandling?: {
    retryCount?: number;
    fallbackRoute?: string;
    stopOnError?: boolean;
  };
  tags?: string[];
  preset?: string;
}

export interface GlobalContext {
  envVars: { key: string; value: string }[];
  sharedContext: {
    company_id: string;
    user_id: string;
    environment: 'development' | 'staging' | 'production';
    default_llm: string;
    default_temperature: number;
  };
  authBindings: { tool: string; authType: string; configured: boolean }[];
}

export interface ModuleDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  nodeIds: string[];
  edgeIds: string[];
  inputs: AgentNodePort[];
  outputs: AgentNodePort[];
  createdAt: string;
}

export interface TestRunStep {
  nodeId: string;
  nodeLabel: string;
  status: 'pending' | 'running' | 'completed' | 'error' | 'skipped';
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  latencyMs: number;
  error?: string;
  toolCalls?: { name: string; args: Record<string, any>; result: any }[];
}

export interface TestRunResult {
  runId: string;
  status: 'completed' | 'failed' | 'running';
  steps: TestRunStep[];
  totalLatencyMs: number;
  nodesExecuted: number;
  totalToolCalls: number;
  startedAt: string;
  completedAt?: string;
}

export interface AgentNodePaletteItem {
  type: AgentCanvasNodeType;
  label: string;
  icon: string;
  category: AgentNodeCategory;
  description: string;
  inputs: AgentNodePort[];
  outputs: AgentNodePort[];
  configSchema: Record<string, AgentNodeConfigField>;
  tags?: string[];
}
