import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Bell, Loader2, Save, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';
import { Json } from '@/integrations/supabase/types';

interface StaleAlertConfig {
  enabled: boolean;
  threshold_days: number;
  notify_managers: boolean;
  notify_admins: boolean;
  excluded_stages: string[];
  allowed_pipeline_ids: string[] | null;
  always_notify_emails: string[];
  include_flagged: boolean;
  include_lenders_needing_update: boolean;
  lender_stale_days: number;
}

interface Pipeline {
  id: string;
  name: string;
  is_default: boolean;
}

const DEFAULT_CONFIG: StaleAlertConfig = {
  enabled: true,
  threshold_days: 14,
  notify_managers: true,
  notify_admins: true,
  excluded_stages: ['archived', 'on_hold', 'closed_lost', 'in_development'],
  allowed_pipeline_ids: null,
  always_notify_emails: [],
  include_flagged: true,
  include_lenders_needing_update: true,
  lender_stale_days: 14,
};

export function StaleAlertSettings({ isAdmin }: { isAdmin: boolean }) {
  const { company } = useCompany();
  const [config, setConfig] = useState<StaleAlertConfig>(DEFAULT_CONFIG);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [newEmail, setNewEmail] = useState('');

  useEffect(() => {
    if (!company?.id) return;
    (async () => {
      const [settingsRes, pipelinesRes] = await Promise.all([
        supabase
          .from('company_settings')
          .select('stale_alert_config')
          .eq('company_id', company.id)
          .maybeSingle(),
        supabase
          .from('deal_pipelines')
          .select('id, name, is_default')
          .eq('company_id', company.id)
          .order('position', { ascending: true }),
      ]);

      if (settingsRes.data?.stale_alert_config) {
        setConfig({ ...DEFAULT_CONFIG, ...(settingsRes.data.stale_alert_config as unknown as StaleAlertConfig) });
      }
      if (pipelinesRes.data) {
        setPipelines(pipelinesRes.data);
      }
      setIsLoading(false);
    })();
  }, [company?.id]);

  const handleSave = async () => {
    if (!company?.id || !isAdmin) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('company_settings')
        .update({ stale_alert_config: config as unknown as Json })
        .eq('company_id', company.id);
      if (error) throw error;
      toast.success('Deal attention alert settings saved');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePipelineToggle = (pipelineId: string, checked: boolean) => {
    setConfig(prev => {
      const current = prev.allowed_pipeline_ids || pipelines.map(p => p.id);
      if (checked) {
        const updated = [...current, pipelineId];
        return { ...prev, allowed_pipeline_ids: updated.length >= pipelines.length ? null : updated };
      } else {
        const updated = current.filter(id => id !== pipelineId);
        return { ...prev, allowed_pipeline_ids: updated.length === 0 ? current : updated };
      }
    });
  };

  const isPipelineSelected = (pipelineId: string) => {
    if (config.allowed_pipeline_ids === null) return true;
    return config.allowed_pipeline_ids.includes(pipelineId);
  };

  const handleAddEmail = () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) return;
    if (config.always_notify_emails.includes(email)) {
      toast.error('Email already added');
      return;
    }
    setConfig(prev => ({ ...prev, always_notify_emails: [...prev.always_notify_emails, email] }));
    setNewEmail('');
  };

  const handleRemoveEmail = (email: string) => {
    setConfig(prev => ({ ...prev, always_notify_emails: prev.always_notify_emails.filter(e => e !== email) }));
  };

  if (isLoading) {
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
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          <div>
            <CardTitle className="text-lg">Deals Needing Attention Alerts</CardTitle>
            <CardDescription>Configure daily email alerts for stale, flagged, and lender-needing-update deals</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Enable Deal Attention Emails</Label>
            <p className="text-sm text-muted-foreground">Send daily emails summarizing deals needing attention (7am ET)</p>
          </div>
          <Switch
            checked={config.enabled}
            onCheckedChange={(v) => setConfig(p => ({ ...p, enabled: v }))}
            disabled={!isAdmin}
          />
        </div>

        <Separator />

        {/* Attention Criteria */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">What triggers an alert?</Label>

          <div className="flex items-center justify-between py-1">
            <div className="space-y-0.5">
              <Label className="text-sm">Stale Deals</Label>
              <p className="text-xs text-muted-foreground">Deals not updated within the threshold</p>
            </div>
            <Select
              value={String(config.threshold_days)}
              onValueChange={(v) => setConfig(p => ({ ...p, threshold_days: parseInt(v) }))}
              disabled={!isAdmin}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="14">14 days</SelectItem>
                <SelectItem value="21">21 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between py-1">
            <div className="space-y-0.5">
              <Label className="text-sm">Flagged Deals</Label>
              <p className="text-xs text-muted-foreground">Include deals marked as flagged for discussion</p>
            </div>
            <Switch
              checked={config.include_flagged}
              onCheckedChange={(v) => setConfig(p => ({ ...p, include_flagged: v }))}
              disabled={!isAdmin}
            />
          </div>

          <div className="flex items-center justify-between py-1">
            <div className="space-y-0.5">
              <Label className="text-sm">Lenders Needing Update</Label>
              <p className="text-xs text-muted-foreground">Deals with active lenders not updated within threshold</p>
            </div>
            <Switch
              checked={config.include_lenders_needing_update}
              onCheckedChange={(v) => setConfig(p => ({ ...p, include_lenders_needing_update: v }))}
              disabled={!isAdmin}
            />
          </div>
        </div>

        <Separator />

        {pipelines.length > 1 && (
          <>
            <div className="space-y-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Monitored Pipelines</Label>
                <p className="text-xs text-muted-foreground">Only deals in selected pipelines will trigger alerts</p>
              </div>

              <div className="space-y-2 pl-1">
                {pipelines.map(pipeline => (
                  <div key={pipeline.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`pipeline-${pipeline.id}`}
                      checked={isPipelineSelected(pipeline.id)}
                      onCheckedChange={(checked) => handlePipelineToggle(pipeline.id, !!checked)}
                      disabled={!isAdmin}
                    />
                    <Label
                      htmlFor={`pipeline-${pipeline.id}`}
                      className="text-sm font-normal cursor-pointer flex items-center gap-1.5"
                    >
                      {pipeline.name}
                      {pipeline.is_default && (
                        <span className="text-xs text-muted-foreground">(default)</span>
                      )}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <Separator />
          </>
        )}

        <div className="space-y-3">
          <Label className="text-sm font-medium">Who receives alerts?</Label>

          <div className="flex items-center justify-between py-1">
            <div className="space-y-0.5">
              <Label className="text-sm">Deal Managers & Analysts</Label>
              <p className="text-xs text-muted-foreground">Each receives alerts only for deals they're assigned to</p>
            </div>
            <Switch
              checked={config.notify_managers}
              onCheckedChange={(v) => setConfig(p => ({ ...p, notify_managers: v }))}
              disabled={!isAdmin}
            />
          </div>

          <div className="flex items-center justify-between py-1">
            <div className="space-y-0.5">
              <Label className="text-sm">Admins & Owners</Label>
              <p className="text-xs text-muted-foreground">All admins receive alerts for every deal across the company</p>
            </div>
            <Switch
              checked={config.notify_admins}
              onCheckedChange={(v) => setConfig(p => ({ ...p, notify_admins: v }))}
              disabled={!isAdmin}
            />
          </div>
        </div>

        <Separator />

        {/* Always-notify emails */}
        <div className="space-y-3">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">Always Notify (All Deals)</Label>
            <p className="text-xs text-muted-foreground">These users always receive a summary of ALL deals needing attention, regardless of role</p>
          </div>

          {config.always_notify_emails.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {config.always_notify_emails.map(email => (
                <Badge key={email} variant="secondary" className="gap-1 pr-1">
                  {email}
                  {isAdmin && (
                    <button
                      onClick={() => handleRemoveEmail(email)}
                      className="ml-1 hover:bg-muted rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              ))}
            </div>
          )}

          {isAdmin && (
            <div className="flex gap-2">
              <Input
                placeholder="email@company.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddEmail()}
                className="flex-1"
              />
              <Button variant="outline" size="sm" onClick={handleAddEmail}>
                Add
              </Button>
            </div>
          )}
        </div>

        {isAdmin && (
          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={isSaving} size="sm">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              Save
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
