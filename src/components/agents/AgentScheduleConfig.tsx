import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Clock, Calendar, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface AgentScheduleConfigProps {
  value: {
    schedule_cron: string;
    schedule_timezone: string;
  };
  onChange: (value: { schedule_cron: string; schedule_timezone: string }) => void;
}

const PRESET_SCHEDULES = [
  { label: 'Every morning at 9am', cron: '0 9 * * *', description: 'Daily at 9:00 AM' },
  { label: 'Every evening at 5pm', cron: '0 17 * * *', description: 'Daily at 5:00 PM' },
  { label: 'Monday mornings', cron: '0 9 * * 1', description: 'Weekly on Monday at 9:00 AM' },
  { label: 'Friday afternoons', cron: '0 17 * * 5', description: 'Weekly on Friday at 5:00 PM' },
  { label: 'Every hour', cron: '0 * * * *', description: 'At the start of every hour' },
  { label: 'Twice daily', cron: '0 9,17 * * *', description: 'Daily at 9:00 AM and 5:00 PM' },
  { label: 'First of month', cron: '0 9 1 * *', description: 'Monthly on the 1st at 9:00 AM' },
  { label: 'Custom', cron: 'custom', description: 'Enter custom cron expression' },
];

const TIMEZONES = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'Eastern (ET)' },
  { value: 'America/Chicago', label: 'Central (CT)' },
  { value: 'America/Denver', label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
];

export function AgentScheduleConfig({ value, onChange }: AgentScheduleConfigProps) {
  const [isCustom, setIsCustom] = useState(
    !PRESET_SCHEDULES.find((p) => p.cron === value.schedule_cron && p.cron !== 'custom')
  );

  const handlePresetChange = (preset: string) => {
    if (preset === 'custom') {
      setIsCustom(true);
    } else {
      setIsCustom(false);
      onChange({ ...value, schedule_cron: preset });
    }
  };

  const selectedPreset = PRESET_SCHEDULES.find((p) => p.cron === value.schedule_cron);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Clock className="h-4 w-4" />
        <span>Schedule Configuration</span>
      </div>

      {/* Preset Selection */}
      <div className="space-y-2">
        <Label>Schedule Preset</Label>
        <Select
          value={isCustom ? 'custom' : value.schedule_cron}
          onValueChange={handlePresetChange}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a schedule" />
          </SelectTrigger>
          <SelectContent>
            {PRESET_SCHEDULES.map((preset) => (
              <SelectItem key={preset.cron} value={preset.cron}>
                <div className="flex items-center gap-2">
                  <span>{preset.label}</span>
                  {preset.cron !== 'custom' && (
                    <span className="text-xs text-muted-foreground">
                      ({preset.description})
                    </span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Custom Cron Input */}
      {isCustom && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label>Cron Expression</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-sm">
                    Format: minute hour day month weekday
                    <br />
                    Example: "0 9 * * *" = Daily at 9am
                    <br />
                    Use * for "every"
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Input
            value={value.schedule_cron}
            onChange={(e) => onChange({ ...value, schedule_cron: e.target.value })}
            placeholder="0 9 * * *"
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">
            minute (0-59) hour (0-23) day (1-31) month (1-12) weekday (0-6, 0=Sun)
          </p>
        </div>
      )}

      {/* Timezone Selection */}
      <div className="space-y-2">
        <Label>Timezone</Label>
        <Select
          value={value.schedule_timezone}
          onValueChange={(tz) => onChange({ ...value, schedule_timezone: tz })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select timezone" />
          </SelectTrigger>
          <SelectContent>
            {TIMEZONES.map((tz) => (
              <SelectItem key={tz.value} value={tz.value}>
                {tz.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Schedule Preview */}
      {value.schedule_cron && (
        <div className="p-3 bg-muted rounded-lg space-y-2">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Schedule Preview</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {selectedPreset && selectedPreset.cron !== 'custom'
              ? selectedPreset.description
              : `Cron: ${value.schedule_cron}`}
          </p>
          <Badge variant="outline" className="text-xs">
            Timezone: {value.schedule_timezone}
          </Badge>
        </div>
      )}
    </div>
  );
}
