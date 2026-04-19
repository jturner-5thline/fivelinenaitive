import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/**
 * Admin action: finds deals where hubspot_deal_id IS NULL AND pipeline = 'Active Deals' (or 'Active Pipeline'),
 * and syncs each to HubSpot via the hubspot-create-deal edge function.
 */
export function SyncUnsyncedDealsButton() {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);

  const handleSync = async () => {
    setRunning(true);
    try {
      // Resolve "Active*" pipelines for the user's company
      const { data: pipelines, error: pipelineErr } = await supabase
        .from("deal_pipelines")
        .select("id, name");
      if (pipelineErr) throw pipelineErr;

      const activePipelineIds = (pipelines || [])
        .filter((p) => /^active/i.test(p.name))
        .map((p) => p.id);

      if (activePipelineIds.length === 0) {
        toast({ variant: "destructive", title: "No Active pipelines found" });
        return;
      }

      const { data: deals, error: dealsErr } = await supabase
        .from("deals")
        .select("id, company")
        .is("hubspot_deal_id", null)
        .in("pipeline_id", activePipelineIds)
        .neq("hubspot_sync_status", "skipped")
        .limit(200);
      if (dealsErr) throw dealsErr;

      if (!deals || deals.length === 0) {
        toast({ title: "All caught up", description: "No unsynced Active Pipeline deals." });
        return;
      }

      toast({
        title: `Syncing ${deals.length} deal${deals.length === 1 ? "" : "s"}…`,
        description: "Running in background",
      });

      let success = 0;
      let failed = 0;
      for (const d of deals) {
        try {
          const { data, error } = await supabase.functions.invoke("hubspot-create-deal", {
            body: { deal_id: d.id, force: true },
          });
          if (error || (data as any)?.error) failed++;
          else success++;
        } catch {
          failed++;
        }
      }

      toast({
        title: "Sync complete",
        description: `${success} synced, ${failed} failed`,
        variant: failed > 0 ? "destructive" : "default",
      });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Sync failed", description: e?.message });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleSync} disabled={running} className="gap-2">
      {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
      Sync unsynced deals to HubSpot
    </Button>
  );
}
