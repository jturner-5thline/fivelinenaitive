import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Wand2,
  Target,
  Database,
  ChevronRight,
  ChevronLeft,
  Loader2,
  MessageCircle,
  PlusCircle,
  ArrowRightCircle,
  Clock,
  Timer,
  Calendar,
  CheckSquare,
  FileText,
  Users,
  Mail,
  StickyNote,
  GitBranch,
  Sliders,
  Bell,
  Send,
  ListTodo,
  Zap,
} from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface WizardAnswers {
  objective: string;
  dataAccess: Record<string, boolean>;
  goal: string;
  triggers: Record<string, boolean>;
  triggerConfig: {
    inactivityDays: number;
    scheduleFrequency: string;
    scheduleTime: string;
    scheduleSendTo: string[];
  };
  actions: Record<string, boolean>;
}

interface AgentConfigWizardProps {
  onComplete: (config: {
    name: string;
    description: string;
    systemPrompt: string;
    personality: string;
    canAccessDeals: boolean;
    canAccessLenders: boolean;
    canAccessActivities: boolean;
    canAccessMilestones: boolean;
  }) => void;
  onCancel: () => void;
}

const OBJECTIVE_SUGGESTIONS = [
  { label: 'Analyze deals', value: 'I want to analyze and evaluate deals to make better decisions' },
  { label: 'Match lenders', value: 'I want to find and match the best lenders for each deal' },
  { label: 'Track progress', value: 'I want to track deal progress and stay on top of milestones' },
  { label: 'Generate reports', value: 'I want to generate insights and reports about my pipeline' },
  { label: 'Automate tasks', value: 'I want to automate repetitive tasks and notifications' },
];

const CORE_DATA_OPTIONS = [
  { id: 'deals', label: 'Deal Data', description: 'Access deal details, values, stages, and notes', icon: Database },
  { id: 'lenders', label: 'Lender Data', description: 'Access lender information, quotes, and status', icon: Users },
  { id: 'activities', label: 'Activity Logs', description: 'Access recent activities and history', icon: GitBranch },
  { id: 'milestones', label: 'Milestones', description: 'Access milestone tracking and due dates', icon: Target },
];

const EXTENDED_DATA_OPTIONS = [
  { id: 'tasks', label: 'Tasks & Checklists', description: 'Access open and completed tasks assigned to deals', icon: CheckSquare },
  { id: 'documents', label: 'Documents & Files', description: 'Know which documents have been uploaded and which are missing', icon: FileText },
  { id: 'contacts', label: 'Contacts & Sponsors', description: 'Access borrower, sponsor, and guarantor information', icon: Users },
  { id: 'emails', label: 'Emails & Communications', description: 'Access email thread history and last outreach date', icon: Mail },
  { id: 'notes', label: 'Deal Notes', description: 'Access freeform notes logged by team members', icon: StickyNote },
  { id: 'stageHistory', label: 'Pipeline Stage History', description: 'Access how long each deal has been in each stage', icon: GitBranch },
  { id: 'customFields', label: 'Custom Deal Fields', description: 'Access custom fields like LTV, DSCR, loan type, property type', icon: Sliders },
];

const TRIGGER_OPTIONS = [
  { id: 'on_demand', label: 'On Demand', description: 'Chat only — run when you open the agent', icon: MessageCircle },
  { id: 'deal_created', label: 'Deal Created', description: 'Trigger when a new deal is added', icon: PlusCircle },
  { id: 'deal_stage_change', label: 'Deal Stage Changes', description: 'Trigger when a deal moves stages', icon: ArrowRightCircle },
  { id: 'milestone_overdue', label: 'Milestone Overdue', description: 'Trigger when a milestone passes its due date', icon: Clock },
  { id: 'no_activity', label: 'No Activity for X Days', description: 'Trigger when a deal has no activity', icon: Timer, hasConfig: true },
  { id: 'scheduled', label: 'Scheduled', description: 'Run on a recurring schedule', icon: Calendar, hasConfig: true },
];

