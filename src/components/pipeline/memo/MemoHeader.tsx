import type { Deal } from '@/types/deal';
import { Badge } from '@/components/ui/badge';
import { formatDealType } from '@/utils/dealTypeLabels';

interface MemoHeaderProps {
  deal: Deal;
  /** Show pulsing live-deal dot (only on the topmost visible card). */
  showLiveDot?: boolean;
}

function formatAmount(value: number | undefined | null): string {
  if (!value || value <= 0) return '—';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value.toLocaleString()}`;
}

/**
 * Memo card header. Renders deal/company name, inline pill badges for
 * deal size, engagement type and asset class, and a "Live deal" status
 * indicator on the right edge.
 */
export function MemoHeader({ deal, showLiveDot = true }: MemoHeaderProps) {
  const amountLabel = formatAmount(deal.value);
  const structureLabel = deal.engagementType
    ? deal.engagementType.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : null;
  const assetClassRaw = (deal.dealTypes && deal.dealTypes[0]) || null;
  const assetClass = assetClassRaw ? formatDealType(assetClassRaw) : null;

  return (
    <div className="px-5 pt-4 pb-3 border-b border-border">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <h2
            className="text-base font-semibold leading-tight text-foreground truncate"
            title={deal.company || deal.name}
          >
            {deal.company || deal.name}
          </h2>
          {structureLabel && (
            <Badge variant="gray" className="rounded-full">{structureLabel}</Badge>
          )}
          {assetClass && (
            <Badge variant="gray" className="rounded-full">{assetClass}</Badge>
          )}
        </div>
        <Badge variant="green" className="rounded-full shrink-0">{amountLabel}</Badge>
      </div>
    </div>
  );
}