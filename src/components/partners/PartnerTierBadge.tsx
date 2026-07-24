import { Clock, AlertTriangle, Shield } from 'lucide-react';
import type { PartnerTierInfo } from '@/hooks/usePartnerTier';

const TIER_STYLES: Record<number, { label: string; className: string }> = {
  1: {
    label: 'Tier 1',
    className: 'bg-amber-400/15 text-amber-300 border-amber-400/40',
  },
  2: {
    label: 'Tier 2',
    className: 'bg-slate-300/15 text-slate-200 border-slate-300/40',
  },
  3: {
    label: 'Tier 3',
    className: 'bg-orange-700/20 text-orange-300 border-orange-600/40',
  },
  4: {
    label: 'Tier 4',
    className: 'bg-slate-600/30 text-slate-300 border-slate-500/40',
  },
};

export function PartnerTierBadge({
  info,
  size = 'sm',
}: {
  info?: PartnerTierInfo | null;
  size?: 'sm' | 'md';
}) {
  if (!info) {
    return (
      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-700/40 text-slate-400 border border-slate-600/40">
        Tier —
      </span>
    );
  }
  const s = TIER_STYLES[info.tier];
  const sizing = size === 'md' ? 'px-2 py-0.5 text-xs' : 'px-1.5 py-0.5 text-[10px]';
  const isNewTier4 = info.tier === 4 && !info.manualOverride && info.totalDeals === 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded font-semibold border ${sizing} ${s.className}`}
      title={
        info.manualOverride
          ? `Manual override${info.overrideReason ? `: ${info.overrideReason}` : ''}`
          : isNewTier4
            ? 'New partner — no attributed deals yet. Tier updates automatically as deals are sent.'
            : undefined
      }
    >
      {info.tier === 4 && <Clock className="h-3 w-3" />}
      {isNewTier4 ? `${s.label} (new)` : s.label}
      {info.manualOverride && <Shield className="h-3 w-3 opacity-80" />}
    </span>
  );
}

export function PartnerTier4WarningBadge({ info }: { info?: PartnerTierInfo | null }) {
  if (!info || info.tier !== 4 || !info.removalWarning) return null;
  const map = {
    eligible: { text: 'Eligible for removal', cls: 'bg-red-500/15 text-red-300 border-red-500/40' },
    '30d': { text: '30 days until removal eligibility', cls: 'bg-red-500/15 text-red-300 border-red-500/40' },
    '60d': { text: '60 days until removal eligibility', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/40' },
  } as const;
  const m = map[info.removalWarning];
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${m.cls}`}>
      <AlertTriangle className="h-3 w-3" />
      {m.text}
    </span>
  );
}