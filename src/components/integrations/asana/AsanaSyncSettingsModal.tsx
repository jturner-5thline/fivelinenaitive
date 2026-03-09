import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AsanaProjectsTab } from "./AsanaProjectsTab";
import { AsanaFieldMappingTab } from "./AsanaFieldMappingTab";
import { AsanaStatusMappingTab } from "./AsanaStatusMappingTab";
import { AsanaAutoSyncTab } from "./AsanaAutoSyncTab";

interface AsanaSyncSettingsModalProps {
  open: boolean;
  onClose: () => void;
  integrationId: string;
}

export interface AsanaSyncConfig {
  id: string;
  integration_id: string;
  user_id: string;
  sync_direction: string;
  auto_sync_enabled: boolean;
  auto_sync_interval_minutes: number;
  sync_on_task_create: boolean;
  sync_on_task_update: boolean;
  sync_on_task_complete: boolean;
}

export function AsanaSyncSettingsModal({ open, onClose, integrationId }: AsanaSyncSettingsModalProps) {
  const { user } = useAuth();
  const [syncConfig, setSyncConfig] = useState<AsanaSyncConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const loadOrCreateConfig = useCallback(async () => {
    if (!user || !integrationId) return;
    setLoading(true);
    try {
      // Try to load existing config
      const { data, error } = await supabase
        .from("asana_sync_config")
        .select("*")
        .eq("integration_id", integrationId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSyncConfig(data as unknown as AsanaSyncConfig);
      } else {
        // Create default config
        const { data: newConfig, error: insertError } = await supabase
          .from("asana_sync_config")
          .insert({
            integration_id: integrationId,
            user_id: user.id,
          })
          .select()
          .single();

        if (insertError) throw insertError;
        setSyncConfig(newConfig as unknown as AsanaSyncConfig);
      }
    } catch (err: any) {
      console.error("Failed to load Asana sync config:", err);
      toast.error("Failed to load sync configuration");
    } finally {
      setLoading(false);
    }
  }, [user, integrationId]);

  useEffect(() => {
    if (open) loadOrCreateConfig();
  }, [open, loadOrCreateConfig]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[750px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Asana Sync Settings</DialogTitle>
          <DialogDescription>
            Configure mapping rules, project filters, and auto-sync triggers.
          </DialogDescription>
        </DialogHeader>

        {loading || !syncConfig ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            Loading configuration…
          </div>
        ) : (
          <Tabs defaultValue="projects" className="flex-1 flex flex-col min-h-0">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="projects">Projects</TabsTrigger>
              <TabsTrigger value="fields">Field Mapping</TabsTrigger>
              <TabsTrigger value="statuses">Status Mapping</TabsTrigger>
              <TabsTrigger value="autosync">Auto-Sync</TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-1 mt-4">
              <TabsContent value="projects" className="mt-0">
                <AsanaProjectsTab
                  syncConfigId={syncConfig.id}
                  integrationId={integrationId}
                />
              </TabsContent>

              <TabsContent value="fields" className="mt-0">
                <AsanaFieldMappingTab syncConfigId={syncConfig.id} />
              </TabsContent>

              <TabsContent value="statuses" className="mt-0">
                <AsanaStatusMappingTab
                  syncConfigId={syncConfig.id}
                  integrationId={integrationId}
                />
              </TabsContent>

              <TabsContent value="autosync" className="mt-0">
                <AsanaAutoSyncTab
                  syncConfig={syncConfig}
                  onUpdate={(updated) => setSyncConfig(updated)}
                />
              </TabsContent>
            </ScrollArea>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
