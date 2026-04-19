import { useEffect, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, XCircle, Loader2, ExternalLink, RefreshCw, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const HUBSPOT_PORTAL_ID = "5626401";

interface HubSpotDealBadgeProps {
  dealId: string;
}

interface SyncState {
  hubspot_deal_id: string | null;
  hubspot_sync_status: string | null;
  hubspot_sync_error: string | null;
  hubspot_last_synced_at: string | null;
}

export function HubSpotDealBadge({ dealId }: HubSpotDealBadgeProps) {
  const { toast } = useToast();
  const [state, setState] = useState<SyncState | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);

  const fetchState = useCallback(async () => {
    const { data } = await supabase
      .from("deals")
      .select("hubspot_deal_id, hubspot_sync_status, hubspot_sync_error, hubspot_last_synced_at")
      .eq("id", dealId)
      .single();
    if (data) setState(data as SyncState);
    setLoading(false);
  }, [dealId]);

  useEffect(() => { fetchState(); }, [fetchState]);

  const retry = useCallback(async () => {
    setRetrying(true);
    try {
      const { data, error } = await supabase.functions.invoke("hubspot-create-deal", {
        body: { deal_id: dealId, force: true },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: "HubSpot sync triggered", description: "Refreshing status…" });
      setTimeout(fetchState, 1500);
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Sync failed",
        description: e?.message || "Could not sync to HubSpot",
      });
    } finally {
      setRetrying(false);
    }
  }, [dealId, fetchState, toast]);

  if (loading) {
    return <Badge variant="outline" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" /> HubSpot</Badge>;
  }
  if (!state) return null;

  // Synced successfully
  if (state.hubspot_deal_id && state.hubspot_sync_status === "success") {
    const url = `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/deal/${state.hubspot_deal_id}`;
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex">
              <Badge className="gap-1 bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30 hover:bg-orange-500/20">
                <CheckCircle2 className="h-3 w-3" />
                HubSpot
                <ExternalLink className="h-3 w-3 ml-0.5" />
              </Badge>
            </a>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Synced to HubSpot · ID {state.hubspot_deal_id}</p>
            {state.hubspot_last_synced_at && (
              <p className="text-xs text-muted-foreground">
                Last sync: {new Date(state.hubspot_last_synced_at).toLocaleString()}
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Failed
  if (state.hubspot_sync_status === "failed") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-6 gap-1 border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={retry}
              disabled={retrying}
            >
              {retrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
              HubSpot · Retry
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-xs font-medium">Sync failed</p>
            <p className="text-xs text-muted-foreground break-all">{state.hubspot_sync_error}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Skipped (historical pre-cutoff)
  if (state.hubspot_sync_status === "skipped") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" className="h-6 gap-1" onClick={retry} disabled={retrying}>
              {retrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Sync to HubSpot
            </Button>
          </TooltipTrigger>
          <TooltipContent><p className="text-xs">Force sync this deal to HubSpot</p></TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Not yet synced (status null)
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="sm" className="h-6 gap-1" onClick={retry} disabled={retrying}>
            {retrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <AlertTriangle className="h-3 w-3" />}
            Sync to HubSpot
          </Button>
        </TooltipTrigger>
        <TooltipContent><p className="text-xs">Not yet synced — click to push to HubSpot</p></TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
