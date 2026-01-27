import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  Bot, 
  Settings, 
  Shield, 
  Database, 
  Building2, 
  Activity, 
  Target, 
  Search,
  Globe,
  Users,
  Sparkles,
  Puzzle,
} from 'lucide-react';
import type { Agent, CreateAgentData } from '@/hooks/useAgents';
import { AgentToolsBuilder, type AgentTool } from './AgentToolsBuilder';

interface AgentBuilderProps {
  initialData?: Agent;
  onSave: (data: CreateAgentData) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}

const EMOJI_OPTIONS = ['🤖', '🧠', '💡', '⚡', '🎯', '📊', '🔍', '💼', '🚀', '🌟', '🎨', '🔮'];

const PERSONALITY_OPTIONS = [
  { value: 'professional', label: 'Professional', description: 'Business-focused and formal' },
  { value: 'friendly', label: 'Friendly', description: 'Warm and approachable' },
  { value: 'analytical', label: 'Analytical', description: 'Data-driven and precise' },
  { value: 'creative', label: 'Creative', description: 'Innovative and exploratory' },
  { value: 'direct', label: 'Direct', description: 'Brief and to the point' },
];

const PROMPT_TEMPLATES = [
  {
    name: 'Deal Advisor',
    emoji: '💼',
    prompt: `You are an expert deal advisor for commercial lending. Help users analyze deals, evaluate opportunities, and make strategic decisions.

Your expertise includes:
- Deal structuring and valuation
- Risk assessment
- Market analysis
- Negotiation strategies

Always provide actionable insights based on the deal context provided.`,
    personality: 'professional',
  },
  {
    name: 'Lender Matcher',
    emoji: '🎯',
    prompt: `You are a lender matching specialist. Help users find and evaluate the best lenders for their deals based on criteria, history, and market conditions.

Your expertise includes:
- Lender selection and ranking
- Understanding lender preferences and patterns
- Optimizing outreach strategies
- Tracking lender engagement

Provide specific, data-backed recommendations when possible.`,
    personality: 'analytical',
  },
  {
    name: 'Pipeline Coach',
    emoji: '📊',
    prompt: `You are a pipeline management coach. Help users optimize their deal workflow, prioritize activities, and improve close rates.

Your expertise includes:
- Pipeline analysis and optimization
- Activity prioritization
- Milestone tracking
- Productivity improvement

Focus on practical, actionable advice that drives results.`,
    personality: 'direct',
  },
];

