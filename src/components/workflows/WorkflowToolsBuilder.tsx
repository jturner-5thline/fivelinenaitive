import { useState } from 'react';
import { 
  Zap, 
  Bell, 
  Mail, 
  Webhook, 
  Clock, 
  GitBranch, 
  Plus, 
  Trash2, 
  Settings, 
  ArrowRight,
  Bot,
  Database,
  MessageSquare,
  CheckCircle2,
  Filter,
  Timer,
  Users,
  Link2,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export type WorkflowNodeType = 
  // Triggers
  | 'trigger_deal_stage' 
  | 'trigger_lender_stage' 
  | 'trigger_new_deal' 
  | 'trigger_deal_closed' 
  | 'trigger_scheduled'
  | 'trigger_webhook'
  // Actions
  | 'action_notification' 
  | 'action_email' 
  | 'action_webhook' 
  | 'action_update_field'
  | 'action_ai_agent'
  | 'action_delay'
  // Logic
  | 'logic_condition' 
  | 'logic_filter'
  | 'logic_approval';

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  name: string;
  enabled: boolean;
  config: Record<string, any>;
}

interface WorkflowToolsBuilderProps {
  nodes: WorkflowNode[];
  onNodesChange: (nodes: WorkflowNode[]) => void;
}

interface ToolCategory {
  name: string;
  icon: React.ReactNode;
  tools: {
    type: WorkflowNodeType;
    name: string;
    description: string;
    icon: React.ReactNode;
  }[];
}

const TOOL_CATEGORIES: ToolCategory[] = [
  {
    name: 'Triggers',
    icon: <Zap className="h-4 w-4" />,
    tools: [
      { type: 'trigger_deal_stage', name: 'Deal Stage Change', description: 'When deal moves stages', icon: <Zap className="h-4 w-4" /> },
      { type: 'trigger_lender_stage', name: 'Lender Stage Change', description: 'When lender status changes', icon: <Zap className="h-4 w-4" /> },
      { type: 'trigger_new_deal', name: 'New Deal', description: 'When deal is created', icon: <Plus className="h-4 w-4" /> },
      { type: 'trigger_deal_closed', name: 'Deal Closed', description: 'When deal is won/lost', icon: <CheckCircle2 className="h-4 w-4" /> },
      { type: 'trigger_scheduled', name: 'Schedule', description: 'Run on a schedule', icon: <Clock className="h-4 w-4" /> },
      { type: 'trigger_webhook', name: 'Webhook Trigger', description: 'Receive external webhook', icon: <Webhook className="h-4 w-4" /> },
    ],
  },
  {
    name: 'Actions',
    icon: <Bell className="h-4 w-4" />,
    tools: [
      { type: 'action_notification', name: 'Send Notification', description: 'In-app notification', icon: <Bell className="h-4 w-4" /> },
      { type: 'action_email', name: 'Send Email', description: 'Email notification', icon: <Mail className="h-4 w-4" /> },
      { type: 'action_webhook', name: 'Call Webhook', description: 'POST to external URL', icon: <Webhook className="h-4 w-4" /> },
      { type: 'action_update_field', name: 'Update Field', description: 'Modify deal/lender data', icon: <Database className="h-4 w-4" /> },
      { type: 'action_ai_agent', name: 'AI Agent', description: 'Run an AI agent', icon: <Bot className="h-4 w-4" /> },
      { type: 'action_delay', name: 'Delay', description: 'Wait before next action', icon: <Timer className="h-4 w-4" /> },
    ],
  },
  {
    name: 'Logic',
    icon: <GitBranch className="h-4 w-4" />,
    tools: [
      { type: 'logic_condition', name: 'Condition', description: 'If/then branching', icon: <GitBranch className="h-4 w-4" /> },
      { type: 'logic_filter', name: 'Filter', description: 'Filter matching records', icon: <Filter className="h-4 w-4" /> },
      { type: 'logic_approval', name: 'Human Approval', description: 'Wait for approval', icon: <Users className="h-4 w-4" /> },
    ],
  },
];

