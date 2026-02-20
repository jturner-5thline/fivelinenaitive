export type CanvasNodeType =
  | 'trigger/lender_event'
  | 'trigger/deal_event'
  | 'trigger/schedule'
  | 'trigger/webhook'
  | 'condition/equals'
  | 'condition/switch'
  | 'data/lookup'
  | 'data/template'
  | 'data/transform'
  | 'integration/slack'
  | 'integration/email'
  | 'integration/webhook'
  | 'integration/database_insert'
  | 'integration/notification'
  | 'utility/delay'
  | 'utility/retry';

export interface NodePort {
  key: string;
  type: string;
  required?: boolean;
  label?: string;
}

export interface NodeConfigField {
  type: 'string' | 'textarea' | 'select' | 'number' | 'boolean' | 'slack_channel_picker' | 'string[]';
  label?: string;
  required?: boolean;
  default?: any;
  options?: { value: string; label: string }[];
  placeholder?: string;
}

export interface CanvasNodeData {
  label: string;
  nodeType: CanvasNodeType;
  icon: string;
  category: 'trigger' | 'condition' | 'data' | 'integration' | 'utility';
  inputs: NodePort[];
  outputs: NodePort[];
  configSchema: Record<string, NodeConfigField>;
  config: Record<string, any>;
  description?: string;
}

export interface NodePaletteItem {
  type: CanvasNodeType;
  label: string;
  icon: string;
  category: CanvasNodeData['category'];
  description: string;
  inputs: NodePort[];
  outputs: NodePort[];
  configSchema: Record<string, NodeConfigField>;
}
