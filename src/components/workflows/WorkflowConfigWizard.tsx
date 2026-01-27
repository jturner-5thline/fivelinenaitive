import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import {
  Wand2,
  Target,
  Zap,
  GitBranch,
  CheckCircle2,
  Users,
  ChevronRight,
  ChevronLeft,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TriggerType, ActionType, WorkflowData, WorkflowAction } from './WorkflowBuilder';

interface WizardAnswers {
  objective: string;
  triggerEvent: string;
  conditions: string;
  outcome: string;
  assignee: string;
}

interface WorkflowConfigWizardProps {
  onComplete: (data: WorkflowData) => void;
  onCancel: () => void;
}

const OBJECTIVE_SUGGESTIONS = [
  { label: 'Notify team', value: 'I want to notify my team when important events happen' },
  { label: 'Track progress', value: 'I want to track when deals move through stages' },
  { label: 'Automate follow-ups', value: 'I want to automate follow-up reminders and actions' },
  { label: 'Sync with tools', value: 'I want to sync data with external tools like Zapier' },
  { label: 'Monitor stale deals', value: 'I want to monitor for stale or stuck deals' },
];

const TRIGGER_SUGGESTIONS = [
  { label: 'Deal stage changes', value: 'When a deal moves to a new stage' },
  { label: 'New deal created', value: 'When a new deal is created' },
  { label: 'Lender status changes', value: 'When a lender status changes' },
  { label: 'Deal closed', value: 'When a deal is closed (won or lost)' },
  { label: 'On a schedule', value: 'On a daily or weekly schedule' },
];

const OUTCOME_SUGGESTIONS = [
  { label: 'Send notification', value: 'Send an in-app notification to the team' },
  { label: 'Send email', value: 'Send an email alert to relevant people' },
  { label: 'Call webhook', value: 'Call a webhook to sync with external tools' },
  { label: 'Update field', value: 'Update a field on the deal automatically' },
  { label: 'Multiple actions', value: 'Perform multiple actions in sequence' },
];

