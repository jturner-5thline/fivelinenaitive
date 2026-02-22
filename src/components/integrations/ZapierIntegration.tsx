import { useState } from 'react';
import { Zap, Plus, Trash2, ToggleLeft, ToggleRight, Send, ChevronDown, ChevronUp, ExternalLink, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useZapierWebhooks, useZapierWebhookLogs, ZAPIER_EVENT_TYPES } from '@/hooks/useZapierWebhooks';
import { formatDistanceToNow } from 'date-fns';

function WebhookLogViewer({ webhookId }: { webhookId: string }) {
  const { data: logs, isLoading } = useZapierWebhookLogs(webhookId);

  if (isLoading) return <div className="text-xs text-muted-foreground py-2">Loading logs...</div>;
  if (!logs || logs.length === 0) return <div className="text-xs text-muted-foreground py-2">No delivery logs yet.</div>;

  return (
    <ScrollArea className="max-h-[200px]">
      <div className="space-y-1.5">
        {logs.map(log => (
          <div key={log.id} className="flex items-center gap-2 text-xs py-1 border-b border-border/50 last:border-0">
            {log.success ? (
              <CheckCircle2 className="h-3 w-3 text-success flex-shrink-0" />
            ) : (
              <XCircle className="h-3 w-3 text-destructive flex-shrink-0" />
            )}
            <span className="text-muted-foreground">{log.event_type}</span>
            {log.status_code && <Badge variant="outline" className="text-[10px] h-4">{log.status_code}</Badge>}
            <span className="ml-auto text-muted-foreground">{formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}</span>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

export function ZapierIntegration() {
  const { webhooks, isLoading, createWebhook, updateWebhook, deleteWebhook, testWebhook } = useZapierWebhooks();
  const [isAdding, setIsAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newEventTypes, setNewEventTypes] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newUrl.trim()) return;
    await createWebhook.mutateAsync({
      label: newLabel.trim() || 'My Zapier Webhook',
      webhook_url: newUrl.trim(),
      event_types: newEventTypes,
    });
    setIsAdding(false);
    setNewLabel('');
    setNewUrl('');
    setNewEventTypes([]);
  };

  const toggleEventType = (eventType: string) => {
    setNewEventTypes(prev =>
      prev.includes(eventType) ? prev.filter(e => e !== eventType) : [...prev, eventType]
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative h-10 w-10 rounded-lg border border-warning/30 bg-warning/15 backdrop-blur-sm flex items-center justify-center overflow-hidden shadow-[0_0_12px_hsl(var(--warning)/0.2),inset_0_1px_1px_hsl(var(--warning)/0.15)]">
                <Zap className="relative z-10 h-5 w-5 text-warning" />
              </div>
              <div>
                <CardTitle className="text-lg">Zapier</CardTitle>
                <CardDescription>Connect to thousands of apps via Zapier webhooks</CardDescription>
              </div>
            </div>
            <Button size="sm" onClick={() => setIsAdding(true)} disabled={isAdding}>
              <Plus className="h-4 w-4 mr-1" /> Add Webhook
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* How it works */}
          <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground space-y-1">
            <p className="font-medium text-foreground text-xs">How it works</p>
            <ol className="list-decimal list-inside space-y-0.5 text-xs">
              <li>Create a Zap in <a href="https://zapier.com" target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">Zapier <ExternalLink className="h-2.5 w-2.5" /></a> with a <strong>Webhooks by Zapier</strong> trigger (Catch Hook)</li>
              <li>Copy the webhook URL and paste it below</li>
              <li>Choose which events should trigger the Zap</li>
              <li>Send a test event and configure your Zap actions</li>
            </ol>
          </div>

          {/* Add form */}
          {isAdding && (
            <Card className="border-primary/30">
              <CardContent className="pt-4 space-y-3">
                <div className="space-y-2">
                  <Label className="text-xs">Label</Label>
                  <Input
                    placeholder="e.g., Deal Updates to Slack"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Webhook URL</Label>
                  <Input
                    placeholder="https://hooks.zapier.com/hooks/catch/..."
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Events (leave empty for all events)</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {ZAPIER_EVENT_TYPES.map(evt => (
                      <label key={evt.value} className="flex items-center gap-2 text-xs cursor-pointer">
                        <Checkbox
                          checked={newEventTypes.includes(evt.value)}
                          onCheckedChange={() => toggleEventType(evt.value)}
                        />
                        {evt.label}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => setIsAdding(false)}>Cancel</Button>
                  <Button size="sm" onClick={handleCreate} disabled={!newUrl.trim() || createWebhook.isPending}>
                    {createWebhook.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                    Save Webhook
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Existing webhooks */}
          {webhooks.length === 0 && !isAdding && (
            <div className="text-center py-8 text-muted-foreground">
              <Zap className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No Zapier webhooks configured yet.</p>
              <p className="text-xs">Click "Add Webhook" to get started.</p>
            </div>
          )}

          {webhooks.map(webhook => (
            <Collapsible
              key={webhook.id}
              open={expandedId === webhook.id}
              onOpenChange={() => setExpandedId(expandedId === webhook.id ? null : webhook.id)}
            >
              <Card className="border-border/50">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Switch
                        checked={webhook.is_active}
                        onCheckedChange={(checked) =>
                          updateWebhook.mutate({ id: webhook.id, is_active: checked })
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{webhook.label}</p>
                          {webhook.event_types.length === 0 ? (
                            <Badge variant="secondary" className="text-[10px] h-4">All events</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] h-4">{webhook.event_types.length} events</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{webhook.webhook_url}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          testWebhook.mutate(webhook.id);
                        }}
                        disabled={testWebhook.isPending}
                      >
                        <Send className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteWebhook.mutate(webhook.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          {expandedId === webhook.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </Button>
                      </CollapsibleTrigger>
                    </div>
                  </div>
                  <CollapsibleContent>
                    <Separator className="my-3" />
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs font-medium mb-1">Subscribed Events</p>
                        {webhook.event_types.length === 0 ? (
                          <p className="text-xs text-muted-foreground">All events</p>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {webhook.event_types.map(et => (
                              <Badge key={et} variant="secondary" className="text-[10px]">
                                {ZAPIER_EVENT_TYPES.find(z => z.value === et)?.label || et}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-medium mb-1">Recent Deliveries</p>
                        <WebhookLogViewer webhookId={webhook.id} />
                      </div>
                    </div>
                  </CollapsibleContent>
                </CardContent>
              </Card>
            </Collapsible>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
