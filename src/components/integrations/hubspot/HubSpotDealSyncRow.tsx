import { memo } from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Link2, Unlink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { HubSpotDeal } from "@/hooks/useHubSpot";

interface HubSpotDealSyncRowProps {
  deal: HubSpotDeal;
  isUnlinked: boolean;
  isSelected: boolean;
  ownerName: string | null;
  stageName: string;
  onSelectDeal: (dealId: string, checked: boolean) => void;
  onLinkDeal: (deal: HubSpotDeal) => void;
}

function formatCurrency(amount: string | undefined) {
  if (!amount) return "-";
  return new Intl.NumberFormat("en-US", { 
    style: "currency", 
    currency: "USD", 
    maximumFractionDigits: 0 
  }).format(parseFloat(amount));
}

export const HubSpotDealSyncRow = memo(function HubSpotDealSyncRow({
  deal,
  isUnlinked,
  isSelected,
  ownerName,
  stageName,
  onSelectDeal,
  onLinkDeal,
}: HubSpotDealSyncRowProps) {
  return (
    <TableRow>
      <HubSpotDealSyncCells
        deal={deal}
        isUnlinked={isUnlinked}
        isSelected={isSelected}
        ownerName={ownerName}
        stageName={stageName}
        onSelectDeal={onSelectDeal}
        onLinkDeal={onLinkDeal}
      />
    </TableRow>
  );
});

export const HubSpotDealSyncCells = memo(function HubSpotDealSyncCells({
  deal,
  isUnlinked,
  isSelected,
  ownerName,
  stageName,
  onSelectDeal,
  onLinkDeal,
}: HubSpotDealSyncRowProps) {
  return (
    <>
      <TableCell>
        {isUnlinked && (
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => onSelectDeal(deal.id, checked as boolean)}
          />
        )}
      </TableCell>
      <TableCell className="font-medium">{deal.properties.dealname || "Unnamed Deal"}</TableCell>
      <TableCell>{formatCurrency(deal.properties.amount)}</TableCell>
      <TableCell>
        <Badge variant="secondary">{stageName}</Badge>
      </TableCell>
      <TableCell className="text-muted-foreground">{ownerName || "-"}</TableCell>
      <TableCell className="text-muted-foreground">
        {deal.properties.createdate
          ? formatDistanceToNow(new Date(deal.properties.createdate), { addSuffix: true })
          : "-"}
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
          <Button variant="ghost" size="sm" onClick={() => onLinkDeal(deal)}>
            <Link2 className="h-4 w-4 mr-1" />
            Link
          </Button>
        )}
      </TableCell>
    </>
  );
});
