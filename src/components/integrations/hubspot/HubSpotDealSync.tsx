import { useState, useMemo, useCallback, memo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useHubSpotDeals, useHubSpotPipelines, useHubSpotOwners, HubSpotDeal } from "@/hooks/useHubSpot";
import { useDeals } from "@/hooks/useDeals";
import { useDealsContext } from "@/contexts/DealsContext";
import { useDealStages } from "@/contexts/DealStagesContext";
import { 
  CheckCircle2, 
  Loader2,
  RefreshCw,
  ArrowRight,
  FileDown,
  Settings2
} from "lucide-react";
import { DealStage, EngagementType } from "@/types/deal";
import { HubSpotDealSyncRow } from "./HubSpotDealSyncRow";
import { HubSpotSyncSummaryCards } from "./HubSpotSyncSummaryCards";

interface SyncMapping {
  hubspotDealId: string;
  localDealId: string | null;
  hubspotDealName: string;
  localDealName: string | null;
  status: 'synced' | 'unlinked' | 'conflict';
  lastSync?: string;
}

// Default stage mapping from HubSpot stages to nAitive stages
const DEFAULT_STAGE_MAPPING: Record<string, DealStage> = {
  'appointmentscheduled': 'client-strategy-review',
  'qualifiedtobuy': 'write-up-pending',
  'presentationscheduled': 'submitted-to-lenders',
  'decisionmakerboughtin': 'lenders-in-review',
  'contractsent': 'terms-issued',
  'closedwon': 'closed-won',
  'closedlost': 'closed-lost',
};

const formatCurrency = (amount: string | undefined) => {
  if (!amount) return "-";
  return new Intl.NumberFormat("en-US", { 
    style: "currency", 
    currency: "USD", 
    maximumFractionDigits: 0 
  }).format(parseFloat(amount));
};

