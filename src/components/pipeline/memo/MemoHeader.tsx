import type { Deal } from '@/types/deal';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';

interface MemoHeaderProps {
  deal: Deal;
}

function formatAmount(value: number | undefined | null): string {
  if (!value || value <= 0) return '—';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value.toLocaleString()}`;
}

/**
 * Memo card header — uses platform Card padding + Badge components.
 */
export function MemoHeader({ deal }: MemoHeaderProps) {
  const amountLabel = `${formatAmount(deal.value)} Request`;
  const structureLabel = deal.engagementType
    ? deal.engagementType.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : null;
  const assetClass = (deal.dealTypes && deal.dealTypes[0]) || null;
  const dateLabel = format(new Date(), 'MMM d');

  return (
    <div className="px-5 pt-4 pb-3 border-b border-border">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h2
            className="text-lg font-semibold leading-tight text-foreground truncate"
            title={deal.company || deal.name}
          >
            {deal.company || deal.name}
          </h2>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <Badge variant="cyan">{amountLabel}</Badge>
            {structureLabel && <Badge variant="gray">{structureLabel}</Badge>}
            {assetClass && <Badge variant="gray">{assetClass}</Badge>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs font-medium text-foreground">{dateLabel}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
            24h Digest
          </div>
        </div>
      </div>
    </div>
  );
}