import { Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { PartnerTierInfo } from '@/hooks/usePartnerTier';
import { usePartnerRules, DEFAULT_PARTNER_RULES } from '@/hooks/usePartnerRules';

function Row({ label, value, met }: { label: string; value: string; met?: boolean | null }) {
  const color =
    met === true ? 'text-emerald-300' : met === false ? 'text-slate-400' : 'text-slate-200';
  const dot =
    met === true ? 'bg-emerald-400' : met === false ? 'bg-slate-500' : 'bg-slate-400';
  return (
    <div className="flex items-start gap-2 text-[11px] leading-snug">
      <span className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${dot}`} />
      <div className="flex-1 min-w-0">
        <div className="text-slate-300">{label}</div>
        <div className={`font-medium ${color}`}>{value}</div>
      </div>
    </div>
  );
}

export function PartnerTierExplainer({ info }: { info?: PartnerTierInfo | null }) {
  const { data: rules } = usePartnerRules();
  if (!info) return null;
  const r = rules || DEFAULT_PARTNER_RULES;
  const t1 = r.tiers.tier1;
  const t2 = r.tiers.tier2;
  const t3 = r.tiers.tier3;
  const t4 = r.tiers.tier4;

  const t1QualMet = info.qualifiedTrailing3mo >= t1.qualifiedDeals;
  const t1SignedMet = info.signedTrailing3mo >= t1.signedClients;
  const t2QualMet =
    info.qualifiedTrailing3mo >= t2.qualifiedDealsMin &&
    info.qualifiedTrailing3mo <= t2.qualifiedDealsMax;
  const t2BoardMet = info.addedToBoardTrailing3mo >= t2.dealsOnBoard;
  const t3Met = info.addedToBoardTrailing12mo >= t3.dealsPerQuarter * 4;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="inline-flex items-center justify-center h-4 w-4 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 transition-colors"
          aria-label="Why this tier"
          title="Why this tier"
        >
          <Info className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-80 bg-slate-900 border-slate-700 text-slate-100 p-3 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <div className="text-xs font-semibold text-white">
            Why Tier {info.tier}
            {info.manualOverride && ' (manual override)'}
          </div>
          {info.manualOverride ? (
            <div className="text-[11px] text-slate-400 mt-0.5">
              Set manually{info.overrideBy ? ` by ${info.overrideBy}` : ''}
              {info.overrideReason ? ` — ${info.overrideReason}` : ''}
            </div>
          ) : (
            <div className="text-[11px] text-slate-400 mt-0.5">
              Computed from attributed deal history against your Partner Rules.
            </div>
          )}
        </div>

        <div className="rounded border border-slate-700 p-2 space-y-1.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Attributed deals</div>
          <Row
            label={`Qualified deals (trailing ${t1.trailingMonths} mo)`}
            value={String(info.qualifiedTrailing3mo)}
          />
          <Row
            label={`Signed clients (trailing ${t1.trailingMonths} mo)`}
            value={String(info.signedTrailing3mo)}
          />
          <Row
            label={`Deals added to board (trailing ${t2.trailingMonths} mo)`}
            value={String(info.addedToBoardTrailing3mo)}
          />
          <Row
            label="Deals added to board (trailing 12 mo)"
            value={String(info.addedToBoardTrailing12mo)}
          />
          <Row label="Total attributed deals" value={String(info.totalDeals)} />
        </div>

        <div className="rounded border border-slate-700 p-2 space-y-1.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">
            Rules evaluated (top-down)
          </div>
          <Row
            label={`Tier 1 · ≥ ${t1.qualifiedDeals} qualified in ${t1.trailingMonths} mo`}
            value={`${info.qualifiedTrailing3mo} / ${t1.qualifiedDeals}`}
            met={t1QualMet}
          />
          <Row
            label={`Tier 1 · OR ≥ ${t1.signedClients} signed client(s)`}
            value={`${info.signedTrailing3mo} / ${t1.signedClients}`}
            met={t1SignedMet}
          />
          <Row
            label={`Tier 2 · ${t2.qualifiedDealsMin}–${t2.qualifiedDealsMax} qualified in ${t2.trailingMonths} mo`}
            value={String(info.qualifiedTrailing3mo)}
            met={t2QualMet}
          />
          <Row
            label={`Tier 2 · OR ≥ ${t2.dealsOnBoard} deals on board (${t2.trailingMonths} mo)`}
            value={`${info.addedToBoardTrailing3mo} / ${t2.dealsOnBoard}`}
            met={t2BoardMet}
          />
          <Row
            label={`Tier 3 · ≥ ${t3.dealsPerQuarter * 4} deals on board (12 mo)`}
            value={`${info.addedToBoardTrailing12mo} / ${t3.dealsPerQuarter * 4}`}
            met={t3Met}
          />
          <Row
            label={`Tier 4 · 0 attributed deals (auto-remove after ${t4.monthsBeforeRemoval} mo)`}
            value={info.totalDeals === 0 ? 'Yes' : 'No'}
            met={info.totalDeals === 0}
          />
        </div>

        {info.tier === 4 && info.daysUntilRemovalEligible !== null && (
          <div className="text-[11px] text-slate-400">
            {info.daysUntilRemovalEligible > 0
              ? `${info.daysUntilRemovalEligible} day(s) until removal eligibility.`
              : 'Eligible for removal now.'}
          </div>
        )}

        <div className="text-[10px] text-slate-500">
          Qualified = deal reached Proposal Issued stage or later. Rules configurable in Sales & BD settings.
        </div>
      </PopoverContent>
    </Popover>
  );
}