export const HubSpotDealSync = memo(function HubSpotDealSync() {
  const { data: hubspotDeals, isLoading: hubspotLoading, refetch: refetchHubspot } = useHubSpotDeals();
  const { data: pipelinesData } = useHubSpotPipelines();
  const { data: ownersData } = useHubSpotOwners();
  const { deals: localDeals, isLoading: localLoading } = useDeals();
  const { createDeal } = useDealsContext();
  const { stages } = useDealStages();
  
  const [selectedDeals, setSelectedDeals] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [isMappingDialogOpen, setIsMappingDialogOpen] = useState(false);
  const [dealToLink, setDealToLink] = useState<HubSpotDeal | null>(null);
  const [selectedLocalDeal, setSelectedLocalDeal] = useState<string>("");
  const [stageMapping, setStageMapping] = useState<Record<string, string>>({});

  // Get all unique stages from HubSpot pipelines - memoized
  const hubspotStages = useMemo(() => {
    if (!pipelinesData?.results) return [];
    const stagesList: Array<{ id: string; label: string; pipelineName: string }> = [];
    pipelinesData.results.forEach(pipeline => {
      pipeline.stages.forEach(stage => {
        stagesList.push({
          id: stage.id,
          label: stage.label,
          pipelineName: pipeline.label,
        });
      });
    });
    return stagesList;
  }, [pipelinesData]);

  // Create lookup maps for O(1) access instead of repeated finds
  const localDealsMap = useMemo(() => {
    if (!localDeals) return new Map<string, typeof localDeals[0]>();
    const map = new Map<string, typeof localDeals[0]>();
    localDeals.forEach(deal => {
      map.set(deal.company.toLowerCase(), deal);
    });
    return map;
  }, [localDeals]);

  const ownersMap = useMemo(() => {
    if (!ownersData?.results) return new Map<string, string>();
    const map = new Map<string, string>();
    ownersData.results.forEach(owner => {
      const name = `${owner.firstName} ${owner.lastName}`.trim() || owner.email;
      map.set(owner.id, name);
    });
    return map;
  }, [ownersData]);

  const stagesMap = useMemo(() => {
    if (!pipelinesData?.results) return new Map<string, string>();
    const map = new Map<string, string>();
    pipelinesData.results.forEach(pipeline => {
      pipeline.stages.forEach(stage => {
        map.set(stage.id, stage.label);
      });
    });
    return map;
  }, [pipelinesData]);

  // Calculate sync mappings with lookup maps
  const { syncMappings, unlinkedDeals, syncedDeals } = useMemo(() => {
    if (!hubspotDeals?.results) return { syncMappings: [], unlinkedDeals: [], syncedDeals: [] };
    
    const mappings: SyncMapping[] = hubspotDeals.results.map((hsDeal) => {
      const dealName = hsDeal.properties.dealname?.toLowerCase() || '';
      const matchingLocal = localDealsMap.get(dealName);
      
      return {
        hubspotDealId: hsDeal.id,
        localDealId: matchingLocal?.id || null,
        hubspotDealName: hsDeal.properties.dealname || 'Unnamed Deal',
        localDealName: matchingLocal?.company || null,
        status: matchingLocal ? 'synced' as const : 'unlinked' as const,
      };
    });

    const unlinked = mappings.filter(m => m.status === 'unlinked');
    const synced = mappings.filter(m => m.status === 'synced');

    return { syncMappings: mappings, unlinkedDeals: unlinked, syncedDeals: synced };
  }, [hubspotDeals, localDealsMap]);

  // Create a set for O(1) lookup of unlinked deal IDs
  const unlinkedDealIds = useMemo(() => 
    new Set(unlinkedDeals.map(m => m.hubspotDealId)), 
    [unlinkedDeals]
  );

  const getStageName = useCallback((stageId: string | undefined) => {
    if (!stageId) return '-';
    return stagesMap.get(stageId) || stageId;
  }, [stagesMap]);

  const getOwnerName = useCallback((ownerId: string | undefined) => {
    if (!ownerId) return null;
    return ownersMap.get(ownerId) || null;
  }, [ownersMap]);

  // Map HubSpot stage to nAitive stage
  const mapHubSpotStage = useCallback((hubspotStageId: string | undefined): DealStage => {
    if (!hubspotStageId) return 'final-credit-items';
    
    // Check custom mapping first
    if (stageMapping[hubspotStageId]) {
      return stageMapping[hubspotStageId] as DealStage;
    }
    
    // Fall back to default mapping
    const stageLower = hubspotStageId.toLowerCase();
    if (DEFAULT_STAGE_MAPPING[stageLower]) {
      return DEFAULT_STAGE_MAPPING[stageLower];
    }
    
    // Default to first stage
    return 'final-credit-items';
  }, [stageMapping]);

  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      setSelectedDeals(new Set(unlinkedDeals.map(m => m.hubspotDealId)));
    } else {
      setSelectedDeals(new Set());
    }
  }, [unlinkedDeals]);

  const handleSelectDeal = useCallback((dealId: string, checked: boolean) => {
    setSelectedDeals(prev => {
      const newSelected = new Set(prev);
      if (checked) {
        newSelected.add(dealId);
      } else {
        newSelected.delete(dealId);
      }
      return newSelected;
    });
  }, []);

  const handleImportSelected = useCallback(async () => {
    if (selectedDeals.size === 0) {
      toast.error("No deals selected");
      return;
    }

    setIsImporting(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      const dealsToImport = hubspotDeals?.results?.filter(d => selectedDeals.has(d.id)) || [];
      
      for (const hsDeal of dealsToImport) {
        try {
          const ownerName = getOwnerName(hsDeal.properties.hubspot_owner_id);
          const mappedStage = mapHubSpotStage(hsDeal.properties.dealstage);
          
          const newDeal = await createDeal({
            company: hsDeal.properties.dealname || 'Imported Deal',
            value: hsDeal.properties.amount ? parseFloat(hsDeal.properties.amount) : 0,
            stage: mappedStage,
            status: 'on-track',
            engagementType: 'guided' as EngagementType,
            manager: ownerName || undefined,
            notes: `Imported from HubSpot (ID: ${hsDeal.id})`,
          });
          
          if (newDeal) {
            successCount++;
          } else {
            errorCount++;
          }
        } catch (err) {
          console.error(`Failed to import deal ${hsDeal.properties.dealname}:`, err);
          errorCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`Successfully imported ${successCount} deal(s)`);
      }
      if (errorCount > 0) {
        toast.error(`Failed to import ${errorCount} deal(s)`);
      }
      
      setSelectedDeals(new Set());
      refetchHubspot();
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Import failed');
    } finally {
      setIsImporting(false);
    }
  }, [selectedDeals, hubspotDeals, getOwnerName, mapHubSpotStage, createDeal, refetchHubspot]);

  const handleLinkDeal = useCallback((hsDeal: HubSpotDeal) => {
    setDealToLink(hsDeal);
    setSelectedLocalDeal("");
    setIsLinkDialogOpen(true);
  }, []);

  const confirmLinkDeal = useCallback(() => {
    if (!dealToLink || !selectedLocalDeal) return;
    
    toast.success(`Linked "${dealToLink.properties.dealname}" to local deal`);
    setIsLinkDialogOpen(false);
    setDealToLink(null);
    setSelectedLocalDeal("");
  }, [dealToLink, selectedLocalDeal]);

  const openMappingDialog = useCallback(() => {
    const initialMapping: Record<string, string> = {};
    hubspotStages.forEach(stage => {
      initialMapping[stage.id] = stageMapping[stage.id] || 
        DEFAULT_STAGE_MAPPING[stage.id.toLowerCase()] || 
        'final-credit-items';
    });
    setStageMapping(initialMapping);
    setIsMappingDialogOpen(true);
  }, [hubspotStages, stageMapping]);

  const saveStageMapping = useCallback(() => {
    toast.success('Stage mapping saved');
    setIsMappingDialogOpen(false);
  }, []);

  const handleRefresh = useCallback(() => {
    refetchHubspot();
  }, [refetchHubspot]);

  if (hubspotLoading || localLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sync Summary */}
      <HubSpotSyncSummaryCards
        totalDeals={hubspotDeals?.results?.length || 0}
        syncedCount={syncedDeals.length}
        unlinkedCount={unlinkedDeals.length}
      />

      {/* Sync Actions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Deal Sync</CardTitle>
              <CardDescription>Import HubSpot deals or link to existing local deals</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={openMappingDialog}>
                <Settings2 className="h-4 w-4 mr-2" />
                Stage Mapping
              </Button>
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button 
                size="sm" 
                onClick={handleImportSelected}
                disabled={selectedDeals.size === 0 || isImporting}
              >
                {isImporting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileDown className="h-4 w-4 mr-2" />
                )}
                Import Selected ({selectedDeals.size})
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {unlinkedDeals.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-green-500" />
              <p className="font-medium">All deals are synced!</p>
              <p className="text-sm">No unlinked HubSpot deals found.</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox 
                        checked={selectedDeals.size === unlinkedDeals.length && unlinkedDeals.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead>HubSpot Deal</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hubspotDeals?.results?.map((deal) => (
                    <HubSpotDealSyncRow
                      key={deal.id}
                      deal={deal}
                      isUnlinked={unlinkedDealIds.has(deal.id)}
                      isSelected={selectedDeals.has(deal.id)}
                      ownerName={getOwnerName(deal.properties.hubspot_owner_id)}
                      stageName={getStageName(deal.properties.dealstage)}
                      onSelectDeal={handleSelectDeal}
                      onLinkDeal={handleLinkDeal}
                    />
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Link Dialog */}
      <Dialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link to Local Deal</DialogTitle>
            <DialogDescription>
              Link "{dealToLink?.properties.dealname}" to an existing local deal
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <div className="flex items-center gap-4 mb-4 p-4 bg-muted rounded-lg">
              <div className="flex-1">
                <p className="font-medium">{dealToLink?.properties.dealname}</p>
                <p className="text-sm text-muted-foreground">
                  {formatCurrency(dealToLink?.properties.amount)} • HubSpot
                </p>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                {selectedLocalDeal ? (
                  <>
                    <p className="font-medium">
                      {localDeals?.find(d => d.id === selectedLocalDeal)?.company}
                    </p>
                    <p className="text-sm text-muted-foreground">Local Deal</p>
                  </>
                ) : (
                  <p className="text-muted-foreground">Select a deal</p>
                )}
              </div>
            </div>

            <Select value={selectedLocalDeal} onValueChange={setSelectedLocalDeal}>
              <SelectTrigger>
                <SelectValue placeholder="Select a local deal to link" />
              </SelectTrigger>
              <SelectContent>
                {localDeals?.map((deal) => (
                  <SelectItem key={deal.id} value={deal.id}>
                    {deal.company} - {formatCurrency(deal.value.toString())}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLinkDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmLinkDeal} disabled={!selectedLocalDeal}>
              Link Deals
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stage Mapping Dialog */}
      <Dialog open={isMappingDialogOpen} onOpenChange={setIsMappingDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Stage Mapping</DialogTitle>
            <DialogDescription>
              Map HubSpot deal stages to nAItive deal stages for imported deals
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-4">
              {hubspotStages.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No HubSpot pipelines found. Connect to HubSpot first.
                </p>
              ) : (
                hubspotStages.map((hsStage) => (
                  <div key={hsStage.id} className="flex items-center gap-4">
                    <div className="flex-1">
                      <Label className="text-sm font-medium">{hsStage.label}</Label>
                      <p className="text-xs text-muted-foreground">{hsStage.pipelineName}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1">
                      <Select
                        value={stageMapping[hsStage.id] || 'final-credit-items'}
                        onValueChange={(value) => setStageMapping(prev => ({
                          ...prev,
                          [hsStage.id]: value
                        }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {stages.map((stage) => (
                            <SelectItem key={stage.id} value={stage.id}>
                              {stage.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMappingDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveStageMapping}>
              Save Mapping
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});
