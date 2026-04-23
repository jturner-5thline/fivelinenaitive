import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, RefreshCw, Loader2, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const DEAL_STATUSES = ["active", "won", "lost", "on_hold", "closed"];
const MILESTONE_STATUSES = ["pending", "in_progress", "completed", "cancelled"];
const TASK_STATUSES = ["todo", "in_progress", "done", "blocked"];

interface StatusMapping {
  id: string;
  asana_section_name: string;
  asana_project_gid: string | null;
  platform_entity: string;
  platform_status: string;
}

interface AsanaStatusMappingTabProps {
  syncConfigId: string;
  integrationId: string;
}

export function AsanaStatusMappingTab({ syncConfigId, integrationId }: AsanaStatusMappingTabProps) {
  const [mappings, setMappings] = useState<StatusMapping[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMappings = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("asana_status_mappings")
      .select("*")
      .eq("sync_config_id", syncConfigId);
    if (!error && data) setMappings(data as unknown as StatusMapping[]);
    setLoading(false);
  }, [syncConfigId]);

  useEffect(() => { loadMappings(); }, [loadMappings]);

  const getStatusOptions = (entity: string) => {
    switch (entity) {
      case "deal": return DEAL_STATUSES;
      case "milestone": return MILESTONE_STATUSES;
      case "task": return TASK_STATUSES;
      default: return DEAL_STATUSES;
    }
  };

  const addMapping = async () => {
    const { data, error } = await supabase
      .from("asana_status_mappings")
      .insert({
        sync_config_id: syncConfigId,
        asana_section_name: "",
        platform_entity: "deal",
        platform_status: "active",
      })
      .select()
      .single();

    if (error) {
      toast.error("Failed to add status mapping", { description: error.message });
      return;
    }
    setMappings((prev) => [...prev, data as unknown as StatusMapping]);
  };

  const updateMapping = async (id: string, updates: Partial<StatusMapping>) => {
    const { error } = await supabase
      .from("asana_status_mappings")
      .update(updates)
      .eq("id", id);
    if (error) { toast.error("Failed to update"); return; }
    setMappings((prev) => prev.map((m) => m.id === id ? { ...m, ...updates } : m));
  };

  const deleteMapping = async (id: string) => {
    const { error } = await supabase
      .from("asana_status_mappings")
      .delete()
      .eq("id", id);
    if (error) { toast.error("Failed to delete"); return; }
    setMappings((prev) => prev.filter((m) => m.id !== id));
  };

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium">Status Mapping</h4>
          <p className="text-xs text-muted-foreground">
            Map Asana sections/statuses to naitive deal stages, milestone statuses, or task statuses.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={addMapping}>
          <Plus className="h-4 w-4 mr-1" />
          Add Mapping
        </Button>
      </div>

      {mappings.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-8 border border-dashed rounded-lg">
          No status mappings configured. Add mappings to convert Asana section names to platform statuses.
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_24px_80px_1fr_32px] gap-2 px-3 text-xs text-muted-foreground font-medium">
            <span>Asana Section</span>
            <span />
            <span>Entity</span>
            <span>Platform Status</span>
            <span />
          </div>
          {mappings.map((mapping) => (
            <div
              key={mapping.id}
              className="grid grid-cols-[1fr_24px_80px_1fr_32px] gap-2 items-center rounded-lg border border-border/50 bg-muted/20 px-3 py-2"
            >
              <Input
                value={mapping.asana_section_name}
                onChange={(e) => updateMapping(mapping.id, { asana_section_name: e.target.value })}
                placeholder="e.g. In Progress, Done, Backlog"
                className="h-7 text-xs"
              />

              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground mx-auto" />

              <Select
                value={mapping.platform_entity}
                onValueChange={(v) => updateMapping(mapping.id, {
                  platform_entity: v,
                  platform_status: getStatusOptions(v)[0],
                })}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deal">Deal</SelectItem>
                  <SelectItem value="milestone">Milestone</SelectItem>
                  <SelectItem value="task">Task</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={mapping.platform_status}
                onValueChange={(v) => updateMapping(mapping.id, { platform_status: v })}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getStatusOptions(mapping.platform_entity).map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteMapping(mapping.id)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
