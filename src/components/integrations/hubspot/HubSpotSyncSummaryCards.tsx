import { memo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Download, Link2, Unlink } from "lucide-react";

interface HubSpotSyncSummaryCardsProps {
  totalDeals: number;
  syncedCount: number;
  unlinkedCount: number;
}

export const HubSpotSyncSummaryCards = memo(function HubSpotSyncSummaryCards({
  totalDeals,
  syncedCount,
  unlinkedCount,
}: HubSpotSyncSummaryCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-primary/10">
              <Download className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalDeals}</p>
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
              <p className="text-2xl font-bold">{syncedCount}</p>
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
              <p className="text-2xl font-bold">{unlinkedCount}</p>
              <p className="text-sm text-muted-foreground">Unlinked</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});
