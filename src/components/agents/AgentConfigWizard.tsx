import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Wand2,
  Target,
  Database,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface WizardAnswers {
  objective: string;
  dataAccess: {
    deals: boolean;
    lenders: boolean;
    activities: boolean;
    milestones: boolean;
  };
  goal: string;
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

const DATA_OPTIONS = [
  { id: 'deals', label: 'Deal Data', description: 'Access deal details, values, stages, and notes' },
  { id: 'lenders', label: 'Lender Data', description: 'Access lender information, quotes, and status' },
  { id: 'activities', label: 'Activity Logs', description: 'Access recent activities and history' },
  { id: 'milestones', label: 'Milestones', description: 'Access milestone tracking and due dates' },
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
  const [answers, setAnswers] = useState<WizardAnswers>({
    objective: '',
    dataAccess: {
      deals: true,
      lenders: true,
      activities: false,
      milestones: false,
    },
    goal: '',
  });

  const steps = [
    { title: 'Objective', icon: Target, description: 'What do you want your agent to do?' },
    { title: 'Data Access', icon: Database, description: 'What information should it use?' },
    { title: 'Goal', icon: Sparkles, description: 'What outcome are you hoping for?' },
  ];

  const progress = ((step + 1) / steps.length) * 100;

  const canProceed = () => {
    switch (step) {
      case 0: return answers.objective.trim().length > 10;
      case 1: return Object.values(answers.dataAccess).some(v => v);
      case 2: return answers.goal.trim().length > 10;
      default: return false;
    }
  };

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      generateAgent();
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  const generateAgent = async () => {
    setIsGenerating(true);
    
    // Generate agent configuration based on answers
    await new Promise(resolve => setTimeout(resolve, 800)); // Brief delay for UX
    
    const { objective, dataAccess, goal } = answers;
    
    // Determine personality based on goal
    let personality = 'professional';
    if (goal.toLowerCase().includes('time') || goal.toLowerCase().includes('automat')) {
      personality = 'direct';
    } else if (goal.toLowerCase().includes('decision') || goal.toLowerCase().includes('analy')) {
      personality = 'analytical';
    } else if (goal.toLowerCase().includes('organize')) {
      personality = 'friendly';
    }
    
    // Generate name based on objective
    let name = 'Custom Assistant';
    if (objective.toLowerCase().includes('analyze') || objective.toLowerCase().includes('evaluat')) {
      name = 'Deal Analyzer';
    } else if (objective.toLowerCase().includes('lender') || objective.toLowerCase().includes('match')) {
      name = 'Lender Matcher';
    } else if (objective.toLowerCase().includes('track') || objective.toLowerCase().includes('progress')) {
      name = 'Progress Tracker';
    } else if (objective.toLowerCase().includes('report') || objective.toLowerCase().includes('insight')) {
      name = 'Insights Generator';
    } else if (objective.toLowerCase().includes('automat')) {
      name = 'Task Automator';
    }
    
    // Build system prompt
    const dataAccessList = [];
    if (dataAccess.deals) dataAccessList.push('deal information (values, stages, notes)');
    if (dataAccess.lenders) dataAccessList.push('lender data (quotes, status, interactions)');
    if (dataAccess.activities) dataAccessList.push('activity logs and history');
    if (dataAccess.milestones) dataAccessList.push('milestones and due dates');
    
    const systemPrompt = `You are ${name}, an AI assistant specialized in commercial lending.

**Your Objective:**
${objective}

**Your Goal:**
${goal}

**Data Access:**
You have access to: ${dataAccessList.join(', ')}.

**Guidelines:**
- Always provide actionable, specific recommendations
- Use the data available to support your insights
- Be proactive in identifying opportunities and risks
- Keep responses concise but comprehensive
- Focus on helping the user achieve their goal

When analyzing deals or providing recommendations, consider all available context and provide clear reasoning for your suggestions.`;

    const description = `${objective.substring(0, 100)}${objective.length > 100 ? '...' : ''}`;

    onComplete({
      name,
      description,
      systemPrompt,
      personality,
      canAccessDeals: dataAccess.deals,
      canAccessLenders: dataAccess.lenders,
      canAccessActivities: dataAccess.activities,
      canAccessMilestones: dataAccess.milestones,
    });
    
    setIsGenerating(false);
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
                {OBJECTIVE_SUGGESTIONS.map((suggestion) => (
                  <Badge
                    key={suggestion.label}
                    variant={answers.objective === suggestion.value ? 'default' : 'outline'}
                    className="cursor-pointer hover:bg-primary/10"
                    onClick={() => setAnswers({ ...answers, objective: suggestion.value })}
                  >
                    {suggestion.label}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        );
      
      case 1:
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Select what data your agent should have access to:
            </p>
            <div className="grid gap-3">
              {DATA_OPTIONS.map((option) => (
                <div
                  key={option.id}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors",
                    answers.dataAccess[option.id as keyof typeof answers.dataAccess]
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50"
                  )}
                  onClick={() => setAnswers({
                    ...answers,
                    dataAccess: {
                      ...answers.dataAccess,
                      [option.id]: !answers.dataAccess[option.id as keyof typeof answers.dataAccess],
                    },
                  })}
                >
                  <Checkbox
                    checked={answers.dataAccess[option.id as keyof typeof answers.dataAccess]}
                    onCheckedChange={(checked) => setAnswers({
                      ...answers,
                      dataAccess: {
                        ...answers.dataAccess,
                        [option.id]: !!checked,
                      },
                    })}
                  />
                  <div className="space-y-1">
                    <p className="font-medium text-sm">{option.label}</p>
                    <p className="text-xs text-muted-foreground">{option.description}</p>
                  </div>
                </div>
              ))}
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
                {GOAL_SUGGESTIONS.map((suggestion) => (
                  <Badge
                    key={suggestion.label}
                    variant={answers.goal === suggestion.value ? 'default' : 'outline'}
                    className="cursor-pointer hover:bg-primary/10"
                    onClick={() => setAnswers({ ...answers, goal: suggestion.value })}
                  >
                    {suggestion.label}
                  </Badge>
                ))}
              </div>
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
        <div className="flex items-center justify-center gap-6">
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
                    index === step
                      ? "bg-primary text-primary-foreground"
                      : index < step
                      ? "bg-primary/20"
                      : "bg-muted"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-xs font-medium">{s.title}</span>
              </div>
            );
          })}
        </div>

        {/* Current step content */}
        <div className="min-h-[280px]">
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
