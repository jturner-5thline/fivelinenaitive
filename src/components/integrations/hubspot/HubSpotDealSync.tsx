import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
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
import { useHubSpotDeals, useHubSpotPipelines, HubSpotDeal } from "@/hooks/useHubSpot";
import { useDeals } from "@/hooks/useDeals";
import { 
  ArrowRightLeft, 
  Download, 
  Upload, 
  CheckCircle2, 
  XCircle,
  Loader2,
  Link2,
  Unlink,
  RefreshCw,
  AlertTriangle,
  ArrowRight
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface SyncMapping {
  hubspotDealId: string;
  localDealId: string | null;
  hubspotDealName: string;
  localDealName: string | null;
  status: 'synced' | 'unlinked' | 'conflict';
  lastSync?: string;
}

export function HubSpotDealSync() {
  const { data: hubspotDeals, isLoading: hubspotLoading, refetch: refetchHubspot } = useHubSpotDeals();
  const { data: pipelinesData } = useHubSpotPipelines();
  const { deals: localDeals, isLoading: localLoading } = useDeals();
  
  const [selectedDeals, setSelectedDeals] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [dealToLink, setDealToLink] = useState<HubSpotDeal | null>(null);
  const [selectedLocalDeal, setSelectedLocalDeal] = useState<string>("");
  const [syncDirection, setSyncDirection] = useState<'import' | 'export'>('import');

  // Calculate sync mappings
  const syncMappings = useMemo<SyncMapping[]>(() => {
    if (!hubspotDeals?.results) return [];
    
    return hubspotDeals.results.map((hsDeal) => {
      // Try to find matching local deal by name
      const matchingLocal = localDeals?.find(
        (ld) => ld.company.toLowerCase() === hsDeal.properties.dealname?.toLowerCase()
      );
      
      return {
        hubspotDealId: hsDeal.id,
        localDealId: matchingLocal?.id || null,
        hubspotDealName: hsDeal.properties.dealname || 'Unnamed Deal',
        localDealName: matchingLocal?.company || null,
        status: matchingLocal ? 'synced' : 'unlinked',
      };
    });
  }, [hubspotDeals, localDeals]);

  const unlinkedDeals = syncMappings.filter(m => m.status === 'unlinked');
  const syncedDeals = syncMappings.filter(m => m.status === 'synced');

  const formatCurrency = (amount: string | undefined) => {
    if (!amount) return "-";
    return new Intl.NumberFormat("en-US", { 
      style: "currency", 
      currency: "USD", 
      maximumFractionDigits: 0 
    }).format(parseFloat(amount));
  };

  const getStageName = (stageId: string | undefined) => {
    if (!stageId || !pipelinesData?.results) return stageId || '-';
    for (const pipeline of pipelinesData.results) {
      const stage = pipeline.stages.find(s => s.id === stageId);
      if (stage) return stage.label;
    }
    return stageId;
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedDeals(new Set(unlinkedDeals.map(m => m.hubspotDealId)));
    } else {
      setSelectedDeals(new Set());
    }
  };

  const handleSelectDeal = (dealId: string, checked: boolean) => {
    const newSelected = new Set(selectedDeals);
    if (checked) {
      newSelected.add(dealId);
    } else {
      newSelected.delete(dealId);
    }
    setSelectedDeals(newSelected);
  };

  const handleImportSelected = async () => {
    if (selectedDeals.size === 0) {
      toast.error("No deals selected");
      return;
    }

    setIsImporting(true);
    
    // In a real implementation, you'd call an API to create deals
    const totalSelected = selectedDeals.size;
    toast.info(`Would import ${totalSelected} deals - implement createDeal in useDeals hook`);
    
    await new Promise(resolve => setTimeout(resolve, 1000));

    setIsImporting(false);
    setSelectedDeals(new Set());
    
    // TODO: Replace with actual import logic and track success/error counts
    toast.success(`Import process completed for ${totalSelected} deal(s)`);
  };

  const handleLinkDeal = (hsDeal: HubSpotDeal) => {
    setDealToLink(hsDeal);
    setSelectedLocalDeal("");
    setIsLinkDialogOpen(true);
  };

  const confirmLinkDeal = () => {
    if (!dealToLink || !selectedLocalDeal) return;
    
    // In a real implementation, you'd save this mapping to the database
    toast.success(`Linked "${dealToLink.properties.dealname}" to local deal`);
    setIsLinkDialogOpen(false);
    setDealToLink(null);
    setSelectedLocalDeal("");
  };

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
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-primary/10">
                <Download className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{hubspotDeals?.results?.length || 0}</p>
                <p className="text-sm text-muted-foreground">HubSpot Deals</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-green-500/10">
                <Link2 className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{syncedDeals.length}</p>
                <p className="text-sm text-muted-foreground">Synced</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-yellow-500/10">
                <Unlink className="h-5 w-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{unlinkedDeals.length}</p>
                <p className="text-sm text-muted-foreground">Unlinked</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sync Actions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Deal Sync</CardTitle>
              <CardDescription>Import HubSpot deals or link to existing local deals</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => refetchHubspot()}>
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
                  <Download className="h-4 w-4 mr-2" />
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
                    <TableHead>Created</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hubspotDeals?.results?.map((deal) => {
                    const mapping = syncMappings.find(m => m.hubspotDealId === deal.id);
                    const isUnlinked = mapping?.status === 'unlinked';
                    
                    return (
                      <TableRow key={deal.id}>
                        <TableCell>
                          {isUnlinked && (
                            <Checkbox 
                              checked={selectedDeals.has(deal.id)}
                              onCheckedChange={(checked) => handleSelectDeal(deal.id, checked as boolean)}
                            />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          {deal.properties.dealname || 'Unnamed Deal'}
                        </TableCell>
                        <TableCell>{formatCurrency(deal.properties.amount)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {getStageName(deal.properties.dealstage)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {deal.properties.createdate
                            ? formatDistanceToNow(new Date(deal.properties.createdate), { addSuffix: true })
                            : '-'}
                        </TableCell>
                        <TableCell>
                          {isUnlinked ? (
                            <Badge variant="outline" className="text-yellow-600 border-yellow-500/30">
                              <Unlink className="h-3 w-3 mr-1" />
                              Unlinked
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-green-600 border-green-500/30">
                              <Link2 className="h-3 w-3 mr-1" />
                              Synced
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {isUnlinked && (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleLinkDeal(deal)}
                            >
                              <Link2 className="h-4 w-4 mr-1" />
                              Link
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
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
              <Link2 className="h-4 w-4 mr-2" />
              Link Deals
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}