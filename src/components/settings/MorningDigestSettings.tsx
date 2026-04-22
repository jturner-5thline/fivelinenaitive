import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sun, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';

// Common timezones grouped sensibly. Keep modest list; user can type any IANA value via input fallback.
const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Mexico_City',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Dublin',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Amsterdam',
  'Europe/Stockholm',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
];

export function MorningDigestSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile-digest', user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('timezone, morning_digest_time, morning_digest_enabled')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [timezone, setTimezone] = useState<string>('America/New_York');
  const [digestTime, setDigestTime] = useState<string>('07:00');
  const [enabled, setEnabled] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setTimezone(profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York');
    // morning_digest_time stored as time, e.g. '07:00:00' — trim to HH:MM
    const t = (profile as any).morning_digest_time || '07:00';
    setDigestTime(typeof t === 'string' ? t.slice(0, 5) : '07:00');
    setEnabled((profile as any).morning_digest_enabled ?? true);
  }, [profile]);

  const detectTz = () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) {
      setTimezone(tz);
      toast.success(`Detected ${tz}`);
    }
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      // Normalize digest time to HH:MM:00 for postgres TIME
      const normalizedTime = digestTime.length === 5 ? `${digestTime}:00` : digestTime;
      const { error } = await supabase
        .from('profiles')
        .update({
          timezone,
          morning_digest_time: normalizedTime,
          morning_digest_enabled: enabled,
        } as any)
        .eq('user_id', user.id);
      if (error) throw error;
      toast.success('Morning digest preferences saved');
      queryClient.invalidateQueries({ queryKey: ['profile-digest', user.id] });
    } catch (err) {
      console.error(err);
      toast.error('Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  // Include the user's current timezone even if not in our list
  const timezoneOptions = Array.from(new Set([timezone, ...COMMON_TIMEZONES])).filter(Boolean);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sun className="h-5 w-5" />
          <div>
            <CardTitle className="text-lg">Morning Digest & Timezone</CardTitle>
            <CardDescription>
              Set when your daily follow-up digest arrives. Used for all timezone-aware reminders.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Send morning digest</Label>
            <p className="text-sm text-muted-foreground">
              A daily summary of follow-up tasks due today, delivered via email and in-app. Skipped on days with no items.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} disabled={isLoading} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="digest-time">Delivery time</Label>
            <Input
              id="digest-time"
              type="time"
              value={digestTime}
              onChange={(e) => setDigestTime(e.target.value)}
              disabled={isLoading || !enabled}
            />
            <p className="text-xs text-muted-foreground">In your local timezone (default 7:00 AM)</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="timezone">Timezone</Label>
            <div className="flex gap-2">
              <Select value={timezone} onValueChange={setTimezone} disabled={isLoading}>
                <SelectTrigger id="timezone" className="flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {timezoneOptions.map((tz) => (
                    <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" size="sm" onClick={detectTz} disabled={isLoading}>
                Detect
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Used for all per-user scheduling</p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving || isLoading}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save preferences
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
