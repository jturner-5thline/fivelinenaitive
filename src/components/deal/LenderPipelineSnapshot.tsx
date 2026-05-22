import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { DealLender } from '@/types/deal';
import type { LenderStageConfig } from '@/utils/dealExport';
import { bucketLenders } from '@/lib/lenderStatusBuckets';
import { LenderStageManageDialog } from './LenderStageManageDialog';
import { getPrimaryStatusDate, formatShortDate, formatFullTimestamp } from '@/utils/lenderStatusDate';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Shared Funding Source Pipeline Snapshot — the 4 stage cards (On Deck, In Review,
 * Terms Issued, Passed) plus the funding source-stage management pop-up.
 *
 * Used in BOTH:
 *   - the deal details page (Lenders panel header)
 *   - the Status Report preview modal
 *
 * Edits write through `onUpdateLender`, which the parent uses to persist to
 * the funding source record (single source of truth) so the report, deal page, and
 * lender page all stay in sync.
 */

type BucketKey = 'onDeck' | 'inReview' | 'termsIssued' | 'passed';
type Accent = 'blue' | 'teal' | 'green' | 'red';

interface Props {
  lenders: DealLender[];
  configuredStages: LenderStageConfig[];
  onUpdateLender: (lenderId: string, updates: Partial<DealLender>) => Promise<void>;
  /** Compact variant for tight spaces on the deal page. */
  density?: 'comfortable' | 'compact';
  className?: string;
}

const META: Record<BucketKey, { label: string; color: Accent }> = {
  onDeck:      { label: 'On Deck',       color: 'blue'  },
  inReview:    { label: 'In Review',     color: 'teal'  },
  termsIssued: { label: 'Terms Issued',  color: 'green' },
  passed:      { label: 'Passed',        color: 'red'   },
};

export function LenderPipelineSnapshot({
  lenders,
  configuredStages,
  onUpdateLender,
  density = 'comfortable',
  className,
}: Props) {
  const buckets = useMemo(
    () => bucketLenders(lenders, configuredStages),
    [lenders, configuredStages],
  );
  const items: Record<BucketKey, DealLender[]> = {
    onDeck: buckets.onDeck as DealLender[],
    inReview: buckets.inReview as DealLender[],
    termsIssued: buckets.termsIssued as DealLender[],
    passed: buckets.passed as DealLender[],
  };

  const [open, setOpen] = useState<null | BucketKey>(null);
  const compact = density === 'compact';

  return (
    <>
      <div
        className={
          'grid grid-cols-2 sm:grid-cols-4 gap-2.5 ' + (className || '')
        }
      >
        {(Object.keys(META) as BucketKey[]).map((k) => {
          const meta = META[k];
          const list = items[k];
          return (
            <button
              key={k}
              type="button"
              onClick={() => setOpen(k)}
              className={
                'text-left rounded-xl overflow-hidden border transition-all flex flex-col group ' +
                'cursor-pointer hover:scale-[1.015] hover:shadow-lg active:scale-[0.99] ' +
                (compact ? 'min-h-[110px]' : 'min-h-[150px]')
              }
              style={cardStyle(meta.color)}
              title={`Manage ${meta.label}`}
            >
              <div
                className="px-3 py-2 flex items-center justify-between text-[10px] uppercase tracking-[0.12em] font-bold text-white"
                style={headStyle(meta.color)}
              >
                <span>{meta.label}</span>
                <span className="text-white/90 text-xs font-bold">{list.length}</span>
              </div>
              <div className={(compact ? 'px-3 py-2' : 'px-3 py-2.5') + ' flex-1 space-y-1.5'}>
                {list.length === 0 ? (
                  <p className="m-0 text-[11px] text-slate-500 italic">None</p>
                ) : (
                  list.map((l) => {
                    const sd = getPrimaryStatusDate(l);
                    const shortDate = formatShortDate(sd.iso);
                    return (
                      <div key={l.id} className="m-0 leading-snug">
                        <p className="m-0 text-[13px] font-semibold text-white break-words">
                          {l.name}
                        </p>
                        {shortDate && (
                          <TooltipProvider delayDuration={150}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className="text-[10px] text-white/70 font-medium tabular-nums"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {sd.approximate ? '~ ' : ''}{sd.label} {shortDate}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="text-xs">
                                {sd.approximate
                                  ? 'Approximate (exact transition date not recorded for this legacy row)'
                                  : formatFullTimestamp(sd.iso)}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </button>
          );
        })}
      </div>

      {open && (
        <LenderStageManageDialog
          open={!!open}
          onOpenChange={(o) => { if (!o) setOpen(null); }}
          bucketKey={open}
          bucketLabel={META[open].label}
          bucketAccent={META[open].color}
          lenders={items[open]}
          configuredStages={configuredStages}
          onUpdateLender={onUpdateLender}
        />
      )}
    </>
  );
}

function cardStyle(color: Accent): CSSProperties {
  const tints: Record<Accent, { bg: string; border: string }> = {
    blue: {
      bg: 'radial-gradient(120% 80% at 0% 0%, hsl(220 75% 35% / 0.32) 0%, transparent 60%), linear-gradient(180deg, hsl(220 45% 16% / 0.9) 0%, hsl(220 40% 9% / 0.95) 100%)',
      border: 'hsl(220 75% 55% / 0.4)',
    },
    teal: {
      bg: 'radial-gradient(120% 80% at 0% 0%, hsl(190 75% 35% / 0.3) 0%, transparent 60%), linear-gradient(180deg, hsl(190 50% 15% / 0.9) 0%, hsl(190 45% 9% / 0.95) 100%)',
      border: 'hsl(185 75% 50% / 0.4)',
    },
    green: {
      bg: 'radial-gradient(120% 80% at 0% 0%, hsl(150 70% 35% / 0.3) 0%, transparent 60%), linear-gradient(180deg, hsl(150 42% 14% / 0.9) 0%, hsl(150 42% 8% / 0.95) 100%)',
      border: 'hsl(150 65% 45% / 0.4)',
    },
    red: {
      bg: 'radial-gradient(120% 80% at 0% 0%, hsl(0 75% 38% / 0.3) 0%, transparent 60%), linear-gradient(180deg, hsl(0 48% 16% / 0.9) 0%, hsl(0 42% 9% / 0.95) 100%)',
      border: 'hsl(0 70% 55% / 0.4)',
    },
  };
  const t = tints[color];
  return {
    background: t.bg,
    borderColor: t.border,
    boxShadow:
      'inset 0 1px 0 hsl(220 60% 85% / 0.08), inset 0 0 0 1px hsl(220 40% 50% / 0.04), 0 6px 20px hsl(220 60% 4% / 0.45)',
  };
}

function headStyle(color: Accent): CSSProperties {
  const map: Record<Accent, string> = {
    blue:  'linear-gradient(135deg, hsl(220 85% 55%), hsl(215 90% 45%))',
    teal:  'linear-gradient(135deg, hsl(190 80% 50%), hsl(175 75% 38%))',
    green: 'linear-gradient(135deg, hsl(150 75% 45%), hsl(155 70% 35%))',
    red:   'linear-gradient(135deg, hsl(0 75% 55%), hsl(355 75% 45%))',
  };
  return { background: map[color] };
}