import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Save, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

/**
 * Per-user override for stale deal / stale lender notification thresholds.
 * System-wide defaults live in admin Settings → Alerts; these per-user
 * values take precedence for THIS user's notifications.
 *
 * Re-alert behavior: notifications fire ONCE per threshold boundary
 * (e.g. 7d, 14d, 21d, 28d), not daily.
 */
export function PerUserStaleThresholdSettings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dealDays, setDealDays] = useState(7);
  const [lenderDays, setLenderDays] = useState(5);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('stale_deal_threshold_days, stale_lender_threshold_days')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) {
        setDealDays((data as any).stale_deal_threshold_days ?? 7);
        setLenderDays((data as any).stale_lender_threshold_days ?? 5);
      }
      setLoading(false);
    })();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          stale_deal_threshold_days: Math.max(1, Math.min(180, dealDays)),
          stale_lender_threshold_days: Math.max(1, Math.min(180, lenderDays)),
        } as any)
        .eq('user_id', user.id);
      if (error) throw error;
      toast.success('Stale alert thresholds saved');
    } catch {
      toast.error('Failed to save thresholds');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">My Stale Alert Thresholds</CardTitle>
        <CardDescription>
          Override the system defaults for when YOUR notifications fire on stale deals and lenders.
          Alerts re-fire only when a new threshold boundary is crossed (e.g. at 7d, 14d, 21d) — not daily.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="stale-deal-days">Stale deal threshold (days)</Label>
            <Input
              id="stale-deal-days"
              type="number"
              min={1}
              max={180}
              value={dealDays}
              onChange={(e) => setDealDays(parseInt(e.target.value || '7', 10))}
            />
            <p className="text-xs text-muted-foreground">Default: 7</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="stale-lender-days">Stale lender threshold (days)</Label>
            <Input
              id="stale-lender-days"
              type="number"
              min={1}
              max={180}
              value={lenderDays}
              onChange={(e) => setLenderDays(parseInt(e.target.value || '5', 10))}
            />
            <p className="text-xs text-muted-foreground">Default: 5</p>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-muted-foreground">
          <AlertCircle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <p>
            Lenders in <strong>On Deck</strong> or <strong>On Hold</strong> stages, and lenders on
            <strong> On Hold</strong> or <strong>Archived</strong> deals, are excluded from all stale-alert
            notifications.
          </p>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
            Save thresholds
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}