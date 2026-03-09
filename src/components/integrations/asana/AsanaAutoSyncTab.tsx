import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Loader2, Save } from "lucide-react";
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

  const hasChanges =
    local.sync_direction !== syncConfig.sync_direction ||
    local.auto_sync_enabled !== syncConfig.auto_sync_enabled ||
    local.auto_sync_interval_minutes !== syncConfig.auto_sync_interval_minutes ||
    local.sync_on_task_create !== syncConfig.sync_on_task_create ||
    local.sync_on_task_update !== syncConfig.sync_on_task_update ||
    local.sync_on_task_complete !== syncConfig.sync_on_task_complete;

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

      {/* Event Triggers */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium">Event Triggers</h4>
        <p className="text-xs text-muted-foreground">Sync when specific events happen in Asana.</p>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Task created</Label>
            <Switch
              checked={local.sync_on_task_create}
              onCheckedChange={(v) => setLocal((p) => ({ ...p, sync_on_task_create: v }))}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Task updated</Label>
            <Switch
              checked={local.sync_on_task_update}
              onCheckedChange={(v) => setLocal((p) => ({ ...p, sync_on_task_update: v }))}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Task completed</Label>
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
