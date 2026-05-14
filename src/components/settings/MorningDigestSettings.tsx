import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sun, Loader2, Info } from 'lucide-react';
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
        .select('timezone')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [timezone, setTimezone] = useState<string>('America/New_York');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setTimezone(profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York');
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
      const { error } = await supabase
        .from('profiles')
        .update({
          timezone,
          // Daily follow-up email is permanently disabled platform-wide;
          // follow-ups are surfaced inside Daily Rundown → Pipeline & Clients.
          morning_digest_enabled: false,
        } as any)
        .eq('user_id', user.id);
      if (error) throw error;
      toast.success('Timezone saved');
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
            <CardTitle className="text-lg">Timezone & Daily Rundown</CardTitle>
            <CardDescription>
              Today&rsquo;s follow-ups now live inside the Daily Rundown — no more morning email. Set your timezone for all timezone-aware reminders.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex gap-2 rounded-md border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
          <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>
            The “Your follow-ups for today” email has been retired. Open the Daily
            Briefing (Pipeline &amp; Clients tab) to see today&rsquo;s follow-ups grouped
            by deal, with quick actions to mark done, snooze, or open the deal.
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            Save timezone
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