export function WorkflowConfigWizard({ onComplete, onCancel }: WorkflowConfigWizardProps) {
  const [step, setStep] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [answers, setAnswers] = useState<WizardAnswers>({
    objective: '',
    triggerEvent: '',
    conditions: '',
    outcome: '',
    assignee: '',
  });

  const steps = [
    { title: 'Objective', icon: Target, description: 'What are you hoping to do?' },
    { title: 'Trigger', icon: Zap, description: 'What should trigger this workflow?' },
    { title: 'Conditions', icon: GitBranch, description: 'What should we check?' },
    { title: 'Outcome', icon: CheckCircle2, description: 'What should happen?' },
    { title: 'Assignee', icon: Users, description: 'Who should be notified?' },
  ];

  const progress = ((step + 1) / steps.length) * 100;

  const canProceed = () => {
    switch (step) {
      case 0: return answers.objective.trim().length > 5;
      case 1: return answers.triggerEvent.trim().length > 5;
      case 2: return true; // Conditions are optional
      case 3: return answers.outcome.trim().length > 5;
      case 4: return true; // Assignee is optional
      default: return false;
    }
  };

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      generateWorkflow();
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  const generateWorkflow = async () => {
    setIsGenerating(true);
    await new Promise(resolve => setTimeout(resolve, 600));

    const { objective, triggerEvent, conditions, outcome, assignee } = answers;

    // Determine trigger type
    let triggerType: TriggerType = 'deal_stage_change';
    const triggerLower = triggerEvent.toLowerCase();
    if (triggerLower.includes('new deal') || triggerLower.includes('created')) {
      triggerType = 'new_deal';
    } else if (triggerLower.includes('lender')) {
      triggerType = 'lender_stage_change';
    } else if (triggerLower.includes('closed') || triggerLower.includes('won') || triggerLower.includes('lost')) {
      triggerType = 'deal_closed';
    } else if (triggerLower.includes('schedule') || triggerLower.includes('daily') || triggerLower.includes('weekly')) {
      triggerType = 'scheduled';
    }

    // Determine action type
    let actionType: ActionType = 'send_notification';
    const outcomeLower = outcome.toLowerCase();
    if (outcomeLower.includes('email')) {
      actionType = 'send_email';
    } else if (outcomeLower.includes('webhook') || outcomeLower.includes('zapier') || outcomeLower.includes('sync')) {
      actionType = 'webhook';
    } else if (outcomeLower.includes('update') || outcomeLower.includes('field')) {
      actionType = 'update_field';
    }

    // Generate workflow name
    let name = 'Custom Workflow';
    if (objective.toLowerCase().includes('notify')) {
      name = 'Team Notification';
    } else if (objective.toLowerCase().includes('track')) {
      name = 'Progress Tracker';
    } else if (objective.toLowerCase().includes('follow')) {
      name = 'Follow-up Automation';
    } else if (objective.toLowerCase().includes('sync')) {
      name = 'Data Sync';
    } else if (objective.toLowerCase().includes('monitor') || objective.toLowerCase().includes('stale')) {
      name = 'Stale Deal Monitor';
    }

    // Build action config based on type
    const actionConfig: Record<string, string> = {};
    if (actionType === 'send_notification') {
      actionConfig.title = name;
      actionConfig.message = outcome;
    } else if (actionType === 'send_email') {
      actionConfig.subject = name;
      actionConfig.body = outcome;
    } else if (actionType === 'webhook') {
      actionConfig.url = '';
    }

    // Build actions array
    const actions: WorkflowAction[] = [{
      id: `action-${Date.now()}`,
      type: actionType,
      config: actionConfig,
    }];

    // Add condition if specified
    if (conditions.trim()) {
      actions[0].condition = {
        field: 'deal_value',
        operator: 'greater_than',
        value: '0',
      };
    }

    // Build trigger config
    const triggerConfig: Record<string, string> = {};
    if (triggerType === 'scheduled') {
      triggerConfig.schedule = triggerLower.includes('weekly') ? 'weekly' : 'daily';
    }

    const workflowData: WorkflowData = {
      name,
      description: `${objective}\n\nTrigger: ${triggerEvent}${conditions ? `\nConditions: ${conditions}` : ''}${assignee ? `\nAssignee: ${assignee}` : ''}`,
      isActive: true,
      triggerType,
      triggerConfig,
      actions,
    };

    onComplete(workflowData);
    setIsGenerating(false);
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="objective">What are you hoping to achieve with this workflow?</Label>
              <Textarea
                id="objective"
                value={answers.objective}
                onChange={(e) => setAnswers({ ...answers, objective: e.target.value })}
                placeholder="I want to automatically..."
                className="min-h-[100px]"
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Quick suggestions:</p>
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
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="trigger">What should trigger this workflow?</Label>
              <Textarea
                id="trigger"
                value={answers.triggerEvent}
                onChange={(e) => setAnswers({ ...answers, triggerEvent: e.target.value })}
                placeholder="When a deal..."
                className="min-h-[100px]"
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Common triggers:</p>
              <div className="flex flex-wrap gap-2">
                {TRIGGER_SUGGESTIONS.map((s) => (
                  <Badge
                    key={s.label}
                    variant={answers.triggerEvent === s.value ? 'default' : 'outline'}
                    className="cursor-pointer hover:bg-primary/10"
                    onClick={() => setAnswers({ ...answers, triggerEvent: s.value })}
                  >
                    {s.label}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="conditions">What conditions should be checked? (optional)</Label>
              <Textarea
                id="conditions"
                value={answers.conditions}
                onChange={(e) => setAnswers({ ...answers, conditions: e.target.value })}
                placeholder="Only if the deal value is over $1M..."
                className="min-h-[100px]"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Leave blank to run for all matching triggers, or specify conditions to filter.
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge
                variant="outline"
                className="cursor-pointer hover:bg-primary/10"
                onClick={() => setAnswers({ ...answers, conditions: 'Only if deal value is greater than $500,000' })}
              >
                High-value deals
              </Badge>
              <Badge
                variant="outline"
                className="cursor-pointer hover:bg-primary/10"
                onClick={() => setAnswers({ ...answers, conditions: 'Only if the deal has been in this stage for more than 7 days' })}
              >
                Stale deals
              </Badge>
              <Badge
                variant="outline"
                className="cursor-pointer hover:bg-primary/10"
                onClick={() => setAnswers({ ...answers, conditions: 'Only if there are no active lenders' })}
              >
                No lenders
              </Badge>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="outcome">What should happen when this workflow runs?</Label>
              <Textarea
                id="outcome"
                value={answers.outcome}
                onChange={(e) => setAnswers({ ...answers, outcome: e.target.value })}
                placeholder="Send a notification..."
                className="min-h-[100px]"
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Common outcomes:</p>
              <div className="flex flex-wrap gap-2">
                {OUTCOME_SUGGESTIONS.map((s) => (
                  <Badge
                    key={s.label}
                    variant={answers.outcome === s.value ? 'default' : 'outline'}
                    className="cursor-pointer hover:bg-primary/10"
                    onClick={() => setAnswers({ ...answers, outcome: s.value })}
                  >
                    {s.label}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="assignee">Who should receive notifications or be assigned? (optional)</Label>
              <Input
                id="assignee"
                value={answers.assignee}
                onChange={(e) => setAnswers({ ...answers, assignee: e.target.value })}
                placeholder="Deal manager, team lead, or specific email..."
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge
                variant="outline"
                className="cursor-pointer hover:bg-primary/10"
                onClick={() => setAnswers({ ...answers, assignee: 'Deal Manager' })}
              >
                Deal Manager
              </Badge>
              <Badge
                variant="outline"
                className="cursor-pointer hover:bg-primary/10"
                onClick={() => setAnswers({ ...answers, assignee: 'Deal Owner' })}
              >
                Deal Owner
              </Badge>
              <Badge
                variant="outline"
                className="cursor-pointer hover:bg-primary/10"
                onClick={() => setAnswers({ ...answers, assignee: 'All team members' })}
              >
                Entire Team
              </Badge>
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
            <CardTitle className="text-lg">Workflow Assistant</CardTitle>
            <CardDescription>Answer a few questions to create your workflow</CardDescription>
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
        <div className="flex items-center justify-center gap-4 overflow-x-auto pb-2">
          {steps.map((s, index) => {
            const Icon = s.icon;
            return (
              <div
                key={index}
                className={cn(
                  "flex flex-col items-center gap-1.5 min-w-fit",
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
                <span className="text-xs font-medium hidden sm:block">{s.title}</span>
              </div>
            );
          })}
        </div>

        {/* Current step content */}
        <div className="min-h-[220px]">
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
                Creating...
              </>
            ) : step === steps.length - 1 ? (
              <>
                <Wand2 className="h-4 w-4 mr-2" />
                Create Workflow
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