export function AgentBuilder({ initialData, onSave, onCancel, isSaving }: AgentBuilderProps) {
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [avatarEmoji, setAvatarEmoji] = useState(initialData?.avatar_emoji || '🤖');
  const [systemPrompt, setSystemPrompt] = useState(initialData?.system_prompt || '');
  const [personality, setPersonality] = useState(initialData?.personality || 'professional');
  const [temperature, setTemperature] = useState(initialData?.temperature || 0.7);
  
  // Permissions
  const [canAccessDeals, setCanAccessDeals] = useState(initialData?.can_access_deals ?? true);
  const [canAccessLenders, setCanAccessLenders] = useState(initialData?.can_access_lenders ?? true);
  const [canAccessActivities, setCanAccessActivities] = useState(initialData?.can_access_activities ?? false);
  const [canAccessMilestones, setCanAccessMilestones] = useState(initialData?.can_access_milestones ?? false);
  const [canSearchWeb, setCanSearchWeb] = useState(initialData?.can_search_web ?? false);
  
  // Sharing
  const [isShared, setIsShared] = useState(initialData?.is_shared ?? false);
  const [isPublic, setIsPublic] = useState(initialData?.is_public ?? false);

  // Tools / Workflow
  const [tools, setTools] = useState<AgentTool[]>(() => {
    // Initialize with data access tools based on initial permissions
    const initialTools: AgentTool[] = [];
    if (initialData?.can_access_deals) {
      initialTools.push({ id: 'deals_init', type: 'deals', name: 'Deal Data', enabled: true, config: {} });
    }
    if (initialData?.can_access_lenders) {
      initialTools.push({ id: 'lenders_init', type: 'lenders', name: 'Lender Data', enabled: true, config: {} });
    }
    if (initialData?.can_access_activities) {
      initialTools.push({ id: 'activities_init', type: 'activities', name: 'Activity Logs', enabled: true, config: {} });
    }
    if (initialData?.can_access_milestones) {
      initialTools.push({ id: 'milestones_init', type: 'milestones', name: 'Milestones', enabled: true, config: {} });
    }
    return initialTools;
  });

  const applyTemplate = (template: typeof PROMPT_TEMPLATES[0]) => {
    setName(template.name);
    setAvatarEmoji(template.emoji);
    setSystemPrompt(template.prompt);
    setPersonality(template.personality);
  };

  // Sync tools to permissions
  const handleToolsChange = (newTools: AgentTool[]) => {
    setTools(newTools);
    // Update permissions based on tools
    setCanAccessDeals(newTools.some(t => t.type === 'deals' && t.enabled));
    setCanAccessLenders(newTools.some(t => t.type === 'lenders' && t.enabled));
    setCanAccessActivities(newTools.some(t => t.type === 'activities' && t.enabled));
    setCanAccessMilestones(newTools.some(t => t.type === 'milestones' && t.enabled));
    setCanSearchWeb(newTools.some(t => t.type === 'web_search' && t.enabled));
  };

  const handleSave = async () => {
    await onSave({
      name,
      description: description || undefined,
      avatar_emoji: avatarEmoji,
      system_prompt: systemPrompt,
      personality,
      temperature,
      can_access_deals: tools.some(t => t.type === 'deals' && t.enabled) || canAccessDeals,
      can_access_lenders: tools.some(t => t.type === 'lenders' && t.enabled) || canAccessLenders,
      can_access_activities: tools.some(t => t.type === 'activities' && t.enabled) || canAccessActivities,
      can_access_milestones: tools.some(t => t.type === 'milestones' && t.enabled) || canAccessMilestones,
      can_search_web: tools.some(t => t.type === 'web_search' && t.enabled) || canSearchWeb,
      is_shared: isShared,
      is_public: isPublic,
    });
  };

  const isValid = name.trim() && systemPrompt.trim();

  return (
    <div className="space-y-6">
      {/* Quick Start Templates */}
      {!initialData && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Quick Start Templates
            </CardTitle>
            <CardDescription>
              Start with a pre-configured template and customize it
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              {PROMPT_TEMPLATES.map((template) => (
                <Button
                  key={template.name}
                  variant="outline"
                  className="h-auto py-3 px-4 justify-start"
                  onClick={() => applyTemplate(template)}
                >
                  <span className="text-xl mr-2">{template.emoji}</span>
                  <span>{template.name}</span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="workflow" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="workflow" className="gap-2">
            <Puzzle className="h-4 w-4" />
            Workflow
          </TabsTrigger>
          <TabsTrigger value="basic" className="gap-2">
            <Bot className="h-4 w-4" />
            Identity
          </TabsTrigger>
          <TabsTrigger value="permissions" className="gap-2">
            <Shield className="h-4 w-4" />
            Permissions
          </TabsTrigger>
          <TabsTrigger value="advanced" className="gap-2">
            <Settings className="h-4 w-4" />
            Advanced
          </TabsTrigger>
        </TabsList>

        <TabsContent value="workflow" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Build Your Agent</CardTitle>
              <CardDescription>
                Add tools, integrations, and logic to create a modular AI agent
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AgentToolsBuilder tools={tools} onToolsChange={handleToolsChange} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="basic" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Agent Identity</CardTitle>
              <CardDescription>
                Define who your agent is and how it should behave
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4">
                <div className="space-y-2">
                  <Label>Avatar</Label>
                  <div className="flex flex-wrap gap-2">
                    {EMOJI_OPTIONS.map((emoji) => (
                      <Button
                        key={emoji}
                        variant={avatarEmoji === emoji ? 'default' : 'outline'}
                        size="icon"
                        className="text-lg"
                        onClick={() => setAvatarEmoji(emoji)}
                      >
                        {emoji}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Deal Assistant"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Helps analyze and evaluate deals"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="personality">Personality</Label>
                <Select value={personality} onValueChange={setPersonality}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERSONALITY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex flex-col">
                          <span>{option.label}</span>
                          <span className="text-xs text-muted-foreground">{option.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="system-prompt">System Prompt *</Label>
                <Textarea
                  id="system-prompt"
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="You are an expert assistant that helps users with..."
                  className="min-h-[200px] font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  This is the core instruction that defines your agent's behavior and expertise
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="permissions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Data Access</CardTitle>
              <CardDescription>
                Choose what information your agent can access
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Database className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Deal Data</p>
                      <p className="text-sm text-muted-foreground">Access deal details, values, and stages</p>
                    </div>
                  </div>
                  <Switch checked={canAccessDeals} onCheckedChange={setCanAccessDeals} />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Lender Data</p>
                      <p className="text-sm text-muted-foreground">Access lender information and status</p>
                    </div>
                  </div>
                  <Switch checked={canAccessLenders} onCheckedChange={setCanAccessLenders} />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Activity className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Activity Logs</p>
                      <p className="text-sm text-muted-foreground">Access recent activities and history</p>
                    </div>
                  </div>
                  <Switch checked={canAccessActivities} onCheckedChange={setCanAccessActivities} />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Target className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Milestones</p>
                      <p className="text-sm text-muted-foreground">Access milestone tracking data</p>
                    </div>
                  </div>
                  <Switch checked={canAccessMilestones} onCheckedChange={setCanAccessMilestones} />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Search className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Web Search</p>
                      <p className="text-sm text-muted-foreground">Search the web for information (coming soon)</p>
                    </div>
                  </div>
                  <Switch checked={canSearchWeb} onCheckedChange={setCanSearchWeb} disabled />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sharing Settings</CardTitle>
              <CardDescription>
                Control who can use this agent
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Share with Team</p>
                    <p className="text-sm text-muted-foreground">Allow team members to use this agent</p>
                  </div>
                </div>
                <Switch checked={isShared} onCheckedChange={setIsShared} />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Globe className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Make Public</p>
                    <p className="text-sm text-muted-foreground">Allow anyone on the platform to use this agent</p>
                  </div>
                </div>
                <Switch checked={isPublic} onCheckedChange={setIsPublic} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="advanced" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Model Settings</CardTitle>
              <CardDescription>
                Fine-tune how your agent responds
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Temperature: {temperature.toFixed(1)}</Label>
                  <Badge variant="outline">
                    {temperature < 0.5 ? 'Focused' : temperature > 1 ? 'Creative' : 'Balanced'}
                  </Badge>
                </div>
                <Slider
                  value={[temperature]}
                  onValueChange={([val]) => setTemperature(val)}
                  min={0}
                  max={2}
                  step={0.1}
                />
                <p className="text-xs text-muted-foreground">
                  Lower values make responses more focused and deterministic. Higher values make responses more creative and varied.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={!isValid || isSaving}>
          {isSaving ? 'Saving...' : initialData ? 'Save Changes' : 'Create Agent'}
        </Button>
      </div>
    </div>
  );
}
