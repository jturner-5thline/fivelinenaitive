import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Bell, Mail, MessageSquare, Smartphone, Zap, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { useNotificationRules, type NotificationRule } from '@/hooks/useNotificationRules';
import {
  useUserNotificationPreferences,
  useUpsertUserNotificationPreference,
  useResetUserNotificationPreference,
  type UserNotificationPreference,
} from '@/hooks/useUserNotificationPreferences';
import { cn } from '@/lib/utils';
import {
  NotificationTriggerConfig,
  type TriggerCustomConfig,
} from './NotificationTriggerConfig';
import { EmailPrioritySignalsConfig } from './EmailPrioritySignalsConfig';
import type { EmailPrioritySignalType } from '@/lib/emailPrioritySignals';

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  in_app: <Bell className="h-3.5 w-3.5" />,
  email: <Mail className="h-3.5 w-3.5" />,
  slack: <MessageSquare className="h-3.5 w-3.5" />,
  sms: <Smartphone className="h-3.5 w-3.5" />,
  push: <Zap className="h-3.5 w-3.5" />,
};

const CHANNEL_LABELS: Record<string, string> = {
  in_app: 'Platform',
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

export function UserNotificationSettings() {
  const { data: rules, isLoading: rulesLoading } = useNotificationRules();
  const { data: userPrefs, isLoading: prefsLoading } = useUserNotificationPreferences();
  const upsertPref = useUpsertUserNotificationPreference();
  const resetPref = useResetUserNotificationPreference();

  const prefsMap = useMemo(() => {
    const map: Record<string, UserNotificationPreference> = {};
    (userPrefs || []).forEach((p) => {
      map[p.trigger_key] = p;
    });
    return map;
  }, [userPrefs]);

  const isLoading = rulesLoading || prefsLoading;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  const enabledRules = (rules || []).filter((r) => r.is_enabled);

  const grouped = enabledRules.reduce<Record<string, NotificationRule[]>>((acc, rule) => {
    const cat = rule.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(rule);
    return acc;
  }, {});

  const handleToggle = async (triggerKey: string, currentEnabled: boolean) => {
    try {
      const existing = prefsMap[triggerKey];
      await upsertPref.mutateAsync({
        trigger_key: triggerKey,
        is_enabled: !currentEnabled,
        channel_overrides: existing?.channel_overrides || {},
      });
      toast.success(!currentEnabled ? 'Notification enabled' : 'Notification disabled');
    } catch {
      toast.error('Failed to update preference');
    }
  };

  const handleChannelToggle = async (triggerKey: string, channelType: string, enabled: boolean) => {
    try {
      const existing = prefsMap[triggerKey];
      const currentOverrides = existing?.channel_overrides || {};
      await upsertPref.mutateAsync({
        trigger_key: triggerKey,
        is_enabled: existing?.is_enabled ?? true,
        channel_overrides: {
          ...currentOverrides,
          [channelType]: { is_enabled: enabled },
        },
      });
      toast.success(`${CHANNEL_LABELS[channelType]} ${enabled ? 'enabled' : 'disabled'}`);
    } catch {
      toast.error('Failed to update channel preference');
    }
  };

  const handleConfigChange = async (triggerKey: string, config: TriggerCustomConfig) => {
    try {
      const existing = prefsMap[triggerKey];
      await upsertPref.mutateAsync({
        trigger_key: triggerKey,
        is_enabled: existing?.is_enabled ?? true,
        channel_overrides: existing?.channel_overrides || {},
        custom_config: config as unknown as Record<string, unknown>,
      });
    } catch {
      toast.error('Failed to update configuration');
    }
  };

  const handleReset = async (triggerKey: string) => {
    try {
      await resetPref.mutateAsync(triggerKey);
      toast.success('Reset to defaults');
    } catch {
      toast.error('Failed to reset preference');
    }
  };

  const isUserEnabled = (triggerKey: string): boolean => {
    const pref = prefsMap[triggerKey];
    return pref?.is_enabled ?? true;
  };

  const isChannelEnabled = (triggerKey: string, channelType: string, ruleChannelEnabled: boolean): boolean => {
    if (!ruleChannelEnabled) return false;
    const pref = prefsMap[triggerKey];
    const override = pref?.channel_overrides?.[channelType];
    return override?.is_enabled ?? true;
  };

  const hasOverride = (triggerKey: string): boolean => {
    return !!prefsMap[triggerKey];
  };

  const getCustomConfig = (triggerKey: string): TriggerCustomConfig | null => {
    const pref = prefsMap[triggerKey];
    return (pref?.custom_recipients as unknown as TriggerCustomConfig) || null;
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Notification Preferences</h3>
        <p className="text-sm text-muted-foreground">Choose which notifications you receive and how they're delivered</p>
      </div>

      {Object.entries(grouped).map(([category, catRules]) => (
        <Card key={category}>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{CATEGORY_LABELS[category] || category}</CardTitle>
            <CardDescription>{catRules.length} notification type{catRules.length !== 1 ? 's' : ''}</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="divide-y">
              {catRules.map((rule) => {
                const enabled = isUserEnabled(rule.trigger_key);
                const hasCustom = hasOverride(rule.trigger_key);
                const enabledChannels = rule.channels.filter((ch) => ch.is_enabled);
                const hasExtraConfig = !!(rule.metadata as Record<string, unknown>)?.config_type;

                return (
                  <div key={rule.id} className={cn("py-4 space-y-3", !enabled && "opacity-60")}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-sm">{rule.name}</h4>
                          {hasCustom && (
                            <Badge variant="outline" className="text-[10px] h-4">Customized</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{rule.description}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {hasCustom && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleReset(rule.trigger_key)}
                            disabled={resetPref.isPending}
                            title="Reset to defaults"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Switch
                          checked={enabled}
                          onCheckedChange={() => handleToggle(rule.trigger_key, enabled)}
                          disabled={upsertPref.isPending}
                        />
                      </div>
                    </div>

                    {enabled && enabledChannels.length > 0 && (
                      <div className="flex items-center gap-3 flex-wrap pl-1">
                        {enabledChannels.map((channel) => {
                          const channelEnabled = isChannelEnabled(rule.trigger_key, channel.channel_type, channel.is_enabled);
                          return (
                            <div
                              key={channel.channel_type}
                              className={cn(
                                "flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs transition-colors cursor-pointer",
                                channelEnabled
                                  ? "bg-primary/10 border-primary/30 text-primary"
                                  : "bg-muted/50 border-border text-muted-foreground"
                              )}
                              onClick={() => handleChannelToggle(rule.trigger_key, channel.channel_type, !channelEnabled)}
                            >
                              {CHANNEL_ICONS[channel.channel_type]}
                              <span>{CHANNEL_LABELS[channel.channel_type]}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {enabled && hasExtraConfig && (
                      <NotificationTriggerConfig
                        triggerKey={rule.trigger_key}
                        metadata={rule.metadata as Record<string, unknown>}
                        currentConfig={getCustomConfig(rule.trigger_key)}
                        onConfigChange={(config) => handleConfigChange(rule.trigger_key, config)}
                        disabled={upsertPref.isPending}
                      />
                    )}

                    {enabled && rule.trigger_key === 'email_priority_signal' && (
                      <EmailPrioritySignalsConfig
                        currentConfig={
                          getCustomConfig(rule.trigger_key) as
                            | { signal_types?: EmailPrioritySignalType[] }
                            | null
                        }
                        onChange={(cfg) =>
                          handleConfigChange(
                            rule.trigger_key,
                            cfg as unknown as TriggerCustomConfig,
                          )
                        }
                        disabled={upsertPref.isPending}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}

      {Object.keys(grouped).length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Bell className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">No notification types configured</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
