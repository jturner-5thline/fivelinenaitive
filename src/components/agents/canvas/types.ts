export type AgentNodeCategory = 'agent' | 'tool' | 'memory' | 'router' | 'ui';

export type AgentCanvasNodeType =
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
  | 'ui/notification';

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
}
