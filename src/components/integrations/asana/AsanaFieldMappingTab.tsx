import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const ASANA_FIELDS = [
  { value: "name", label: "Task Name" },
  { value: "assignee.name", label: "Assignee Name" },
  { value: "assignee.email", label: "Assignee Email" },
  { value: "due_on", label: "Due Date" },
  { value: "notes", label: "Description/Notes" },
  { value: "completed", label: "Completed" },
  { value: "tags", label: "Tags" },
  { value: "created_at", label: "Created At" },
  { value: "modified_at", label: "Modified At" },
];

const PLATFORM_FIELDS: Record<string, { value: string; label: string }[]> = {
  deal: [
    { value: "company", label: "Company Name" },
    { value: "stage", label: "Stage" },
    { value: "value", label: "Value" },
    { value: "notes", label: "Notes" },
    { value: "deal_type", label: "Deal Type" },
    { value: "status", label: "Status" },
  ],
  milestone: [
    { value: "title", label: "Title" },
    { value: "description", label: "Description" },
    { value: "due_date", label: "Due Date" },
    { value: "completed", label: "Completed" },
    { value: "assigned_to_name", label: "Assigned To" },
  ],
  task: [
    { value: "title", label: "Title" },
    { value: "description", label: "Description" },
    { value: "due_date", label: "Due Date" },
    { value: "priority", label: "Priority" },
    { value: "status", label: "Status" },
  ],
};

interface FieldMapping {
  id: string;
  asana_field: string;
  platform_field: string;
  platform_entity: string;
  is_enabled: boolean;
}

interface AsanaFieldMappingTabProps {
  syncConfigId: string;
}

export function AsanaFieldMappingTab({ syncConfigId }: AsanaFieldMappingTabProps) {
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMappings = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("asana_field_mappings")
      .select("*")
      .eq("sync_config_id", syncConfigId);
    if (!error && data) setMappings(data as unknown as FieldMapping[]);
    setLoading(false);
  }, [syncConfigId]);

  useEffect(() => { loadMappings(); }, [loadMappings]);

  const addMapping = async () => {
    const { data, error } = await supabase
      .from("asana_field_mappings")
      .insert({
        sync_config_id: syncConfigId,
        asana_field: "name",
        platform_field: "company",
        platform_entity: "deal",
        is_enabled: true,
      })
      .select()
      .single();

    if (error) {
      toast.error("Failed to add mapping", { description: error.message });
      return;
    }
    setMappings((prev) => [...prev, data as unknown as FieldMapping]);
  };

  const updateMapping = async (id: string, updates: Partial<FieldMapping>) => {
    const { error } = await supabase
      .from("asana_field_mappings")
      .update(updates)
      .eq("id", id);
    if (error) { toast.error("Failed to update mapping"); return; }
    setMappings((prev) => prev.map((m) => m.id === id ? { ...m, ...updates } : m));
  };

  const deleteMapping = async (id: string) => {
    const { error } = await supabase
      .from("asana_field_mappings")
      .delete()
      .eq("id", id);
    if (error) { toast.error("Failed to delete mapping"); return; }
    setMappings((prev) => prev.filter((m) => m.id !== id));
  };

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium">Field Mapping</h4>
          <p className="text-xs text-muted-foreground">
            Map Asana task fields to naitive entity fields.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={addMapping}>
          <Plus className="h-4 w-4 mr-1" />
          Add Mapping
        </Button>
      </div>

      {mappings.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-8 border border-dashed rounded-lg">
          No field mappings configured. Click "Add Mapping" to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {/* Header */}
          <div className="grid grid-cols-[40px_1fr_24px_1fr_80px_32px] gap-2 px-3 text-xs text-muted-foreground font-medium">
            <span />
            <span>Asana Field</span>
            <span />
            <span>Platform Field</span>
            <span>Entity</span>
            <span />
          </div>
          {mappings.map((mapping) => (
            <div
              key={mapping.id}
              className="grid grid-cols-[40px_1fr_24px_1fr_80px_32px] gap-2 items-center rounded-lg border border-border/50 bg-muted/20 px-3 py-2"
            >
              <Switch
                checked={mapping.is_enabled}
                onCheckedChange={(v) => updateMapping(mapping.id, { is_enabled: v })}
              />
              <Select
                value={mapping.asana_field}
                onValueChange={(v) => updateMapping(mapping.id, { asana_field: v })}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASANA_FIELDS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <span className="text-center text-muted-foreground text-xs">→</span>

              <Select
                value={mapping.platform_field}
                onValueChange={(v) => updateMapping(mapping.id, { platform_field: v })}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(PLATFORM_FIELDS[mapping.platform_entity] || PLATFORM_FIELDS.deal).map((f) => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={mapping.platform_entity}
                onValueChange={(v) => updateMapping(mapping.id, { platform_entity: v, platform_field: PLATFORM_FIELDS[v]?.[0]?.value || "title" })}
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
