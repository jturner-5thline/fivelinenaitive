import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Lightbulb, 
  Mail, 
  Activity, 
  RefreshCw, 
  Bell,
  Webhook
} from 'lucide-react';

export type ActionType = 'generate_insight' | 'send_email' | 'create_activity' | 'update_deal' | 'send_notification' | 'webhook';

interface ActionConfig {
  action_type: ActionType;
  email_to?: string;
  email_subject?: string;
  email_template?: string;
  activity_type?: string;
  activity_description?: string;
  deal_field?: string;
  deal_value?: string;
  notification_title?: string;
  notification_message?: string;
  webhook_url?: string;
  webhook_method?: string;
}

interface AgentActionsConfigProps {
  value: ActionConfig;
  onChange: (value: ActionConfig) => void;
}

const ACTION_TYPES = [
  { 
    value: 'generate_insight', 
    label: 'Generate Insight', 
    icon: Lightbulb,
    description: 'Agent analyzes and provides insights'
  },
  { 
    value: 'send_email', 
    label: 'Send Email', 
    icon: Mail,
    description: 'Send an email notification'
  },
  { 
    value: 'create_activity', 
    label: 'Create Activity', 
    icon: Activity,
    description: 'Log an activity on the deal'
  },
  { 
    value: 'update_deal', 
    label: 'Update Deal', 
    icon: RefreshCw,
    description: 'Update deal fields automatically'
  },
  { 
    value: 'send_notification', 
    label: 'Send Notification', 
    icon: Bell,
    description: 'Send an in-app notification'
  },
  { 
    value: 'webhook', 
    label: 'Call Webhook', 
    icon: Webhook,
    description: 'Send data to an external URL'
  },
];

export function AgentActionsConfig({ value, onChange }: AgentActionsConfigProps) {
  const selectedAction = ACTION_TYPES.find((a) => a.value === value.action_type);
  const Icon = selectedAction?.icon || Lightbulb;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Action Type</Label>
        <Select
          value={value.action_type}
          onValueChange={(v) => onChange({ ...value, action_type: v as ActionType })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACTION_TYPES.map((action) => (
              <SelectItem key={action.value} value={action.value}>
                <div className="flex items-center gap-2">
                  <action.icon className="h-4 w-4" />
                  <span>{action.label}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{selectedAction?.description}</p>
      </div>

      {/* Action-specific configuration */}
      <Card className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-primary" />
          <span className="font-medium">{selectedAction?.label} Configuration</span>
        </div>

        {value.action_type === 'generate_insight' && (
          <p className="text-sm text-muted-foreground">
            The agent will analyze the context and generate insights based on its system prompt and capabilities.
            No additional configuration needed.
          </p>
        )}

        {value.action_type === 'send_email' && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Recipient Email</Label>
              <Input
                value={value.email_to || ''}
                onChange={(e) => onChange({ ...value, email_to: e.target.value })}
                placeholder="user@example.com or {{deal_owner_email}}"
              />
              <p className="text-xs text-muted-foreground">
                Use {"{{deal_owner_email}}"} to send to deal owner
              </p>
            </div>
            <div className="space-y-2">
              <Label>Email Subject</Label>
              <Input
                value={value.email_subject || ''}
                onChange={(e) => onChange({ ...value, email_subject: e.target.value })}
                placeholder="Agent Alert: {{deal_name}}"
              />
            </div>
            <div className="space-y-2">
              <Label>Email Template</Label>
              <Textarea
                value={value.email_template || ''}
                onChange={(e) => onChange({ ...value, email_template: e.target.value })}
                placeholder="The agent insight will be included automatically..."
                rows={3}
              />
            </div>
          </div>
        )}

        {value.action_type === 'create_activity' && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Activity Type</Label>
              <Select
                value={value.activity_type || 'ai_insight'}
                onValueChange={(v) => onChange({ ...value, activity_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ai_insight">AI Insight</SelectItem>
                  <SelectItem value="note">Note</SelectItem>
                  <SelectItem value="status_update">Status Update</SelectItem>
                  <SelectItem value="alert">Alert</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Description Template</Label>
              <Textarea
                value={value.activity_description || ''}
                onChange={(e) => onChange({ ...value, activity_description: e.target.value })}
                placeholder="Agent generated insight for {{deal_name}}"
                rows={2}
              />
            </div>
          </div>
        )}

        {value.action_type === 'update_deal' && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Field to Update</Label>
              <Select
                value={value.deal_field || 'notes'}
                onValueChange={(v) => onChange({ ...value, deal_field: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="notes">Notes</SelectItem>
                  <SelectItem value="narrative">Narrative</SelectItem>
                  <SelectItem value="stage">Stage</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Value</Label>
              <Input
                value={value.deal_value || ''}
                onChange={(e) => onChange({ ...value, deal_value: e.target.value })}
                placeholder="Use {{agent_output}} for AI response"
              />
              <p className="text-xs text-muted-foreground">
                Use {"{{agent_output}}"} to include the agent's response
              </p>
            </div>
          </div>
        )}

        {value.action_type === 'send_notification' && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Notification Title</Label>
              <Input
                value={value.notification_title || ''}
                onChange={(e) => onChange({ ...value, notification_title: e.target.value })}
                placeholder="Agent Alert"
              />
            </div>
            <div className="space-y-2">
              <Label>Notification Message</Label>
              <Textarea
                value={value.notification_message || ''}
                onChange={(e) => onChange({ ...value, notification_message: e.target.value })}
                placeholder="{{agent_output}}"
                rows={2}
              />
            </div>
          </div>
        )}

        {value.action_type === 'webhook' && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Webhook URL</Label>
              <Input
                value={value.webhook_url || ''}
                onChange={(e) => onChange({ ...value, webhook_url: e.target.value })}
                placeholder="https://api.example.com/webhook"
              />
            </div>
            <div className="space-y-2">
              <Label>HTTP Method</Label>
              <Select
                value={value.webhook_method || 'POST'}
                onValueChange={(v) => onChange({ ...value, webhook_method: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                  <SelectItem value="PATCH">PATCH</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              The agent output and context will be sent as JSON payload
            </p>
          </div>
        )}
      </Card>

      {/* Available Variables */}
      <div className="space-y-2">
        <Label className="text-xs">Available Variables</Label>
        <div className="flex flex-wrap gap-1">
          {['{{deal_name}}', '{{deal_value}}', '{{deal_stage}}', '{{agent_output}}', '{{deal_owner_email}}'].map((v) => (
            <Badge key={v} variant="secondary" className="text-xs font-mono">
              {v}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}
