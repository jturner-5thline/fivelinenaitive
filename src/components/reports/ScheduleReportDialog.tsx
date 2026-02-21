import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Clock, Mail, MessageSquare, Bell, Loader2, Save } from 'lucide-react';
import { useCreateScheduledReport, SCHEDULE_PRESETS } from '@/hooks/useScheduledReports';
import { toast } from 'sonner';
import type { ReportDefinition } from '@/hooks/useReportDefinitions';

interface ScheduleReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: ReportDefinition;
}

const DAYS_OF_WEEK = [
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
  { value: '0', label: 'Sunday' },
];

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern (ET)' },
  { value: 'America/Chicago', label: 'Central (CT)' },
  { value: 'America/Denver', label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
];

export function ScheduleReportDialog({ open, onOpenChange, report }: ScheduleReportDialogProps) {
  const createSchedule = useCreateScheduledReport();

  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [dayOfWeek, setDayOfWeek] = useState('1');
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [timeOfDay, setTimeOfDay] = useState('09:00');
  const [timezone, setTimezone] = useState('America/New_York');
  const [deliveryEmail, setDeliveryEmail] = useState(true);
  const [deliverySlack, setDeliverySlack] = useState(false);
  const [deliveryInApp, setDeliveryInApp] = useState(true);
  const [slackChannel, setSlackChannel] = useState('');
  const [emailRecipients, setEmailRecipients] = useState('');

  const buildCron = () => {
    const [hour, minute] = timeOfDay.split(':');
    switch (frequency) {
      case 'daily':
        return `${minute} ${hour} * * *`;
      case 'weekly':
        return `${minute} ${hour} * * ${dayOfWeek}`;
      case 'monthly':
        return `${minute} ${hour} ${dayOfMonth} * *`;
      default:
        return `0 9 * * 1`;
    }
  };

  const handleSave = async () => {
    const deliveryChannels: string[] = [];
    if (deliveryInApp) deliveryChannels.push('in_app');
    if (deliveryEmail) deliveryChannels.push('email');
    if (deliverySlack) deliveryChannels.push('slack');

    if (deliveryChannels.length === 0) {
      toast.error('Select at least one delivery channel');
      return;
    }

    const deliveryConfig: Record<string, any> = {};
    if (deliverySlack && slackChannel) {
      deliveryConfig.slack_channel_id = slackChannel;
    }
    if (deliveryEmail && emailRecipients) {
      deliveryConfig.email_recipients = emailRecipients.split(',').map((e) => e.trim()).filter(Boolean);
    }

    await createSchedule.mutateAsync({
      name: `${report.name} - ${frequency.charAt(0).toUpperCase() + frequency.slice(1)}`,
      description: `Auto-scheduled for "${report.name}"`,
      report_type: 'custom_definition',
      report_config: { report_definition_id: report.id } as any,
      schedule_cron: buildCron(),
      schedule_timezone: timezone,
      delivery_method: deliveryChannels[0] || 'in_app',
      delivery_config: deliveryConfig as any,
    });

    onOpenChange(false);
  };

  const cronPreview = () => {
    switch (frequency) {
      case 'daily':
        return `Every day at ${timeOfDay}`;
      case 'weekly':
        return `Every ${DAYS_OF_WEEK.find((d) => d.value === dayOfWeek)?.label} at ${timeOfDay}`;
      case 'monthly':
        return `${dayOfMonth}${getOrdinal(parseInt(dayOfMonth))} of every month at ${timeOfDay}`;
      default:
        return '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Schedule Report
          </DialogTitle>
          <DialogDescription>
            Set up recurring delivery for "{report.name}"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Frequency */}
          <div className="space-y-2">
            <Label>Frequency</Label>
            <div className="flex gap-2">
              {(['daily', 'weekly', 'monthly'] as const).map((f) => (
                <Button
                  key={f}
                  variant={frequency === f ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFrequency(f)}
                  className="capitalize"
                >
                  {f}
                </Button>
              ))}
            </div>
          </div>

          {/* Day selector */}
          {frequency === 'weekly' && (
            <div className="space-y-2">
              <Label>Day of Week</Label>
              <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DAYS_OF_WEEK.map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {frequency === 'monthly' && (
            <div className="space-y-2">
              <Label>Day of Month</Label>
              <Select value={dayOfMonth} onValueChange={setDayOfMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 28 }, (_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      {i + 1}{getOrdinal(i + 1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Time</Label>
              <Input type="time" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{cronPreview()}</span>{' '}
              ({TIMEZONES.find((tz) => tz.value === timezone)?.label})
            </p>
          </div>

          <Separator />

          {/* Delivery Channels */}
          <div className="space-y-3">
            <Label>Delivery Channels</Label>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">In-App Notification</span>
                </div>
                <Switch checked={deliveryInApp} onCheckedChange={setDeliveryInApp} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Email (PDF)</span>
                  </div>
                  <Switch checked={deliveryEmail} onCheckedChange={setDeliveryEmail} />
                </div>
                {deliveryEmail && (
                  <Input
                    value={emailRecipients}
                    onChange={(e) => setEmailRecipients(e.target.value)}
                    placeholder="email1@company.com, email2@company.com"
                    className="text-sm"
                  />
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Slack</span>
                  </div>
                  <Switch checked={deliverySlack} onCheckedChange={setDeliverySlack} />
                </div>
                {deliverySlack && (
                  <Input
                    value={slackChannel}
                    onChange={(e) => setSlackChannel(e.target.value)}
                    placeholder="Channel ID (e.g. C012345)"
                    className="text-sm"
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={createSchedule.isPending} className="gap-2">
            {createSchedule.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Create Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
