/**
 * AvailabilityVerificationSettings — toggles + thresholds for the fix #4
 * re-verify-on-send and soft-hold flow. Stored per user on
 * user_email_ai_preferences.
 */
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Prefs {
  verify_on_send: boolean;
  place_soft_holds: boolean;
  hold_expiration_hours: number;
  min_required_slots: number;
}

const DEFAULTS: Prefs = {
  verify_on_send: true,
  place_soft_holds: true,
  hold_expiration_hours: 72,
  min_required_slots: 3,
};

export function AvailabilityVerificationSettings() {
  const [userId, setUserId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (!uid) return;
      const { data: row } = await supabase
        .from('user_email_ai_preferences')
        .select('verify_on_send, place_soft_holds, hold_expiration_hours, min_required_slots')
        .eq('user_id', uid)
        .maybeSingle();
      if (row) setPrefs({ ...DEFAULTS, ...row });
      setLoaded(true);
    });
  }, []);

  const save = async (next: Prefs) => {
    if (!userId) return;
    setPrefs(next);
    const { error } = await supabase
      .from('user_email_ai_preferences')
      .upsert({ user_id: userId, ...next }, { onConflict: 'user_id' });
    if (error) toast.error(error.message);
    else toast.success('Saved');
  };

  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Availability Verification</CardTitle>
        <p className="text-xs text-muted-foreground">
          Re-check availability and place tentative soft-holds when proposed meeting times are inserted into an outgoing draft.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="vfy" className="text-xs">Re-verify on send</Label>
          <Switch id="vfy" checked={prefs.verify_on_send} disabled={!loaded} onCheckedChange={(v) => save({ ...prefs, verify_on_send: v })} />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="hold" className="text-xs">Place soft-holds on send</Label>
          <Switch id="hold" checked={prefs.place_soft_holds} disabled={!loaded} onCheckedChange={(v) => save({ ...prefs, place_soft_holds: v })} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="exp" className="text-xs flex-1">Soft-hold expiration (hours, 6–168)</Label>
          <Input
            id="exp"
            type="number"
            min={6}
            max={168}
            value={prefs.hold_expiration_hours}
            disabled={!loaded}
            onChange={(e) => save({ ...prefs, hold_expiration_hours: clamp(parseInt(e.target.value || '72', 10), 6, 168) })}
            className="h-7 w-20 text-[11.5px]"
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="min" className="text-xs flex-1">Minimum free slots after refill (1–5)</Label>
          <Input
            id="min"
            type="number"
            min={1}
            max={5}
            value={prefs.min_required_slots}
            disabled={!loaded}
            onChange={(e) => save({ ...prefs, min_required_slots: clamp(parseInt(e.target.value || '3', 10), 1, 5) })}
            className="h-7 w-20 text-[11.5px]"
          />
        </div>
      </CardContent>
    </Card>
  );
}

export default AvailabilityVerificationSettings;