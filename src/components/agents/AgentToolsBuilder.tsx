import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Plus,
  X,
  ChevronRight,
  Database,
  Building2,
  Search,
  Globe,
  MessageSquare,
  Mail,
  Webhook,
  BrainCircuit,
  Clock,
  GitBranch,
  Zap,
  Settings,
  Grip,
  Check,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AgentTool {
  id: string;
  type: string;
  name: string;
  enabled: boolean;
  config: Record<string, any>;
}

export interface AgentToolsBuilderProps {
  tools: AgentTool[];
  onToolsChange: (tools: AgentTool[]) => void;
}

// Available tool definitions
const AVAILABLE_TOOLS = [
  {
    type: 'data_source',
    category: 'Data Sources',
    items: [
      { id: 'deals', name: 'Deal Data', icon: Database, description: 'Access deal details, values, and stages', color: 'bg-blue-500' },
      { id: 'lenders', name: 'Lender Data', icon: Building2, description: 'Access lender information and status', color: 'bg-green-500' },
      { id: 'activities', name: 'Activity Logs', icon: Clock, description: 'Access recent activities and history', color: 'bg-yellow-500' },
      { id: 'milestones', name: 'Milestones', icon: Check, description: 'Access milestone tracking data', color: 'bg-purple-500' },
    ],
  },
  {
    type: 'ai_model',
    category: 'AI Models',
    items: [
      { id: 'gemini_flash', name: 'Gemini Flash', icon: BrainCircuit, description: 'Fast, balanced AI model for most tasks', color: 'bg-cyan-500' },
      { id: 'gemini_pro', name: 'Gemini Pro', icon: BrainCircuit, description: 'Advanced reasoning and complex tasks', color: 'bg-indigo-500' },
      { id: 'gpt5', name: 'GPT-5', icon: BrainCircuit, description: 'Powerful reasoning with high accuracy', color: 'bg-emerald-500' },
    ],
  },
  {
    type: 'capability',
    category: 'Capabilities',
    items: [
      { id: 'web_search', name: 'Web Search', icon: Search, description: 'Search the internet for information', color: 'bg-orange-500' },
      { id: 'memory', name: 'Memory', icon: Database, description: 'Remember context across conversations', color: 'bg-pink-500' },
      { id: 'code_execution', name: 'Code Execution', icon: Zap, description: 'Execute code and calculations', color: 'bg-red-500' },
    ],
  },
  {
    type: 'integration',
    category: 'Integrations',
    items: [
      { id: 'slack', name: 'Slack', icon: MessageSquare, description: 'Send messages and approvals via Slack', color: 'bg-[#4A154B]' },
      { id: 'email', name: 'Email', icon: Mail, description: 'Send and receive emails', color: 'bg-blue-600' },
      { id: 'hubspot', name: 'HubSpot', icon: Globe, description: 'Sync with HubSpot CRM', color: 'bg-[#FF7A59]' },
      { id: 'webhook', name: 'Webhook', icon: Webhook, description: 'Connect to external APIs', color: 'bg-gray-600' },
    ],
  },
  {
    type: 'logic',
    category: 'Logic & Flow',
    items: [
      { id: 'condition', name: 'Condition', icon: GitBranch, description: 'Add conditional logic branches', color: 'bg-amber-500' },
      { id: 'loop', name: 'Loop', icon: Clock, description: 'Iterate over data sets', color: 'bg-teal-500' },
      { id: 'approval', name: 'Human Approval', icon: AlertCircle, description: 'Require human approval before proceeding', color: 'bg-rose-500' },
    ],
  },
];

// Get all tool items flattened
const ALL_TOOL_ITEMS = AVAILABLE_TOOLS.flatMap((cat) =>
  cat.items.map((item) => ({ ...item, category: cat.category, categoryType: cat.type }))
);

