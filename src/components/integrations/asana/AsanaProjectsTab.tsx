import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, FolderOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AsanaProject {
  gid: string;
  name: string;
  archived: boolean;
}

interface AsanaSection {
  gid: string;
  name: string;
}

interface ProjectFilter {
  id: string;
  asana_project_gid: string;
  asana_project_name: string;
  is_enabled: boolean;
  map_to: string;
  asana_section_gid: string | null;
}

interface AsanaProjectsTabProps {
  syncConfigId: string;
  integrationId: string;
}

export function AsanaProjectsTab({ syncConfigId, integrationId }: AsanaProjectsTabProps) {
  const [asanaProjects, setAsanaProjects] = useState<AsanaProject[]>([]);
  const [filters, setFilters] = useState<ProjectFilter[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingProjects, setFetchingProjects] = useState(false);
  const [sectionsMap, setSectionsMap] = useState<Record<string, AsanaSection[]>>({});
  const [loadingSections, setLoadingSections] = useState<Record<string, boolean>>({});

  // Load saved filters
  const loadFilters = useCallback(async () => {
    const { data, error } = await supabase
      .from("asana_project_filters")
      .select("*")
      .eq("sync_config_id", syncConfigId);
    if (!error && data) setFilters(data as unknown as ProjectFilter[]);
  }, [syncConfigId]);

  useEffect(() => { loadFilters(); }, [loadFilters]);

  // Fetch sections for a project
  const fetchSections = async (projectGid: string) => {
    if (sectionsMap[projectGid]) return;
    setLoadingSections((prev) => ({ ...prev, [projectGid]: true }));
    try {
      const { data, error } = await supabase.functions.invoke("asana-proxy", {
        body: { action: "sections", integration_id: integrationId, project_gid: projectGid },
      });
      if (!error && data?.success) {
        setSectionsMap((prev) => ({ ...prev, [projectGid]: data.sections || [] }));
      }
    } catch {
      // silently fail
    } finally {
      setLoadingSections((prev) => ({ ...prev, [projectGid]: false }));
    }
  };

  // Auto-fetch sections for enabled filters
  useEffect(() => {
    filters.filter((f) => f.is_enabled).forEach((f) => {
      if (!sectionsMap[f.asana_project_gid]) {
        fetchSections(f.asana_project_gid);
      }
    });
  }, [filters]);

  // Fetch projects from Asana
  const fetchProjects = async () => {
    setFetchingProjects(true);
    try {
      const { data: intData } = await supabase
        .from("integrations")
        .select("config")
        .eq("id", integrationId)
        .single();

      const config = intData?.config as any;
      if (!config?.workspace_gid) {
        toast.error("No Asana workspace found");
        return;
      }

      const { data, error } = await supabase.functions.invoke("asana-proxy", {
        body: { action: "projects", integration_id: integrationId, workspace_gid: config.workspace_gid },
      });

      if (error || !data?.success) throw new Error(data?.error || "Failed to fetch projects");

      const projects = (data.projects || []).filter((p: AsanaProject) => !p.archived);
      setAsanaProjects(projects);

      const existingGids = new Set(filters.map((f) => f.asana_project_gid));
      const newProjects = projects.filter((p: AsanaProject) => !existingGids.has(p.gid));

      if (newProjects.length > 0) {
        const inserts = newProjects.map((p: AsanaProject) => ({
          sync_config_id: syncConfigId,
          asana_project_gid: p.gid,
          asana_project_name: p.name,
          is_enabled: false,
          map_to: "deals",
        }));

        await supabase.from("asana_project_filters").insert(inserts);
        await loadFilters();
      }

      toast.success(`Found ${projects.length} projects`);
    } catch (err: any) {
      toast.error("Failed to fetch Asana projects", { description: err.message });
    } finally {
      setFetchingProjects(false);
    }
  };

  const toggleFilter = async (filterId: string, enabled: boolean) => {
    const { error } = await supabase
      .from("asana_project_filters")
      .update({ is_enabled: enabled })
      .eq("id", filterId);
    if (error) { toast.error("Failed to update"); return; }
    setFilters((prev) => prev.map((f) => f.id === filterId ? { ...f, is_enabled: enabled } : f));

    // Fetch sections when enabling
    if (enabled) {
      const filter = filters.find((f) => f.id === filterId);
      if (filter) fetchSections(filter.asana_project_gid);
    }
  };

  const updateMapTo = async (filterId: string, mapTo: string) => {
    const { error } = await supabase
      .from("asana_project_filters")
      .update({ map_to: mapTo })
      .eq("id", filterId);
    if (error) { toast.error("Failed to update"); return; }
    setFilters((prev) => prev.map((f) => f.id === filterId ? { ...f, map_to: mapTo } : f));
  };

  const updateSectionGid = async (filterId: string, sectionGid: string | null) => {
    const value = sectionGid === "none" ? null : sectionGid;
    const { error } = await supabase
      .from("asana_project_filters")
      .update({ asana_section_gid: value })
      .eq("id", filterId);
    if (error) { toast.error("Failed to update section"); return; }
    setFilters((prev) => prev.map((f) => f.id === filterId ? { ...f, asana_section_gid: value } : f));
    toast.success("Section updated");
  };

  const enabledCount = filters.filter((f) => f.is_enabled).length;

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium">Project Filtering</h4>
          <p className="text-xs text-muted-foreground">
            Select which Asana projects to sync and how they map to nAItive.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchProjects} disabled={fetchingProjects}>
          {fetchingProjects ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          Refresh Projects
        </Button>
      </div>

      {filters.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground border border-dashed rounded-lg">
          <FolderOpen className="h-8 w-8 mb-2" />
          <p className="text-sm">No projects loaded yet</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={fetchProjects} disabled={fetchingProjects}>
            {fetchingProjects && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Load Asana Projects
          </Button>
        </div>
      ) : (
        <>
          <div className="text-xs text-muted-foreground">
            {enabledCount} of {filters.length} projects enabled for sync
          </div>
          <div className="space-y-2">
            {filters.map((filter) => {
              const sections = sectionsMap[filter.asana_project_gid] || [];
              const isLoadingSection = loadingSections[filter.asana_project_gid];

              return (
                <div
                  key={filter.id}
                  className="flex flex-col gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Switch
                        checked={filter.is_enabled}
                        onCheckedChange={(v) => toggleFilter(filter.id, v)}
                      />
                      <span className="text-sm truncate">{filter.asana_project_name}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Select value={filter.map_to} onValueChange={(v) => updateMapTo(filter.id, v)}>
                        <SelectTrigger className="h-7 w-[120px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="deals">→ Deals</SelectItem>
                          <SelectItem value="milestones">→ Milestones</SelectItem>
                          <SelectItem value="tasks">→ Tasks</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {filter.is_enabled && (
                    <div className="flex items-center gap-2 pl-10">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">Section:</span>
                      {isLoadingSection ? (
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                      ) : (
                        <Select
                          value={filter.asana_section_gid || "none"}
                          onValueChange={(v) => updateSectionGid(filter.id, v)}
                        >
                          <SelectTrigger className="h-7 w-[200px] text-xs">
                            <SelectValue placeholder="No section (project default)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No section (default)</SelectItem>
                            {sections.map((s) => (
                              <SelectItem key={s.gid} value={s.gid}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
