import { Deal, DealStatus, STATUS_CONFIG } from '@/types/deal';
import { DealCard } from './DealCard';
import { FileX } from 'lucide-react';

interface DealsListProps {
  deals: Deal[];
  onStatusChange: (dealId: string, newStatus: DealStatus) => void;
  groupByStatus?: boolean;
}

const STATUS_ORDER: DealStatus[] = ['on-track', 'at-risk', 'off-track', 'on-hold', 'archived'];

export function DealsList({ deals, onStatusChange, groupByStatus = true }: DealsListProps) {
  if (deals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
          <FileX className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium text-foreground">No deals found</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Try adjusting your filters or create a new deal to get started.
        </p>
      </div>
    );
  }

  // If not grouping, show flat grid
  if (!groupByStatus) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {deals.map((deal) => (
          <DealCard key={deal.id} deal={deal} onStatusChange={onStatusChange} />
        ))}
      </div>
    );
  }

  // Group deals by status
  const groupedDeals = STATUS_ORDER.reduce((acc, status) => {
    const dealsForStatus = deals.filter((deal) => deal.status === status);
    if (dealsForStatus.length > 0) {
      acc.push({ status, deals: dealsForStatus });
    }
    return acc;
  }, [] as { status: DealStatus; deals: Deal[] }[]);

  return (
    <div className="space-y-8">
      {groupedDeals.map(({ status, deals: statusDeals }) => (
        <div key={status}>
          <div className="flex items-center gap-2 mb-4">
            <span className={`h-2.5 w-2.5 rounded-full ${STATUS_CONFIG[status].dotColor}`} />
            <h2 className="text-lg font-semibold text-foreground">
              {STATUS_CONFIG[status].label}
            </h2>
            <span className="text-sm text-muted-foreground">({statusDeals.length})</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {statusDeals.map((deal) => (
              <DealCard key={deal.id} deal={deal} onStatusChange={onStatusChange} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
