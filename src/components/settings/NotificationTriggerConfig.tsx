import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { STAGE_CONFIG, LENDER_STAGE_CONFIG } from '@/types/deal';
import { useDealStages } from '@/contexts/DealStagesContext';

export interface TriggerCustomConfig {
  selected_stages?: string[];
  inactivity_days?: number;
  reminder_types?: string[];
  lead_days?: number;
}

interface NotificationTriggerConfigProps {
  triggerKey: string;
  metadata: Record<string, unknown>;
  currentConfig: TriggerCustomConfig | null;
  onConfigChange: (config: TriggerCustomConfig) => void;
  disabled?: boolean;
}

const REMINDER_TYPE_LABELS: Record<string, string> = {
  due_date_approaching: 'Due date approaching',
  due_today: 'Due today',
  past_due: 'Past due',
};

export function NotificationTriggerConfig({
  triggerKey,
  metadata,
  currentConfig,
  onConfigChange,
  disabled,
}: NotificationTriggerConfigProps) {
  const configType = metadata?.config_type as string | undefined;
  const { stages: dynamicDealStages } = useDealStages();

  if (!configType) return null;

  if (configType === 'stage_select') {
    const stageOptions = dynamicDealStages?.length
      ? dynamicDealStages.map((s) => ({ value: s.id, label: s.label }))
      : Object.entries(STAGE_CONFIG).map(([k, v]) => ({ value: k, label: v.label }));

    const selectedStages = currentConfig?.selected_stages || [];

    const toggleStage = (stageValue: string) => {
      const next = selectedStages.includes(stageValue)
        ? selectedStages.filter((s) => s !== stageValue)
        : [...selectedStages, stageValue];
      onConfigChange({ ...currentConfig, selected_stages: next });
    };

    return (
      <div className="space-y-2 pl-1">
        <Label className="text-xs text-muted-foreground">
          {(metadata.config_label as string) || 'Select stages'}
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {stageOptions.map((opt) => {
            const selected = selectedStages.includes(opt.value);
            return (
              <Badge
                key={opt.value}
                variant={selected ? 'default' : 'outline'}
                className={cn(
                  'cursor-pointer text-[11px] transition-colors',
                  disabled && 'pointer-events-none opacity-50'
                )}
                onClick={() => !disabled && toggleStage(opt.value)}
              >
                {opt.label}
              </Badge>
            );
          })}
        </div>
        {selectedStages.length === 0 && (
          <p className="text-[11px] text-muted-foreground">All stages selected by default</p>
        )}
      </div>
    );
  }

  if (configType === 'lender_stage_select') {
    const stageOptions = Object.entries(LENDER_STAGE_CONFIG).map(([k, v]) => ({
      value: k,
      label: v.label,
    }));

    const selectedStages = currentConfig?.selected_stages || [];

    const toggleStage = (stageValue: string) => {
      const next = selectedStages.includes(stageValue)
        ? selectedStages.filter((s) => s !== stageValue)
        : [...selectedStages, stageValue];
      onConfigChange({ ...currentConfig, selected_stages: next });
    };

    return (
      <div className="space-y-2 pl-1">
        <Label className="text-xs text-muted-foreground">
          {(metadata.config_label as string) || 'Select lender stages'}
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {stageOptions.map((opt) => {
            const selected = selectedStages.includes(opt.value);
            return (
              <Badge
                key={opt.value}
                variant={selected ? 'default' : 'outline'}
                className={cn(
                  'cursor-pointer text-[11px] transition-colors',
                  disabled && 'pointer-events-none opacity-50'
                )}
                onClick={() => !disabled && toggleStage(opt.value)}
              >
                {opt.label}
              </Badge>
            );
          })}
        </div>
        {selectedStages.length === 0 && (
          <p className="text-[11px] text-muted-foreground">All stages selected by default</p>
        )}
      </div>
    );
  }

  if (configType === 'inactivity_days') {
    const defaultDays = (metadata.default_days as number) || 7;
    const days = currentConfig?.inactivity_days ?? defaultDays;

    return (
      <div className="flex items-center gap-2 pl-1">
        <Label className="text-xs text-muted-foreground whitespace-nowrap">
          {(metadata.config_label as string) || 'Inactivity period'}:
        </Label>
        <Input
          type="number"
          min={1}
          max={90}
          value={days}
          onChange={(e) => {
            const val = Math.max(1, Math.min(90, parseInt(e.target.value) || defaultDays));
            onConfigChange({ ...currentConfig, inactivity_days: val });
          }}
          className="w-16 h-7 text-xs"
          disabled={disabled}
        />
        <span className="text-xs text-muted-foreground">days</span>
      </div>
    );
  }

  if (configType === 'reminder_config') {
    const reminderOptions = (metadata.reminder_options as string[]) || [
      'due_date_approaching',
      'due_today',
      'past_due',
    ];
    const defaultLeadDays = (metadata.default_lead_days as number) || 1;
    const selectedReminders = currentConfig?.reminder_types || reminderOptions;
    const leadDays = currentConfig?.lead_days ?? defaultLeadDays;

    const toggleReminder = (type: string) => {
      const next = selectedReminders.includes(type)
        ? selectedReminders.filter((r) => r !== type)
        : [...selectedReminders, type];
      onConfigChange({ ...currentConfig, reminder_types: next, lead_days: leadDays });
    };

    return (
      <div className="space-y-2 pl-1">
        <Label className="text-xs text-muted-foreground">
          {(metadata.config_label as string) || 'Reminder settings'}
        </Label>
        <div className="flex flex-wrap gap-3">
          {reminderOptions.map((type) => (
            <div key={type} className="flex items-center gap-1.5">
              <Checkbox
                id={`reminder-${triggerKey}-${type}`}
                checked={selectedReminders.includes(type)}
                onCheckedChange={() => !disabled && toggleReminder(type)}
                disabled={disabled}
                className="h-3.5 w-3.5"
              />
              <label
                htmlFor={`reminder-${triggerKey}-${type}`}
                className="text-xs cursor-pointer"
              >
                {REMINDER_TYPE_LABELS[type] || type}
              </label>
            </div>
          ))}
        </div>
        {selectedReminders.includes('due_date_approaching') && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Lead time:</span>
            <Input
              type="number"
              min={1}
              max={30}
              value={leadDays}
              onChange={(e) => {
                const val = Math.max(1, Math.min(30, parseInt(e.target.value) || defaultLeadDays));
                onConfigChange({
                  ...currentConfig,
                  reminder_types: selectedReminders,
                  lead_days: val,
                });
              }}
              className="w-16 h-7 text-xs"
              disabled={disabled}
            />
            <span className="text-xs text-muted-foreground">day(s) before</span>
          </div>
        )}
      </div>
    );
  }

  return null;
}