const ACTION_OPTIONS = [
  { id: 'chat_only', label: 'Chat Only', description: 'Results available when you open the agent chat', icon: MessageCircle },
  { id: 'create_task', label: 'Create a Task', description: 'Auto-create a task with the agent\'s findings', icon: ListTodo },
  { id: 'log_note', label: 'Log a Note', description: 'Log agent output as a note on the relevant deal', icon: StickyNote },
  { id: 'email_digest', label: 'Send Email Digest', description: 'Email results to deal owner or specified address', icon: Mail },
  { id: 'slack_message', label: 'Send Slack Message', description: 'Post to a connected Slack channel', icon: Send },
  { id: 'notification', label: 'In-App Notification', description: 'Trigger a notification badge for the assigned user', icon: Bell },
];

const GOAL_SUGGESTIONS = [
  { label: 'Save time', value: 'Help me save time by automating analysis and recommendations' },
  { label: 'Better decisions', value: 'Help me make better data-driven decisions' },
  { label: 'Never miss deadlines', value: 'Help me never miss important deadlines or follow-ups' },
  { label: 'Improve close rates', value: 'Help me improve my deal close rates' },
  { label: 'Stay organized', value: 'Help me stay organized across all my deals' },
];

export function AgentConfigWizard({ onComplete, onCancel }: AgentConfigWizardProps) {
  const [step, setStep] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedName, setGeneratedName] = useState('');
  const [answers, setAnswers] = useState<WizardAnswers>({
    objective: '',
    dataAccess: {
      deals: true,
      lenders: true,
      activities: false,
      milestones: false,
      tasks: false,
      documents: false,
      contacts: false,
      emails: false,
      notes: false,
      stageHistory: false,
      customFields: false,
    },
    goal: '',
    triggers: { on_demand: true },
    triggerConfig: {
      inactivityDays: 7,
      scheduleFrequency: 'daily',
      scheduleTime: '09:00',
      scheduleSendTo: ['notification'],
    },
    actions: { chat_only: true },
  });

  const steps = [
    { title: 'Objective', icon: Target, description: 'What do you want your agent to do?' },
    { title: 'Data Access', icon: Database, description: 'What information should it use?' },
    { title: 'Goal', icon: Sparkles, description: 'What outcome are you hoping for?' },
    { title: 'Triggers', icon: Zap, description: 'When should this run?' },
    { title: 'Actions', icon: Bell, description: 'What should happen with results?' },
  ];

  const progress = ((step + 1) / steps.length) * 100;

  const canProceed = () => {
    switch (step) {
      case 0: return answers.objective.trim().length > 10;
      case 1: return Object.values(answers.dataAccess).some(v => v);
      case 2: return answers.goal.trim().length > 10;
      case 3: return Object.values(answers.triggers).some(v => v);
      case 4: return Object.values(answers.actions).some(v => v);
      default: return false;
    }
  };

  const generateNameFromObjective = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('generate-agent-config', {
        body: { objective: answers.objective, mode: 'name' },
      });
      if (error) throw error;
      if (data?.name) setGeneratedName(data.name);
    } catch {
      // Silently fail — we'll use fallback naming
    }
  };

  const handleNext = async () => {
    if (step === 0 && !generatedName) {
      // Fire-and-forget name generation when leaving step 1
      generateNameFromObjective();
    }
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      generateAgent();
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const generateAgent = async () => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-agent-config', {
        body: {
          objective: answers.objective,
          dataSources: answers.dataAccess,
          goal: answers.goal,
          mode: 'full',
        },
      });

      if (error) throw error;

      onComplete({
        name: data?.name || generatedName || 'Custom Agent',
        description: data?.description || answers.objective.substring(0, 100),
        systemPrompt: data?.system_prompt || buildFallbackPrompt(),
        personality: data?.personality || 'professional',
        canAccessDeals: !!answers.dataAccess.deals,
        canAccessLenders: !!answers.dataAccess.lenders,
        canAccessActivities: !!answers.dataAccess.activities,
        canAccessMilestones: !!answers.dataAccess.milestones,
      });
    } catch {
      // Fallback to local generation
      toast.info('Using local generation');
      onComplete({
        name: generatedName || 'Custom Agent',
        description: answers.objective.substring(0, 100),
        systemPrompt: buildFallbackPrompt(),
        personality: 'professional',
        canAccessDeals: !!answers.dataAccess.deals,
        canAccessLenders: !!answers.dataAccess.lenders,
        canAccessActivities: !!answers.dataAccess.activities,
        canAccessMilestones: !!answers.dataAccess.milestones,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const buildFallbackPrompt = () => {
    const { objective, dataAccess, goal } = answers;
    const sources = Object.entries(dataAccess).filter(([_, v]) => v).map(([k]) => k).join(', ');
    return `You are an AI assistant for commercial lending.\n\n**Objective:** ${objective}\n**Goal:** ${goal}\n**Data Access:** ${sources}\n\nProvide actionable, specific recommendations based on the data available to you.`;
  };

  const toggleDataAccess = (id: string) => {
    setAnswers(prev => ({
      ...prev,
      dataAccess: { ...prev.dataAccess, [id]: !prev.dataAccess[id] },
    }));
  };

  const toggleTrigger = (id: string) => {
    setAnswers(prev => ({
      ...prev,
      triggers: { ...prev.triggers, [id]: !prev.triggers[id] },
    }));
  };

  const toggleAction = (id: string) => {
    setAnswers(prev => ({
      ...prev,
      actions: { ...prev.actions, [id]: !prev.actions[id] },
    }));
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="objective">Describe what you want your agent to do</Label>
              <Textarea
                id="objective"
                value={answers.objective}
                onChange={(e) => setAnswers({ ...answers, objective: e.target.value })}
                placeholder="I want an AI assistant that helps me..."
                className="min-h-[120px]"
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Or choose a suggestion:</p>
              <div className="flex flex-wrap gap-2">
                {OBJECTIVE_SUGGESTIONS.map((s) => (
                  <Badge
                    key={s.label}
                    variant={answers.objective === s.value ? 'default' : 'outline'}
                    className="cursor-pointer hover:bg-primary/10"
                    onClick={() => setAnswers({ ...answers, objective: s.value })}
                  >
                    {s.label}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        );

      case 1:
        return (
          <div className="space-y-5">
            <div className="space-y-1">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Core Data</h4>
            </div>
            <div className="grid gap-3">
              {CORE_DATA_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const checked = !!answers.dataAccess[opt.id];
                return (
                  <div
                    key={opt.id}
                    className={cn(
                      "flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-colors",
                      checked ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                    )}
                    onClick={() => toggleDataAccess(opt.id)}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-sm">{opt.label}</p>
                        <p className="text-xs text-muted-foreground">{opt.description}</p>
                      </div>
                    </div>
                    <Switch checked={checked} onCheckedChange={() => toggleDataAccess(opt.id)} />
                  </div>
                );
              })}
            </div>

            <div className="space-y-1 pt-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Extended Data</h4>
            </div>
            <div className="grid gap-3">
              {EXTENDED_DATA_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const checked = !!answers.dataAccess[opt.id];
                return (
                  <div
                    key={opt.id}
                    className={cn(
                      "flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-colors",
                      checked ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                    )}
                    onClick={() => toggleDataAccess(opt.id)}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-sm">{opt.label}</p>
                        <p className="text-xs text-muted-foreground">{opt.description}</p>
                      </div>
                    </div>
                    <Switch checked={checked} onCheckedChange={() => toggleDataAccess(opt.id)} />
                  </div>
                );
              })}
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="goal">What outcome are you hoping to achieve?</Label>
              <Textarea
                id="goal"
                value={answers.goal}
                onChange={(e) => setAnswers({ ...answers, goal: e.target.value })}
                placeholder="I'm hoping this agent will help me..."
                className="min-h-[120px]"
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Or choose a goal:</p>
              <div className="flex flex-wrap gap-2">
                {GOAL_SUGGESTIONS.map((s) => (
                  <Badge
                    key={s.label}
                    variant={answers.goal === s.value ? 'default' : 'outline'}
                    className="cursor-pointer hover:bg-primary/10"
                    onClick={() => setAnswers({ ...answers, goal: s.value })}
                  >
                    {s.label}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Select one or more triggers for your agent:</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {TRIGGER_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const checked = !!answers.triggers[opt.id];
                return (
                  <div
                    key={opt.id}
                    className={cn(
                      "flex flex-col gap-2 rounded-lg border p-4 cursor-pointer transition-colors",
                      checked ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                    )}
                    onClick={() => toggleTrigger(opt.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center", checked ? "bg-primary/20" : "bg-muted")}>
                          <Icon className={cn("h-4 w-4", checked ? "text-primary" : "text-muted-foreground")} />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{opt.label}</p>
                          <p className="text-xs text-muted-foreground">{opt.description}</p>
                        </div>
                      </div>
                    </div>

                    {/* Sub-configs */}
                    {checked && opt.id === 'no_activity' && (
                      <div className="flex items-center gap-2 pl-10 pt-1" onClick={(e) => e.stopPropagation()}>
                        <Label className="text-xs">Days:</Label>
                        <Input
                          type="number"
                          min={1}
                          max={90}
                          value={answers.triggerConfig.inactivityDays}
                          onChange={(e) => setAnswers(prev => ({
                            ...prev,
                            triggerConfig: { ...prev.triggerConfig, inactivityDays: parseInt(e.target.value) || 7 },
                          }))}
                          className="w-20 h-7 text-xs"
                        />
                      </div>
                    )}
                    {checked && opt.id === 'scheduled' && (
                      <div className="space-y-2 pl-10 pt-1" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <Select
                            value={answers.triggerConfig.scheduleFrequency}
                            onValueChange={(v) => setAnswers(prev => ({
                              ...prev,
                              triggerConfig: { ...prev.triggerConfig, scheduleFrequency: v },
                            }))}
                          >
                            <SelectTrigger className="w-28 h-7 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="daily">Daily</SelectItem>
                              <SelectItem value="weekly">Weekly</SelectItem>
                              <SelectItem value="monthly">Monthly</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input
                            type="time"
                            value={answers.triggerConfig.scheduleTime}
                            onChange={(e) => setAnswers(prev => ({
                              ...prev,
                              triggerConfig: { ...prev.triggerConfig, scheduleTime: e.target.value },
                            }))}
                            className="w-28 h-7 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Send results to:</Label>
                          <div className="flex gap-2 flex-wrap">
                            {['In-app notification', 'Email digest', 'Slack message'].map((opt) => {
                              const key = opt.toLowerCase().replace(/\s/g, '_');
                              const isSelected = answers.triggerConfig.scheduleSendTo.includes(key);
                              return (
                                <Badge
                                  key={key}
                                  variant={isSelected ? 'default' : 'outline'}
                                  className="cursor-pointer text-xs"
                                  onClick={() => {
                                    setAnswers(prev => ({
                                      ...prev,
                                      triggerConfig: {
                                        ...prev.triggerConfig,
                                        scheduleSendTo: isSelected
                                          ? prev.triggerConfig.scheduleSendTo.filter(s => s !== key)
                                          : [...prev.triggerConfig.scheduleSendTo, key],
                                      },
                                    }));
                                  }}
                                >
                                  {opt}
                                </Badge>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Select what should happen when your agent produces results:</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {ACTION_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const checked = !!answers.actions[opt.id];
                return (
                  <div
                    key={opt.id}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors",
                      checked ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                    )}
                    onClick={() => toggleAction(opt.id)}
                  >
                    <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", checked ? "bg-primary/20" : "bg-muted")}>
                      <Icon className={cn("h-4 w-4", checked ? "text-primary" : "text-muted-foreground")} />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Wand2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Agent Configuration Wizard</CardTitle>
            <CardDescription>Answer a few questions to create your perfect agent</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Step {step + 1} of {steps.length}</span>
            <span>{Math.round(progress)}% complete</span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-4">
          {steps.map((s, index) => {
            const Icon = s.icon;
            return (
              <div
                key={index}
                className={cn(
                  "flex flex-col items-center gap-1.5",
                  index === step ? "text-primary" : index < step ? "text-primary/60" : "text-muted-foreground"
                )}
              >
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                    index === step ? "bg-primary text-primary-foreground" : index < step ? "bg-primary/20" : "bg-muted"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-[10px] font-medium hidden sm:block">{s.title}</span>
              </div>
            );
          })}
        </div>

        {/* Current step content */}
        <div className="min-h-[280px] max-h-[50vh] overflow-y-auto">
          <div className="mb-4">
            <h3 className="font-medium">{steps[step].title}</h3>
            <p className="text-sm text-muted-foreground">{steps[step].description}</p>
          </div>
          {renderStep()}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-2">
          <Button variant="ghost" onClick={step === 0 ? onCancel : handleBack}>
            {step === 0 ? 'Cancel' : (
              <>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </>
            )}
          </Button>

          <Button onClick={handleNext} disabled={!canProceed() || isGenerating}>
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating Agent...
              </>
            ) : step === steps.length - 1 ? (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Create Agent
              </>
            ) : (
              <>
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
