import { Bell, Zap, Mail, Clock, ArrowDown, ArrowRight, Link2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import type { TriggerType, WorkflowAction } from './WorkflowBuilder';

interface TemplatePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUseTemplate: () => void;
  template: {
    name: string;
    description: string;
    triggerType: TriggerType;
    triggerConfig: Record<string, any>;
    actions: WorkflowAction[];
    tags: string[];
  } | null;
}

const TRIGGER_LABELS: Record<TriggerType, string> = {
  deal_stage_change: 'Deal Stage Change',
  lender_stage_change: 'Lender Stage Change',
  new_deal: 'New Deal Created',
  deal_closed: 'Deal Closed',
  scheduled: 'Scheduled',
};

const TRIGGER_ICONS: Record<TriggerType, React.ReactNode> = {
  deal_stage_change: <Zap className="h-4 w-4" />,
  lender_stage_change: <Zap className="h-4 w-4" />,
  new_deal: <Zap className="h-4 w-4" />,
  deal_closed: <Zap className="h-4 w-4" />,
  scheduled: <Clock className="h-4 w-4" />,
};

const ACTION_LABELS: Record<string, string> = {
  send_notification: 'Send Notification',
  send_email: 'Send Email',
  webhook: 'Webhook (Zapier)',
  update_field: 'Update Field',
  trigger_workflow: 'Trigger Workflow',
};

const ACTION_ICONS: Record<string, React.ReactNode> = {
  send_notification: <Bell className="h-4 w-4" />,
  send_email: <Mail className="h-4 w-4" />,
  webhook: <Zap className="h-4 w-4" />,
  update_field: <Zap className="h-4 w-4" />,
  trigger_workflow: <Link2 className="h-4 w-4" />,
};

export function TemplatePreviewDialog({
  open,
  onOpenChange,
  onUseTemplate,
  template,
}: TemplatePreviewDialogProps) {
  if (!template) return null;

  const renderTriggerConfig = () => {
    const config = template.triggerConfig;
    if (!config || Object.keys(config).length === 0) {
      return <span className="text-muted-foreground text-sm">No specific configuration</span>;
    }

    return (
      <div className="space-y-1 text-sm">
        {config.fromStage && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">From Stage:</span>
            <Badge variant="outline">{config.fromStage || 'Any'}</Badge>
          </div>
        )}
        {config.toStage && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">To Stage:</span>
            <Badge variant="outline">{config.toStage || 'Any'}</Badge>
          </div>
        )}
        {config.closedStatus && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Status:</span>
            <Badge variant="outline">{config.closedStatus}</Badge>
          </div>
        )}
        {config.schedule && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Schedule:</span>
            <Badge variant="outline">{config.schedule}</Badge>
          </div>
        )}
      </div>
    );
  };

  const renderActionConfig = (action: WorkflowAction) => {
    const config = action.config;
    
    return (
      <div className="space-y-2 text-sm">
        {config.title && (
          <div>
            <span className="text-muted-foreground">Title:</span>
            <p className="font-medium">{config.title}</p>
          </div>
        )}
        {config.message && (
          <div>
            <span className="text-muted-foreground">Message:</span>
            <p className="text-foreground/80 bg-muted/50 rounded p-2 mt-1 font-mono text-xs">
              {config.message}
            </p>
          </div>
        )}
        {config.subject && (
          <div>
            <span className="text-muted-foreground">Subject:</span>
            <p className="font-medium">{config.subject}</p>
          </div>
        )}
        {config.body && (
          <div>
            <span className="text-muted-foreground">Body:</span>
            <p className="text-foreground/80 bg-muted/50 rounded p-2 mt-1 text-xs">
              {config.body}
            </p>
          </div>
        )}
        {config.url && (
          <div>
            <span className="text-muted-foreground">URL:</span>
            <p className="font-mono text-xs bg-muted/50 rounded p-2 mt-1 break-all">
              {config.url}
            </p>
          </div>
        )}
        {action.delay && (
          <div className="flex items-center gap-2 pt-2">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">
              Delay: {action.delay.amount} {action.delay.unit}
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>{template.name}</DialogTitle>
          <DialogDescription>{template.description}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[50vh] pr-4">
          <div className="space-y-6">
            {/* Trigger Section */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Trigger
              </h4>
              <div className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  {TRIGGER_ICONS[template.triggerType]}
                </div>
                <div className="flex-1">
                  <p className="font-medium">{TRIGGER_LABELS[template.triggerType]}</p>
                  <div className="mt-2">
                    {renderTriggerConfig()}
                  </div>
                </div>
              </div>
            </div>

            {/* Flow Arrow */}
            <div className="flex justify-center">
              <ArrowDown className="h-5 w-5 text-muted-foreground" />
            </div>

            {/* Actions Section */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Actions ({template.actions.length})
              </h4>
              <div className="space-y-3">
                {template.actions.map((action, index) => (
                  <div key={action.id || index}>
                    <div className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                      <div className="p-2 rounded-lg bg-secondary text-secondary-foreground">
                        {ACTION_ICONS[action.type]}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{ACTION_LABELS[action.type]}</p>
                          <Badge variant="outline" className="text-xs">
                            Step {index + 1}
                          </Badge>
                        </div>
                        <div className="mt-2">
                          {renderActionConfig(action)}
                        </div>
                      </div>
                    </div>
                    {index < template.actions.length - 1 && (
                      <div className="flex justify-center py-2">
                        <ArrowDown className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Tags */}
            {template.tags.length > 0 && (
              <>
                <Separator />
                <div className="flex flex-wrap gap-1">
                  {template.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onUseTemplate}>
            Use This Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
