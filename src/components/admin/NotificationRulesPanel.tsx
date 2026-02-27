import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Bell, Mail, MessageSquare, Smartphone, Zap, Users, ChevronRight, Pencil, Save, X, Search, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useNotificationRules, useUpdateNotificationRule, type NotificationRule, type ChannelConfig } from '@/hooks/useNotificationRules';
import { cn } from '@/lib/utils';

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  in_app: <Bell className="h-4 w-4" />,
  email: <Mail className="h-4 w-4" />,
  slack: <MessageSquare className="h-4 w-4" />,
  sms: <Smartphone className="h-4 w-4" />,
  push: <Zap className="h-4 w-4" />,
};

const CHANNEL_LABELS: Record<string, string> = {
  in_app: 'In-App',
  email: 'Email',
  slack: 'Slack',
  sms: 'SMS',
  push: 'Push',
};

const CATEGORY_LABELS: Record<string, string> = {
  deals: 'Deals',
  tasks: 'Tasks',
  lenders: 'Lenders',
  milestones: 'Milestones',
  reporting: 'Reporting',
  system: 'System',
};

const CATEGORY_COLORS: Record<string, string> = {
  deals: 'bg-primary/10 text-primary',
  tasks: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  lenders: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  milestones: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  reporting: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  system: 'bg-muted text-muted-foreground',
};

const ROLE_LABELS: Record<string, string> = {
  DEAL_OWNER: 'Deal Owner',
  DEAL_MANAGER: 'Deal Manager',
  ANALYST: 'Analyst',
  ADMIN: 'Admin',
  ASSIGNEE: 'Assignee',
};

function TemplateEditor({
  rule,
  onSave,
  isSaving,
}: {
  rule: NotificationRule;
  onSave: (channels: ChannelConfig[]) => void;
  isSaving: boolean;
}) {
  const [channels, setChannels] = useState<ChannelConfig[]>(rule.channels);

  const updateChannel = (index: number, updates: Partial<ChannelConfig>) => {
    const updated = [...channels];
    updated[index] = { ...updated[index], ...updates };
    setChannels(updated);
  };

  const updateTemplate = (index: number, field: string, value: string) => {
    const updated = [...channels];
    updated[index] = {
      ...updated[index],
      template: { ...updated[index].template, [field]: value },
    };
    setChannels(updated);
  };

  return (
    <div className="space-y-4">
      {channels.map((channel, idx) => (
        <div key={channel.channel_type} className="border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {CHANNEL_ICONS[channel.channel_type]}
              <span className="font-medium text-sm">{CHANNEL_LABELS[channel.channel_type]}</span>
            </div>
            <Switch
              checked={channel.is_enabled}
              onCheckedChange={(checked) => updateChannel(idx, { is_enabled: checked })}
            />
          </div>

          {channel.is_enabled && (
            <div className="space-y-3 pl-6 border-l-2 border-muted ml-2">
              {channel.channel_type === 'email' && (
                <div>
                  <Label className="text-xs text-muted-foreground">Subject</Label>
                  <Input
                    value={channel.template.subject || ''}
                    onChange={(e) => updateTemplate(idx, 'subject', e.target.value)}
                    placeholder="Email subject with {{variables}}"
                    className="mt-1"
                  />
                </div>
              )}
              {(channel.channel_type === 'in_app') && (
                <div>
                  <Label className="text-xs text-muted-foreground">Title</Label>
                  <Input
                    value={channel.template.title || ''}
                    onChange={(e) => updateTemplate(idx, 'title', e.target.value)}
                    placeholder="Notification title"
                    className="mt-1"
                  />
                </div>
              )}
              <div>
                <Label className="text-xs text-muted-foreground">Body</Label>
                <Textarea
                  value={channel.template.body}
                  onChange={(e) => updateTemplate(idx, 'body', e.target.value)}
                  placeholder="Message body with {{variables}}"
                  className="mt-1 min-h-[80px] font-mono text-xs"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Available variables: {'{{deal_name}}, {{actor_name}}, {{recipient_name}}, {{lender_name}}, {{milestone_title}}, {{old_stage}}, {{new_stage}}, {{due_date}}'}
              </p>
            </div>
          )}
        </div>
      ))}

      <Button onClick={() => onSave(channels)} disabled={isSaving} className="w-full gap-2">
        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save Templates
      </Button>
    </div>
  );
}

