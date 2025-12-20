import { useState } from 'react';
import { Plus, Trash2, Zap, Bell, Mail, Clock, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';

export type TriggerType = 'deal_stage_change' | 'lender_stage_change' | 'new_deal' | 'deal_closed' | 'scheduled';

export type ActionType = 'send_notification' | 'send_email' | 'webhook' | 'update_field';

export interface WorkflowAction {
  id: string;
  type: ActionType;
  config: Record<string, any>;
}

export interface WorkflowData {
  name: string;
  description: string;
  isActive: boolean;
  triggerType: TriggerType;
  triggerConfig: Record<string, any>;
  actions: WorkflowAction[];
}

interface WorkflowBuilderProps {
  initialData?: WorkflowData;
  onSave: (data: WorkflowData) => void;
  onCancel: () => void;
  isSaving?: boolean;
}

const TRIGGER_OPTIONS: { value: TriggerType; label: string; icon: React.ReactNode; description: string }[] = [
  { value: 'deal_stage_change', label: 'Deal Stage Change', icon: <Zap className="h-4 w-4" />, description: 'Triggers when a deal moves to a different stage' },
  { value: 'lender_stage_change', label: 'Lender Stage Change', icon: <Zap className="h-4 w-4" />, description: 'Triggers when a lender status changes' },
  { value: 'new_deal', label: 'New Deal Created', icon: <Plus className="h-4 w-4" />, description: 'Triggers when a new deal is created' },
  { value: 'deal_closed', label: 'Deal Closed', icon: <Zap className="h-4 w-4" />, description: 'Triggers when a deal is closed (won or lost)' },
  { value: 'scheduled', label: 'Scheduled', icon: <Clock className="h-4 w-4" />, description: 'Runs on a schedule (daily, weekly, etc.)' },
];

const ACTION_OPTIONS: { value: ActionType; label: string; icon: React.ReactNode; description: string }[] = [
  { value: 'send_notification', label: 'Send Notification', icon: <Bell className="h-4 w-4" />, description: 'Send an in-app notification' },
  { value: 'send_email', label: 'Send Email', icon: <Mail className="h-4 w-4" />, description: 'Send an email notification' },
  { value: 'webhook', label: 'Webhook (Zapier)', icon: <Zap className="h-4 w-4" />, description: 'Call an external webhook URL' },
  { value: 'update_field', label: 'Update Field', icon: <Zap className="h-4 w-4" />, description: 'Update a field on the deal or lender' },
];

export function WorkflowBuilder({ initialData, onSave, onCancel, isSaving }: WorkflowBuilderProps) {
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [isActive, setIsActive] = useState(initialData?.isActive ?? true);
  const [triggerType, setTriggerType] = useState<TriggerType>(initialData?.triggerType || 'deal_stage_change');
  const [triggerConfig, setTriggerConfig] = useState<Record<string, any>>(initialData?.triggerConfig || {});
  const [actions, setActions] = useState<WorkflowAction[]>(initialData?.actions || []);

  const addAction = (type: ActionType) => {
    const newAction: WorkflowAction = {
      id: crypto.randomUUID(),
      type,
      config: {},
    };
    setActions([...actions, newAction]);
  };

  const removeAction = (id: string) => {
    setActions(actions.filter(a => a.id !== id));
  };

  const updateActionConfig = (id: string, config: Record<string, any>) => {
    setActions(actions.map(a => a.id === id ? { ...a, config } : a));
  };

  const handleSave = () => {
    onSave({
      name,
      description,
      isActive,
      triggerType,
      triggerConfig,
      actions,
    });
  };

  const renderTriggerConfig = () => {
    switch (triggerType) {
      case 'deal_stage_change':
        return (
          <div className="space-y-3">
            <div>
              <Label>From Stage (optional)</Label>
              <Input
                placeholder="Any stage"
                value={triggerConfig.fromStage || ''}
                onChange={(e) => setTriggerConfig({ ...triggerConfig, fromStage: e.target.value })}
              />
            </div>
            <div>
              <Label>To Stage (optional)</Label>
              <Input
                placeholder="Any stage"
                value={triggerConfig.toStage || ''}
                onChange={(e) => setTriggerConfig({ ...triggerConfig, toStage: e.target.value })}
              />
            </div>
          </div>
        );
      case 'lender_stage_change':
        return (
          <div className="space-y-3">
            <div>
              <Label>From Stage (optional)</Label>
              <Input
                placeholder="Any stage"
                value={triggerConfig.fromStage || ''}
                onChange={(e) => setTriggerConfig({ ...triggerConfig, fromStage: e.target.value })}
              />
            </div>
            <div>
              <Label>To Stage (optional)</Label>
              <Input
                placeholder="Any stage"
                value={triggerConfig.toStage || ''}
                onChange={(e) => setTriggerConfig({ ...triggerConfig, toStage: e.target.value })}
              />
            </div>
          </div>
        );
      case 'scheduled':
        return (
          <div>
            <Label>Schedule</Label>
            <Select
              value={triggerConfig.schedule || 'daily'}
              onValueChange={(v) => setTriggerConfig({ ...triggerConfig, schedule: v })}
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
        );
      default:
        return <p className="text-sm text-muted-foreground">No additional configuration needed</p>;
    }
  };

  const renderActionConfig = (action: WorkflowAction) => {
    switch (action.type) {
      case 'send_notification':
        return (
          <div className="space-y-3">
            <div>
              <Label>Title</Label>
              <Input
                placeholder="Notification title"
                value={action.config.title || ''}
                onChange={(e) => updateActionConfig(action.id, { ...action.config, title: e.target.value })}
              />
            </div>
            <div>
              <Label>Message</Label>
              <Textarea
                placeholder="Notification message"
                value={action.config.message || ''}
                onChange={(e) => updateActionConfig(action.id, { ...action.config, message: e.target.value })}
              />
            </div>
          </div>
        );
      case 'send_email':
        return (
          <div className="space-y-3">
            <div>
              <Label>Subject</Label>
              <Input
                placeholder="Email subject"
                value={action.config.subject || ''}
                onChange={(e) => updateActionConfig(action.id, { ...action.config, subject: e.target.value })}
              />
            </div>
            <div>
              <Label>Body</Label>
              <Textarea
                placeholder="Email body"
                value={action.config.body || ''}
                onChange={(e) => updateActionConfig(action.id, { ...action.config, body: e.target.value })}
              />
            </div>
          </div>
        );
      case 'webhook':
        return (
          <div className="space-y-3">
            <div>
              <Label>Webhook URL (e.g., Zapier)</Label>
              <Input
                placeholder="https://hooks.zapier.com/..."
                value={action.config.url || ''}
                onChange={(e) => updateActionConfig(action.id, { ...action.config, url: e.target.value })}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              The workflow will POST data to this URL when triggered
            </p>
          </div>
        );
      case 'update_field':
        return (
          <div className="space-y-3">
            <div>
              <Label>Field to Update</Label>
              <Select
                value={action.config.field || ''}
                onValueChange={(v) => updateActionConfig(action.id, { ...action.config, field: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select field" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="status">Status</SelectItem>
                  <SelectItem value="stage">Stage</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>New Value</Label>
              <Input
                placeholder="New value"
                value={action.config.value || ''}
                onChange={(e) => updateActionConfig(action.id, { ...action.config, value: e.target.value })}
              />
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const selectedTrigger = TRIGGER_OPTIONS.find(t => t.value === triggerType);

  return (
    <div className="space-y-6">
      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Workflow Name</Label>
            <Input
              placeholder="e.g., Notify on Deal Close"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Textarea
              placeholder="What does this workflow do?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Active</Label>
              <p className="text-sm text-muted-foreground">Enable or disable this workflow</p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </CardContent>
      </Card>

      {/* Trigger */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Trigger
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>When should this workflow run?</Label>
            <Select value={triggerType} onValueChange={(v) => { setTriggerType(v as TriggerType); setTriggerConfig({}); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIGGER_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div className="flex items-center gap-2">
                      {opt.icon}
                      {opt.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTrigger && (
              <p className="text-sm text-muted-foreground mt-1">{selectedTrigger.description}</p>
            )}
          </div>
          <div className="border-t pt-4">
            <Label className="text-sm font-medium">Trigger Configuration</Label>
            <div className="mt-2">
              {renderTriggerConfig()}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowRight className="h-4 w-4 text-primary" />
            Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {actions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No actions added yet. Add an action below.
            </p>
          ) : (
            <div className="space-y-4">
              {actions.map((action, index) => {
                const actionDef = ACTION_OPTIONS.find(a => a.value === action.type);
                return (
                  <div key={action.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="gap-1">
                          {actionDef?.icon}
                          {actionDef?.label}
                        </Badge>
                        <span className="text-xs text-muted-foreground">Action {index + 1}</span>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => removeAction(action.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    {renderActionConfig(action)}
                  </div>
                );
              })}
            </div>
          )}

          <div className="border-t pt-4">
            <Label className="text-sm font-medium mb-2 block">Add Action</Label>
            <div className="grid grid-cols-2 gap-2">
              {ACTION_OPTIONS.map(opt => (
                <Button
                  key={opt.value}
                  variant="outline"
                  className="justify-start gap-2"
                  onClick={() => addAction(opt.value)}
                >
                  {opt.icon}
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={!name.trim() || isSaving}>
          {isSaving ? 'Saving...' : 'Save Workflow'}
        </Button>
      </div>
    </div>
  );
}
