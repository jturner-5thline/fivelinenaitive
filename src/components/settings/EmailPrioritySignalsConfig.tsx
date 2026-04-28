import { useMemo } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  PRIORITY_SIGNAL_DEFS,
  DEFAULT_ENABLED_SIGNALS,
  type EmailPrioritySignalType,
} from '@/lib/emailPrioritySignals';

interface Props {
  /** Current per-user config: { signal_types: EmailPrioritySignalType[] } */
  currentConfig: { signal_types?: EmailPrioritySignalType[] } | null;
  onChange: (next: { signal_types: EmailPrioritySignalType[] }) => void;
  disabled?: boolean;
}

/**
 * Settings card body for the Email Priority Signal trigger. Lets the user
 * pick exactly which signal types should fire an in-app + Slack
 * notification when detected in inbound email. Stored in
 * user_notification_preferences.custom_recipients.signal_types.
 */
export function EmailPrioritySignalsConfig({ currentConfig, onChange, disabled }: Props) {
  const enabled = useMemo<Set<EmailPrioritySignalType>>(() => {
    const list =
      currentConfig?.signal_types && currentConfig.signal_types.length > 0
        ? currentConfig.signal_types
        : DEFAULT_ENABLED_SIGNALS;
    return new Set(list);
  }, [currentConfig]);

  const toggle = (type: EmailPrioritySignalType, checked: boolean) => {
    const next = new Set(enabled);
    if (checked) next.add(type);
    else next.delete(type);
    onChange({ signal_types: Array.from(next) });
  };

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        Notify me when these signals are detected
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
        {PRIORITY_SIGNAL_DEFS.map((def) => {
          const id = `signal-${def.type}`;
          const isOn = enabled.has(def.type);
          return (
            <div key={def.type} className="flex items-start gap-2">
              <Checkbox
                id={id}
                checked={isOn}
                disabled={disabled}
                onCheckedChange={(c) => toggle(def.type, !!c)}
                className="mt-0.5"
              />
              <div className="min-w-0">
                <Label htmlFor={id} className="text-xs font-medium cursor-pointer">
                  {def.label}
                </Label>
                <p className="text-[10px] text-muted-foreground leading-tight">
                  {def.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