export function AgentToolsBuilder({ tools, onToolsChange }: AgentToolsBuilderProps) {
  const [selectedTool, setSelectedTool] = useState<AgentTool | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const addTool = (toolDef: { id: string; name: string }) => {
    const newTool: AgentTool = {
      id: `${toolDef.id}_${Date.now()}`,
      type: toolDef.id,
      name: toolDef.name,
      enabled: true,
      config: {},
    };
    onToolsChange([...tools, newTool]);
    setSelectedTool(newTool);
  };

  const removeTool = (toolId: string) => {
    onToolsChange(tools.filter((t) => t.id !== toolId));
    if (selectedTool?.id === toolId) {
      setSelectedTool(null);
    }
  };

  const toggleTool = (toolId: string) => {
    onToolsChange(
      tools.map((t) =>
        t.id === toolId ? { ...t, enabled: !t.enabled } : t
      )
    );
  };

  const updateToolConfig = (toolId: string, config: Record<string, any>) => {
    const updated = tools.map((t) =>
      t.id === toolId ? { ...t, config: { ...t.config, ...config } } : t
    );
    onToolsChange(updated);
    const updatedTool = updated.find((t) => t.id === toolId);
    if (updatedTool) setSelectedTool(updatedTool);
  };

  const getToolDef = (type: string) => ALL_TOOL_ITEMS.find((t) => t.id === type);

  const filteredCategories = AVAILABLE_TOOLS.map((cat) => ({
    ...cat,
    items: cat.items.filter(
      (item) =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter((cat) => cat.items.length > 0);

  return (
    <div className="flex gap-4 h-[500px]">
      {/* Left Panel - Tool Palette */}
      <Card className="w-64 flex-shrink-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Add Tools</CardTitle>
          <Input
            placeholder="Search tools..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 text-sm"
          />
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[400px]">
            <div className="p-3 space-y-4">
              {filteredCategories.map((category) => (
                <div key={category.type}>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    {category.category}
                  </p>
                  <div className="space-y-1">
                    {category.items.map((item) => {
                      const Icon = item.icon;
                      const isAdded = tools.some((t) => t.type === item.id);
                      return (
                        <Button
                          key={item.id}
                          variant="ghost"
                          size="sm"
                          className={cn(
                            'w-full justify-start gap-2 h-auto py-2',
                            isAdded && 'opacity-50'
                          )}
                          onClick={() => addTool(item)}
                          disabled={isAdded}
                        >
                          <div className={cn('w-6 h-6 rounded flex items-center justify-center', item.color)}>
                            <Icon className="h-3.5 w-3.5 text-white" />
                          </div>
                          <span className="text-sm truncate">{item.name}</span>
                          {isAdded && <Check className="h-3 w-3 ml-auto text-muted-foreground" />}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Center Panel - Workflow Canvas */}
      <Card className="flex-1">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Agent Workflow
          </CardTitle>
          <CardDescription className="text-xs">
            Configure your agent's tools and flow
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3">
          <ScrollArea className="h-[420px]">
            {tools.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                  <Plus className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">No tools added yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Select tools from the left panel to build your agent
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {tools.map((tool, index) => {
                  const toolDef = getToolDef(tool.type);
                  if (!toolDef) return null;
                  const Icon = toolDef.icon;
                  return (
                    <div key={tool.id}>
                      <div
                        className={cn(
                          'group flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all',
                          selectedTool?.id === tool.id
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50',
                          !tool.enabled && 'opacity-50'
                        )}
                        onClick={() => setSelectedTool(tool)}
                      >
                        <Grip className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-grab" />
                        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', toolDef.color)}>
                          <Icon className="h-4 w-4 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{tool.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {toolDef.description}
                          </p>
                        </div>
                        <Switch
                          checked={tool.enabled}
                          onCheckedChange={() => toggleTool(tool.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeTool(tool.id);
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      {index < tools.length - 1 && (
                        <div className="flex justify-center py-1">
                          <ChevronRight className="h-4 w-4 text-muted-foreground rotate-90" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Right Panel - Tool Configuration */}
      <Card className="w-72 flex-shrink-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3">
      {selectedTool && getToolDef(selectedTool.type) ? (
        <ToolConfigPanel
          tool={selectedTool}
          toolDef={getToolDef(selectedTool.type)!}
          onConfigChange={(config) => updateToolConfig(selectedTool.id, config)}
        />
      ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-4">
              <Settings className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                Select a tool to configure
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type ToolDefItem = {
  id: string;
  name: string;
  icon: React.ForwardRefExoticComponent<React.SVGProps<SVGSVGElement> & React.RefAttributes<SVGSVGElement>>;
  description: string;
  color: string;
};

interface ToolConfigPanelProps {
  tool: AgentTool;
  toolDef: ToolDefItem;
  onConfigChange: (config: Record<string, any>) => void;
}

function ToolConfigPanel({ tool, toolDef, onConfigChange }: ToolConfigPanelProps) {
  const Icon = toolDef.icon;

  // Render different config options based on tool type
  const renderConfig = () => {
    switch (tool.type) {
      case 'deals':
      case 'lenders':
      case 'activities':
      case 'milestones':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Access Level</Label>
              <Select
                value={tool.config.accessLevel || 'read'}
                onValueChange={(v) => onConfigChange({ accessLevel: v })}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="read">Read Only</SelectItem>
                  <SelectItem value="write">Read & Write</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Scope</Label>
              <Select
                value={tool.config.scope || 'all'}
                onValueChange={(v) => onConfigChange({ scope: v })}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Records</SelectItem>
                  <SelectItem value="context">Current Context</SelectItem>
                  <SelectItem value="filtered">Filtered</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'gemini_flash':
      case 'gemini_pro':
      case 'gpt5':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Temperature</Label>
              <Input
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={tool.config.temperature || 0.7}
                onChange={(e) => onConfigChange({ temperature: parseFloat(e.target.value) })}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Max Tokens</Label>
              <Input
                type="number"
                min={100}
                max={8000}
                step={100}
                value={tool.config.maxTokens || 2000}
                onChange={(e) => onConfigChange({ maxTokens: parseInt(e.target.value) })}
                className="h-8 text-sm"
              />
            </div>
          </div>
        );

      case 'slack':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Default Channel</Label>
              <Input
                placeholder="#general"
                value={tool.config.channel || ''}
                onChange={(e) => onConfigChange({ channel: e.target.value })}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Action Type</Label>
              <Select
                value={tool.config.actionType || 'notify'}
                onValueChange={(v) => onConfigChange({ actionType: v })}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="notify">Send Notification</SelectItem>
                  <SelectItem value="approval">Request Approval</SelectItem>
                  <SelectItem value="interactive">Interactive Message</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'email':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Default Recipient</Label>
              <Input
                type="email"
                placeholder="email@example.com"
                value={tool.config.recipient || ''}
                onChange={(e) => onConfigChange({ recipient: e.target.value })}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Email Type</Label>
              <Select
                value={tool.config.emailType || 'notification'}
                onValueChange={(v) => onConfigChange({ emailType: v })}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="notification">Notification</SelectItem>
                  <SelectItem value="summary">Summary Report</SelectItem>
                  <SelectItem value="alert">Alert</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'webhook':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Webhook URL</Label>
              <Input
                placeholder="https://api.example.com/webhook"
                value={tool.config.url || ''}
                onChange={(e) => onConfigChange({ url: e.target.value })}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Method</Label>
              <Select
                value={tool.config.method || 'POST'}
                onValueChange={(v) => onConfigChange({ method: v })}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'condition':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Condition Type</Label>
              <Select
                value={tool.config.conditionType || 'field'}
                onValueChange={(v) => onConfigChange({ conditionType: v })}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="field">Field Value</SelectItem>
                  <SelectItem value="expression">Expression</SelectItem>
                  <SelectItem value="ai_decision">AI Decision</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Condition Expression</Label>
              <Input
                placeholder="deal.value > 1000000"
                value={tool.config.expression || ''}
                onChange={(e) => onConfigChange({ expression: e.target.value })}
                className="h-8 text-sm font-mono"
              />
            </div>
          </div>
        );

      case 'approval':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Approval Channel</Label>
              <Select
                value={tool.config.approvalChannel || 'slack'}
                onValueChange={(v) => onConfigChange({ approvalChannel: v })}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="slack">Slack</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="in_app">In-App</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Timeout (hours)</Label>
              <Input
                type="number"
                min={1}
                max={168}
                value={tool.config.timeout || 24}
                onChange={(e) => onConfigChange({ timeout: parseInt(e.target.value) })}
                className="h-8 text-sm"
              />
            </div>
          </div>
        );

      default:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Custom Configuration</Label>
              <Input
                placeholder="Enter value..."
                value={tool.config.custom || ''}
                onChange={(e) => onConfigChange({ custom: e.target.value })}
                className="h-8 text-sm"
              />
            </div>
          </div>
        );
    }
  };

  return (
    <ScrollArea className="h-[420px]">
      <div className="space-y-4">
        {/* Tool Header */}
        <div className="flex items-center gap-3 pb-3 border-b">
          <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', toolDef.color)}>
            <Icon className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="font-medium text-sm">{tool.name}</p>
            <Badge variant="outline" className="text-xs">
              {tool.enabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>
        </div>

        {/* Tool-specific configuration */}
        {renderConfig()}
      </div>
    </ScrollArea>
  );
}
