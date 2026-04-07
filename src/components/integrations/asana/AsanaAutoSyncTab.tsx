import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Webhook, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { AsanaSyncConfig } from "./AsanaSyncSettingsModal";

interface AsanaAutoSyncTabProps {
  syncConfig: AsanaSyncConfig;
  onUpdate: (config: AsanaSyncConfig) => void;
}

export function AsanaAutoSyncTab({ syncConfig, onUpdate }: AsanaAutoSyncTabProps) {
  const [local, setLocal] = useState({ ...syncConfig });
  const [saving, setSaving] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState<'unknown' | 'active' | 'inactive'>('unknown');
  const [registeringWebhook, setRegisteringWebhook] = useState(false);
  const [loadingWebhook, setLoadingWebhook] = useState(true);

  const hasChanges =
    local.sync_direction !== syncConfig.sync_direction ||
    local.auto_sync_enabled !== syncConfig.auto_sync_enabled ||
    local.auto_sync_interval_minutes !== syncConfig.auto_sync_interval_minutes ||
    local.sync_on_task_create !== syncConfig.sync_on_task_create ||
    local.sync_on_task_update !== syncConfig.sync_on_task_update ||
    local.sync_on_task_complete !== syncConfig.sync_on_task_complete;

  // Check existing webhook status
  useEffect(() => {
    async function checkWebhook() {
      setLoadingWebhook(true);
      try {
        const { data } = await supabase
          .from("asana_webhooks")
          .select("id, is_active, asana_webhook_gid")
          .eq("integration_id", syncConfig.integration_id)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();

        setWebhookStatus(data ? 'active' : 'inactive');
      } catch {
        setWebhookStatus('unknown');
      } finally {
        setLoadingWebhook(false);
      }
    }
    checkWebhook();
  }, [syncConfig.integration_id]);

  const registerWebhook = async () => {
    setRegisteringWebhook(true);
    try {
      // Get enabled project filters for this integration
      const { data: filters } = await supabase
        .from("asana_project_filters")
        .select("asana_project_gid, asana_project_name, sync_config_id")
        .eq("sync_config_id", syncConfig.id)
        .eq("is_enabled", true);

      if (!filters || filters.length === 0) {
        toast.error("No Asana projects configured", {
          description: "Please add at least one project in the Projects tab first.",
        });
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      let registeredCount = 0;

      for (const filter of filters) {
        const targetUrl = `${supabaseUrl}/functions/v1/asana-webhook?integration_id=${syncConfig.integration_id}&project_gid=${filter.asana_project_gid}`;

        // Create DB record first
        await supabase
          .from("asana_webhooks")
          .upsert({
            integration_id: syncConfig.integration_id,
            asana_project_gid: filter.asana_project_gid,
            target_url: targetUrl,
            is_active: true,
          }, { onConflict: "integration_id,asana_project_gid" });

        // Register with Asana
        const { data } = await supabase.functions.invoke("asana-proxy", {
          body: {
            action: "register_webhook",
            integration_id: syncConfig.integration_id,
            project_gid: filter.asana_project_gid,
            target_url: targetUrl,
          },
        });

        if (data?.success && data.webhook?.gid) {
          await supabase
            .from("asana_webhooks")
            .update({ asana_webhook_gid: data.webhook.gid })
            .eq("integration_id", syncConfig.integration_id)
            .eq("asana_project_gid", filter.asana_project_gid);

          registeredCount++;
        } else {
          console.error("Webhook registration failed for project:", filter.asana_project_gid, data);
        }
      }

      if (registeredCount > 0) {
        setWebhookStatus('active');
        toast.success(`Webhook registered for ${registeredCount} project(s)`, {
          description: "Asana will now sync task completions back to nAItive.",
        });
      } else {
        toast.error("Failed to register webhooks", {
          description: "Check that your Asana token has webhook permissions.",
        });
      }
    } catch (err: any) {
      console.error("Webhook registration error:", err);
      toast.error("Failed to register webhook", { description: err.message });
    } finally {
      setRegisteringWebhook(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("asana_sync_config")
        .update({
          sync_direction: local.sync_direction,
          auto_sync_enabled: local.auto_sync_enabled,
          auto_sync_interval_minutes: local.auto_sync_interval_minutes,
          sync_on_task_create: local.sync_on_task_create,
          sync_on_task_update: local.sync_on_task_update,
          sync_on_task_complete: local.sync_on_task_complete,
        })
        .eq("id", syncConfig.id);

      if (error) throw error;
      onUpdate({ ...syncConfig, ...local });
      toast.success("Auto-sync settings saved");
    } catch (err: any) {
      toast.error("Failed to save settings", { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-4">
      {/* Reverse Sync Webhook */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Webhook className="h-4 w-4" />
              Reverse Sync (Asana → nAItive)
            </h4>
            <p className="text-xs text-muted-foreground mt-1">
              Automatically sync task completions from Asana back to nAItive via webhook.
            </p>
          </div>
          {loadingWebhook ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : webhookStatus === 'active' ? (
            <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Active
            </Badge>
          ) : (
            <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">
              <AlertCircle className="h-3 w-3 mr-1" />
              Not configured
            </Badge>
          )}
        </div>
        {webhookStatus !== 'active' && !loadingWebhook && (
          <Button
            variant="outline"
            size="sm"
            onClick={registerWebhook}
            disabled={registeringWebhook}
          >
            {registeringWebhook ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Webhook className="h-4 w-4 mr-2" />
            )}
            Enable Reverse Sync
          </Button>
        )}
      </div>

      <Separator />

      {/* Sync Direction */}
      <div>
        <h4 className="text-sm font-medium mb-3">Sync Direction</h4>
        <RadioGroup
          value={local.sync_direction}
          onValueChange={(v) => setLocal((p) => ({ ...p, sync_direction: v }))}
          className="space-y-2"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="asana_to_platform" id="dir-a2p" />
            <Label htmlFor="dir-a2p" className="text-sm">Asana → nAItive only</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="platform_to_asana" id="dir-p2a" />
            <Label htmlFor="dir-p2a" className="text-sm">nAItive → Asana only</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="both" id="dir-both" />
            <Label htmlFor="dir-both" className="text-sm">Bi-directional</Label>
          </div>
        </RadioGroup>
      </div>

      <Separator />

      {/* Auto Sync Toggle */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium">Auto-Sync</h4>
            <p className="text-xs text-muted-foreground">Automatically sync data on a schedule.</p>
          </div>
          <Switch
            checked={local.auto_sync_enabled}
            onCheckedChange={(v) => setLocal((p) => ({ ...p, auto_sync_enabled: v }))}
          />
        </div>

        {local.auto_sync_enabled && (
          <div className="flex items-center gap-3">
            <Label className="text-sm text-muted-foreground">Sync every</Label>
            <Select
              value={String(local.auto_sync_interval_minutes)}
              onValueChange={(v) => setLocal((p) => ({ ...p, auto_sync_interval_minutes: parseInt(v) }))}
            >
              <SelectTrigger className="w-[140px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 minutes</SelectItem>
                <SelectItem value="30">30 minutes</SelectItem>
                <SelectItem value="60">1 hour</SelectItem>
                <SelectItem value="360">6 hours</SelectItem>
                <SelectItem value="1440">24 hours</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <Separator />

      {/* Outbound Sync: nAItive → Asana */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium">Outbound Sync (nAItive → Asana)</h4>
        <p className="text-xs text-muted-foreground">Push task changes from nAItive to Asana automatically.</p>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Sync tasks to Asana on creation</Label>
              <p className="text-xs text-muted-foreground">When a task is created in nAItive, push it to the mapped Asana project.</p>
            </div>
            <Switch
              checked={local.sync_on_task_create}
              onCheckedChange={(v) => setLocal((p) => ({ ...p, sync_on_task_create: v }))}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Sync task updates</Label>
              <p className="text-xs text-muted-foreground">Push due date and assignee changes to Asana.</p>
            </div>
            <Switch
              checked={local.sync_on_task_update}
              onCheckedChange={(v) => setLocal((p) => ({ ...p, sync_on_task_update: v }))}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Sync task completions</Label>
              <p className="text-xs text-muted-foreground">Mark Asana tasks complete/incomplete when status changes in nAItive.</p>
            </div>
            <Switch
              checked={local.sync_on_task_complete}
              onCheckedChange={(v) => setLocal((p) => ({ ...p, sync_on_task_complete: v }))}
            />
          </div>
        </div>
      </div>

      <Separator />

      <div className="flex justify-end">
        <Button onClick={save} disabled={!hasChanges || saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
