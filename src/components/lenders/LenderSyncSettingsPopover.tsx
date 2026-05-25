import { useEffect, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Settings, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface Settings {
  auto_approve_deterministic: boolean;
  likely_match_threshold: number;
  possible_match_threshold: number;
}

const DEFAULTS: Settings = {
  auto_approve_deterministic: false,
  likely_match_threshold: 0.82,
  possible_match_threshold: 0.65,
};

/** Per-company Flex sync triage settings. Admin-only (RLS enforced). */
export function LenderSyncSettingsPopover() {
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [s, setS] = useState<Settings>(DEFAULTS);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { setLoading(false); return; }
      const { data: prof } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', u.user.id)
        .maybeSingle();
      const cid = (prof?.company_id as string) || null;
      setCompanyId(cid);
      if (cid) {
        const { data } = await supabase
          .from('lender_sync_settings')
          .select('*')
          .eq('company_id', cid)
          .maybeSingle();
        if (data) {
          setS({
            auto_approve_deterministic: !!data.auto_approve_deterministic,
            likely_match_threshold: Number(data.likely_match_threshold) || DEFAULTS.likely_match_threshold,
            possible_match_threshold: Number(data.possible_match_threshold) || DEFAULTS.possible_match_threshold,
          });
        }
      }
      setLoading(false);
    })();
  }, [open]);

  const save = async () => {
    if (!companyId) return;
    setSaving(true);
    const { error } = await supabase
      .from('lender_sync_settings')
      .upsert({ company_id: companyId, ...s }, { onConflict: 'company_id' });
    setSaving(false);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Saved', description: 'Sync triage settings updated.' });
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => e.stopPropagation()}
          title="Flex sync triage settings"
        >
          <Settings className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px]" align="end" onClick={(e) => e.stopPropagation()}>
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">Flex Sync Triage</p>
              <p className="text-xs text-muted-foreground">Thresholds tune what counts as a likely/possible duplicate.</p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Auto-approve exact duplicates</Label>
                <p className="text-[11px] text-muted-foreground">Only deterministic exact matches (alias / domain).</p>
              </div>
              <Switch
                checked={s.auto_approve_deterministic}
                onCheckedChange={(v) => setS({ ...s, auto_approve_deterministic: !!v })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Likely ≥</Label>
                <Input
                  type="number" min={0.5} max={1} step={0.01}
                  value={s.likely_match_threshold}
                  onChange={(e) => setS({ ...s, likely_match_threshold: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label className="text-xs">Possible ≥</Label>
                <Input
                  type="number" min={0.3} max={0.95} step={0.01}
                  value={s.possible_match_threshold}
                  onChange={(e) => setS({ ...s, possible_match_threshold: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={save} disabled={saving || !companyId}>
                {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                Save
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}