import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { 
  Zap, 
  Plus,
  Trash2,
  Play,
  Pause,
  Briefcase,
  Building2,
  Target,
  Bell,
  FileText,
  Activity
} from 'lucide-react';
import { 
  useAgentTriggers, 
  useCreateAgentTrigger, 
  useDeleteAgentTrigger, 
  useToggleAgentTrigger,
  type TriggerType,
  type ActionType,
  type AgentTrigger
} from '@/hooks/useAgentTriggers';
import { formatDistanceToNow } from 'date-fns';

interface AgentTriggersManagerProps {
  agentId: string;
  agentName: string;
}

const TRIGGER_OPTIONS: { value: TriggerType; label: string; icon: React.ElementType; description: string }[] = [
  { value: 'deal_created', label: 'New Deal Created', icon: Briefcase, description: 'When a new deal is added' },
  { value: 'deal_stage_change', label: 'Deal Stage Change', icon: Briefcase, description: 'When a deal moves to a new stage' },
  { value: 'deal_closed', label: 'Deal Closed', icon: Briefcase, description: 'When a deal is won or lost' },
  { value: 'lender_added', label: 'Lender Added', icon: Building2, description: 'When a lender is added to a deal' },
  { value: 'lender_stage_change', label: 'Lender Stage Change', icon: Building2, description: 'When a lender status changes' },
  { value: 'milestone_completed', label: 'Milestone Completed', icon: Target, description: 'When a milestone is marked complete' },
];

const ACTION_OPTIONS: { value: ActionType; label: string; icon: React.ElementType; description: string }[] = [
  { value: 'generate_insight', label: 'Generate Insight', icon: Zap, description: 'Create an AI insight (stored in run history)' },
  { value: 'create_activity', label: 'Log Activity', icon: Activity, description: 'Add to deal activity timeline' },
  { value: 'update_notes', label: 'Update Notes', icon: FileText, description: 'Append insight to deal notes' },
  { value: 'send_notification', label: 'Send Notification', icon: Bell, description: 'Send in-app notification' },
];

export function AgentTriggersManager({ agentId, agentName }: AgentTriggersManagerProps) {
  const { data: triggers, isLoading } = useAgentTriggers(agentId);
  const createTrigger = useCreateAgentTrigger();
  const deleteTrigger = useDeleteAgentTrigger();
  const toggleTrigger = useToggleAgentTrigger();

  const [isCreating, setIsCreating] = useState(false);
  const [newTriggerName, setNewTriggerName] = useState('');
  const [newTriggerType, setNewTriggerType] = useState<TriggerType>('deal_stage_change');
  const [newActionType, setNewActionType] = useState<ActionType>('generate_insight');

  const handleCreate = async () => {
    if (!newTriggerName.trim()) return;

    await createTrigger.mutateAsync({
      agent_id: agentId,
      name: newTriggerName,
      trigger_type: newTriggerType,
      action_type: newActionType,
    });

    setNewTriggerName('');
    setIsCreating(false);
  };

  const getTriggerIcon = (type: TriggerType) => {
    const option = TRIGGER_OPTIONS.find(o => o.value === type);
    return option?.icon || Zap;
  };

  const getActionIcon = (type: ActionType) => {
    const option = ACTION_OPTIONS.find(o => o.value === type);
    return option?.icon || Zap;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">Automation Triggers</h3>
          <p className="text-sm text-muted-foreground">
            Set up automatic actions when events occur
          </p>
        </div>
        {!isCreating && (
          <Button variant="outline" size="sm" onClick={() => setIsCreating(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Trigger
          </Button>
        )}
      </div>

      {isCreating && (
        <Card className="border-primary/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">New Trigger</CardTitle>
            <CardDescription>
              Configure when {agentName} should run automatically
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="trigger-name">Trigger Name</Label>
              <Input
                id="trigger-name"
                placeholder="e.g., Analyze new deals"
                value={newTriggerName}
                onChange={(e) => setNewTriggerName(e.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>When this happens...</Label>
                <Select value={newTriggerType} onValueChange={(v) => setNewTriggerType(v as TriggerType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRIGGER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex items-center gap-2">
                          <option.icon className="h-4 w-4" />
                          <span>{option.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {TRIGGER_OPTIONS.find(o => o.value === newTriggerType)?.description}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Do this...</Label>
                <Select value={newActionType} onValueChange={(v) => setNewActionType(v as ActionType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTION_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex items-center gap-2">
                          <option.icon className="h-4 w-4" />
                          <span>{option.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {ACTION_OPTIONS.find(o => o.value === newActionType)?.description}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsCreating(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleCreate} 
                disabled={!newTriggerName.trim() || createTrigger.isPending}
              >
                {createTrigger.isPending ? 'Creating...' : 'Create Trigger'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading triggers...</div>
      ) : triggers && triggers.length > 0 ? (
        <div className="space-y-2">
          {triggers.map((trigger) => {
            const TriggerIcon = getTriggerIcon(trigger.trigger_type);
            const ActionIcon = getActionIcon(trigger.action_type);

            return (
              <Card key={trigger.id} className={!trigger.is_active ? 'opacity-60' : ''}>
                <CardContent className="py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex-shrink-0 w-8 h-8 rounded bg-primary/10 flex items-center justify-center">
                        <Zap className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">{trigger.name}</p>
                          {!trigger.is_active && (
                            <Badge variant="secondary" className="text-xs">Paused</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <TriggerIcon className="h-3 w-3" />
                          <span>{TRIGGER_OPTIONS.find(o => o.value === trigger.trigger_type)?.label}</span>
                          <span>→</span>
                          <ActionIcon className="h-3 w-3" />
                          <span>{ACTION_OPTIONS.find(o => o.value === trigger.action_type)?.label}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right text-xs text-muted-foreground hidden sm:block">
                        <p>{trigger.trigger_count} runs</p>
                        {trigger.last_triggered_at && (
                          <p>Last: {formatDistanceToNow(new Date(trigger.last_triggered_at), { addSuffix: true })}</p>
                        )}
                      </div>
                      <Switch
                        checked={trigger.is_active}
                        onCheckedChange={(checked) => toggleTrigger.mutate({ id: trigger.id, is_active: checked })}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => deleteTrigger.mutate(trigger.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <Zap className="h-8 w-8 mx-auto text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">
              No triggers configured yet
            </p>
            <p className="text-xs text-muted-foreground">
              Add a trigger to automate this agent
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
