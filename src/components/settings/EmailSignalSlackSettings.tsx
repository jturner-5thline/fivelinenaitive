import { Flag, Loader2, MessageSquare } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  PRIORITY_SIGNAL_DEFS,
  DEFAULT_ENABLED_SIGNALS,
  getSignalSeverity,
  type EmailPrioritySignalType,
} from '@/lib/emailPrioritySignals';
import {
  useUserNotificationPreferences,
  useUpsertUserNotificationPreference,
} from '@/hooks/useUserNotificationPreferences';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const TRIGGER_KEY = 'email_priority_signal';

/**
 * Per-user toggle panel for the Slack notifications fired when high-priority
 * lender-email signals are detected (pass / decline / wire / diligence /
 * term sheet / etc). The panel writes to
 * `user_notification_preferences.custom_recipients.signal_types` for the
 * `email_priority_signal` trigger — the same row read by
 * `useEmailPrioritySignals` to decide which detected signals deserve a push.
 */
export function EmailSignalSlackSettings() {
  const { data: prefs, isLoading } = useUserNotificationPreferences();
  const upsert = useUpsertUserNotificationPreference();

  const pref = (prefs || []).find((p) => p.trigger_key === TRIGGER_KEY);
  const isEnabled = pref?.is_enabled !== false; // default ON
  const enabledTypes = new Set<EmailPrioritySignalType>(
    (pref?.custom_recipients as any)?.signal_types ?? DEFAULT_ENABLED_SIGNALS
  );

  const persist = async (
    next: { isEnabled?: boolean; enabledTypes?: EmailPrioritySignalType[] },
  ) => {
    try {
      await upsert.mutateAsync({
        trigger_key: TRIGGER_KEY,
        is_enabled: next.isEnabled ?? isEnabled,
        custom_config: {
          ...(pref?.custom_recipients as any),
          signal_types:
            next.enabledTypes ?? Array.from(enabledTypes),
        },
      });
    } catch (err: any) {
      toast({
        title: 'Could not save signal preferences',
        description: err?.message ?? 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const toggleType = (t: EmailPrioritySignalType, on: boolean) => {
    const next = new Set(enabledTypes);
    if (on) next.add(t);
    else next.delete(t);
    void persist({ enabledTypes: Array.from(next) });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-medium">Slack DMs for Email Priority Signals</h3>
      </div>
      <p className="text-sm text-muted-foreground pl-6">
        When a lender email matches a high-priority signal (e.g. <em>pass</em>,
        <em> term sheet</em>, <em>wire</em>) and is matched to a deal, send a
        Slack DM to the deal manager with the lender, deal, signal, and a deep
        link back into naitive.
      </p>

      <div className="space-y-4 pl-6">
        <div className="flex items-center justify-between">
          <Label htmlFor="email_priority_signal_master" className="flex flex-col gap-1">
            <span>Send Slack DMs for priority signals</span>
            <span className="text-sm text-muted-foreground font-normal">
              Master switch. Disable to silence all signal-based pushes.
            </span>
          </Label>
          <Switch
            id="email_priority_signal_master"
            checked={isEnabled}
            onCheckedChange={(v) => void persist({ isEnabled: v })}
            disabled={isLoading || upsert.isPending}
          />
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Signal types that trigger Slack</span>
            {upsert.isPending && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
          </div>
          <div className="grid grid-cols-1 gap-2">
            {PRIORITY_SIGNAL_DEFS.map((def) => {
              const sev = getSignalSeverity(def.type);
              const checked = enabledTypes.has(def.type);
              return (
                <div
                  key={def.type}
                  className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-card/40 px-3 py-2"
                >
                  <Label
                    htmlFor={`signal_${def.type}`}
                    className="flex flex-1 items-center gap-3 cursor-pointer"
                  >
                    <Flag
                      className={cn(
                        'h-3.5 w-3.5 shrink-0',
                        sev === 'urgent'
                          ? 'fill-red-500 text-red-500'
                          : 'fill-amber-500 text-amber-500',
                      )}
                    />
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-sm font-medium">{def.label}</span>
                      <span className="text-xs text-muted-foreground font-normal">
                        {def.description}
                      </span>
                    </div>
                  </Label>
                  <Switch
                    id={`signal_${def.type}`}
                    checked={checked}
                    onCheckedChange={(v) => toggleType(def.type, v)}
                    disabled={!isEnabled || isLoading || upsert.isPending}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}