import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowRight,
  ArrowLeft,
  ArrowLeftRight,
  Clock,
  Trash2,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import {
  useHubSpotMappingConfig,
  useHubSpotFieldMappings,
  useHubSpotSyncRuns,
  HUBSPOT_DEAL_FIELDS,
  NATIVE_DEAL_FIELDS,
  DEFAULT_FIELD_MAPPINGS,
  type HubSpotIntegrationConfig,
} from "@/hooks/useHubSpotMapping";

interface HubSpotMappingDetailModalProps {
  configId: string;
  open: boolean;
  onClose: () => void;
}

type LocalMapping = {
  external_field_name: string;
  native_field_name: string;
  is_required: boolean;
};

export function HubSpotMappingDetailModal({ configId, open, onClose }: HubSpotMappingDetailModalProps) {
  const { configs, upsertConfig } = useHubSpotMappingConfig();
  const { mappings, isLoading: mappingsLoading, saveMappings } = useHubSpotFieldMappings(configId);
  const { runs, isLoading: runsLoading } = useHubSpotSyncRuns(configId);

  const config = configs.find(c => c.id === configId);
  
  const [direction, setDirection] = useState<HubSpotIntegrationConfig["direction"]>("hubspot_to_native");
  const [recordBehavior, setRecordBehavior] = useState<HubSpotIntegrationConfig["record_behavior"]>("create_and_update");
  const [localMappings, setLocalMappings] = useState<LocalMapping[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  // Initialize from config
  useEffect(() => {
    if (config) {
      setDirection(config.direction);
      setRecordBehavior(config.record_behavior);
    }
  }, [config]);

  // Initialize mappings
  useEffect(() => {
    if (mappings.length > 0) {
      setLocalMappings(
        mappings.map(m => ({
          external_field_name: m.external_field_name,
          native_field_name: m.native_field_name,
          is_required: m.is_required,
        }))
      );
    } else if (!mappingsLoading) {
      // Use defaults for new configs
      setLocalMappings(
        DEFAULT_FIELD_MAPPINGS.map(d => ({
          external_field_name: d.external,
          native_field_name: d.native,
          is_required: d.required,
        }))
      );
    }
  }, [mappings, mappingsLoading]);

  // Track which native fields are already mapped
  const mappedNativeFields = useMemo(
    () => new Set(localMappings.map(m => m.native_field_name)),
    [localMappings]
  );

  const unmappedHubSpotFields = useMemo(
    () => HUBSPOT_DEAL_FIELDS.filter(f => !localMappings.some(m => m.external_field_name === f.name)),
    [localMappings]
  );

  const updateMapping = (index: number, nativeField: string) => {
    setLocalMappings(prev => {
      const next = [...prev];
      next[index] = { ...next[index], native_field_name: nativeField };
      return next;
    });
    setIsDirty(true);
  };

  const removeMapping = (index: number) => {
    if (localMappings[index].is_required) return;
    setLocalMappings(prev => prev.filter((_, i) => i !== index));
    setIsDirty(true);
  };

  const addMapping = (externalField: string) => {
    const hsField = HUBSPOT_DEAL_FIELDS.find(f => f.name === externalField);
    setLocalMappings(prev => [
      ...prev,
      {
        external_field_name: externalField,
        native_field_name: "",
        is_required: hsField?.required || false,
      },
    ]);
    setIsDirty(true);
  };

  const handleSave = async () => {
    // Validate required fields are mapped
    const requiredFields = HUBSPOT_DEAL_FIELDS.filter(f => f.required);
    const missingRequired = requiredFields.filter(
      f => !localMappings.some(m => m.external_field_name === f.name && m.native_field_name)
    );
    if (missingRequired.length > 0) {
      return; // validation shown inline
    }

    // Save config settings
    await upsertConfig.mutateAsync({
      type: "hubspot_deals",
      direction,
      record_behavior: recordBehavior,
      status: config?.status || "disabled",
    });

    // Save field mappings (only those with a native field set)
    await saveMappings.mutateAsync(
      localMappings.filter(m => m.native_field_name)
    );

    setIsDirty(false);
  };

  const isSaving = upsertConfig.isPending || saveMappings.isPending;

  const directionIcon = {
    native_to_hubspot: <ArrowRight className="h-4 w-4" />,
    hubspot_to_native: <ArrowLeft className="h-4 w-4" />,
    bidirectional: <ArrowLeftRight className="h-4 w-4" />,
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>HubSpot Deals ↔ naitive Deals</DialogTitle>
          <DialogDescription>
            Configure field mappings, sync direction, and record behavior for deal synchronization.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 pr-4">
          <div className="space-y-6 pb-4">
            {/* Directionality */}
            <div>
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                Sync Direction
                {directionIcon[direction]}
              </h4>
              <RadioGroup value={direction} onValueChange={(v) => { setDirection(v as any); setIsDirty(true); }}>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="hubspot_to_native" id="dir-h2n" />
                    <Label htmlFor="dir-h2n" className="text-sm">
                      HubSpot → naitive <span className="text-muted-foreground">(recommended)</span>
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="native_to_hubspot" id="dir-n2h" />
                    <Label htmlFor="dir-n2h" className="text-sm">naitive → HubSpot</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="bidirectional" id="dir-bi" />
                    <Label htmlFor="dir-bi" className="text-sm">Two-way</Label>
                  </div>
                </div>
              </RadioGroup>
            </div>

            <Separator />

            {/* Record Behavior */}
            <div>
              <h4 className="text-sm font-medium mb-3">Record Behavior</h4>
              <RadioGroup value={recordBehavior} onValueChange={(v) => { setRecordBehavior(v as any); setIsDirty(true); }}>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="create_and_update" id="rb-cu" />
                    <Label htmlFor="rb-cu" className="text-sm">
                      Create + Update <span className="text-muted-foreground">(default)</span>
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="create_only" id="rb-c" />
                    <Label htmlFor="rb-c" className="text-sm">Create only</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="update_only" id="rb-u" />
                    <Label htmlFor="rb-u" className="text-sm">Update only</Label>
                  </div>
                </div>
              </RadioGroup>
            </div>

            <Separator />

            {/* Field Mapping Table */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium">Field Mappings</h4>
                {unmappedHubSpotFields.length > 0 && (
                  <Select onValueChange={addMapping}>
                    <SelectTrigger className="w-[200px] h-8 text-xs">
                      <SelectValue placeholder="Add field mapping..." />
                    </SelectTrigger>
                    <SelectContent>
                      {unmappedHubSpotFields.map(f => (
                        <SelectItem key={f.name} value={f.name} className="text-xs">
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">HubSpot Field</TableHead>
                      <TableHead className="text-xs w-[40px] text-center">→</TableHead>
                      <TableHead className="text-xs">naitive Field</TableHead>
                      <TableHead className="text-xs w-[80px]">Status</TableHead>
                      <TableHead className="text-xs w-[40px]" />
                    </TableRow>
                  </TableHeader>
                </Table>
                <div className="max-h-[320px] overflow-y-auto">
                  <Table>
                    <TableBody>
                      {localMappings.map((mapping, idx) => {
                        const hsField = HUBSPOT_DEAL_FIELDS.find(f => f.name === mapping.external_field_name);
                        const isMapped = !!mapping.native_field_name;
                        return (
                          <TableRow key={mapping.external_field_name}>
                            <TableCell className="text-sm">
                              <div className="flex items-center gap-2">
                                {hsField?.label || mapping.external_field_name}
                                {mapping.is_required && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                    Required
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-center text-muted-foreground w-[40px]">→</TableCell>
                            <TableCell>
                              <Select
                                value={mapping.native_field_name || undefined}
                                onValueChange={(v) => updateMapping(idx, v)}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="Select field..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {NATIVE_DEAL_FIELDS.map(nf => (
                                    <SelectItem
                                      key={nf.name}
                                      value={nf.name}
                                      disabled={mappedNativeFields.has(nf.name) && mapping.native_field_name !== nf.name}
                                      className="text-xs"
                                    >
                                      {nf.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="w-[80px]">
                              {isMapped ? (
                                <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-[10px]">
                                  <CheckCircle2 className="h-3 w-3 mr-0.5" />
                                  Mapped
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-yellow-500 border-yellow-500/20 text-[10px]">
                                  <AlertTriangle className="h-3 w-3 mr-0.5" />
                                  Unmapped
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="w-[40px]">
                              {!mapping.is_required && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => removeMapping(idx)}
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {localMappings.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            No field mappings configured. Add fields using the dropdown above.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>

            <Separator />

            {/* Recent Sync Runs */}
            <div>
              <h4 className="text-sm font-medium mb-3">Recent Sync Runs</h4>
              {runsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-8 bg-muted/30 rounded animate-pulse" />
                  ))}
                </div>
              ) : runs.length === 0 ? (
                <div className="rounded-lg border border-border/50 p-4 text-center">
                  <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No sync runs yet. Enable the mapping and run a sync.</p>
                </div>
              ) : (
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs">Records</TableHead>
                        <TableHead className="text-xs">Errors</TableHead>
                        <TableHead className="text-xs">Started</TableHead>
                        <TableHead className="text-xs">Duration</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {runs.slice(0, 10).map(run => {
                        const duration = run.finished_at
                          ? Math.round((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000)
                          : null;
                        return (
                          <TableRow key={run.id}>
                            <TableCell>
                              {run.status === "success" ? (
                                <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-[10px]">
                                  <CheckCircle2 className="h-3 w-3 mr-0.5" />
                                  Success
                                </Badge>
                              ) : run.status === "failure" ? (
                                <Badge variant="destructive" className="text-[10px]">
                                  <XCircle className="h-3 w-3 mr-0.5" />
                                  Failed
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[10px]">
                                  <Loader2 className="h-3 w-3 mr-0.5 animate-spin" />
                                  Running
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-xs">{run.records_processed}</TableCell>
                            <TableCell className="text-xs">
                              {run.error_count > 0 ? (
                                <span className="text-destructive">{run.error_count}</span>
                              ) : (
                                "0"
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {format(new Date(run.started_at), "MMM d, HH:mm")}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {duration !== null ? `${duration}s` : "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Mapping
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
