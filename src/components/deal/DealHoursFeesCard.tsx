import { Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AddHoursButton } from '@/components/deal/DealHoursEntriesEditor';
import { DealWeeklyHoursChart } from '@/components/deal/DealWeeklyHoursChart';
import { useCompanyFeesVisibility, formatComputedTotal } from '@/hooks/useCompanyFeesVisibility';

interface DealHoursFeesCardProps {
  deal: any;
  updateDeal: (field: string, value: any) => void;
  onHoursChanged?: () => void;
}

/**
 * Hours & Fees block. Extracted out of the Deal Information card so it can
 * live in the main content column next to Outstanding Items.
 */
export function DealHoursFeesCard({ deal, updateDeal, onHoursChanged }: DealHoursFeesCardProps) {
  const feesVisibility = useCompanyFeesVisibility();
  const refreshDeals = onHoursChanged;
  return (
      <div
        className="space-y-3 rounded-xl border border-white/[0.08] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
        style={{ background: 'rgba(18, 24, 38, 0.82)' }}
      >
        <h4
          className="text-[13px] font-medium flex items-center gap-2 tracking-[0.01em]"
          style={{ color: 'rgba(148, 163, 184, 0.88)' }}
        >
          <Clock className="h-3.5 w-3.5" />
          Hours & Fees
          <DealWeeklyHoursChart dealId={deal.id} />
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Hours */}
          <div className="space-y-3 min-w-0">
            <div className="flex flex-col gap-1 md:grid md:grid-cols-[6.5rem_1fr] md:items-center md:gap-2">
              <span className="text-muted-foreground text-sm">Pre-Signing</span>
              <div className="flex items-center gap-2 h-8">
                <span className="text-sm font-medium tabular-nums flex-1">
                  {(deal.preSigningHours ?? 0).toLocaleString()}
                </span>
                <AddHoursButton
                  dealId={deal.id}
                  phase="pre_signing"
                  iconOnly
                  onChanged={() => { void refreshDeals?.(); }}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1 md:grid md:grid-cols-[6.5rem_1fr] md:items-center md:gap-2">
              <span className="text-muted-foreground text-sm">Post-Signing</span>
              <div className="flex items-center gap-2 h-8">
                <span className="text-sm font-medium tabular-nums flex-1">
                  {(deal.postSigningHours ?? 0).toLocaleString()}
                </span>
                <AddHoursButton
                  dealId={deal.id}
                  phase="post_signing"
                  iconOnly
                  onChanged={() => { void refreshDeals?.(); }}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1 md:grid md:grid-cols-[6.5rem_1fr] md:items-center md:gap-2">
              <span className="text-muted-foreground text-sm">Total Hours</span>
              <span className="text-sm font-medium h-8 flex items-center tabular-nums">
                {((deal.preSigningHours ?? 0) + (deal.postSigningHours ?? 0)).toLocaleString()}
              </span>
            </div>
            <div className="flex flex-col gap-1 md:grid md:grid-cols-[6.5rem_1fr] md:items-center md:gap-2">
              <span className="text-muted-foreground text-sm">Revenue / Hour</span>
              <span className="text-sm font-medium h-8 flex items-center">
                {(() => {
                  const totalHours = (deal.preSigningHours ?? 0) + (deal.postSigningHours ?? 0);
                  if (totalHours === 0) return '-';
                  const revenuePerHour = (deal.totalFee ?? 0) / totalHours;
                  return `$${revenuePerHour.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
                })()}
              </span>
            </div>
          </div>
          {/* Fees */}
          <div className="space-y-3 min-w-0">
            {feesVisibility.retainerEnabled && (
            <div className="flex flex-col gap-1 md:grid md:grid-cols-[6.5rem_1fr] md:items-center md:gap-2" data-testid="fee-retainer">
              <span className="text-muted-foreground text-sm">Retainer Fee</span>
              <div className="relative w-full">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  type="text"
                  value={deal.retainerFee ? Math.round(deal.retainerFee).toLocaleString() : ''}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/,/g, '');
                    if (raw === '' || /^\d+$/.test(raw)) updateDeal('retainerFee', raw ? Number(raw) : 0);
                  }}
                  placeholder="0"
                  className="pl-5 h-8 text-sm w-full"
                />
              </div>
            </div>
            )}
            {feesVisibility.milestoneEnabled && (
            <div className="flex flex-col gap-1 md:grid md:grid-cols-[6.5rem_1fr] md:items-center md:gap-2" data-testid="fee-milestone">
              <span className="text-muted-foreground text-sm">Milestone Fee</span>
              <div className="relative w-full">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  type="text"
                  value={deal.milestoneFee ? Math.round(deal.milestoneFee).toLocaleString() : ''}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/,/g, '');
                    if (raw === '' || /^\d+$/.test(raw)) updateDeal('milestoneFee', raw ? Number(raw) : 0);
                  }}
                  placeholder="0"
                  className="pl-5 h-8 text-sm w-full"
                />
              </div>
            </div>
            )}
            <div className="flex flex-col gap-1 md:grid md:grid-cols-[6.5rem_1fr] md:items-center md:gap-2">
              <span className="text-muted-foreground text-sm">Success Fee %</span>
              <div className="flex items-center gap-2">
                <div className="relative w-16 shrink-0">
                  <Input
                    type="number"
                    value={deal.successFeePercent ?? ''}
                    onChange={(e) => updateDeal('successFeePercent', e.target.value ? Number(e.target.value) : 0)}
                    placeholder="0"
                    className="pr-6 h-8 text-sm w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    min={0}
                    max={100}
                    step={0.1}
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                     <span className="text-sm text-muted-foreground whitespace-nowrap flex-1 text-right cursor-help">
                      <span className="font-medium text-foreground">{(() => {
                        const total = deal.totalFee ?? 0;
                        const milestone = deal.milestoneFee ?? 0;
                        const retainer = deal.retainerFee ?? 0;
                        const closing = Math.max(0, total - milestone - retainer);
                        if (closing >= 1_000_000) return `$${(closing / 1_000_000).toFixed(1)}M`;
                        if (closing >= 1_000) return `$${(closing / 1_000).toFixed(1)}K`;
                        return `$${Math.round(closing).toLocaleString()}`;
                      })()}</span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[200px] text-center">
                    <p className="text-xs">Amount due at closing of the facility, less fees already paid</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
            <div className="flex flex-col gap-1 md:grid md:grid-cols-[6.5rem_1fr] md:items-center md:gap-2" data-testid="fee-total">
              <span className="text-muted-foreground text-sm">Total Fee</span>
              <div className="relative w-full">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  type="text"
                  value={
                    feesVisibility.totalFeeComputedOnly
                      ? (() => {
                          const c = formatComputedTotal(
                            (deal as any).value ?? null,
                            deal.successFeePercent ?? null,
                          );
                          return c === '—' ? '' : c.replace(/^\$/, '');
                        })()
                      : (deal.totalFee ? Math.round(deal.totalFee).toLocaleString() : '')
                  }
                  readOnly
                  title={
                    feesVisibility.totalFeeComputedOnly
                      ? 'Computed: deal size × success fee %'
                      : 'Auto-calculated: Retainer + Milestone + Deal Size × Success Fee %'
                  }
                  placeholder="0"
                  className="pl-5 h-8 text-sm w-full bg-muted/40 cursor-not-allowed"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}