export function WorkflowToolsBuilder({ nodes, onNodesChange }: WorkflowToolsBuilderProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  const addNode = (type: WorkflowNodeType, name: string) => {
    const newNode: WorkflowNode = {
      id: `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      name,
      enabled: true,
      config: {},
    };
    onNodesChange([...nodes, newNode]);
    setSelectedNodeId(newNode.id);
  };

  const removeNode = (id: string) => {
    onNodesChange(nodes.filter(n => n.id !== id));
    if (selectedNodeId === id) setSelectedNodeId(null);
  };

  const updateNode = (id: string, updates: Partial<WorkflowNode>) => {
    onNodesChange(nodes.map(n => n.id === id ? { ...n, ...updates } : n));
  };

  const toggleNode = (id: string) => {
    const node = nodes.find(n => n.id === id);
    if (node) {
      updateNode(id, { enabled: !node.enabled });
    }
  };

  const getNodeIcon = (type: WorkflowNodeType) => {
    for (const category of TOOL_CATEGORIES) {
      const tool = category.tools.find(t => t.type === type);
      if (tool) return tool.icon;
    }
    return <Zap className="h-4 w-4" />;
  };

  const getNodeColor = (type: WorkflowNodeType) => {
    if (type.startsWith('trigger_')) return 'bg-blue-500/10 border-blue-500/30 text-blue-600';
    if (type.startsWith('action_')) return 'bg-green-500/10 border-green-500/30 text-green-600';
    if (type.startsWith('logic_')) return 'bg-purple-500/10 border-purple-500/30 text-purple-600';
    return 'bg-muted';
  };

  const filteredCategories = TOOL_CATEGORIES.map(category => ({
    ...category,
    tools: category.tools.filter(tool =>
      tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.description.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter(category => category.tools.length > 0);

  const renderNodeConfig = () => {
    if (!selectedNode) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4">
          <Settings className="h-8 w-8 mb-2 opacity-50" />
          <p className="text-sm">Select a node to configure</p>
        </div>
      );
    }

    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-sm">{selectedNode.name}</h3>
          <Switch
            checked={selectedNode.enabled}
            onCheckedChange={() => toggleNode(selectedNode.id)}
          />
        </div>

        {/* Common config for triggers */}
        {selectedNode.type === 'trigger_deal_stage' && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">From Stage</Label>
              <Input
                placeholder="Any"
                value={selectedNode.config.fromStage || ''}
                onChange={(e) => updateNode(selectedNode.id, {
                  config: { ...selectedNode.config, fromStage: e.target.value }
                })}
              />
            </div>
            <div>
              <Label className="text-xs">To Stage</Label>
              <Input
                placeholder="Any"
                value={selectedNode.config.toStage || ''}
                onChange={(e) => updateNode(selectedNode.id, {
                  config: { ...selectedNode.config, toStage: e.target.value }
                })}
              />
            </div>
          </div>
        )}

        {selectedNode.type === 'trigger_scheduled' && (
          <div>
            <Label className="text-xs">Schedule</Label>
            <Select
              value={selectedNode.config.schedule || 'daily'}
              onValueChange={(v) => updateNode(selectedNode.id, {
                config: { ...selectedNode.config, schedule: v }
              })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {selectedNode.type === 'action_notification' && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Title</Label>
              <Input
                placeholder="Notification title"
                value={selectedNode.config.title || ''}
                onChange={(e) => updateNode(selectedNode.id, {
                  config: { ...selectedNode.config, title: e.target.value }
                })}
              />
            </div>
            <div>
              <Label className="text-xs">Message</Label>
              <Textarea
                placeholder="Notification message"
                value={selectedNode.config.message || ''}
                onChange={(e) => updateNode(selectedNode.id, {
                  config: { ...selectedNode.config, message: e.target.value }
                })}
              />
            </div>
          </div>
        )}

        {selectedNode.type === 'action_email' && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Subject</Label>
              <Input
                placeholder="Email subject"
                value={selectedNode.config.subject || ''}
                onChange={(e) => updateNode(selectedNode.id, {
                  config: { ...selectedNode.config, subject: e.target.value }
                })}
              />
            </div>
            <div>
              <Label className="text-xs">Body</Label>
              <Textarea
                placeholder="Email body"
                value={selectedNode.config.body || ''}
                onChange={(e) => updateNode(selectedNode.id, {
                  config: { ...selectedNode.config, body: e.target.value }
                })}
              />
            </div>
          </div>
        )}

        {selectedNode.type === 'action_webhook' && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Webhook URL</Label>
              <Input
                placeholder="https://hooks.zapier.com/..."
                value={selectedNode.config.url || ''}
                onChange={(e) => updateNode(selectedNode.id, {
                  config: { ...selectedNode.config, url: e.target.value }
                })}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Data will be POSTed to this URL
            </p>
          </div>
        )}

        {selectedNode.type === 'action_delay' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="text-xs">Amount</Label>
                <Input
                  type="number"
                  min={1}
                  value={selectedNode.config.amount || 1}
                  onChange={(e) => updateNode(selectedNode.id, {
                    config: { ...selectedNode.config, amount: parseInt(e.target.value) || 1 }
                  })}
                />
              </div>
              <div className="flex-1">
                <Label className="text-xs">Unit</Label>
                <Select
                  value={selectedNode.config.unit || 'hours'}
                  onValueChange={(v) => updateNode(selectedNode.id, {
                    config: { ...selectedNode.config, unit: v }
                  })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutes">Minutes</SelectItem>
                    <SelectItem value="hours">Hours</SelectItem>
                    <SelectItem value="days">Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {selectedNode.type === 'logic_condition' && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Field</Label>
              <Select
                value={selectedNode.config.field || 'deal_value'}
                onValueChange={(v) => updateNode(selectedNode.id, {
                  config: { ...selectedNode.config, field: v }
                })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deal_value">Deal Value</SelectItem>
                  <SelectItem value="deal_stage">Deal Stage</SelectItem>
                  <SelectItem value="lender_count">Lender Count</SelectItem>
                  <SelectItem value="deal_type">Deal Type</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Operator</Label>
              <Select
                value={selectedNode.config.operator || 'equals'}
                onValueChange={(v) => updateNode(selectedNode.id, {
                  config: { ...selectedNode.config, operator: v }
                })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="equals">Equals</SelectItem>
                  <SelectItem value="not_equals">Not Equals</SelectItem>
                  <SelectItem value="greater_than">Greater Than</SelectItem>
                  <SelectItem value="less_than">Less Than</SelectItem>
                  <SelectItem value="contains">Contains</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Value</Label>
              <Input
                placeholder="Value to compare"
                value={selectedNode.config.value || ''}
                onChange={(e) => updateNode(selectedNode.id, {
                  config: { ...selectedNode.config, value: e.target.value }
                })}
              />
            </div>
          </div>
        )}

        {selectedNode.type === 'action_ai_agent' && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Agent</Label>
              <Select
                value={selectedNode.config.agentId || ''}
                onValueChange={(v) => updateNode(selectedNode.id, {
                  config: { ...selectedNode.config, agentId: v }
                })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an agent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Select agent...</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Run an AI agent to analyze or process the data
            </p>
          </div>
        )}

        {selectedNode.type === 'logic_approval' && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Approver</Label>
              <Input
                placeholder="Email or role"
                value={selectedNode.config.approver || ''}
                onChange={(e) => updateNode(selectedNode.id, {
                  config: { ...selectedNode.config, approver: e.target.value }
                })}
              />
            </div>
            <div>
              <Label className="text-xs">Message</Label>
              <Textarea
                placeholder="Approval request message"
                value={selectedNode.config.message || ''}
                onChange={(e) => updateNode(selectedNode.id, {
                  config: { ...selectedNode.config, message: e.target.value }
                })}
              />
            </div>
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="w-full text-destructive hover:text-destructive"
          onClick={() => removeNode(selectedNode.id)}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Remove Node
        </Button>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-12 gap-4 min-h-[400px]">
      {/* Tool Palette */}
      <div className="col-span-3 border rounded-lg bg-muted/30">
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search nodes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        </div>
        <ScrollArea className="h-[350px]">
          <div className="p-2 space-y-4">
            {filteredCategories.map((category) => (
              <div key={category.name}>
                <div className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-muted-foreground">
                  {category.icon}
                  {category.name}
                </div>
                <div className="space-y-1">
                  {category.tools.map((tool) => (
                    <button
                      key={tool.type}
                      onClick={() => addNode(tool.type, tool.name)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-left text-sm rounded-md hover:bg-muted transition-colors"
                    >
                      <span className="text-muted-foreground">{tool.icon}</span>
                      <span className="truncate">{tool.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Workflow Canvas */}
      <div className="col-span-6 border rounded-lg bg-muted/10 p-4">
        <div className="text-xs font-medium text-muted-foreground mb-3">Workflow Flow</div>
        {nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[320px] text-center text-muted-foreground">
            <Plus className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">Add nodes from the palette</p>
            <p className="text-xs">Start with a trigger, then add actions</p>
          </div>
        ) : (
          <ScrollArea className="h-[320px]">
            <div className="space-y-2">
              {nodes.map((node, index) => (
                <div key={node.id}>
                  <div
                    onClick={() => setSelectedNodeId(node.id)}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                      getNodeColor(node.type),
                      selectedNodeId === node.id && "ring-2 ring-primary",
                      !node.enabled && "opacity-50"
                    )}
                  >
                    <div className="flex-shrink-0">
                      {getNodeIcon(node.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{node.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {node.type.replace(/_/g, ' ')}
                      </p>
                    </div>
                    <Switch
                      checked={node.enabled}
                      onCheckedChange={() => toggleNode(node.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  {index < nodes.length - 1 && (
                    <div className="flex justify-center py-1">
                      <ArrowRight className="h-4 w-4 text-muted-foreground rotate-90" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Configuration Panel */}
      <div className="col-span-3 border rounded-lg bg-muted/30">
        <div className="p-3 border-b">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Settings className="h-4 w-4" />
            Configuration
          </div>
        </div>
        <ScrollArea className="h-[350px]">
          {renderNodeConfig()}
        </ScrollArea>
      </div>
    </div>
  );
}
