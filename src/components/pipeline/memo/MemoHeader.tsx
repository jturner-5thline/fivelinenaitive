import type { Deal } from '@/types/deal';
import { Badge } from '@/components/ui/badge';
import { formatDealType } from '@/utils/dealTypeLabels';
import { usePipelineStageConfig } from '@/hooks/usePipelineStageConfig';

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
  const { getStageConfigForDeal } = usePipelineStageConfig();
  const rawStage = (deal.stage as string | undefined) || '';
  const resolvedLabel = rawStage
    ? getStageConfigForDeal(rawStage, deal.pipelineId)?.label
    : null;
  const stageLabel =
    resolvedLabel ||
    (rawStage
      ? rawStage.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      : null);

  // Real deal status text: comes from the deal's free-text "status notes"
  // field (stored as rich-text HTML in `deal.notes`), which is the same
  // value shown in the deal detail header tile.
  const statusText = (() => {
    const raw = (deal.notes || '').toString();
    if (!raw.trim()) return null;
    const stripped = raw
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
    return stripped || null;
  })();
  const statusDisplay = statusText || stageLabel;

  return (
    <div className="px-5 pt-4 pb-3 border-b border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <h2
            className="text-[15px] font-semibold leading-tight tracking-tight text-white truncate"
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
      {statusDisplay && (
        <p
          className="mt-1.5 text-[12px] leading-snug text-muted-foreground break-words"
          title={statusDisplay}
        >
          <span className="text-muted-foreground/70">Status:</span>{' '}
          <span className="text-foreground/80">{statusDisplay}</span>
        </p>
      )}
    </div>
  );
}