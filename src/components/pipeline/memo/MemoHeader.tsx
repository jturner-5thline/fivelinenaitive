import type { Deal } from '@/types/deal';
import { format } from 'date-fns';

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
 * Memo card header bar.
 *
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │ DEAL UPDATE MEMO                              Apr 22 · 24h Digest│
 *   │ Arbolus      [$5M Request] [Senior Debt] [SaaS]                 │
 *   └─────────────────────────────────────────────────────────────────┘
 */
export function MemoHeader({ deal }: MemoHeaderProps) {
  const amountLabel = `${formatAmount(deal.value)} Request`;
  const structureLabel = deal.engagementType
    ? deal.engagementType.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : null;
  const assetClass = (deal.dealTypes && deal.dealTypes[0]) || null;
  const dateLabel = format(new Date(), 'MMM d');

  return (
    <div className="px-6 pt-5 pb-4 border-b border-white/40">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7a9aaa] mb-1.5">
            Deal Update Memo
          </div>
          <h2
            className="pipeline-memo-serif text-[22px] leading-[1.1] text-[#1a2b38] truncate"
            title={deal.company || deal.name}
          >
            {deal.company || deal.name}
          </h2>
          <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#1e8b8b]/12 text-[#1e8b8b] border border-[#2ab5b5]/20">
              {amountLabel}
            </span>
            {structureLabel && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/45 text-[#4a6070] border border-white/60">
                {structureLabel}
              </span>
            )}
            {assetClass && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/45 text-[#4a6070] border border-white/60">
                {assetClass}
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[11px] font-medium text-[#4a6070]">{dateLabel}</div>
          <div className="text-[10px] uppercase tracking-wider text-[#7a9aaa] mt-0.5">24h Digest</div>
        </div>
      </div>
    </div>
  );
}