export function NotificationRulesPanel() {
  const { data: rules, isLoading } = useNotificationRules();
  const updateRule = useUpdateNotificationRule();
  const [searchQuery, setSearchQuery] = useState('');
  const [editingRule, setEditingRule] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  const filteredRules = (rules || []).filter(rule => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      rule.name.toLowerCase().includes(q) ||
      rule.trigger_key.toLowerCase().includes(q) ||
      rule.category.toLowerCase().includes(q) ||
      (rule.description || '').toLowerCase().includes(q)
    );
  });

  // Group by category
  const grouped = filteredRules.reduce<Record<string, NotificationRule[]>>((acc, rule) => {
    const cat = rule.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(rule);
    return acc;
  }, {});

  const handleToggle = async (rule: NotificationRule) => {
    try {
      await updateRule.mutateAsync({ id: rule.id, is_enabled: !rule.is_enabled });
      toast.success(`${rule.name} ${rule.is_enabled ? 'disabled' : 'enabled'}`);
    } catch {
      toast.error('Failed to update rule');
    }
  };

  const handleChannelToggle = async (rule: NotificationRule, channelType: string, enabled: boolean) => {
    const updated = rule.channels.map(ch =>
      ch.channel_type === channelType ? { ...ch, is_enabled: enabled } : ch
    );
    try {
      await updateRule.mutateAsync({ id: rule.id, channels: updated });
      toast.success(`${CHANNEL_LABELS[channelType]} ${enabled ? 'enabled' : 'disabled'} for ${rule.name}`);
    } catch {
      toast.error('Failed to update channel');
    }
  };

  const handleSaveTemplates = async (ruleId: string, channels: ChannelConfig[]) => {
    try {
      await updateRule.mutateAsync({ id: ruleId, channels });
      toast.success('Templates saved');
      setEditingRule(null);
    } catch {
      toast.error('Failed to save templates');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Notification Rules</h3>
          <p className="text-sm text-muted-foreground">Configure triggers, channels, templates, and recipients for all notification types</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search notification rules..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {Object.keys(grouped).length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Bell className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">No notification rules found</p>
          </CardContent>
        </Card>
      )}

      <Accordion type="multiple" defaultValue={Object.keys(grouped)} className="space-y-4">
        {Object.entries(grouped).map(([category, catRules]) => (
          <AccordionItem key={category} value={category} className="border rounded-lg">
            <AccordionTrigger className="px-4 py-3 hover:no-underline">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className={cn('text-xs', CATEGORY_COLORS[category])}>
                  {CATEGORY_LABELS[category] || category}
                </Badge>
                <span className="text-sm text-muted-foreground">{catRules.length} rule{catRules.length !== 1 ? 's' : ''}</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-0 pb-0">
              <div className="divide-y">
                {catRules.map((rule) => (
                  <div key={rule.id} className="p-4 space-y-3">
                    {/* Rule header */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-medium text-sm">{rule.name}</h4>
                          <Badge variant="outline" className="text-[10px] font-mono">
                            {rule.trigger_key}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{rule.description}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Dialog open={editingRule === rule.id} onOpenChange={(open) => setEditingRule(open ? rule.id : null)}>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>Edit Templates: {rule.name}</DialogTitle>
                              <DialogDescription>Configure message templates for each delivery channel</DialogDescription>
                            </DialogHeader>
                            <TemplateEditor
                              rule={rule}
                              onSave={(channels) => handleSaveTemplates(rule.id, channels)}
                              isSaving={updateRule.isPending}
                            />
                          </DialogContent>
                        </Dialog>
                        <Switch
                          checked={rule.is_enabled}
                          onCheckedChange={() => handleToggle(rule)}
                          disabled={updateRule.isPending}
                        />
                      </div>
                    </div>

                    {/* Channels row */}
                    <div className="flex items-center gap-3 flex-wrap">
                      {rule.channels.map((channel) => (
                        <div
                          key={channel.channel_type}
                          className={cn(
                            "flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs transition-colors cursor-pointer",
                            channel.is_enabled
                              ? "bg-primary/10 border-primary/30 text-primary"
                              : "bg-muted/50 border-border text-muted-foreground"
                          )}
                          onClick={() => handleChannelToggle(rule, channel.channel_type, !channel.is_enabled)}
                        >
                          {CHANNEL_ICONS[channel.channel_type]}
                          <span>{CHANNEL_LABELS[channel.channel_type]}</span>
                        </div>
                      ))}
                    </div>

                    {/* Recipients */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Recipients:</span>
                      {(rule.default_recipients.roles || []).map((role) => (
                        <Badge key={role} variant="secondary" className="text-[10px] h-5">
                          {ROLE_LABELS[role] || role}
                        </Badge>
                      ))}
                      {(rule.default_recipients.user_ids || []).length > 0 && (
                        <Badge variant="outline" className="text-[10px] h-5">
                          +{rule.default_recipients.user_ids!.length} user{rule.default_recipients.user_ids!.length !== 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
