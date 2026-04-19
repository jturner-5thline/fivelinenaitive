import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowRightLeft,
  Settings2,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  useHubSpotMappingConfig,
  useHubSpotSyncRuns,
  type HubSpotIntegrationConfig,
} from "@/hooks/useHubSpotMapping";
import { HubSpotMappingDetailModal } from "./HubSpotMappingDetailModal";
import { SyncUnsyncedDealsButton } from "./SyncUnsyncedDealsButton";

function StatusBadge({ status }: { status: HubSpotIntegrationConfig["status"] }) {
  switch (status) {
    case "enabled":
      return (
        <Badge className="bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500/10">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Enabled
        </Badge>
      );
    case "failing":
      return (
        <Badge variant="destructive">
          <XCircle className="h-3 w-3 mr-1" />
          Failing
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary">
          <Clock className="h-3 w-3 mr-1" />
          Disabled
        </Badge>
      );
  }
}

interface MappingRowProps {
  config: HubSpotIntegrationConfig;
  onConfigure: () => void;
  onToggle: (enabled: boolean) => void;
  isToggling: boolean;
}

function MappingRow({ config, onConfigure, onToggle, isToggling }: MappingRowProps) {
  const { runs, triggerSync } = useHubSpotSyncRuns(config.id);
  const latestRun = runs[0];

  const directionLabel = {
    native_to_hubspot: "nAItive → HubSpot",
    hubspot_to_native: "HubSpot → nAItive",
    bidirectional: "Two-way",
  }[config.direction];

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0 flex-1">
            <div className="h-10 w-10 rounded-lg bg-orange-500/10 flex items-center justify-center flex-shrink-0">
              <ArrowRightLeft className="h-5 w-5 text-orange-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-sm">HubSpot Deals ↔ nAItive Deals</h3>
                <StatusBadge status={config.status} />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Sync deal records between HubSpot CRM and nAItive. Direction: {directionLabel}
              </p>
              <div className="flex items-center gap-4 mt-2 flex-wrap">
                {config.last_sync_at && (
                  <span className="text-xs text-muted-foreground">
                    Last synced: {formatDistanceToNow(new Date(config.last_sync_at), { addSuffix: true })}
                  </span>
                )}
                {latestRun && (
                  <span className="text-xs text-muted-foreground">
                    {latestRun.records_processed} records processed
                  </span>
                )}
                {latestRun?.status === "failure" && (
                  <span className="text-xs text-destructive flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Last sync failed
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={config.status === "enabled"}
              onCheckedChange={onToggle}
              disabled={isToggling}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <Button variant="outline" size="sm" onClick={onConfigure}>
            <Settings2 className="h-3.5 w-3.5 mr-1.5" />
            Configure
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => triggerSync.mutate()}
            disabled={triggerSync.isPending || config.status !== "enabled"}
          >
            {triggerSync.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5 mr-1.5" />
            )}
            Run Sync
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function HubSpotMappingOverview() {
  const { configs, isLoading, upsertConfig, toggleStatus } = useHubSpotMappingConfig();
  const [configureId, setConfigureId] = useState<string | null>(null);

  const dealsConfig = configs.find(c => c.type === "hubspot_deals");

  const handleCreateConfig = async () => {
    const result = await upsertConfig.mutateAsync({ type: "hubspot_deals" });
    setConfigureId((result as any).id);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Object Mappings</h3>
          <p className="text-xs text-muted-foreground">
            Configure how HubSpot objects map to nAItive entities
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SyncUnsyncedDealsButton />
          {!dealsConfig && (
            <Button size="sm" onClick={handleCreateConfig} disabled={upsertConfig.isPending}>
              {upsertConfig.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Add Deal Mapping
            </Button>
          )}
        </div>
      </div>

      {dealsConfig ? (
        <MappingRow
          config={dealsConfig}
          onConfigure={() => setConfigureId(dealsConfig.id)}
          onToggle={(enabled) => toggleStatus.mutate({ id: dealsConfig.id, enabled })}
          isToggling={toggleStatus.isPending}
        />
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ArrowRightLeft className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No mappings configured</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Set up a mapping between HubSpot Deals and nAItive Deals to start syncing.
            </p>
            <Button onClick={handleCreateConfig} disabled={upsertConfig.isPending}>
              {upsertConfig.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Deal Mapping
            </Button>
          </CardContent>
        </Card>
      )}

      {configureId && (
        <HubSpotMappingDetailModal
          configId={configureId}
          open={!!configureId}
          onClose={() => setConfigureId(null)}
        />
      )}
    </div>
  );
}
