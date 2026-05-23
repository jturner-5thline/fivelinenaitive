/**
 * WorkingHoursSettings — per-day-of-week working hours used by
 * NaitiveCalendar (dims cells outside hours) and the AI assistant when
 * scoring proposed meeting slots. Stored on the user, not the org.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  useUserCalendarPrefs,
  DEFAULT_WORKING_HOURS,
  type DayOfWeek,
  type WorkingHours,
} from '@/hooks/useUserCalendarPrefs';

const DAYS: { key: DayOfWeek; label: string }[] = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
];

export function WorkingHoursSettings() {
  const { workingHours, setWorkingHours, tz, isLoaded } = useUserCalendarPrefs();

  const update = async (next: WorkingHours) => {
    await setWorkingHours(next);
    toast.success('Working hours saved');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Working Hours</CardTitle>
        <p className="text-xs text-muted-foreground">
          Times outside your working hours are dimmed on the calendar. Saved per user; current time zone:{' '}
          <span className="text-foreground">{tz}</span>.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {DAYS.map(({ key, label }) => {
          const wh = workingHours[key];
          const enabled = !!wh;
          const start = wh?.start ?? '09:00';
          const end = wh?.end ?? '18:00';
          return (
            <div key={key} className="flex items-center gap-3 py-1 border-b border-white/[0.04]">
              <div className="w-24 text-xs text-foreground/85">{label}</div>
              <Switch
                checked={enabled}
                disabled={!isLoaded}
                onCheckedChange={(v) => {
                  const next: WorkingHours = { ...workingHours };
                  next[key] = v ? (wh ?? DEFAULT_WORKING_HOURS.mon!) : null;
                  void update(next);
                }}
                aria-label={`${label} enabled`}
              />
              <div className="flex items-center gap-1 ml-auto">
                <Label htmlFor={`${key}-start`} className="sr-only">{label} start</Label>
                <Input
                  id={`${key}-start`}
                  type="time"
                  disabled={!enabled}
                  value={start}
                  onChange={(e) => {
                    const next: WorkingHours = { ...workingHours, [key]: { start: e.target.value, end } };
                    void update(next);
                  }}
                  className="h-7 w-24 text-[11.5px]"
                />
                <span className="text-[10.5px] text-muted-foreground">–</span>
                <Input
                  type="time"
                  disabled={!enabled}
                  value={end}
                  onChange={(e) => {
                    const next: WorkingHours = { ...workingHours, [key]: { start, end: e.target.value } };
                    void update(next);
                  }}
                  className="h-7 w-24 text-[11.5px]"
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default WorkingHoursSettings;