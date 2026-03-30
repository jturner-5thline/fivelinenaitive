import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Bell, Loader2, Save } from 'lucide-react';
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
};

export function StaleAlertSettings({ isAdmin }: { isAdmin: boolean }) {
  const { company } = useCompany();
  const [config, setConfig] = useState<StaleAlertConfig>(DEFAULT_CONFIG);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

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
      toast.success('Stale alert settings saved');
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
        // If all pipelines are selected, set to null (all pipelines)
        return { ...prev, allowed_pipeline_ids: updated.length >= pipelines.length ? null : updated };
      } else {
        const updated = current.filter(id => id !== pipelineId);
        // Don't allow empty — at least one pipeline must be selected
        return { ...prev, allowed_pipeline_ids: updated.length === 0 ? current : updated };
      }
    });
  };

  const isPipelineSelected = (pipelineId: string) => {
    if (config.allowed_pipeline_ids === null) return true;
    return config.allowed_pipeline_ids.includes(pipelineId);
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
            <CardTitle className="text-lg">Stale Deal Email Alerts</CardTitle>
            <CardDescription>Configure who receives email notifications for deals that need attention</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Enable Stale Deal Emails</Label>
            <p className="text-sm text-muted-foreground">Send email alerts when deals haven't been updated</p>
          </div>
          <Switch
            checked={config.enabled}
            onCheckedChange={(v) => setConfig(p => ({ ...p, enabled: v }))}
            disabled={!isAdmin}
          />
        </div>

        <Separator />

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Stale Threshold</Label>
            <p className="text-sm text-muted-foreground">Days without updates before a deal is flagged</p>
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

        <Separator />

        {pipelines.length > 1 && (
          <>
            <div className="space-y-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Monitored Pipelines</Label>
                <p className="text-xs text-muted-foreground">Only deals in selected pipelines will trigger stale alerts. Deals in unselected pipelines are ignored.</p>
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
              <Label className="text-sm">Deal Managers</Label>
              <p className="text-xs text-muted-foreground">Each manager receives alerts only for their own deals</p>
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
