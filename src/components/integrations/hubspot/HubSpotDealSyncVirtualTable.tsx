import * as React from "react";
import { TableVirtuoso } from "react-virtuoso";

import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HubSpotDeal } from "@/hooks/useHubSpot";
import { HubSpotDealSyncCells } from "./HubSpotDealSyncRow";

interface HubSpotDealSyncVirtualTableProps {
  deals: HubSpotDeal[];
  selectedDeals: Set<string>;
  unlinkedDealIds: Set<string>;
  unlinkedDealsCount: number;
  getOwnerName: (ownerId: string | undefined) => string | null;
  getStageName: (stageId: string | undefined) => string;
  onSelectAll: (checked: boolean) => void;
  onSelectDeal: (dealId: string, checked: boolean) => void;
  onLinkDeal: (deal: HubSpotDeal) => void;
}

export const HubSpotDealSyncVirtualTable = React.memo(function HubSpotDealSyncVirtualTable({
  deals,
  selectedDeals,
  unlinkedDealIds,
  unlinkedDealsCount,
  getOwnerName,
  getStageName,
  onSelectAll,
  onSelectDeal,
  onLinkDeal,
}: HubSpotDealSyncVirtualTableProps) {
  const components = React.useMemo(
    () => ({
      Scroller: React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
        ({ className, ...props }, ref) => (
          <div ref={ref} className={cn("h-[400px] overflow-auto", className)} {...props} />
        ),
      ),
      Table: (props: React.TableHTMLAttributes<HTMLTableElement>) => (
        <table {...props} className={cn("w-full caption-bottom text-sm", props.className)} />
      ),
      TableHead: TableHeader,
      TableRow,
      TableBody,
    }),
    [],
  );

  // Give the scroller a displayName for React DevTools clarity.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (components.Scroller as any).displayName = "HubSpotDealSyncVirtualScroller";

  const isAllUnlinkedSelected = selectedDeals.size === unlinkedDealsCount && unlinkedDealsCount > 0;

  return (
    <TableVirtuoso
      data={deals}
      // react-virtuoso types can be finicky depending on version; this keeps it stable.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      components={components as any}
      fixedHeaderContent={() => (
        <TableRow>
          <TableHead className="w-12">
            <Checkbox checked={isAllUnlinkedSelected} onCheckedChange={(c) => onSelectAll(c === true)} />
          </TableHead>
          <TableHead>HubSpot Deal</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Stage</TableHead>
          <TableHead>Owner</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      )}
      itemContent={(_index, deal) => (
        <HubSpotDealSyncCells
          deal={deal}
          isUnlinked={unlinkedDealIds.has(deal.id)}
          isSelected={selectedDeals.has(deal.id)}
          ownerName={getOwnerName(deal.properties.hubspot_owner_id)}
          stageName={getStageName(deal.properties.dealstage)}
          onSelectDeal={onSelectDeal}
          onLinkDeal={onLinkDeal}
        />
      )}
    />
  );
});
